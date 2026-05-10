import {
  TONE_CLASSES,
  attendanceChip,
  type ChipTone,
} from "@/lib/attendance/format";
import type { AttendanceStatus } from "@/lib/types/hrm";

const BASE = "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset";

export function StatusChip({ status }: { status: AttendanceStatus }) {
  const { label, tone } = attendanceChip(status);
  return <span className={`${BASE} ${TONE_CLASSES[tone]}`}>{label}</span>;
}

export function Chip({
  label,
  tone = "gray",
}: {
  label: string;
  tone?: ChipTone;
}) {
  return <span className={`${BASE} ${TONE_CLASSES[tone]}`}>{label}</span>;
}
