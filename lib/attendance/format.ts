// Display helpers for attendance UI.
//
// Pure functions — no DB, no React. Server- and client-safe.
// Time formatting uses Asia/Karachi for display since that's the operational
// timezone. Underlying timestamps remain UTC.

import type { AttendanceStatus } from "@/lib/types/hrm";

export type ChipTone =
  | "green"
  | "amber"
  | "orange"
  | "red"
  | "blue"
  | "gray"
  | "indigo"
  | "yellow"
  | "teal";

export type ChipDescriptor = {
  label: string;
  tone: ChipTone;
};

const STATUS_CHIPS: Record<AttendanceStatus, ChipDescriptor> = {
  present: { label: "Present", tone: "green" },
  late: { label: "Late", tone: "amber" },
  half_day: { label: "Half-day", tone: "orange" },
  absent: { label: "Absent", tone: "red" },
  on_leave: { label: "On leave", tone: "blue" },
  day_off: { label: "Day off", tone: "gray" },
  public_holiday: { label: "Public holiday", tone: "gray" },
  remote_present: { label: "Remote — present", tone: "indigo" },
  remote_late: { label: "Remote — late", tone: "amber" },
  remote_half_day: { label: "Remote — half-day", tone: "orange" },
  remote_pending_review: { label: "Remote — pending review", tone: "yellow" },
  remote_rejected: { label: "Remote — rejected", tone: "red" },
  pending_review: { label: "Pending review", tone: "yellow" },
  approved_manually: { label: "Approved", tone: "teal" },
};

export function attendanceChip(status: AttendanceStatus): ChipDescriptor {
  return STATUS_CHIPS[status] ?? { label: status, tone: "gray" };
}

export const TONE_CLASSES: Record<ChipTone, string> = {
  green: "bg-green-50 text-green-700 ring-green-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  orange: "bg-orange-50 text-orange-700 ring-orange-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  blue: "bg-blue-50 text-blue-700 ring-blue-700/20",
  gray: "bg-gray-100 text-gray-700 ring-gray-500/20",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-700/20",
  yellow: "bg-yellow-50 text-yellow-800 ring-yellow-600/30",
  teal: "bg-teal-50 text-teal-700 ring-teal-700/20",
};

/**
 * Format a UTC timestamp as HH:MM in Asia/Karachi. Returns "—" for null.
 */
export function formatTimePKT(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/**
 * Format a UTC timestamp as a date "DD MMM YYYY" in Asia/Karachi.
 */
export function formatDatePKT(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/**
 * Format minutes worked as Hh Mm (e.g., 410 → "6h 50m"). Returns "—" for null.
 */
export function formatWorkedMinutes(min: number | null): string {
  if (min == null) return "—";
  const hours = Math.floor(min / 60);
  const minutes = min % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Today's date as YYYY-MM-DD in Asia/Karachi (used for matching DATE columns).
 */
export function todayPKT(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Day-of-week label in PKT. Used for the "Today is …" header.
 */
export function weekdayPKT(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    weekday: "long",
  }).format(now);
}

/**
 * Whether today (PKT) is Sunday — when the system is locked off.
 */
export function isSundayPKT(now: Date = new Date()): boolean {
  return weekdayPKT(now) === "Sunday";
}
