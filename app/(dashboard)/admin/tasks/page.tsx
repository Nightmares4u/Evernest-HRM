import Link from "next/link";
import { redirect } from "next/navigation";
import { Chip } from "@/components/StatusChip";
import { TaskScheduleGrid } from "@/components/TaskScheduleGrid";
import {
  type AdminTaskFilter,
  listAssignableUsers,
  listTasksForAdmin,
  listTasksInRange,
  type TaskRowVM,
} from "@/lib/db/tasks";
import { isSupabaseConfigured } from "@/lib/db/queries";
import { todayPKT } from "@/lib/attendance/format";
import { approveTask, createTask, rejectTask } from "../../tasks/actions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isBranchManagerOrAboveRole } from "@/lib/auth/permissions";

const SCHEDULE_DAYS = 14;

const FILTER_OPTIONS: Array<{ key: AdminTaskFilter; label: string }> = [
  { key: "open", label: "Open" },
  { key: "pending_approval", label: "Pending approval" },
  { key: "overdue", label: "Overdue" },
  { key: "all", label: "All" },
];

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export default async function AdminTasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    ok?: string;
    filter?: string;
    view?: string;
  }>;
}) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isBranchManagerOrAboveRole(me.appUser.role)) {
    redirect("/dashboard?error=Manager access required");
  }
  const isSuperAdmin = me.appUser.role === "super_admin";
  const filter: AdminTaskFilter =
    FILTER_OPTIONS.find((f) => f.key === sp.filter)?.key ?? "open";
  const view = sp.view === "schedule" ? "schedule" : "list";
  const live = isSupabaseConfigured();
  const today = todayPKT();
  const scheduleEnd = addDays(today, SCHEDULE_DAYS - 1);

  const [tasks, assignees, scheduleTasks] = await Promise.all([
    listTasksForAdmin(filter),
    listAssignableUsers(),
    view === "schedule"
      ? listTasksInRange(today, scheduleEnd)
      : Promise.resolve<TaskRowVM[]>([]),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Tasks admin</h1>
          <p className="text-sm text-gray-500">
            Assign tasks. Approve marketing/approval-required submissions.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ViewTabs current={view} basePath="/admin/tasks" filter={filter} />
          {view === "list" && (
            <nav className="flex flex-wrap gap-2 text-xs">
              {FILTER_OPTIONS.map((f) => (
                <Link
                  key={f.key}
                  href={`/admin/tasks?view=list&filter=${f.key}`}
                  className={`rounded-md px-3 py-1 ring-1 ring-inset ${
                    filter === f.key
                      ? "bg-indigo-50 text-indigo-700 ring-indigo-200"
                      : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {f.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
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
          Mock mode (no Supabase env). Assign / approve actions are no-ops here.
        </div>
      )}

      {isSuperAdmin && <TaskMaintenanceCard />}

      <AssignForm assignees={assignees} today={today} />

      {view === "list" ? (
        <ListSection tasks={tasks} filter={filter} today={today} />
      ) : (
        <ScheduleSection tasks={scheduleTasks} startDate={today} />
      )}
    </div>
  );
}

function TaskMaintenanceCard() {
  return (
    <section className="rounded-lg border border-red-100 bg-white p-5 shadow ring-1 ring-black/5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Task Maintenance</h2>
          <p className="mt-1 text-sm text-gray-500">
            Preview and delete test/stale HRM tasks.
          </p>
        </div>
        <Link
          href="/admin/tasks/maintenance"
          className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500"
        >
          Open maintenance
        </Link>
      </div>
    </section>
  );
}

function ViewTabs({
  current,
  basePath,
  filter,
}: {
  current: "list" | "schedule";
  basePath: string;
  filter: AdminTaskFilter;
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
        href={`${basePath}?view=list&filter=${filter}`}
        className={cls(current === "list")}
      >
        List
      </Link>
      <Link href={`${basePath}?view=schedule`} className={cls(current === "schedule")}>
        Schedule
      </Link>
      <Link
        href={`${basePath}/history`}
        className="rounded-md bg-white px-3 py-1 text-xs text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
      >
        Done history
      </Link>
      <Link
        href="/admin/tasks/recurring"
        className="rounded-md bg-white px-3 py-1 text-xs text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
      >
        Recurring
      </Link>
    </nav>
  );
}

function AssignForm({
  assignees,
  today,
}: {
  assignees: Awaited<ReturnType<typeof listAssignableUsers>>;
  today: string;
}) {
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-gray-700">Assign a task</h2>
      <form
        action={createTask}
        className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2"
      >
        <input type="hidden" name="redirect_to" value="/admin/tasks" />

        <div className="lg:col-span-2">
          <label className="block text-xs font-medium text-gray-700">Title</label>
          <input
            type="text"
            name="title"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            placeholder="e.g. Reply to all leads from Italy campaign"
          />
        </div>
        <div className="lg:col-span-2">
          <label className="block text-xs font-medium text-gray-700">
            Description (optional)
          </label>
          <textarea
            name="description"
            rows={3}
            className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            placeholder="Any context, links, expectations…"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Assignee</label>
          <select
            name="assigned_to"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">— choose —</option>
            {assignees.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name} ({u.role}
                {u.branch_code ? ` · ${u.branch_code}` : ""})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Due date</label>
          <input
            type="date"
            name="due_date"
            required
            defaultValue={today}
            className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">
            Due time (optional)
          </label>
          <input
            type="time"
            name="due_time"
            className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Priority</label>
          <select
            name="priority"
            defaultValue="normal"
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="low">low</option>
            <option value="normal">normal</option>
            <option value="urgent">urgent</option>
          </select>
        </div>
        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="requires_approval"
              className="rounded border-gray-300"
            />
            Requires my approval (use for marketing & sensitive tasks)
          </label>
        </div>
        <div className="lg:col-span-2">
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Assign task
          </button>
        </div>
      </form>
    </section>
  );
}

function ListSection({
  tasks,
  filter,
  today,
}: {
  tasks: TaskRowVM[];
  filter: AdminTaskFilter;
  today: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-700">
        Tasks ({filter}) — {tasks.length}
      </h2>
      {tasks.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
          Nothing in this view.
        </p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <AdminTaskRow key={t.id} t={t} today={today} />
          ))}
        </div>
      )}
    </section>
  );
}

function ScheduleSection({
  tasks,
  startDate,
}: {
  tasks: TaskRowVM[];
  startDate: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-700">
        {SCHEDULE_DAYS}-day schedule — every assignee
      </h2>
      <p className="text-xs text-gray-500">
        Tasks placed by due time. Cards show title + assignee. Hover for full
        title and time.
      </p>
      <TaskScheduleGrid tasks={tasks} startDate={startDate} days={SCHEDULE_DAYS} />
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

function AdminTaskRow({ t, today }: { t: TaskRowVM; today: string }) {
  const overdue = t.status !== "done" && t.due_date < today;
  const pendingApproval = t.requires_approval && t.status === "in_progress";
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
            {overdue && <Chip label="overdue" tone="red" />}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Due {t.due_date}
            {t.due_time && (
              <> at <span className="tabular-nums">{t.due_time.slice(0, 5)}</span></>
            )}{" "}
            &middot; assignee {t.assignee_name} ({t.assignee_role})
            {t.branch_code && <> &middot; {t.branch_code}</>}
          </div>
          {t.description && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
              {t.description}
            </p>
          )}
        </div>

        {pendingApproval && (
          <div className="flex flex-col gap-2 sm:min-w-[14rem]">
            <form action={approveTask} className="rounded-md border border-green-200 bg-green-50/40 p-2">
              <input type="hidden" name="id" value={t.id} />
              <input
                type="text"
                name="note"
                className="block w-full rounded border border-green-200 bg-white px-2 py-1 text-sm"
                placeholder="Approve note (optional)"
              />
              <button
                type="submit"
                className="mt-1 w-full rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-500"
              >
                Approve
              </button>
            </form>
            <form action={rejectTask} className="rounded-md border border-red-200 bg-red-50/40 p-2">
              <input type="hidden" name="id" value={t.id} />
              <input
                type="text"
                name="note"
                className="block w-full rounded border border-red-200 bg-white px-2 py-1 text-sm"
                placeholder="Reject reason"
              />
              <button
                type="submit"
                className="mt-1 w-full rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500"
              >
                Reject back to to-do
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
