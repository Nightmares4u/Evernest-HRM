"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/server";

function fail(message: string): never {
  redirect(`/admin/holidays?error=${encodeURIComponent(message)}`);
}

function ok(message: string): never {
  revalidatePath("/admin/holidays");
  revalidatePath("/admin/payroll");
  redirect(`/admin/holidays?ok=${encodeURIComponent(message)}`);
}

async function requireSuperAdmin() {
  const me = await getCurrentUser();
  if (!me) fail("Please sign in.");
  if (me.appUser.role !== "super_admin") fail("Super-admin access required.");
  return me;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function expandDateRange(startDate: string, endDate: string): string[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export async function addHoliday(formData: FormData) {
  const me = await requireSuperAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? formData.get("date") ?? "").trim();
  const endDateRaw = String(formData.get("end_date") ?? "").trim();
  const endDate = endDateRaw || startDate;
  const branchId = String(formData.get("branch_id") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const isPaid = formData.get("is_paid") === "on";
  const companyWide = formData.get("company_wide") === "on";

  if (!name) fail("Holiday name is required.");
  if (!isIsoDate(startDate)) fail("Holiday start date is required.");
  if (!isIsoDate(endDate)) fail("Holiday end date must be a valid date.");
  if (endDate < startDate) fail("Holiday end date cannot be before the start date.");
  if (!companyWide && !branchId) fail("Choose a branch or mark company-wide.");

  const dates = expandDateRange(startDate, endDate);
  if (dates.length > 45) fail("Holiday ranges are limited to 45 days.");

  const admin = createAdminClient();
  const insertPayloads = dates.map((date) => ({
    name,
    date,
    type: companyWide ? "public" : "branch_specific",
    branch_id: companyWide ? null : branchId,
    employee_id: null,
    is_paid: isPaid,
    company_wide: companyWide,
    notes: notes || null,
    created_by: me.authUserId,
  }));

  const { data, error } = await admin
    .from("holidays")
    .insert(insertPayloads)
    .select("id, date");
  if (error || !data?.length) {
    fail(`Could not add holiday: ${error?.message ?? "unknown error"}`);
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: me.authUserId,
    target_type: "holiday",
    target_id: data[0].id,
    action: dates.length > 1 ? "create_holiday_range" : "create_holiday",
    old_value: null,
    new_value: {
      name,
      start_date: startDate,
      end_date: endDate,
      dates: data.map((row) => row.date),
      holiday_ids: data.map((row) => row.id),
      branch_id: companyWide ? null : branchId,
      is_paid: isPaid,
      company_wide: companyWide,
      notes: notes || null,
    },
    reason: notes || (dates.length > 1 ? "Holiday range added" : "Holiday added"),
  });
  if (auditError) fail(`Holiday added, but audit log failed: ${auditError.message}`);

  ok(dates.length > 1 ? `${dates.length} holiday dates added.` : "Holiday added.");
}

export async function deleteHoliday(formData: FormData) {
  const me = await requireSuperAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) fail("Missing holiday id.");

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("holidays")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError || !existing) fail("Holiday not found.");

  const { error: deleteError } = await admin.from("holidays").delete().eq("id", id);
  if (deleteError) fail(`Could not delete holiday: ${deleteError.message}`);

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: me.authUserId,
    target_type: "holiday",
    target_id: id,
    action: "delete_holiday",
    old_value: existing,
    new_value: null,
    reason: "Holiday removed",
  });
  if (auditError) fail(`Holiday deleted, but audit log failed: ${auditError.message}`);

  ok("Holiday removed.");
}
