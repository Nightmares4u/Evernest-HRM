import type { ChipTone } from "@/lib/attendance/format";
import { TONE_CLASSES } from "@/lib/attendance/format";

export function StatusBadge({
  label,
  tone = "gray",
}: {
  label: string;
  tone?: ChipTone;
}) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[tone]}`}>
      {label}
    </span>
  );
}
