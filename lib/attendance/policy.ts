// Pure attendance-rule helpers. No DB, no React, no I/O.
// All time math is in milliseconds; PKT is constant UTC+5 (no DST).

import type { AttendanceMode, AttendanceStatus } from "@/lib/types/hrm";

/**
 * ISO weekday for a Date in Asia/Karachi (Mon=1 .. Sun=7).
 */
export function isoWeekdayPKT(d: Date = new Date()): number {
  const short = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    weekday: "short",
  }).format(d);
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[short] ?? 0;
}

/**
 * Build a PKT-anchored timestamptz string from a date and a HH:MM[:SS] time.
 * Karachi is UTC+5 with no DST, so the offset is fixed at +05:00.
 */
export function buildPktTimestamp(dateIso: string, time: string): string {
  const t = time.length === 5 ? `${time}:00` : time;
  return `${dateIso}T${t}+05:00`;
}

export type CheckInResult = {
  isLate: boolean;
  lateMinutes: number;
  status: AttendanceStatus;
};

/**
 * Decide late/on-time + status at the moment of check-in.
 * `lateMinutes` is measured from the shift start (not from the grace edge),
 * so 11:11 against an 11:00 shift with 10-min grace = 11 minutes late.
 */
export function computeOnCheckIn(args: {
  expectedStartIso: string;
  checkInIso: string;
  graceMinutes: number;
  mode: AttendanceMode;
}): CheckInResult {
  const startMs = Date.parse(args.expectedStartIso);
  const checkInMs = Date.parse(args.checkInIso);
  const graceMs = args.graceMinutes * 60_000;
  const isLate = checkInMs > startMs + graceMs;
  const lateMinutes = isLate ? Math.floor((checkInMs - startMs) / 60_000) : 0;

  let status: AttendanceStatus;
  if (args.mode === "remote") {
    status = isLate ? "remote_late" : "remote_present";
  } else {
    status = isLate ? "late" : "present";
  }
  return { isLate, lateMinutes, status };
}

/**
 * Soft IP-whitelist check. The branch's whitelist is a free-form text[] of
 * IPv4/IPv6 strings. Empty whitelist = soft mode = always pass. Mismatch
 * surfaces as requires_review = true on the attendance row, never as a hard
 * block. CIDR support is intentionally deferred — exact match only for now.
 */
export function ipMatchesWhitelist(
  ip: string | null,
  whitelist: string[] | null | undefined
): boolean {
  if (!whitelist || whitelist.length === 0) return true;
  if (!ip) return false;
  return whitelist.includes(ip);
}

export type CheckOutResult = {
  workedMinutes: number;
  isHalfDay: boolean;
  status: AttendanceStatus;
};

/**
 * Compute worked minutes + half-day flag + final status at check-out.
 * Status preserves the late/on-time classification from check-in unless
 * it gets demoted to half-day.
 */
export function computeOnCheckOut(args: {
  checkInIso: string;
  checkOutIso: string;
  halfDayThresholdMinutes: number;
  mode: AttendanceMode;
  isLate: boolean;
}): CheckOutResult {
  const inMs = Date.parse(args.checkInIso);
  const outMs = Date.parse(args.checkOutIso);
  const workedMinutes = Math.max(0, Math.floor((outMs - inMs) / 60_000));
  const isHalfDay = workedMinutes < args.halfDayThresholdMinutes;

  let status: AttendanceStatus;
  if (isHalfDay) {
    status = args.mode === "remote" ? "remote_half_day" : "half_day";
  } else if (args.isLate) {
    status = args.mode === "remote" ? "remote_late" : "late";
  } else {
    status = args.mode === "remote" ? "remote_present" : "present";
  }
  return { workedMinutes, isHalfDay, status };
}
