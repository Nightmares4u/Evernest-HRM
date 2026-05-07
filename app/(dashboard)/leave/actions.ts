"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { countWorkingDays, eachWorkingDay } from "@/lib/leave/policy";

function fail(path: string, msg: string): never {
  redirect(`${path}?error=${encodeURIComponent(msg)}`);
}

function ok(path: string, msg: string): never {
  redirect(`${path}?ok=${encodeURIComponent(msg)}`);
}

/**
 * Employee submits a leave request.
 */
export async function submitLeaveRequest(formData: FormData) {
  const start = String(formData.get("start_date") ?? "").trim();
  const end = String(formData.get("end_date") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (!start || !end) fail("/leave", "Start and end dates are required.");

  const days = countWorkingDays(start, end);
  if (days <= 0) fail("/leave", "Range must include at least one Mon-Sat day.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: empRow } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!empRow) fail("/leave", "No employee record on file.");

  const { error } = await supabase.from("leave_requests").insert({
    employee_id: empRow.id,
    start_date: start,
    end_date: end,
    days_count: days,
    reason,
    status: "pending",
  });
  if (error) fail("/leave", `Submission failed: ${error.message}`);

  revalidatePath("/leave");
  revalidatePath("/admin/leave");
  ok("/leave", `Leave request submitted (${days} working day${days === 1 ? "" : "s"}).`);
}

async function logAudit(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    actor_id: string;
    target_type: string;
    target_id: string;
    action: string;
    old_value?: unknown;
    new_value?: unknown;
    reason?: string | null;
  }
) {
  await admin.from("audit_logs").insert({
    actor_id: args.actor_id,
    target_type: args.target_type,
    target_id: args.target_id,
    action: args.action,
    old_value: args.old_value ?? null,
    new_value: args.new_value ?? null,
    reason: args.reason ?? null,
  });
}

/**
 * Admin / super-admin approves a leave request.
 *   - flips status to 'approved'
 *   - inserts attendance_records (status='on_leave') for each working day
 *   - increments leave_balances.used for the employee's current month
 *     (creates the row if missing, with accrued=1.0)
 *   - writes an audit_logs row
 */
export async function approveLeaveRequest(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!id) fail("/admin/leave", "Missing request id.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: req, error: fetchErr } = await supabase
    .from("leave_requests")
    .select("id, employee_id, start_date, end_date, days_count, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !req) fail("/admin/leave", "Request not found.");
  if (req.status !== "pending") fail("/admin/leave", `Request is already ${req.status}.`);

  // Use admin client for the cross-table mutation so all writes succeed even
  // if the user's RLS would normally block some of them. The actor identity
  // (auth.uid()) is captured explicitly in audit_logs.
  const admin = createAdminClient();

  const { error: updateErr } = await admin
    .from("leave_requests")
    .update({
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_note: note,
    })
    .eq("id", id);
  if (updateErr) fail("/admin/leave", `Approve failed: ${updateErr.message}`);

  // Look up the employee's branch + a shift so we can fill required NOT NULL
  // columns on attendance_records (expected_start/end). Use 09:00–18:00 PKT
  // as a placeholder if the employee has no shift assigned.
  const { data: empMeta } = await admin
    .from("employees")
    .select(
      "branch_id, shifts ( id, start_time, end_time )"
    )
    .eq("id", req.employee_id)
    .single();

  type ShiftSlim = { id: string; start_time: string; end_time: string };
  const shift = (empMeta as unknown as { shifts: ShiftSlim | ShiftSlim[] | null } | null)?.shifts;
  const s = Array.isArray(shift) ? shift[0] : shift;
  const start = s?.start_time ?? "09:00:00";
  const endT = s?.end_time ?? "18:00:00";

  const days = eachWorkingDay(req.start_date, req.end_date);
  const rows = days.map((d) => ({
    employee_id: req.employee_id,
    date: d,
    shift_id: s?.id ?? null,
    expected_start: `${d}T${start.length === 5 ? start + ":00" : start}+05:00`,
    expected_end: `${d}T${endT.length === 5 ? endT + ":00" : endT}+05:00`,
    status: "on_leave" as const,
    is_absent: false,
    branch_id:
      (empMeta as unknown as { branch_id: string | null } | null)?.branch_id ?? null,
    mode: "manual" as const,
  }));

  if (rows.length > 0) {
    // Use upsert in case the employee already had records for those dates
    // (e.g., previously checked in); leave should override.
    const { error: insErr } = await admin
      .from("attendance_records")
      .upsert(rows, { onConflict: "employee_id,date" });
    if (insErr) fail("/admin/leave", `Could not write attendance rows: ${insErr.message}`);
  }

  // Increment leave_balances.used for the request's start month.
  const [yy, mm] = req.start_date
    .split("-")
    .map((p: string) => Number.parseInt(p, 10));
  const { data: balRow } = await admin
    .from("leave_balances")
    .select("id, used")
    .eq("employee_id", req.employee_id)
    .eq("year", yy)
    .eq("month", mm)
    .maybeSingle();

  if (balRow) {
    await admin
      .from("leave_balances")
      .update({ used: Number(balRow.used) + Number(req.days_count) })
      .eq("id", balRow.id);
  } else {
    await admin.from("leave_balances").insert({
      employee_id: req.employee_id,
      year: yy,
      month: mm,
      accrued: 1.0,
      used: Number(req.days_count),
      carry_forward_in: 0,
    });
  }

  await logAudit(admin, {
    actor_id: user.id,
    target_type: "leave_request",
    target_id: id,
    action: "approve_leave",
    old_value: { status: "pending" },
    new_value: { status: "approved", review_note: note },
    reason: note,
  });

  revalidatePath("/leave");
  revalidatePath("/admin/leave");
  revalidatePath("/attendance");
  ok("/admin/leave", "Leave approved.");
}

/**
 * Admin / super-admin rejects a leave request.
 */
export async function rejectLeaveRequest(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!id) fail("/admin/leave", "Missing request id.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: req, error: fetchErr } = await admin
    .from("leave_requests")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !req) fail("/admin/leave", "Request not found.");
  if (req.status !== "pending") fail("/admin/leave", `Request is already ${req.status}.`);

  const { error } = await admin
    .from("leave_requests")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_note: note,
    })
    .eq("id", id);
  if (error) fail("/admin/leave", `Reject failed: ${error.message}`);

  await logAudit(admin, {
    actor_id: user.id,
    target_type: "leave_request",
    target_id: id,
    action: "reject_leave",
    old_value: { status: "pending" },
    new_value: { status: "rejected", review_note: note },
    reason: note,
  });

  revalidatePath("/leave");
  revalidatePath("/admin/leave");
  ok("/admin/leave", "Leave rejected.");
}
