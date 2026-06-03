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
import { personalProfileCompletionStatus } from "@/lib/employees/personal-profile";
import {
  listAssignableUsers,
  listTasksInRange,
  type AssignableUser,
  type TaskRowVM,
} from "@/lib/db/tasks";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isBranchManagerOrAboveRole } from "@/lib/auth/permissions";
import type { AttendanceStatus } from "@/lib/types/hrm";

import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";

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
  const canManage = me ? isBranchManagerOrAboveRole(me.appUser.role) : false;

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
      canManage
        ? listTasksInRange(todayIso, addDays(todayIso, SCHEDULE_DAYS - 1))
        : Promise.resolve<TaskRowVM[]>([]),
      canManage
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
  const myProfileCompletion = me?.employee
    ? personalProfileCompletionStatus(me.employee)
    : null;

  // schedule grid for the dashboard: super-admin sees company-wide, everyone else sees their own
  const scheduleTasks = canManage ? allUpcomingTasks : myUpcomingTasks;
  const myTaskCount = myUpcomingTasks.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`${weekdayPKT(today)} ${me ? `— signed in as ${me.appUser.display_name}` : ""}`}
        action={me && <StatusBadge label={me.appUser.role} tone="blue" />}
      />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      )}
      {ok && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 shadow-sm">
          {ok}
        </div>
      )}

      {!live && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
          Mock data (no Supabase env).
        </div>
      )}

      <MyAttendanceCard me={me} />

      {myProfileCompletion && !myProfileCompletion.complete && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Complete your profile for HR records and payroll forwarding.
            </span>
            <Link
              href="/profile"
              className="rounded-md bg-white px-4 py-2 text-xs font-semibold text-amber-900 ring-1 ring-inset ring-amber-200 hover:bg-amber-100 transition-colors"
            >
              My Profile
            </Link>
          </div>
        </section>
      )}

      {canManage && <QuickAssignTaskForm assignees={assignees} />}

      {canManage && (
        <PendingAttendanceReviews records={pendingReviewRecords} />
      )}

      {me && (
        <SectionCard
          title={canManage ? `${isSuperAdmin ? "Company" : "Branch"} schedule — next ${SCHEDULE_DAYS} days` : `My schedule — next ${SCHEDULE_DAYS} days`}
          description={`${scheduleTasks.length} task${scheduleTasks.length === 1 ? "" : "s"} assigned`}
          action={
            <div className="flex flex-wrap gap-2 text-xs">
              <Link
                href="/tasks?view=schedule"
                className="rounded-md bg-white px-3 py-1.5 font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 transition-colors"
              >
                My tasks
              </Link>
              {canManage && (
                <Link
                  href="/admin/tasks?view=schedule"
                  className="rounded-md bg-white px-3 py-1.5 font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 transition-colors"
                >
                  Open admin schedule
                </Link>
              )}
              {isSuperAdmin && (
                <Link
                  href="/admin/tasks/history?range=this_month"
                  className="rounded-md bg-white px-3 py-1.5 font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 transition-colors"
                >
                  Company Task History
                </Link>
              )}
            </div>
          }
        >
          <div className="mt-4">
            {scheduleTasks.length === 0 ? (
              <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-center text-gray-500">
                {canManage
                  ? "No tasks across your scope in the next 7 days."
                  : `No tasks assigned to you in the next ${SCHEDULE_DAYS} days.`}
              </p>
            ) : (
              <TaskScheduleGrid
                tasks={scheduleTasks}
                startDate={todayIso}
                days={SCHEDULE_DAYS}
                showAssignee={canManage}
              />
            )}
          </div>
        </SectionCard>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Present today" value={presentToday} tone="green" />
        <StatCard label="Late today" value={lateToday} tone="amber" />
        <StatCard label="Absent today" value={absentToday} tone="red" />
        <StatCard label="Pending review" value={pendingToday} tone="yellow" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title={isSuperAdmin ? "Headcount & payroll" : "Headcount"}>
          <dl className="grid grid-cols-2 gap-y-4 text-sm mt-4">
            <dt className="text-gray-500 font-medium">Total employees</dt>
            <dd className="text-right font-semibold text-gray-900">{totalEmployees}</dd>
            {isSuperAdmin && (
              <>
                <dt className="text-gray-500 font-medium">Monthly payroll</dt>
                <dd className="text-right font-semibold tabular-nums text-gray-900">
                  {PKR.format(totalPayroll)}
                </dd>
              </>
            )}
            <dt className="text-gray-500 font-medium">Branches</dt>
            <dd className="text-right font-medium text-gray-900">3 (KHI, LHE, RMT)</dd>
            <dt className="text-gray-500 font-medium">Departments</dt>
            <dd className="text-right font-medium text-gray-900">6</dd>
          </dl>
          <Link
            href="/employees"
            className="mt-6 inline-block text-sm font-medium text-blue-600 hover:text-blue-500 transition-colors"
          >
            View directory →
          </Link>
        </SectionCard>

        <SectionCard title="Attendance snapshot">
          <div className="flex flex-wrap gap-2 mt-4">
            <StatusBadge label={`${presentToday} present`} tone="green" />
            <StatusBadge label={`${lateToday} late`} tone="amber" />
            <StatusBadge label={`${absentToday} absent`} tone="red" />
            <StatusBadge label={`${pendingToday} pending`} tone="yellow" />
            {!isSuperAdmin && me && (
              <StatusBadge
                label={`${myTaskCount} task${myTaskCount === 1 ? "" : "s"} in next ${SCHEDULE_DAYS}d`}
                tone="blue"
              />
            )}
          </div>
          <Link
            href="/attendance"
            className="mt-6 inline-block text-sm font-medium text-blue-600 hover:text-blue-500 transition-colors"
          >
            Open Today panel →
          </Link>
        </SectionCard>
      </div>
    </div>
  );
}

function PendingAttendanceReviews({
  records,
}: {
  records: AttendanceRowVM[];
}) {
  return (
    <SectionCard
      title="Pending attendance reviews"
      description={`${records.length} requiring attention`}
      action={
        <Link
          href="/attendance"
          className="text-xs font-medium text-blue-600 hover:text-blue-500 transition-colors"
        >
          Open Today panel →
        </Link>
      }
    >
      {records.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-center text-gray-500">
          No attendance records need review today.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {records.slice(0, 5).map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-yellow-200 bg-yellow-50/40 px-4 py-3 text-sm shadow-sm"
            >
              <div>
                <p className="font-semibold text-gray-900">{r.employee_full_name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {r.branch_code ?? "—"} · {r.mode} · checked in{" "}
                  {formatTimePKT(r.check_in_at)}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <StatusChip status={r.status} />
                <StatusBadge label="pending review" tone="yellow" />
                <GeoStatusChip
                  status={r.verification_status}
                  browserStatus={r.geolocation?.status}
                />
              </div>
            </li>
          ))}
          {records.length > 5 && (
            <li className="text-xs font-medium text-gray-500 px-2">
              +{records.length - 5} more in the Today panel.
            </li>
          )}
        </ul>
      )}
    </SectionCard>
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
    return <StatusBadge label="location verified" tone="green" />;
  }
  if (status === "outside_geofence") {
    return <StatusBadge label="outside geofence" tone="red" />;
  }
  if (status === "remote_location_captured") {
    return <StatusBadge label="remote location captured" tone="blue" />;
  }
  if (status === "remote_location_missing") {
    return <StatusBadge label="remote location missing" tone="yellow" />;
  }
  if (status === "office_geofence_not_configured") {
    return <StatusBadge label="geofence not configured" tone="gray" />;
  }
  if (status?.startsWith("location_")) {
    return <StatusBadge label={status.replaceAll("_", " ")} tone="yellow" />;
  }

  if (browserStatus === "granted")
    return <StatusBadge label="location captured" tone="green" />;
  if (browserStatus === "denied")
    return <StatusBadge label="location denied" tone="yellow" />;
  if (browserStatus === "unavailable")
    return <StatusBadge label="location unavailable" tone="amber" />;
  if (browserStatus === "timeout")
    return <StatusBadge label="location timeout" tone="amber" />;
  if (browserStatus === "not_supported")
    return <StatusBadge label="location unsupported" tone="gray" />;
  if (browserStatus === "not_provided")
    return <StatusBadge label="no location proof" tone="gray" />;
  if (browserStatus) return <StatusBadge label={`location ${browserStatus}`} tone="gray" />;
  return <StatusBadge label="location unknown" tone="gray" />;
}
