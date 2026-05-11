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
//   - office mode AND browser location is outside the assigned branch radius, OR
//   - browser geolocation was denied/unavailable/not-supported/timed out, OR
//   - remote mode AND no browser location was captured.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { sendEmail, sendEmailSafely } from "@/lib/email/send";
import { listRoleNotificationEmails } from "@/lib/email/recipients";
import { checkInEmail, checkOutEmail } from "@/lib/email/templates";
import { formatTimePKT, todayPKT } from "@/lib/attendance/format";
import {
  buildPktTimestamp,
  computeOnCheckIn,
  computeOnCheckOut,
  isoWeekdayPKT,
} from "@/lib/attendance/policy";
import { resolveEmployeeShift } from "@/lib/attendance/shifts";
import {
  actorFromCurrentUser,
  canOverrideAttendance,
} from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { AttendanceMode, AttendanceStatus } from "@/lib/types/hrm";

async function getSuperAdminEmails(
  admin: ReturnType<typeof createAdminClient>
): Promise<string[]> {
  return listRoleNotificationEmails(admin, "super_admin");
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

function overrideFail(formData: FormData, msg: string): never {
  const redirectTo = safeOverrideRedirect(formData);
  redirect(`${redirectTo}?error=${encodeURIComponent(msg)}`);
}

function overrideOk(formData: FormData, msg: string): never {
  const redirectTo = safeOverrideRedirect(formData);
  redirect(`${redirectTo}?ok=${encodeURIComponent(msg)}`);
}

function safeOverrideRedirect(formData: FormData): string {
  const raw = String(formData.get("redirect_to") ?? "/attendance").trim();
  if (raw === "/attendance") return raw;
  if (/^\/admin\/employees\/[0-9a-fA-F-]{36}(\?.*)?$/.test(raw)) return raw;
  return "/attendance";
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
  office_latitude: number | null;
  office_longitude: number | null;
  office_radius_meters: number | null;
};

type EmployeeLite = {
  id: string;
  branch_id: string | null;
  attendance_exempt: boolean;
  remote_allowed: boolean;
  remote_default_days: number[] | null;
  custom_shift_enabled: boolean;
  custom_shift_start: string | null;
  custom_shift_end: string | null;
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
      custom_shift_enabled, custom_shift_start, custom_shift_end,
      shifts ( id, start_time, end_time, late_grace_minutes, half_day_threshold_minutes ),
      branches ( id, office_latitude, office_longitude, office_radius_meters )
      `
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) fail(`Could not load employee record: ${error.message}`);
  if (!data) fail("No employee record found for your account.");

  const emp = data as unknown as EmployeeLite;
  const shift = Array.isArray(emp.shifts) ? emp.shifts[0] : emp.shifts;
  const effectiveShift = resolveEmployeeShift({ employee: emp, shift });
  if (!effectiveShift) fail("No shift assigned to your account. Ask admin to set one.");

  const branch = Array.isArray(emp.branches) ? emp.branches[0] : emp.branches;

  return { supabase, employee: emp, shift: effectiveShift, branch };
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

function modeForOverrideStatus(status: AttendanceStatus): AttendanceMode {
  if (status.startsWith("remote_")) return "remote";
  return "manual";
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

function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const earthRadiusM = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(earthRadiusM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

function evaluateLocationVerification(args: {
  mode: AttendanceMode;
  branch: BranchLite | null;
  geo: ParsedGeo;
}): {
  distance: number | null;
  verificationStatus: string;
  requiresReview: boolean;
  reviewReason: string | null;
  reviewSignals: string[];
} {
  const geoStatusNeedsReview = LOCATION_REVIEW_STATUSES.has(args.geo.status);
  if (!args.geo.coords) {
    const status =
      args.geo.status === "not_provided"
        ? args.mode === "remote"
          ? "remote_location_missing"
          : "location_not_provided"
        : `location_${args.geo.status}`;
    return {
      distance: null,
      verificationStatus: status,
      requiresReview: true,
      reviewReason: status,
      reviewSignals: [status],
    };
  }

  if (args.mode === "remote") {
    return {
      distance: null,
      verificationStatus: "remote_location_captured",
      requiresReview: false,
      reviewReason: null,
      reviewSignals: [],
    };
  }

  const officeLat = args.branch?.office_latitude;
  const officeLng = args.branch?.office_longitude;
  if (officeLat == null || officeLng == null) {
    return {
      distance: null,
      verificationStatus: "office_geofence_not_configured",
      requiresReview: false,
      reviewReason: null,
      reviewSignals: [],
    };
  }

  const distance = distanceMeters(args.geo.coords, {
    lat: officeLat,
    lng: officeLng,
  });
  const radius = args.branch?.office_radius_meters ?? 200;
  const outside = distance > radius;
  return {
    distance,
    verificationStatus: outside ? "outside_geofence" : "location_verified",
    requiresReview: outside || geoStatusNeedsReview,
    reviewReason: outside ? "outside_geofence" : null,
    reviewSignals: outside ? ["outside_geofence"] : [],
  };
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

  // Geolocation (browser-supplied + status).
  const geo = parseGeolocation(formData);
  const verification = evaluateLocationVerification({ mode, branch, geo });
  const geoJson = geo.coords
    ? {
        ...geo.coords,
        status: geo.status,
        ...(verification.distance != null
          ? { distance_meters: verification.distance }
          : {}),
        verification_status: verification.verificationStatus,
        ...(verification.reviewSignals.length
          ? { review_signal: verification.reviewSignals.join(",") }
          : {}),
      }
    : {
        status: geo.status,
        verification_status: verification.verificationStatus,
        ...(verification.reviewSignals.length
          ? { review_signal: verification.reviewSignals.join(",") }
          : {}),
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
      geolocation: geoJson,
      check_in_latitude: geo.coords?.lat ?? null,
      check_in_longitude: geo.coords?.lng ?? null,
      check_in_distance_meters: verification.distance,
      verification_status: verification.verificationStatus,
      review_reason: verification.reviewReason,
      branch_id: employee.branch_id,
      requires_review: verification.requiresReview,
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
      requires_review: verification.requiresReview,
      geo_status: geo.status,
      ip: null,
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

export async function checkOut(formData?: FormData) {
  const { supabase, employee, shift, branch } = await loadMyEmployee();
  const today = todayPKT();

  const { data: existing, error: fetchErr } = await supabase
    .from("attendance_records")
    .select("id, check_in_at, is_late, mode, geolocation, requires_review, review_reason")
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

  const geo = parseGeolocation(formData);
  const verification = evaluateLocationVerification({
    mode: existing.mode,
    branch,
    geo,
  });
  const existingGeo =
    existing.geolocation && typeof existing.geolocation === "object"
      ? (existing.geolocation as Record<string, unknown>)
      : {};
  const geoJson = {
    ...existingGeo,
    check_out_status: geo.status,
    check_out_verification_status: verification.verificationStatus,
    ...(geo.coords
      ? {
          check_out_lat: geo.coords.lat,
          check_out_lng: geo.coords.lng,
          check_out_accuracy: geo.coords.accuracy,
        }
      : {}),
    ...(verification.distance != null
      ? { check_out_distance_meters: verification.distance }
      : {}),
    ...(verification.reviewSignals.length
      ? { check_out_review_signal: verification.reviewSignals.join(",") }
      : {}),
  };

  const { error } = await supabase
    .from("attendance_records")
    .update({
      check_out_at: checkOutIso,
      worked_minutes: result.workedMinutes,
      is_half_day: result.isHalfDay,
      status: result.status,
      geolocation: geoJson,
      check_out_latitude: geo.coords?.lat ?? null,
      check_out_longitude: geo.coords?.lng ?? null,
      check_out_distance_meters: verification.distance,
      verification_status: verification.verificationStatus,
      review_reason: verification.reviewReason ?? existing.review_reason,
      requires_review: existing.requires_review || verification.requiresReview,
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
  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const requiresReview = formData.get("requires_review") === "on";

  if (!id && (!employeeId || !date)) {
    overrideFail(formData, "Missing attendance record or employee/date.");
  }
  if (!id && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    overrideFail(formData, "Manual attendance date must be YYYY-MM-DD.");
  }
  if (!OVERRIDE_STATUSES.includes(statusRaw as AttendanceStatus)) {
    overrideFail(formData, "Pick a valid corrected status.");
  }
  if (!reason) attendanceFail("Override reason is required.");

  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const actor = actorFromCurrentUser(me);

  const admin = createAdminClient();

  const correctedStatus = statusRaw as AttendanceStatus;
  const recordSelect = `
    id, employee_id, date, expected_start, expected_end, shift_id, branch_id, mode,
    check_in_at, check_out_at, worked_minutes, status, late_minutes,
    is_late, is_half_day, is_absent, requires_review, updated_at
  `;
  const fetchExisting = id
    ? await admin
        .from("attendance_records")
        .select(recordSelect)
        .eq("id", id)
        .maybeSingle()
    : await admin
        .from("attendance_records")
        .select(recordSelect)
        .eq("employee_id", employeeId)
        .eq("date", date)
        .maybeSingle();

  if (fetchExisting.error) {
    overrideFail(formData, `Could not load attendance record: ${fetchExisting.error.message}`);
  }

  let record = fetchExisting.data;
  if (!record) {
    const { data: employee, error: empErr } = await admin
      .from("employees")
      .select(
        `
        id, user_id, branch_id, shift_id,
        custom_shift_enabled, custom_shift_start, custom_shift_end,
        app_users:user_id ( role ),
        shifts ( id, start_time, end_time, late_grace_minutes, half_day_threshold_minutes )
        `
      )
      .eq("id", employeeId)
      .maybeSingle();
    if (empErr || !employee) overrideFail(formData, "Employee not found.");

    const shiftValue = employee.shifts;
    const baselineShift = Array.isArray(shiftValue) ? shiftValue[0] : shiftValue;
    const shift = resolveEmployeeShift({ employee, shift: baselineShift });
    if (!shift) overrideFail(formData, "Employee has no shift for manual attendance.");

    const rowDate = date;
    const now = new Date().toISOString();
    const { data: inserted, error: insertErr } = await admin
      .from("attendance_records")
      .insert({
        employee_id: employee.id,
        date: rowDate,
        shift_id: employee.shift_id,
        expected_start: buildPktTimestamp(rowDate, shift.start_time),
        expected_end: buildPktTimestamp(rowDate, shift.end_time),
        status: correctedStatus,
        mode: modeForOverrideStatus(correctedStatus),
        branch_id: employee.branch_id,
        requires_review: requiresReview,
        is_absent: correctedStatus === "absent",
        is_late: correctedStatus === "late" || correctedStatus === "remote_late",
        is_half_day:
          correctedStatus === "half_day" || correctedStatus === "remote_half_day",
        updated_at: now,
      })
      .select(recordSelect)
      .single();
    if (insertErr || !inserted) {
      overrideFail(formData, `Could not create attendance record: ${insertErr?.message ?? "unknown"}`);
    }
    record = inserted;
  }
  if (!record) overrideFail(formData, "Attendance record not found.");

  const { data: targetEmployee, error: targetError } = await admin
    .from("employees")
    .select("id, user_id, branch_id, app_users:user_id ( role )")
    .eq("id", record.employee_id)
    .maybeSingle();
  if (targetError || !targetEmployee) overrideFail(formData, "Employee not found.");
  const targetAppUser = Array.isArray(targetEmployee.app_users)
    ? targetEmployee.app_users[0]
    : targetEmployee.app_users;
  if (
    !canOverrideAttendance(actor, {
      id: targetEmployee.id,
      user_id: targetEmployee.user_id,
      branch_id: targetEmployee.branch_id,
      user_role: targetAppUser?.role ?? "employee",
    })
  ) {
    overrideFail(formData, "You do not have permission to override this employee.");
  }

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
    mode: modeForOverrideStatus(correctedStatus),
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
    .eq("id", record.id);
  if (updateErr) overrideFail(formData, `Override failed: ${updateErr.message}`);

  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: me.authUserId,
    target_type: "attendance_record",
    target_id: id,
    action: "override_attendance",
    old_value: oldValue,
    new_value: newValue,
    reason,
  });
  if (auditErr) {
    overrideFail(formData, `Override saved, but audit log failed: ${auditErr.message}`);
  }

  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  revalidatePath("/employees");
  revalidatePath(`/admin/employees/${record.employee_id}`);
  overrideOk(formData, "Attendance override saved.");
}
