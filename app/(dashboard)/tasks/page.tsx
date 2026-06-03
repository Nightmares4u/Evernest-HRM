import Link from "next/link";
import { Chip } from "@/components/StatusChip";
import { TaskScheduleGrid } from "@/components/TaskScheduleGrid";
import {
  listAssignableUsers,
  listMyTasks,
  listRequestsISent,
  listRequestsToMe,
  listTasksInRange,
  listUsersICanRequestFrom,
  type AssignableUser,
  type TaskRowVM,
  type RequestRowVM,
} from "@/lib/db/tasks";
import { isSupabaseConfigured } from "@/lib/db/queries";
import { todayPKT } from "@/lib/attendance/format";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isBranchManagerOrAboveRole } from "@/lib/auth/permissions";
import {
  acceptRequest,
  createRequestTask,
  createSelfTask,
  createTask,
  declineRequest,
  markTaskDone,
  submitForApproval,
} from "./actions";

const SCHEDULE_DAYS = 7;
type TasksTab = "mine" | "requests-in" | "requests-out";

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; tab?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const tab: TasksTab =
    sp.tab === "requests-in" || sp.tab === "requests-out" ? sp.tab : "mine";
  const view = sp.view === "schedule" ? "schedule" : "list";
  const live = isSupabaseConfigured();
  const today = todayPKT();
  const endDate = addDays(today, SCHEDULE_DAYS - 1);

  const me = await getCurrentUser();
  const canAssign = Boolean(me && isBranchManagerOrAboveRole(me.appUser.role));
  const [
    groups,
    scheduleTasks,
    requestsToMe,
    requestsISent,
    requestableUsers,
    assignableUsers,
  ] = await Promise.all([
    listMyTasks(),
    me && tab === "mine" && view === "schedule"
      ? listTasksInRange(today, endDate, me.authUserId)
      : Promise.resolve<TaskRowVM[]>([]),
    listRequestsToMe(),
    listRequestsISent(),
    listUsersICanRequestFrom(),
    canAssign ? listAssignableUsers() : Promise.resolve<AssignableUser[]>([]),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500">
            Track your work, send requests, and accept incoming task asks.
          </p>
        </div>
        <NewTaskPanel
          today={today}
          requestableUsers={requestableUsers}
          assignableUsers={assignableUsers}
          canAssign={canAssign}
        />
      </header>

      <WorkflowTabs
        current={tab}
        requestCount={requestsToMe.length}
        sentCount={requestsISent.length}
      />

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

      {tab === "mine" && (
        <ViewTabs current={view} basePath="/tasks?tab=mine" />
      )}

      {tab === "requests-in" ? (
        <RequestsToMeView requests={requestsToMe} />
      ) : tab === "requests-out" ? (
        <RequestsISentView requests={requestsISent} />
      ) : view === "list" ? (
        <ListView groups={groups} requestsCount={requestsToMe.length} />
      ) : (
        <ScheduleView
          tasks={scheduleTasks}
          startDate={today}
          counts={{
            today: groups.today.length,
            upcoming: groups.upcoming.length,
            overdue: groups.overdue.length,
            awaiting: groups.awaiting_approval.length,
            requests: requestsToMe.length,
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
        ? "bg-blue-50 text-blue-700 ring-blue-200"
        : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50"
    }`;
  return (
    <nav className="flex gap-2">
      <Link href={`${basePath}&view=list`} className={cls(current === "list")}>
        List
      </Link>
      <Link
        href={`${basePath}&view=schedule`}
        className={cls(current === "schedule")}
      >
        Schedule
      </Link>
    </nav>
  );
}

function WorkflowTabs({
  current,
  requestCount,
  sentCount,
}: {
  current: TasksTab;
  requestCount: number;
  sentCount: number;
}) {
  const cls = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${
      active
        ? "bg-indigo-50 text-indigo-700 ring-indigo-200"
        : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50"
    }`;
  return (
    <nav className="flex flex-wrap gap-2">
      <Link href="/tasks?tab=mine&view=list" className={cls(current === "mine")}>
        My tasks
      </Link>
      <Link href="/tasks?tab=requests-in" className={cls(current === "requests-in")}>
        Requests to me ({requestCount})
      </Link>
      <Link href="/tasks?tab=requests-out" className={cls(current === "requests-out")}>
        Requests I sent ({sentCount})
      </Link>
      <Link
        href="/tasks/history"
        className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
      >
        Done history
      </Link>
    </nav>
  );
}

function NewTaskPanel({
  today,
  requestableUsers,
  assignableUsers,
  canAssign,
}: {
  today: string;
  requestableUsers: AssignableUser[];
  assignableUsers: AssignableUser[];
  canAssign: boolean;
}) {
  return (
    <details className="group relative">
      <summary className="cursor-pointer list-none rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
        + New task
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-[min(92vw,48rem)] rounded-lg bg-white p-4 shadow-xl ring-1 ring-black/10">
        <div className="grid gap-4 lg:grid-cols-3">
          <TaskModeForm
            mode="self"
            title="For myself"
            action={createSelfTask}
            today={today}
          />
          <TaskModeForm
            mode="request"
            title="Request from someone"
            action={createRequestTask}
            today={today}
            users={requestableUsers}
          />
          {canAssign && (
            <TaskModeForm
              mode="assigned"
              title="Assign to someone"
              action={createTask}
              today={today}
              users={assignableUsers}
              includeApproval
            />
          )}
        </div>
      </div>
    </details>
  );
}

function TaskModeForm({
  mode,
  title,
  action,
  today,
  users,
  includeApproval,
}: {
  mode: "self" | "request" | "assigned";
  title: string;
  action: (formData: FormData) => void | Promise<void>;
  today: string;
  users?: AssignableUser[];
  includeApproval?: boolean;
}) {
  const needsAssignee = mode !== "self";
  return (
    <form action={action} className="space-y-3 rounded-md border border-gray-200 p-3">
      <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
        <input type="radio" name="mode_choice" defaultChecked />
        {title}
      </label>
      <input type="hidden" name="mode" value={mode} />
      {mode === "assigned" && <input type="hidden" name="redirect_to" value="/tasks" />}
      <div>
        <label className="block text-xs font-medium text-gray-700">Title</label>
        <input
          type="text"
          name="title"
          required
          className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700">
          Description (optional)
        </label>
        <textarea
          name="description"
          rows={3}
          className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>
      {needsAssignee && (
        <div>
          <label className="block text-xs font-medium text-gray-700">
            {mode === "request" ? "Request from" : "Assignee"}
          </label>
          <select
            name="assigned_to"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Choose</option>
            {(users ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name} ({u.role}
                {u.branch_code ? ` - ${u.branch_code}` : ""}
                {u.department_name ? ` - ${u.department_name}` : ""})
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
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
          <label className="block text-xs font-medium text-gray-700">Due time</label>
          <input
            type="time"
            name="due_time"
            className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
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
      {includeApproval && (
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" name="requires_approval" className="rounded border-gray-300" />
          Requires my approval
        </label>
      )}
      <button
        type="submit"
        className="w-full rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-700"
      >
        Create
      </button>
    </form>
  );
}

function ListView({
  groups,
  requestsCount,
}: {
  groups: Awaited<ReturnType<typeof listMyTasks>>;
  requestsCount: number;
}) {
  return (
    <>
      <div className="flex flex-wrap gap-2 text-xs">
        <Chip label={`${groups.today.length} today`} tone="green" />
        <Chip label={`${groups.upcoming.length} upcoming`} tone="gray" />
        <Chip label={`${groups.overdue.length} overdue`} tone="red" />
        <Chip label={`${requestsCount} requests`} tone="indigo" />
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
  counts: {
    today: number;
    upcoming: number;
    overdue: number;
    awaiting: number;
    requests: number;
  };
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <Chip label={`${counts.today} today`} tone="green" />
        <Chip label={`${counts.upcoming} upcoming`} tone="gray" />
        <Chip label={`${counts.overdue} overdue`} tone="red" />
        <Chip label={`${counts.requests} requests`} tone="indigo" />
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

function RequestsToMeView({ requests }: { requests: RequestRowVM[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-700">
        Requests to me <span className="text-xs font-normal text-gray-500">{requests.length}</span>
      </h2>
      {requests.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
          No pending requests.
        </p>
      ) : (
        <div className="space-y-2">
          {requests.map((request) => (
            <RequestToMeRow key={request.id} request={request} />
          ))}
        </div>
      )}
    </section>
  );
}

function RequestToMeRow({ request }: { request: RequestRowVM }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">{request.title}</span>
            <Chip label={request.priority} tone={priorityTone(request.priority)} />
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Requested by {request.requester_name}
            {request.requester_email && <> ({request.requester_email})</>}
            {" "}· due {request.due_date}
            {request.due_time && (
              <> at <span className="tabular-nums">{request.due_time.slice(0, 5)}</span></>
            )}
          </div>
          {request.description && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
              {request.description}
            </p>
          )}
        </div>
        <div className="grid gap-2 sm:min-w-[14rem]">
          <form action={acceptRequest}>
            <input type="hidden" name="id" value={request.id} />
            <button
              type="submit"
              className="w-full rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-500"
            >
              Accept
            </button>
          </form>
          <form action={declineRequest} className="rounded-md border border-red-200 bg-red-50/40 p-2">
            <input type="hidden" name="id" value={request.id} />
            <label className="block text-xs font-medium text-red-900">
              Decline reason
            </label>
            <textarea
              name="reason"
              required
              rows={2}
              className="mt-1 block w-full rounded border border-red-200 bg-white px-2 py-1 text-sm"
            />
            <button
              type="submit"
              className="mt-2 w-full rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500"
            >
              Decline
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function RequestsISentView({ requests }: { requests: TaskRowVM[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-700">
        Requests I sent <span className="text-xs font-normal text-gray-500">{requests.length}</span>
      </h2>
      {requests.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
          No sent requests yet.
        </p>
      ) : (
        <div className="space-y-2">
          {requests.map((request) => (
            <RequestSentRow key={request.id} request={request} />
          ))}
        </div>
      )}
    </section>
  );
}

function requestWorkflowLabel(request: TaskRowVM): string {
  if (request.declined_at) {
    return `Declined - ${request.declined_reason ?? "No reason provided"}`;
  }
  if (request.accepted_at) return "Accepted";
  return "Pending";
}

function requestWorkflowTone(request: TaskRowVM) {
  if (request.declined_at) return "red" as const;
  if (request.accepted_at) return "green" as const;
  return "yellow" as const;
}

function RequestSentRow({ request }: { request: TaskRowVM }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">{request.title}</span>
            <Chip label={request.priority} tone={priorityTone(request.priority)} />
            <Chip
              label={requestWorkflowLabel(request)}
              tone={requestWorkflowTone(request)}
            />
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Requested from {request.assignee_name} · due {request.due_date}
            {request.due_time && (
              <> at <span className="tabular-nums">{request.due_time.slice(0, 5)}</span></>
            )}
          </div>
          {request.description && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
              {request.description}
            </p>
          )}
        </div>
      </div>
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
  return "blue" as const;
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
