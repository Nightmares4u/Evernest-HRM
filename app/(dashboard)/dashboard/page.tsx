import Link from "next/link";
import { Chip, StatusChip } from "@/components/StatusChip";
import { MyAttendanceCard } from "@/components/MyAttendanceCard";
import { QuickAssignTaskForm } from "@/components/QuickAssignTaskForm";
import { TaskScheduleGrid } from "@/components/TaskScheduleGrid";
import { formatTimePKT, todayPKT, weekdayPKT } from "@/lib/attendance/format";
import {
  type AttendanceRowVM,
  isSupabaseConfigured,
  listEmployees,
  listTodayAttendance,
} from "@/lib/db/queries";
import {
  listAssignableUsers,
  listTasksInRange,
  type AssignableUser,
  type TaskRowVM,
} from "@/lib/db/tasks";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { AttendanceStatus } from "@/lib/types/hrm";

const PRESENT_STATES: AttendanceStatus[] = [
  "present",
  "remote_present",
  "approved_manually",
];
const LATE_STATES: AttendanceStatus[] = ["late", "remote_late"];

const PKR = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0,
});

const SCHEDULE_DAYS = 7;

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const today = new Date();
  const todayIso = todayPKT();
  const live = isSupabaseConfigured();
  const { error, ok } = await searchParams;

  const me = await getCurrentUser();
  const isSuperAdmin = me?.appUser.role === "super_admin";

  const [records, employees, myUpcomingTasks, allUpcomingTasks, assignees] =
    await Promise.all([
      listTodayAttendance(),
      listEmployees(),
      me
        ? listTasksInRange(
            todayIso,
            addDays(todayIso, SCHEDULE_DAYS - 1),
            me.authUserId
          )
        : Promise.resolve<TaskRowVM[]>([]),
      isSuperAdmin
        ? listTasksInRange(todayIso, addDays(todayIso, SCHEDULE_DAYS - 1))
        : Promise.resolve<TaskRowVM[]>([]),
      isSuperAdmin
        ? listAssignableUsers()
        : Promise.resolve<AssignableUser[]>([]),
    ]);

  const presentToday = records.filter((r) => PRESENT_STATES.includes(r.status))
    .length;
  const lateToday = records.filter((r) => LATE_STATES.includes(r.status)).length;
  const absentToday = records.filter((r) => r.status === "absent").length;
  const pendingReviewRecords = records.filter((r) => r.requires_review);
  const pendingToday = pendingReviewRecords.length;

  const totalEmployees = employees.length;
  const totalPayroll = employees.reduce((sum, e) => sum + e.monthly_salary, 0);

  // schedule grid for the dashboard: super-admin sees company-wide, everyone else sees their own
  const scheduleTasks = isSuperAdmin ? allUpcomingTasks : myUpcomingTasks;
  const myTaskCount = myUpcomingTasks.length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">
          {weekdayPKT(today)}
          {me && (
            <>
              {" — signed in as "}
              <span className="font-medium text-gray-700">
                {me.appUser.display_name}
              </span>{" "}
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {me.appUser.role}
              </span>
            </>
          )}
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {ok && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          {ok}
        </div>
      )}

      {!live && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Mock data (no Supabase env).
        </div>
      )}

      <MyAttendanceCard me={me} />

      {isSuperAdmin && <QuickAssignTaskForm assignees={assignees} />}

      {isSuperAdmin && (
        <PendingAttendanceReviews records={pendingReviewRecords} />
      )}

      {me && (
        <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-700">
              {isSuperAdmin
                ? `Company schedule — next ${SCHEDULE_DAYS} days`
                : `My schedule — next ${SCHEDULE_DAYS} days`}
              <span className="ml-2 text-xs font-normal text-gray-500">
                {scheduleTasks.length} task{scheduleTasks.length === 1 ? "" : "s"}
              </span>
            </h2>
            <div className="flex gap-2 text-xs">
              <Link
                href="/tasks?view=schedule"
                className="rounded-md bg-white px-3 py-1 text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
              >
                My tasks
              </Link>
              {isSuperAdmin && (
                <Link
                  href="/admin/tasks?view=schedule"
                  className="rounded-md bg-white px-3 py-1 text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
                >
                  Open admin schedule
                </Link>
              )}
            </div>
          </div>
          <div className="mt-3">
            {scheduleTasks.length === 0 ? (
              <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
                {isSuperAdmin
                  ? "No tasks across the team in the next 7 days."
                  : `No tasks assigned to you in the next ${SCHEDULE_DAYS} days.`}
              </p>
            ) : (
              <TaskScheduleGrid
                tasks={scheduleTasks}
                startDate={todayIso}
                days={SCHEDULE_DAYS}
                showAssignee={isSuperAdmin}
              />
            )}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Present today" value={presentToday} tone="text-green-700" />
        <StatCard label="Late today" value={lateToday} tone="text-amber-700" />
        <StatCard label="Absent today" value={absentToday} tone="text-red-700" />
        <StatCard label="Pending review" value={pendingToday} tone="text-yellow-700" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Headcount & payroll">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-gray-500">Total employees</dt>
            <dd className="text-right font-medium text-gray-900">{totalEmployees}</dd>
            <dt className="text-gray-500">Monthly payroll</dt>
            <dd className="text-right font-medium tabular-nums text-gray-900">
              {PKR.format(totalPayroll)}
            </dd>
            <dt className="text-gray-500">Branches</dt>
            <dd className="text-right font-medium text-gray-900">3 (KHI, LHE, RMT)</dd>
            <dt className="text-gray-500">Departments</dt>
            <dd className="text-right font-medium text-gray-900">6</dd>
          </dl>
          <Link
            href="/employees"
            className="mt-4 inline-block text-sm text-indigo-600 hover:text-indigo-500"
          >
            View directory →
          </Link>
        </Panel>

        <Panel title="Attendance snapshot">
          <div className="flex flex-wrap gap-2">
            <Chip label={`${presentToday} present`} tone="green" />
            <Chip label={`${lateToday} late`} tone="amber" />
            <Chip label={`${absentToday} absent`} tone="red" />
            <Chip label={`${pendingToday} pending`} tone="yellow" />
            {!isSuperAdmin && me && (
              <Chip
                label={`${myTaskCount} task${myTaskCount === 1 ? "" : "s"} in next ${SCHEDULE_DAYS}d`}
                tone="indigo"
              />
            )}
          </div>
          <Link
            href="/attendance"
            className="mt-4 inline-block text-sm text-indigo-600 hover:text-indigo-500"
          >
            Open Today panel →
          </Link>
        </Panel>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
      <div className="p-5">
        <p className="truncate text-sm font-medium text-gray-500">{label}</p>
        <p className={`mt-1 text-3xl font-semibold tabular-nums ${tone}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function PendingAttendanceReviews({
  records,
}: {
  records: AttendanceRowVM[];
}) {
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700">
          Pending attendance reviews
          <span className="ml-2 text-xs font-normal text-gray-500">
            {records.length}
          </span>
        </h2>
        <Link
          href="/attendance"
          className="text-xs text-indigo-600 hover:text-indigo-500"
        >
          Open Today panel →
        </Link>
      </div>
      {records.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
          No attendance records need review today.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {records.slice(0, 5).map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-yellow-100 bg-yellow-50/40 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-gray-900">{r.employee_full_name}</p>
                <p className="text-xs text-gray-500">
                  {r.branch_code ?? "—"} · {r.mode} · checked in{" "}
                  {formatTimePKT(r.check_in_at)}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                <StatusChip status={r.status} />
                <Chip label="pending review" tone="yellow" />
                <GeoStatusChip
                  status={r.verification_status}
                  browserStatus={r.geolocation?.status}
                />
              </div>
            </li>
          ))}
          {records.length > 5 && (
            <li className="text-xs text-gray-500">
              +{records.length - 5} more in the Today panel.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function GeoStatusChip({
  status,
  browserStatus,
}: {
  status?: string | null;
  browserStatus?: string;
}) {
  if (status === "location_verified") {
    return <Chip label="location verified" tone="green" />;
  }
  if (status === "outside_geofence") {
    return <Chip label="outside geofence" tone="red" />;
  }
  if (status === "remote_location_captured") {
    return <Chip label="remote location captured" tone="indigo" />;
  }
  if (status === "remote_location_missing") {
    return <Chip label="remote location missing" tone="yellow" />;
  }
  if (status === "office_geofence_not_configured") {
    return <Chip label="geofence not configured" tone="gray" />;
  }
  if (status?.startsWith("location_")) {
    return <Chip label={status.replaceAll("_", " ")} tone="yellow" />;
  }

  if (browserStatus === "granted")
    return <Chip label="location captured" tone="green" />;
  if (browserStatus === "denied")
    return <Chip label="location denied" tone="yellow" />;
  if (browserStatus === "unavailable")
    return <Chip label="location unavailable" tone="amber" />;
  if (browserStatus === "timeout")
    return <Chip label="location timeout" tone="amber" />;
  if (browserStatus === "not_supported")
    return <Chip label="location unsupported" tone="gray" />;
  if (browserStatus === "not_provided")
    return <Chip label="no location proof" tone="gray" />;
  if (browserStatus) return <Chip label={`location ${browserStatus}`} tone="gray" />;
  return <Chip label="location unknown" tone="gray" />;
}
