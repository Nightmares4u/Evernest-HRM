// Schedule grid: dates as rows, hours as columns. Tasks render as small
// priority-coloured cards in the cell that matches their (due_date, due_time).
// Tasks without due_time bucket into the "EOD" column.
//
// Pure server component. No DB calls — caller passes tasks + range.

import type { TaskRowVM } from "@/lib/db/tasks";

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18] as const;
type HourCol = (typeof HOURS)[number] | "EOD";

function priorityClasses(p: string) {
  if (p === "urgent")
    return "bg-red-50 text-red-800 border-red-200 hover:bg-red-100";
  if (p === "low")
    return "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100";
  return "bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100";
}

function statusClasses(s: string) {
  if (s === "done") return "opacity-50 line-through";
  if (s === "blocked") return "ring-1 ring-red-300";
  if (s === "in_progress") return "ring-1 ring-yellow-300";
  return "";
}

function bucketHour(due_time: string | null | undefined): HourCol {
  if (!due_time) return "EOD";
  const h = Number.parseInt(due_time.slice(0, 2), 10);
  if (!Number.isFinite(h)) return "EOD";
  if (h < 9) return 9;
  if (h > 18) return "EOD";
  return h as HourCol;
}

function dateRange(startIso: string, days: number): string[] {
  const out: string[] = [];
  const [y, m, d] = startIso.split("-").map((p) => Number.parseInt(p, 10));
  for (let i = 0; i < days; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    out.push(dt.toISOString().slice(0, 10));
  }
  return out;
}

function dayLabel(iso: string): { weekday: string; dm: string; dow: number } {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
  }).format(dt);
  const dm = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
  }).format(dt);
  return { weekday, dm, dow: dt.getUTCDay() };
}

export function TaskScheduleGrid({
  tasks,
  startDate,
  days = 7,
  showAssignee = true,
}: {
  tasks: TaskRowVM[];
  startDate: string;
  days?: number;
  showAssignee?: boolean;
}) {
  const dates = dateRange(startDate, days);
  const dateSet = new Set(dates);

  // dateIso -> hourCol -> tasks[]
  const grid = new Map<string, Map<HourCol, TaskRowVM[]>>();
  for (const d of dates) {
    const m = new Map<HourCol, TaskRowVM[]>();
    for (const h of HOURS) m.set(h, []);
    m.set("EOD", []);
    grid.set(d, m);
  }
  for (const t of tasks) {
    if (!dateSet.has(t.due_date)) continue;
    const slot = bucketHour(t.due_time);
    grid.get(t.due_date)!.get(slot)!.push(t);
  }

  const colWidth = 96; // px

  return (
    <div className="overflow-x-auto rounded-lg bg-white shadow ring-1 ring-black/5">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50">
          <tr>
            <th
              className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-semibold uppercase tracking-wide text-gray-500"
              style={{ minWidth: 110 }}
            >
              Day
            </th>
            {HOURS.map((h) => (
              <th
                key={h}
                className="px-1 py-2 text-center font-semibold uppercase tracking-wide text-gray-500"
                style={{ minWidth: colWidth }}
              >
                {String(h).padStart(2, "0")}:00
              </th>
            ))}
            <th
              className="px-1 py-2 text-center font-semibold uppercase tracking-wide text-gray-500"
              style={{ minWidth: colWidth }}
            >
              EOD
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {dates.map((d) => {
            const { weekday, dm, dow } = dayLabel(d);
            const isSunday = dow === 0;
            return (
              <tr key={d} className={isSunday ? "bg-gray-50/60" : "bg-white"}>
                <td
                  className="sticky left-0 z-10 whitespace-nowrap border-r border-gray-100 bg-inherit px-3 py-2 align-top text-gray-700"
                  style={{ minWidth: 110 }}
                >
                  <div className="font-medium text-gray-900">{weekday}</div>
                  <div className="text-[11px] text-gray-500">{dm}</div>
                  {isSunday && (
                    <div className="mt-1 text-[10px] uppercase tracking-wide text-gray-400">
                      Weekly off
                    </div>
                  )}
                </td>
                {HOURS.map((h) => (
                  <td
                    key={h}
                    className="border-l border-gray-100 p-1 align-top"
                    style={{ minWidth: colWidth }}
                  >
                    <Cell tasks={grid.get(d)!.get(h)!} showAssignee={showAssignee} />
                  </td>
                ))}
                <td
                  className="border-l border-gray-100 p-1 align-top"
                  style={{ minWidth: colWidth }}
                >
                  <Cell tasks={grid.get(d)!.get("EOD")!} showAssignee={showAssignee} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cell({
  tasks,
  showAssignee,
}: {
  tasks: TaskRowVM[];
  showAssignee: boolean;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="space-y-1">
      {tasks.map((t) => (
        <div
          key={t.id}
          className={`rounded border px-1.5 py-1 text-[10px] leading-tight transition ${priorityClasses(t.priority)} ${statusClasses(t.status)}`}
          title={`${t.title}${t.assignee_name ? ` — ${t.assignee_name}` : ""}${t.due_time ? ` @ ${t.due_time.slice(0, 5)}` : ""}`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="truncate font-medium">{t.title}</span>
            {t.due_time && (
              <span className="ml-1 text-[9px] tabular-nums opacity-75">
                {t.due_time.slice(0, 5)}
              </span>
            )}
          </div>
          {showAssignee && t.assignee_name && (
            <div className="truncate text-[9px] opacity-75">
              {t.assignee_name}
            </div>
          )}
          {t.requires_approval && t.status !== "done" && (
            <div className="mt-0.5 inline-block rounded bg-yellow-100 px-1 text-[8px] uppercase tracking-wide text-yellow-800">
              approval
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
