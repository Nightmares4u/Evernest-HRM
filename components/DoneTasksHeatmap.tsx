// Heatmap-style done-tasks grid.
// Rows = employees (assignees that appear in the task list). Columns = the
// last `weeks` ISO weeks (Monday-anchored). Cells show the count of done
// tasks that fell into that (assignee, week) bucket, colour-scaled.
//
// Pure server component — caller passes the task list + date anchors.

import { lastNWeekStarts, shortDatePKT, startOfWeek } from "@/lib/attendance/format";
import type { TaskRowVM } from "@/lib/db/tasks";

function cellClass(count: number): string {
  if (count === 0) return "bg-white text-gray-300";
  if (count <= 2) return "bg-green-100 text-green-900";
  if (count <= 5) return "bg-green-200 text-green-900";
  if (count <= 9) return "bg-green-400 text-white";
  return "bg-green-600 text-white";
}

export function DoneTasksHeatmap({
  tasks,
  endDate,
  weeks = 8,
}: {
  tasks: TaskRowVM[];
  endDate: string;
  weeks?: number;
}) {
  const weekStarts = lastNWeekStarts(weeks, endDate);
  const weekStartSet = new Set(weekStarts);

  // Collect unique assignees from the tasks (only people with at least one done task in range)
  const assigneeNames = new Map<string, string>();
  for (const t of tasks) {
    if (!assigneeNames.has(t.assigned_to)) {
      assigneeNames.set(t.assigned_to, t.assignee_name);
    }
  }
  const assignees = Array.from(assigneeNames.entries()).sort((a, b) =>
    a[1].localeCompare(b[1])
  );

  // bucket: assignee -> weekStart -> count
  const buckets = new Map<string, Map<string, number>>();
  for (const [id] of assignees) {
    const m = new Map<string, number>();
    for (const ws of weekStarts) m.set(ws, 0);
    buckets.set(id, m);
  }
  for (const t of tasks) {
    if (!t.completed_at) continue;
    const ws = startOfWeek(t.completed_at.slice(0, 10));
    if (!weekStartSet.has(ws)) continue;
    const m = buckets.get(t.assigned_to);
    if (!m) continue;
    m.set(ws, (m.get(ws) ?? 0) + 1);
  }

  // totals row
  const weekTotals = new Map<string, number>();
  for (const ws of weekStarts) {
    let s = 0;
    for (const [, m] of buckets) s += m.get(ws) ?? 0;
    weekTotals.set(ws, s);
  }

  if (assignees.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
        No done tasks in this range.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg bg-white shadow ring-1 ring-black/5">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50">
          <tr>
            <th
              className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-semibold uppercase tracking-wide text-gray-500"
              style={{ minWidth: 160 }}
            >
              Employee
            </th>
            {weekStarts.map((ws) => (
              <th
                key={ws}
                className="px-1 py-2 text-center font-semibold uppercase tracking-wide text-gray-500"
                style={{ minWidth: 80 }}
              >
                <div>{shortDatePKT(ws)}</div>
                <div className="text-[10px] font-normal text-gray-400">
                  {`week of`}
                </div>
              </th>
            ))}
            <th
              className="px-1 py-2 text-center font-semibold uppercase tracking-wide text-gray-500"
              style={{ minWidth: 60 }}
            >
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {assignees.map(([id, name]) => {
            const m = buckets.get(id)!;
            let rowTotal = 0;
            for (const c of m.values()) rowTotal += c;
            return (
              <tr key={id}>
                <td
                  className="sticky left-0 z-10 whitespace-nowrap border-r border-gray-100 bg-white px-3 py-2 align-middle text-gray-900"
                  style={{ minWidth: 160 }}
                >
                  {name}
                </td>
                {weekStarts.map((ws) => {
                  const c = m.get(ws) ?? 0;
                  return (
                    <td
                      key={ws}
                      className={`border-l border-gray-100 px-1 py-2 text-center align-middle font-medium tabular-nums ${cellClass(c)}`}
                      title={`${name} · week of ${shortDatePKT(ws)} · ${c} done`}
                    >
                      {c || ""}
                    </td>
                  );
                })}
                <td className="border-l border-gray-100 px-2 py-2 text-center font-semibold tabular-nums text-gray-900">
                  {rowTotal}
                </td>
              </tr>
            );
          })}
          <tr className="bg-gray-50 font-semibold">
            <td
              className="sticky left-0 z-10 border-r border-gray-200 bg-gray-50 px-3 py-2 text-gray-700"
              style={{ minWidth: 160 }}
            >
              Total
            </td>
            {weekStarts.map((ws) => (
              <td
                key={ws}
                className="border-l border-gray-100 px-1 py-2 text-center tabular-nums text-gray-700"
              >
                {weekTotals.get(ws) ?? 0}
              </td>
            ))}
            <td className="border-l border-gray-200 px-2 py-2 text-center tabular-nums text-gray-900">
              {tasks.length}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
