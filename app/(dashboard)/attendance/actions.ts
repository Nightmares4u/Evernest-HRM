"use server";

// Check-in / check-out server actions. Both are env-safe — they redirect to
// /dashboard?error=… with a friendly message instead of throwing when business
// rules block the action (Sunday, holiday, exempt employee, etc.).

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayPKT } from "@/lib/attendance/format";
import {
  buildPktTimestamp,
  computeOnCheckIn,
  computeOnCheckOut,
  isoWeekdayPKT,
} from "@/lib/attendance/policy";
import type { AttendanceMode } from "@/lib/types/hrm";

function fail(msg: string): never {
  redirect(`/dashboard?error=${encodeURIComponent(msg)}`);
}

type ShiftLite = {
  id: string;
  start_time: string;
  end_time: string;
  late_grace_minutes: number;
  half_day_threshold_minutes: number;
};

type EmployeeLite = {
  id: string;
  branch_id: string | null;
  attendance_exempt: boolean;
  remote_allowed: boolean;
  remote_default_days: number[] | null;
  shifts: ShiftLite | ShiftLite[] | null;
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
      shifts ( id, start_time, end_time, late_grace_minutes, half_day_threshold_minutes )
      `
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) fail(`Could not load employee record: ${error.message}`);
  if (!data) fail("No employee record found for your account.");

  const emp = data as unknown as EmployeeLite;
  const shift = Array.isArray(emp.shifts) ? emp.shifts[0] : emp.shifts;
  if (!shift) fail("No shift assigned to your account. Ask admin to set one.");

  return { supabase, employee: emp, shift };
}

export async function checkIn() {
  const { supabase, employee, shift } = await loadMyEmployee();

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

  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0].trim() ||
    headerStore.get("x-real-ip") ||
    null;
  const userAgent = headerStore.get("user-agent") || null;

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
      branch_id: employee.branch_id,
    },
    { onConflict: "employee_id,date" }
  );

  if (error) fail(`Check-in failed: ${error.message}`);

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

  revalidatePath("/dashboard");
  revalidatePath("/attendance");
}
