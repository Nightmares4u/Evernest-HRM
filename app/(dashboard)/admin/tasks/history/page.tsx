import Link from "next/link";
import { Chip } from "@/components/StatusChip";
import { DoneTasksHeatmap } from "@/components/DoneTasksHeatmap";
import {
  dateRangeToTimestamps,
  endOfMonth,
  shortDatePKT,
  startOfMonth,
  startOfWeek,
  todayPKT,
} from "@/lib/attendance/format";
import { isSupabaseConfigured } from "@/lib/db/queries";
import { listDoneTasks, type TaskRowVM } from "@/lib/db/tasks";

type Range = "this_week" | "last_week" | "this_month" | "last_month" | "last_8_weeks" | "all";

const RANGES: Array<{ key: Range; label: string }> = [
  { key: "this_week", label: "This week" },
  { key: "last_week", label: "Last week" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last_8_weeks", label: "Last 8 weeks" },
  { key: "all", label: "All time" },
];

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function resolveRange(range: Range, today: string): { startIso: string; endIso: string } {
  if (range === "this_week") return { startIso: startOfWeek(today), endIso: today };
  if (range === "last_week") {
    const thisMon = startOfWeek(today);
    return { startIso: addDays(thisMon, -7), endIso: addDays(thisMon, -1) };
  }
  if (range === "this_month") return { startIso: startOfMonth(today), endIso: today };
  if (range === "last_month") {
    const [y, m] = today.split("-").map((p) => Number.parseInt(p, 10));
    const prevY = m === 1 ? y - 1 : y;
    const prevM = m === 1 ? 12 : m - 1;
    const startIso = `${prevY}-${String(prevM).padStart(2, "0")}-01`;
    return { startIso, endIso: endOfMonth(startIso) };
  }
  if (range === "last_8_weeks") {
    const thisMon = startOfWeek(today);
    return { startIso: addDays(thisMon, -7 * 7), endIso: today };
  }
  return { startIso: "1970-01-01", endIso: today };
}

export default async function AdminTasksHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const range = (RANGES.find((r) => r.key === sp.range)?.key) ?? "this_week";
  const view = sp.view === "grid" ? "grid" : "list";
  const live = isSupabaseConfigured();
  const today = todayPKT();
  const { startIso, endIso } = resolveRange(range, today);
  const { since, until } = dateRangeToTimestamps(startIso, endIso);
  const tasks = await listDoneTasks(since, until);

  // Top-3 performers in this range
  const byAssignee = new Map<string, { name: string; count: number }>();
  for (const t of tasks) {
    const cur = byAssignee.get(t.assigned_to);
    if (cur) cur.count += 1;
    else
      byAssignee.set(t.assigned_to, { name: t.assignee_name, count: 1 });
  }
  const top = Array.from(byAssignee.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Tasks history</h1>
          <p className="text-sm text-gray-500">
            Done tasks across the team. Switch back to{" "}
            <Link href="/admin/tasks" className="text-indigo-600 hover:text-indigo-500">
              active tasks
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ViewTabs current={view} range={range} />
          <RangeTabs current={range} view={view} />
        </div>
      </header>

      {!live && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Mock mode (no Supabase env).
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total done" value={tasks.length} />
        {top.map((t, i) => (
          <Stat
            key={i}
            label={`#${i + 1} ${t.name.split(" ")[0]}`}
            value={t.count}
            sublabel={t.name}
          />
        ))}
        {Array.from({ length: Math.max(0, 3 - top.length) }).map((_, i) => (
          <Stat key={`p-${i}`} label={`#${top.length + i + 1}`} value={0} sublabel="—" />
        ))}
      </div>

      {view === "grid" ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">
            Heatmap — last 8 weeks
          </h2>
          <p className="text-xs text-gray-500">
            Cells count tasks completed by each assignee per week. Cell colour
            scales with volume.
          </p>
          <DoneTasksHeatmap tasks={tasks} endDate={today} weeks={8} />
        </section>
      ) : (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">
            Tasks {tasks.length === 0 ? "" : `(${tasks.length})`}
          </h2>
          {tasks.length === 0 ? (
            <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
              No tasks completed in this range.
            </p>
          ) : (
            <ol className="space-y-2">
              {tasks.map((t) => (
                <DoneRow key={t.id} t={t} />
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}

function ViewTabs({ current, range }: { current: "list" | "grid"; range: Range }) {
  const cls = (active: boolean) =>
    `rounded-md px-3 py-1 text-xs ring-1 ring-inset ${
      active
        ? "bg-indigo-50 text-indigo-700 ring-indigo-200"
        : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50"
    }`;
  return (
    <nav className="flex gap-2">
      <Link
        href={`/admin/tasks/history?view=list&range=${range}`}
        className={cls(current === "list")}
      >
        List
      </Link>
      <Link
        href={`/admin/tasks/history?view=grid&range=${range}`}
        className={cls(current === "grid")}
      >
        Grid
      </Link>
    </nav>
  );
}

function RangeTabs({ current, view }: { current: Range; view: "list" | "grid" }) {
  return (
    <nav className="flex flex-wrap gap-2 text-xs">
      {RANGES.map((r) => (
        <Link
          key={r.key}
          href={`/admin/tasks/history?view=${view}&range=${r.key}`}
          className={`rounded-md px-3 py-1 ring-1 ring-inset ${
            current === r.key
              ? "bg-indigo-50 text-indigo-700 ring-indigo-200"
              : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50"
          }`}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}

function Stat({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: number;
  sublabel?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
      <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-green-700">
        {value}
      </p>
      {sublabel && (
        <p className="mt-1 truncate text-xs text-gray-500">{sublabel}</p>
      )}
    </div>
  );
}

function priorityTone(p: string) {
  if (p === "urgent") return "red" as const;
  if (p === "low") return "gray" as const;
  return "indigo" as const;
}

function DoneRow({ t }: { t: TaskRowVM }) {
  const completedDay = t.completed_at?.slice(0, 10) ?? t.due_date;
  return (
    <li className="rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">{t.title}</span>
            <Chip label={t.priority} tone={priorityTone(t.priority)} />
            <Chip label="done" tone="green" />
            {t.requires_approval && t.approved_by && (
              <Chip label="approved" tone="green" />
            )}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            <span className="font-medium text-gray-700">{t.assignee_name}</span>{" "}
            &middot; completed {shortDatePKT(completedDay)}
            {t.due_date && t.due_date !== completedDay && (
              <> &middot; was due {shortDatePKT(t.due_date)}</>
            )}{" "}
            &middot; assigned by {t.assigner_name}
            {t.branch_code && <> &middot; {t.branch_code}</>}
          </div>
        </div>
      </div>
    </li>
  );
}
