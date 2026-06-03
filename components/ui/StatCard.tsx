import type { ReactNode } from "react";

type Tone =
  | "green"
  | "amber"
  | "red"
  | "yellow"
  | "gray"
  | "indigo"
  | "blue"
  | "teal"
  | "text-green-700"
  | "text-amber-700"
  | "text-red-700"
  | "text-yellow-700";

const TONES: Record<string, { value: string; chip: string }> = {
  green: { value: "text-green-700", chip: "bg-green-50 text-green-700 ring-green-600/20" },
  amber: { value: "text-amber-700", chip: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  red: { value: "text-red-700", chip: "bg-red-50 text-red-700 ring-red-600/20" },
  yellow: { value: "text-yellow-700", chip: "bg-yellow-50 text-yellow-700 ring-yellow-600/20" },
  blue: { value: "text-blue-800", chip: "bg-blue-50 text-blue-700 ring-blue-600/20" },
  indigo: { value: "text-blue-800", chip: "bg-blue-50 text-blue-700 ring-blue-600/20" },
  teal: { value: "text-teal-700", chip: "bg-teal-50 text-teal-700 ring-teal-600/20" },
  gray: { value: "text-gray-900", chip: "bg-gray-100 text-gray-600 ring-gray-500/20" },
};

export function StatCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  icon?: ReactNode;
}) {
  const isTextTone = typeof tone === "string" && tone.startsWith("text-");
  const conf = tone && !isTextTone ? TONES[tone] : undefined;
  const valueColor = isTextTone ? (tone as string) : conf?.value ?? "text-gray-900";
  const chip = conf?.chip ?? "bg-gray-100 text-gray-600 ring-gray-500/20";

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200/70">
      <div className="flex items-start justify-between gap-3">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
        {icon && (
          <span
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${chip}`}
          >
            {icon}
          </span>
        )}
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
