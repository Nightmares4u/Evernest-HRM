import Link from "next/link";
import { Chip } from "@/components/StatusChip";
import { TaskScheduleGrid } from "@/components/TaskScheduleGrid";
import {
  listMyTasks,
  listTasksInRange,
  type TaskRowVM,
} from "@/lib/db/tasks";
import { isSupabaseConfigured } from "@/lib/db/queries";
import { todayPKT } from "@/lib/attendance/format";
import { getCurrentUser } from "@/lib/auth/current-user";
import { markTaskDone, submitForApproval } from "./actions";

const SCHEDULE_DAYS = 7;

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view === "schedule" ? "schedule" : "list";
  const live = isSupabaseConfigured();
  const today = todayPKT();
  const endDate = addDays(today, SCHEDULE_DAYS - 1);

  const me = await getCurrentUser();
  const [groups, scheduleTasks] = await Promise.all([
    listMyTasks(),
    me ? listTasksInRange(today, endDate, me.authUserId) : Promise.resolve<TaskRowVM[]>([]),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">My tasks</h1>
          <p className="text-sm text-gray-500">
            Switch between a list view and the {SCHEDULE_DAYS}-day schedule grid.
          </p>
        </div>
        <ViewTabs current={view} basePath="/tasks" />
      </header>

      {sp.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {sp.error}
        </div>
      )}
      {sp.ok && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          {sp.ok}
        </div>
      )}
      {!live && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Mock mode — no Supabase env. Sign in to see real tasks.
        </div>
      )}

      {view === "list" ? (
        <ListView groups={groups} />
      ) : (
        <ScheduleView
          tasks={scheduleTasks}
          startDate={today}
          counts={{
            today: groups.today.length,
            upcoming: groups.upcoming.length,
            overdue: groups.overdue.length,
            awaiting: groups.awaiting_approval.length,
          }}
        />
      )}
    </div>
  );
}

function ViewTabs({
  current,
  basePath,
}: {
  current: "list" | "schedule";
  basePath: string;
}) {
  const cls = (active: boolean) =>
    `rounded-md px-3 py-1 text-xs ring-1 ring-inset ${
      active
        ? "bg-indigo-50 text-indigo-700 ring-indigo-200"
        : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50"
    }`;
  return (
    <nav className="flex gap-2">
      <Link href={`${basePath}?view=list`} className={cls(current === "list")}>
        List
      </Link>
      <Link
        href={`${basePath}?view=schedule`}
        className={cls(current === "schedule")}
      >
        Schedule
      </Link>
      <Link
        href={`${basePath}/history`}
        className="rounded-md bg-white px-3 py-1 text-xs text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
      >
        Done history
      </Link>
    </nav>
  );
}

function ListView({ groups }: { groups: Awaited<ReturnType<typeof listMyTasks>> }) {
  return (
    <>
      <div className="flex flex-wrap gap-2 text-xs">
        <Chip label={`${groups.today.length} today`} tone="green" />
        <Chip label={`${groups.upcoming.length} upcoming`} tone="gray" />
        <Chip label={`${groups.overdue.length} overdue`} tone="red" />
        <Chip
          label={`${groups.awaiting_approval.length} awaiting approval`}
          tone="yellow"
        />
      </div>
      <Section title="Today" tasks={groups.today} emptyHint="Nothing due today." />
      <Section
        title="Awaiting approval"
        tasks={groups.awaiting_approval}
        emptyHint="No tasks waiting for super-admin review."
      />
      <Section
        title="Overdue"
        tasks={groups.overdue}
        emptyHint="Nothing overdue. Keep it that way."
        tone="red"
      />
      <Section
        title="Upcoming"
        tasks={groups.upcoming}
        emptyHint="Nothing upcoming."
      />
      <Section
        title="Recently done"
        tasks={groups.recently_done}
        emptyHint="No completions yet."
        compact
      />
    </>
  );
}

function ScheduleView({
  tasks,
  startDate,
  counts,
}: {
  tasks: TaskRowVM[];
  startDate: string;
  counts: { today: number; upcoming: number; overdue: number; awaiting: number };
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <Chip label={`${counts.today} today`} tone="green" />
        <Chip label={`${counts.upcoming} upcoming`} tone="gray" />
        <Chip label={`${counts.overdue} overdue`} tone="red" />
        <Chip
          label={`${counts.awaiting} awaiting approval`}
          tone="yellow"
        />
      </div>
      <p className="text-xs text-gray-500">
        Cells show tasks placed at their due time. Tasks without a specific time
        bucket into the EOD column. Sundays are weekly off (locked).
      </p>
      <TaskScheduleGrid
        tasks={tasks}
        startDate={startDate}
        days={SCHEDULE_DAYS}
        showAssignee={false}
      />
    </div>
  );
}

function Section({
  title,
  tasks,
  emptyHint,
  tone,
  compact,
}: {
  title: string;
  tasks: TaskRowVM[];
  emptyHint: string;
  tone?: "red";
  compact?: boolean;
}) {
  return (
    <section className="space-y-2">
      <h2
        className={`text-sm font-semibold ${
          tone === "red" ? "text-red-700" : "text-gray-700"
        }`}
      >
        {title}
        <span className="ml-2 text-xs font-normal text-gray-500">
          {tasks.length}
        </span>
      </h2>
      {tasks.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
          {emptyHint}
        </p>
      ) : (
        <div className={compact ? "space-y-1" : "space-y-2"}>
          {tasks.map((t) => (
            <TaskRow key={t.id} t={t} compact={compact} />
          ))}
        </div>
      )}
    </section>
  );
}

function priorityTone(p: string) {
  if (p === "urgent") return "red" as const;
  if (p === "low") return "gray" as const;
  return "indigo" as const;
}

function statusTone(s: string) {
  if (s === "done") return "green" as const;
  if (s === "in_progress") return "yellow" as const;
  if (s === "blocked") return "red" as const;
  return "gray" as const;
}

function TaskRow({ t, compact }: { t: TaskRowVM; compact?: boolean }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">{t.title}</span>
            <Chip label={t.priority} tone={priorityTone(t.priority)} />
            <Chip label={t.status} tone={statusTone(t.status)} />
            {t.requires_approval && (
              <Chip label="approval required" tone="yellow" />
            )}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Due {t.due_date}
            {t.due_time && (
              <> at <span className="tabular-nums">{t.due_time.slice(0, 5)}</span></>
            )}{" "}
            &middot; assigned by {t.assigner_name}
            {t.branch_code && <> &middot; {t.branch_code}</>}
            {t.department_name && <> &middot; {t.department_name}</>}
          </div>
          {!compact && t.description && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
              {t.description}
            </p>
          )}
        </div>

        {!compact && t.status !== "done" && (
          <div className="flex flex-col gap-2 sm:min-w-[14rem]">
            {t.requires_approval ? (
              <form action={submitForApproval} className="rounded-md border border-yellow-200 bg-yellow-50/40 p-2">
                <input type="hidden" name="id" value={t.id} />
                <label className="block text-xs font-medium text-yellow-900">
                  Submission note (optional)
                </label>
                <input
                  type="text"
                  name="note"
                  className="mt-1 block w-full rounded border border-yellow-200 bg-white px-2 py-1 text-sm"
                  placeholder="What did you do?"
                />
                <button
                  type="submit"
                  className="mt-2 w-full rounded-md bg-yellow-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-yellow-500"
                >
                  Submit for approval
                </button>
              </form>
            ) : (
              <form action={markTaskDone}>
                <input type="hidden" name="id" value={t.id} />
                <button
                  type="submit"
                  className="w-full rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-500"
                >
                  Mark done
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
