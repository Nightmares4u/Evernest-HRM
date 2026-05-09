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
type HistoryView = "list" | "grid";
type EmployeeStack = {
  id: string;
  name: string;
  email: string;
  branchCode: string | null;
  tasks: TaskRowVM[];
};

const RANGES: Array<{ key: Range; label: string }> = [
  { key: "this_week", label: "This week" },
  { key: "last_week", label: "Last week" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last_8_weeks", label: "Last 8 weeks" },
  { key: "all", label: "All time" },
];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function isMonthKey(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number.parseInt(value.slice(5, 7), 10);
  return month >= 1 && month <= 12;
}

function monthLabel(monthKey: string): string {
  const year = monthKey.slice(0, 4);
  const monthIndex = Number.parseInt(monthKey.slice(5, 7), 10) - 1;
  return `${MONTHS[monthIndex]} ${year}`;
}

function resolveWindow(
  range: Range,
  today: string,
  selectedMonth: string | null
): { startIso: string; endIso: string; label: string } {
  if (selectedMonth) {
    const startIso = `${selectedMonth}-01`;
    const endIso = selectedMonth === today.slice(0, 7) ? today : endOfMonth(startIso);
    return { startIso, endIso, label: monthLabel(selectedMonth) };
  }

  if (range === "this_week") {
    return { startIso: startOfWeek(today), endIso: today, label: "This week" };
  }
  if (range === "last_week") {
    const thisMon = startOfWeek(today);
    return { startIso: addDays(thisMon, -7), endIso: addDays(thisMon, -1), label: "Last week" };
  }
  if (range === "this_month") {
    return { startIso: startOfMonth(today), endIso: today, label: "This month" };
  }
  if (range === "last_month") {
    const [y, m] = today.split("-").map((p) => Number.parseInt(p, 10));
    const prevY = m === 1 ? y - 1 : y;
    const prevM = m === 1 ? 12 : m - 1;
    const startIso = `${prevY}-${String(prevM).padStart(2, "0")}-01`;
    return { startIso, endIso: endOfMonth(startIso), label: "Last month" };
  }
  if (range === "last_8_weeks") {
    const thisMon = startOfWeek(today);
    return { startIso: addDays(thisMon, -7 * 7), endIso: today, label: "Last 8 weeks" };
  }
  return { startIso: "1970-01-01", endIso: today, label: "All time" };
}

function historyHref({
  view,
  range,
  month,
}: {
  view: HistoryView;
  range?: Range;
  month?: string | null;
}) {
  const params = new URLSearchParams({ view });
  if (month) params.set("month", month);
  else params.set("range", range ?? "this_month");
  return `/admin/tasks/history?${params.toString()}`;
}

function groupByEmployee(tasks: TaskRowVM[]): EmployeeStack[] {
  const groups = new Map<string, EmployeeStack>();
  for (const task of tasks) {
    const current = groups.get(task.assigned_to);
    if (current) {
      current.tasks.push(task);
      continue;
    }

    groups.set(task.assigned_to, {
      id: task.assigned_to,
      name: task.assignee_name,
      email: task.assignee_email,
      branchCode: task.branch_code,
      tasks: [task],
    });
  }

  return Array.from(groups.values()).sort((a, b) => {
    const countDiff = b.tasks.length - a.tasks.length;
    if (countDiff !== 0) return countDiff;
    return a.name.localeCompare(b.name);
  });
}

export default async function AdminTasksHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; view?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const selectedMonth = isMonthKey(sp.month) ? sp.month : null;
  const range = (RANGES.find((r) => r.key === sp.range)?.key) ?? "this_month";
  const view: HistoryView = sp.view === "grid" ? "grid" : "list";
  const live = isSupabaseConfigured();
  const today = todayPKT();
  const { startIso, endIso, label } = resolveWindow(range, today, selectedMonth);
  const { since, until } = dateRangeToTimestamps(startIso, endIso);
  const tasks = await listDoneTasks(since, until);
  const employeeStacks = groupByEmployee(tasks);
  const top = employeeStacks.slice(0, 3);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Tasks history</h1>
          <p className="text-sm text-gray-500">
            Done tasks across the team for {label.toLowerCase()}. Switch back to{" "}
            <Link href="/admin/tasks" className="text-indigo-600 hover:text-indigo-500">
              active tasks
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ViewTabs current={view} range={range} month={selectedMonth} />
          <RangeTabs current={range} view={view} />
        </div>
      </header>

      {!live && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Mock mode (no Supabase env).
        </div>
      )}

      <MonthSelector today={today} selectedMonth={selectedMonth} view={view} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total done" value={tasks.length} />
        {top.map((t, i) => (
          <Stat
            key={t.id}
            label={`#${i + 1} ${t.name.split(" ")[0]}`}
            value={t.tasks.length}
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
            Heatmap — {label}
          </h2>
          <p className="text-xs text-gray-500">
            Cells count tasks completed by each assignee per week. Cell colour
            scales with volume.
          </p>
          <DoneTasksHeatmap tasks={tasks} endDate={endIso} weeks={8} />
        </section>
      ) : (
        <DoneTaskStack groups={employeeStacks} total={tasks.length} label={label} />
      )}
    </div>
  );
}

function ViewTabs({
  current,
  range,
  month,
}: {
  current: HistoryView;
  range: Range;
  month: string | null;
}) {
  const cls = (active: boolean) =>
    `rounded-md px-3 py-1 text-xs ring-1 ring-inset ${
      active
        ? "bg-indigo-50 text-indigo-700 ring-indigo-200"
        : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50"
    }`;
  return (
    <nav className="flex gap-2">
      <Link
        href={historyHref({ view: "list", range, month })}
        className={cls(current === "list")}
      >
        List
      </Link>
      <Link
        href={historyHref({ view: "grid", range, month })}
        className={cls(current === "grid")}
      >
        Heatmap
      </Link>
    </nav>
  );
}

function RangeTabs({ current, view }: { current: Range; view: HistoryView }) {
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

function MonthSelector({
  today,
  selectedMonth,
  view,
}: {
  today: string;
  selectedMonth: string | null;
  view: HistoryView;
}) {
  const year = Number.parseInt((selectedMonth ?? today).slice(0, 4), 10);
  const currentMonth = today.slice(0, 7);

  return (
    <section className="rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Monthly done-task stack</h2>
          <p className="text-xs text-gray-500">
            Pick a month to review completed task volume employee by employee.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Link
            href={historyHref({ view, month: `${year - 1}-12` })}
            className="rounded-md bg-white px-3 py-1 text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
          >
            {year - 1}
          </Link>
          <span className="font-semibold text-gray-700">{year}</span>
          <Link
            href={historyHref({ view, month: `${year + 1}-01` })}
            className="rounded-md bg-white px-3 py-1 text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
          >
            {year + 1}
          </Link>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6 lg:grid-cols-12">
        {MONTHS.map((month, index) => {
          const monthKey = `${year}-${String(index + 1).padStart(2, "0")}`;
          const active = selectedMonth === monthKey || (!selectedMonth && monthKey === currentMonth);
          return (
            <Link
              key={monthKey}
              href={historyHref({ view, month: monthKey })}
              className={`rounded-md px-3 py-2 text-center ring-1 ring-inset ${
                active
                  ? "bg-green-50 font-semibold text-green-700 ring-green-200"
                  : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50"
              }`}
            >
              {month}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function DoneTaskStack({
  groups,
  total,
  label,
}: {
  groups: EmployeeStack[];
  total: number;
  label: string;
}) {
  if (groups.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">Completed task list</h2>
        <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
          No tasks completed in this range.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">
          Completed task list grouped by employee ({total})
        </h2>
        <p className="text-xs text-gray-500">
          Employee-wise stack for {label.toLowerCase()}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <div
            key={group.id}
            className="rounded-lg bg-white p-4 shadow ring-1 ring-black/5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{group.name}</p>
                <p className="truncate text-xs text-gray-500">{group.email || "No email"}</p>
              </div>
              <Chip label={`${group.tasks.length} done`} tone="green" />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {group.branchCode && <Chip label={group.branchCode} tone="gray" />}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {groups.map((group) => (
          <section key={group.id} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-800">{group.name}</h3>
              <span className="text-xs tabular-nums text-gray-500">
                {group.tasks.length} completed
              </span>
            </div>
            <ol className="space-y-2">
              {group.tasks.map((t) => (
                <DoneRow key={t.id} t={t} />
              ))}
            </ol>
          </section>
        ))}
      </div>
    </section>
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
