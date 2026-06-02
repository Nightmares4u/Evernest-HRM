import Link from "next/link";
import { Chip } from "@/components/StatusChip";
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
import { getCurrentUser } from "@/lib/auth/current-user";

type Range = "this_week" | "last_week" | "this_month" | "last_month" | "all";

const RANGES: Array<{ key: Range; label: string }> = [
  { key: "this_week", label: "This week" },
  { key: "last_week", label: "Last week" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "all", label: "All time" },
];

function resolveRange(range: Range, today: string): { startIso: string; endIso: string } {
  if (range === "this_week") {
    return { startIso: startOfWeek(today), endIso: today };
  }
  if (range === "last_week") {
    const thisMon = startOfWeek(today);
    const prevMon = addDays(thisMon, -7);
    const prevSun = addDays(thisMon, -1);
    return { startIso: prevMon, endIso: prevSun };
  }
  if (range === "this_month") {
    return { startIso: startOfMonth(today), endIso: today };
  }
  if (range === "last_month") {
    const [y, m] = today.split("-").map((p) => Number.parseInt(p, 10));
    const prevY = m === 1 ? y - 1 : y;
    const prevM = m === 1 ? 12 : m - 1;
    const startIso = `${prevY}-${String(prevM).padStart(2, "0")}-01`;
    const endIso = endOfMonth(startIso);
    return { startIso, endIso };
  }
  return { startIso: "1970-01-01", endIso: today };
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export default async function MyTasksHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const range = (RANGES.find((r) => r.key === sp.range)?.key) ?? "this_week";
  const live = isSupabaseConfigured();
  const today = todayPKT();
  const me = await getCurrentUser();
  const { startIso, endIso } = resolveRange(range, today);
  const { since, until } = dateRangeToTimestamps(startIso, endIso);
  const tasks = me ? await listDoneTasks(since, until, me.authUserId) : [];

  const total = tasks.length;
  const thisWeekStart = startOfWeek(today);
  const thisMonthStart = startOfMonth(today);
  const doneThisWeek = tasks.filter(
    (t) => t.completed_at && t.completed_at.slice(0, 10) >= thisWeekStart
  ).length;
  const doneThisMonth = tasks.filter(
    (t) => t.completed_at && t.completed_at.slice(0, 10) >= thisMonthStart
  ).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">My done tasks</h1>
          <p className="text-sm text-gray-500">
            History of tasks you&apos;ve completed. Switch back to{" "}
            <Link href="/tasks" className="text-blue-600 hover:text-blue-500">
              active tasks
            </Link>
            .
          </p>
        </div>
        <RangeTabs current={range} basePath="/tasks/history" />
      </header>

      {!live && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Mock mode (no Supabase env).
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={`Total in ${RANGES.find((r) => r.key === range)?.label.toLowerCase()}`} value={total} />
        <Stat label="Done this week" value={doneThisWeek} />
        <Stat label="Done this month" value={doneThisMonth} />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">
          Tasks {tasks.length === 0 ? "" : `(${tasks.length})`}
        </h2>
        {tasks.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
            Nothing completed in this range.
          </p>
        ) : (
          <ol className="space-y-2">
            {tasks.map((t) => (
              <DoneRow key={t.id} t={t} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function RangeTabs({
  current,
  basePath,
}: {
  current: Range;
  basePath: string;
}) {
  return (
    <nav className="flex flex-wrap gap-2 text-xs">
      {RANGES.map((r) => (
        <Link
          key={r.key}
          href={`${basePath}?range=${r.key}`}
          className={`rounded-md px-3 py-1 ring-1 ring-inset ${
            current === r.key
              ? "bg-blue-50 text-blue-700 ring-blue-200"
              : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50"
          }`}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="overflow-hidden rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
      <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-green-700">
        {value}
      </p>
    </div>
  );
}

function priorityTone(p: string) {
  if (p === "urgent") return "red" as const;
  if (p === "low") return "gray" as const;
  return "blue" as const;
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
            Completed {shortDatePKT(completedDay)}
            {t.due_date && t.due_date !== completedDay && (
              <> &middot; was due {shortDatePKT(t.due_date)}</>
            )}{" "}
            &middot; assigned by {t.assigner_name}
          </div>
          {t.description && (
            <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-gray-600">
              {t.description}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
