import type { ReactNode } from "react";

const TONES = {
  blue: "bg-blue-100 text-blue-700 ring-blue-50",
  green: "bg-green-100 text-green-700 ring-green-50",
  amber: "bg-amber-100 text-amber-700 ring-amber-50",
  red: "bg-red-100 text-red-700 ring-red-50",
  gray: "bg-gray-100 text-gray-500 ring-gray-50",
  teal: "bg-teal-100 text-teal-700 ring-teal-50",
} as const;

export type TimelineTone = keyof typeof TONES;

export type TimelineItem = {
  id: string;
  title: string;
  description?: string | null;
  at: string;
  icon?: ReactNode;
  tone?: TimelineTone;
};

export function ActivityTimeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
        No activity recorded yet.
      </p>
    );
  }
  return (
    <ol className="relative space-y-5">
      {items.map((item, i) => (
        <li key={item.id} className="relative flex gap-3">
          {i < items.length - 1 && (
            <span
              className="absolute left-[15px] top-8 h-[calc(100%-0.25rem)] w-px bg-gray-200"
              aria-hidden="true"
            />
          )}
          <span
            className={`relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ${
              TONES[item.tone ?? "gray"]
            }`}
          >
            {item.icon ?? <span className="h-1.5 w-1.5 rounded-full bg-current" />}
          </span>
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-sm font-medium text-gray-900">{item.title}</p>
            {item.description && (
              <p className="mt-0.5 text-sm text-gray-600">{item.description}</p>
            )}
            <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-gray-400">
              {item.at}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
