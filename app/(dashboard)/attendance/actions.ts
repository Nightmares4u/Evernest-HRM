"use server";

// Check-in / check-out server actions. Both are env-safe — they redirect to
// /dashboard?error=… with a friendly message instead of throwing when business
// rules block the action (Sunday, holiday, exempt employee, etc.).
//
// checkIn accepts an optional FormData with browser-captured lat/lng/accuracy
// and a geolocation_status string. The status is recorded on the attendance
// record so super-admins can see when a check-in had no location proof.
//
// requires_review is set when:
//   - office mode AND IP doesn't match the branch whitelist, OR
//   - geolocation was denied/unavailable/not-supported/timed out, OR
//   - remote mode AND no geolocation captured.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { sendEmail, sendEmailSafely } from "@/lib/email/send";
import { checkInEmail, checkOutEmail } from "@/lib/email/templates";
import { formatTimePKT, todayPKT } from "@/lib/attendance/format";
import {
  buildPktTimestamp,
  computeOnCheckIn,
  computeOnCheckOut,
  ipMatchesWhitelist,
  isoWeekdayPKT,
} from "@/lib/attendance/policy";
import type { AttendanceMode, AttendanceStatus } from "@/lib/types/hrm";

async function getSuperAdminEmails(
  admin: ReturnType<typeof createAdminClient>
): Promise<string[]> {
  const { data } = await admin
    .from("app_users")
    .select("email")
    .eq("role", "super_admin")
    .eq("is_active", true);
  return ((data ?? []) as Array<{ email: string }>)
    .map((u) => u.email)
    .filter((e): e is string => Boolean(e));
}

function fail(msg: string): never {
  redirect(`/dashboard?error=${encodeURIComponent(msg)}`);
}

function attendanceFail(msg: string): never {
  redirect(`/attendance?error=${encodeURIComponent(msg)}`);
}

function attendanceOk(msg: string): never {
  redirect(`/attendance?ok=${encodeURIComponent(msg)}`);
}

type ShiftLite = {
  id: string;
  start_time: string;
  end_time: string;
  late_grace_minutes: number;
  half_day_threshold_minutes: number;
};

type BranchLite = {
  id: string;
  ip_whitelist: string[] | null;
};

type EmployeeLite = {
  id: string;
  branch_id: string | null;
  attendance_exempt: boolean;
  remote_allowed: boolean;
  remote_default_days: number[] | null;
  shifts: ShiftLite | ShiftLite[] | null;
  branches: BranchLite | BranchLite[] | null;
};

async function loadMyEmployee() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("employees")
    .select(
      `
      id, branch_id, attendance_exempt, remote_allowed, remote_default_days,
      shifts ( id, start_time, end_time, late_grace_minutes, half_day_threshold_minutes ),
      branches ( id, ip_whitelist )
      `
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) fail(`Could not load employee record: ${error.message}`);
  if (!data) fail("No employee record found for your account.");

  const emp = data as unknown as EmployeeLite;
  const shift = Array.isArray(emp.shifts) ? emp.shifts[0] : emp.shifts;
  if (!shift) fail("No shift assigned to your account. Ask admin to set one.");

  const branch = Array.isArray(emp.branches) ? emp.branches[0] : emp.branches;

  return { supabase, employee: emp, shift, branch };
}

type ParsedGeo = {
  coords: { lat: number; lng: number; accuracy: number } | null;
  status: string;
};

const LOCATION_REVIEW_STATUSES = new Set([
  "denied",
  "unavailable",
  "not_supported",
  "timeout",
]);

const OVERRIDE_STATUSES: AttendanceStatus[] = [
  "present",
  "late",
  "half_day",
  "absent",
  "on_leave",
  "day_off",
  "remote_present",
  "remote_late",
  "remote_half_day",
];

function parseOverrideTime(
  raw: FormDataEntryValue | null,
  date: string
): string | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  if (!/^\d{2}:\d{2}$/.test(value)) {
    attendanceFail("Override time must use HH:MM format.");
  }
  return buildPktTimestamp(date, value);
}

function workedMinutesBetween(
  checkInAt: string | null,
  checkOutAt: string | null
): number | null {
  if (!checkInAt || !checkOutAt) return null;
  const inMs = Date.parse(checkInAt);
  const outMs = Date.parse(checkOutAt);
  if (!Number.isFinite(inMs) || !Number.isFinite(outMs)) return null;
  return Math.max(0, Math.floor((outMs - inMs) / 60_000));
}

function lateMinutesFrom(
  expectedStart: string,
  checkInAt: string | null
): number {
  if (!checkInAt) return 0;
  const startMs = Date.parse(expectedStart);
  const inMs = Date.parse(checkInAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(inMs) || inMs <= startMs) {
    return 0;
  }
  return Math.floor((inMs - startMs) / 60_000);
}

function parseGeolocation(formData?: FormData): ParsedGeo {
  if (!formData) return { coords: null, status: "not_provided" };
  const status = String(
    formData.get("geolocation_status") ?? "not_provided"
  ).trim();
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  const accuracy = Number(formData.get("accuracy"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { coords: null, status };
  }
  return {
    coords: {
      lat,
      lng,
      accuracy: Number.isFinite(accuracy) ? accuracy : 0,
    },
    status,
  };
}

export async function checkIn(formData?: FormData) {
  const { supabase, employee, shift, branch } = await loadMyEmployee();

  if (employee.attendance_exempt) {
    fail("Your account is attendance-exempt — no check-in required.");
  }

  const today = todayPKT();
  const isoWeekday = isoWeekdayPKT();
  if (isoWeekday === 7) {
    fail("Sunday is the weekly off — no check-in.");
  }

  // Reject if any holiday matches today (company-wide, branch-specific, or individual).
  const { data: holidays } = await supabase
    .from("holidays")
    .select("id")
    .eq("date", today);
  if (holidays && holidays.length > 0) {
    fail("Today is a holiday — no check-in needed.");
  }

  const mode: AttendanceMode =
    employee.remote_allowed &&
    (employee.remote_default_days ?? []).includes(isoWeekday)
      ? "remote"
      : "office";

  const expectedStartIso = buildPktTimestamp(today, shift.start_time);
  const expectedEndIso = buildPktTimestamp(today, shift.end_time);
  const checkInIso = new Date().toISOString();

  const { isLate, lateMinutes, status } = computeOnCheckIn({
    expectedStartIso,
    checkInIso,
    graceMinutes: shift.late_grace_minutes,
    mode,
  });

  // IP capture (server-side; can't be spoofed by the client).
  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0].trim() ||
    headerStore.get("x-real-ip") ||
    null;
  const userAgent = headerStore.get("user-agent") || null;

  // Geolocation (browser-supplied + status).
  const geo = parseGeolocation(formData);

  // requires_review logic:
  //   - office mode  -> require IP whitelist match (when whitelist is set)
  //   - any mode     -> flag denied/unavailable/not-supported/timed-out location
  //   - remote mode  -> require geolocation captured
  const ipOk =
    mode === "remote"
      ? true
      : ipMatchesWhitelist(ip, branch?.ip_whitelist ?? []);
  const geoStatusNeedsReview = LOCATION_REVIEW_STATUSES.has(geo.status);
  const geoOk = mode === "remote" ? geo.status === "granted" : true;
  const requiresReview = !ipOk || geoStatusNeedsReview || !geoOk;
  const reviewSignals = [
    !ipOk ? "ip_mismatch" : null,
    geoStatusNeedsReview ? `location_${geo.status}` : null,
    mode === "remote" && !geoOk ? "remote_location_missing" : null,
  ].filter((v): v is string => Boolean(v));
  const geoJson = geo.coords
    ? {
        ...geo.coords,
        status: geo.status,
        ...(reviewSignals.length ? { review_signal: reviewSignals.join(",") } : {}),
      }
    : {
        status: geo.status,
        ...(reviewSignals.length ? { review_signal: reviewSignals.join(",") } : {}),
      };

  const { error } = await supabase.from("attendance_records").upsert(
    {
      employee_id: employee.id,
      date: today,
      shift_id: shift.id,
      expected_start: expectedStartIso,
      expected_end: expectedEndIso,
      check_in_at: checkInIso,
      status,
      late_minutes: lateMinutes,
      is_late: isLate,
      is_half_day: false,
      is_absent: false,
      mode,
      ip_address: ip,
      user_agent: userAgent,
      geolocation: geoJson,
      branch_id: employee.branch_id,
      requires_review: requiresReview,
    },
    { onConflict: "employee_id,date" }
  );

  if (error) fail(`Check-in failed: ${error.message}`);

  // Notify super-admins. Uses admin client to read both employee display name
  // and the super_admin email list (RLS would block this for an employee).
  await sendEmailSafely(async () => {
    const admin = createAdminClient();
    const [meRes, branchRes, superAdminEmails] = await Promise.all([
      supabase
        .from("app_users")
        .select("display_name")
        .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
        .maybeSingle(),
      employee.branch_id
        ? admin
            .from("branches")
            .select("code")
            .eq("id", employee.branch_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      getSuperAdminEmails(admin),
    ]);

    if (superAdminEmails.length === 0) return;
    const tpl = checkInEmail({
      employee_name: meRes.data?.display_name ?? "Someone",
      time_pkt: formatTimePKT(checkInIso),
      mode,
      is_late: isLate,
      late_minutes: lateMinutes,
      requires_review: requiresReview,
      geo_status: geo.status,
      ip,
      branch_code:
        (branchRes.data as { code?: string } | null)?.code ?? null,
    });
    await sendEmail({
      to: superAdminEmails,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
  });

  revalidatePath("/dashboard");
  revalidatePath("/attendance");
}

export async function checkOut() {
  const { supabase, employee, shift } = await loadMyEmployee();
  const today = todayPKT();

  const { data: existing, error: fetchErr } = await supabase
    .from("attendance_records")
    .select("id, check_in_at, is_late, mode")
    .eq("employee_id", employee.id)
    .eq("date", today)
    .maybeSingle();

  if (fetchErr) fail(`Could not load today's record: ${fetchErr.message}`);
  if (!existing || !existing.check_in_at) {
    fail("Cannot check out — you haven't checked in yet today.");
  }

  const checkOutIso = new Date().toISOString();
  const result = computeOnCheckOut({
    checkInIso: existing.check_in_at,
    checkOutIso,
    halfDayThresholdMinutes: shift.half_day_threshold_minutes,
    mode: existing.mode,
    isLate: existing.is_late,
  });

  const { error } = await supabase
    .from("attendance_records")
    .update({
      check_out_at: checkOutIso,
      worked_minutes: result.workedMinutes,
      is_half_day: result.isHalfDay,
      status: result.status,
    })
    .eq("id", existing.id);

  if (error) fail(`Check-out failed: ${error.message}`);

  // Notify super-admins of the checkout.
  await sendEmailSafely(async () => {
    const admin = createAdminClient();
    const [meRes, branchRes, superAdminEmails] = await Promise.all([
      supabase
        .from("app_users")
        .select("display_name")
        .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
        .maybeSingle(),
      employee.branch_id
        ? admin
            .from("branches")
            .select("code")
            .eq("id", employee.branch_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      getSuperAdminEmails(admin),
    ]);

    if (superAdminEmails.length === 0) return;
    const tpl = checkOutEmail({
      employee_name: meRes.data?.display_name ?? "Someone",
      time_pkt: formatTimePKT(checkOutIso),
      worked_minutes: result.workedMinutes,
      is_half_day: result.isHalfDay,
      status: result.status,
      branch_code:
        (branchRes.data as { code?: string } | null)?.code ?? null,
    });
    await sendEmail({
      to: superAdminEmails,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
  });

  revalidatePath("/dashboard");
  revalidatePath("/attendance");
}

export async function overrideAttendanceRecord(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const requiresReview = formData.get("requires_review") === "on";

  if (!id) attendanceFail("Missing attendance record id.");
  if (!OVERRIDE_STATUSES.includes(statusRaw as AttendanceStatus)) {
    attendanceFail("Pick a valid corrected status.");
  }
  if (!reason) attendanceFail("Override reason is required.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: actor, error: actorErr } = await admin
    .from("app_users")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (actorErr || !actor || actor.role !== "super_admin" || !actor.is_active) {
    attendanceFail("Only super-admins can override attendance.");
  }

  const { data: record, error: fetchErr } = await admin
    .from("attendance_records")
    .select(
      `
      id, employee_id, date, expected_start, check_in_at, check_out_at,
      worked_minutes, status, late_minutes, is_late, is_half_day, is_absent,
      requires_review, updated_at
      `
    )
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !record) attendanceFail("Attendance record not found.");

  const correctedStatus = statusRaw as AttendanceStatus;
  const correctedCheckIn = parseOverrideTime(formData.get("check_in_time"), record.date);
  const correctedCheckOut = parseOverrideTime(formData.get("check_out_time"), record.date);
  const nextCheckIn = correctedCheckIn ?? record.check_in_at;
  const nextCheckOut = correctedCheckOut ?? record.check_out_at;
  const nextWorkedMinutes =
    correctedCheckIn && correctedCheckOut
      ? workedMinutesBetween(correctedCheckIn, correctedCheckOut)
      : workedMinutesBetween(nextCheckIn, nextCheckOut) ?? record.worked_minutes;
  const isLate = correctedStatus === "late" || correctedStatus === "remote_late";
  const isHalfDay =
    correctedStatus === "half_day" || correctedStatus === "remote_half_day";
  const isAbsent = correctedStatus === "absent";
  const lateMinutes = isLate ? lateMinutesFrom(record.expected_start, nextCheckIn) : 0;
  const now = new Date().toISOString();

  const oldValue = {
    status: record.status,
    check_in_at: record.check_in_at,
    check_out_at: record.check_out_at,
    worked_minutes: record.worked_minutes,
    late_minutes: record.late_minutes,
    is_late: record.is_late,
    is_half_day: record.is_half_day,
    is_absent: record.is_absent,
    requires_review: record.requires_review,
    updated_at: record.updated_at,
  };
  const newValue = {
    status: correctedStatus,
    check_in_at: nextCheckIn,
    check_out_at: nextCheckOut,
    worked_minutes: nextWorkedMinutes,
    late_minutes: lateMinutes,
    is_late: isLate,
    is_half_day: isHalfDay,
    is_absent: isAbsent,
    requires_review: requiresReview,
    updated_at: now,
  };

  const { error: updateErr } = await admin
    .from("attendance_records")
    .update(newValue)
    .eq("id", id);
  if (updateErr) attendanceFail(`Override failed: ${updateErr.message}`);

  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    target_type: "attendance_record",
    target_id: id,
    action: "override_attendance",
    old_value: oldValue,
    new_value: newValue,
    reason,
  });
  if (auditErr) {
    attendanceFail(`Override saved, but audit log failed: ${auditErr.message}`);
  }

  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  attendanceOk("Attendance override saved.");
}
