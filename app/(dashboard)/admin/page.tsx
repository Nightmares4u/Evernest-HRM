import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getAdminPendingCounts,
  isSupabaseConfigured,
  listBranches,
  listDepartments,
  listEmployees,
  listShifts,
} from "@/lib/db/queries";
import { listRedlinedEmployees } from "@/lib/db/tasks";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isBranchManagerOrAboveRole } from "@/lib/auth/permissions";

import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { DataTable, Td } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";

const PKR = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0,
});

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatDays(days: number[]): string {
  if (!days.length) return "—";
  return days
    .filter((d) => d >= 1 && d <= 7)
    .map((d) => WEEKDAY_LABELS[d - 1])
    .join(", ");
}

export default async function AdminPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isBranchManagerOrAboveRole(me.appUser.role)) {
    redirect("/dashboard?error=Manager access required");
  }
  const isSuperAdmin = me.appUser.role === "super_admin";
  const live = isSupabaseConfigured();
  const [employees, branches, departments, shifts, counts, redlined] =
    await Promise.all([
      listEmployees(),
      listBranches(),
      listDepartments(),
      listShifts(),
      getAdminPendingCounts(),
      listRedlinedEmployees(),
    ]);

  const totalEmployees = employees.length;
  const totalPayroll = isSuperAdmin ? employees.reduce((s, e) => s + e.monthly_salary, 0) : 0;
  const exemptCount = employees.filter((e) => e.attendance_exempt).length;
  const remoteAllowed = employees.filter((e) => e.remote_allowed).length;

  const employeesByBranch = branches.map((b) => ({
    branch: b,
    count: employees.filter((e) => e.branch_id === b.id).length,
  }));

  const employeesByDept = departments.map((d) => ({
    dept: d,
    count: employees.filter((e) => e.department_id === d.id).length,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Command Center"
        description="Configuration overview and operational controls."
      />

      {!live && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Mock data (no Supabase env).
        </div>
      )}

      <SectionCard title="Action Items">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 mt-2">
          <ActionCard
            label="Pending leave"
            value={counts.pending_leave}
            href="/admin/leave?filter=pending"
            tone={counts.pending_leave > 0 ? "amber" : "gray"}
            hint={counts.pending_leave === 0 ? "Inbox clear" : "Review and act"}
          />
          <ActionCard
            label="Pending task approvals"
            value={counts.pending_task_approvals}
            href="/admin/tasks?filter=pending_approval"
            tone={counts.pending_task_approvals > 0 ? "amber" : "gray"}
            hint={
              counts.pending_task_approvals === 0
                ? "Nothing waiting"
                : "Marketing / approval-required"
            }
          />
          <ActionCard
            label="Today's check-in coverage"
            value={
              counts.tracked_total === 0
                ? "—"
                : `${counts.checked_in_today}/${counts.tracked_total}`
            }
            href="/attendance"
            tone={
              counts.tracked_total > 0 &&
              counts.checked_in_today === counts.tracked_total
                ? "green"
                : "amber"
            }
            hint={
              counts.tracked_total > 0
                ? `${counts.tracked_total - counts.checked_in_today} not yet in`
                : "No tracked staff"
            }
          />
          <ActionCard
            label="Active recurring tasks"
            value={counts.active_recurring}
            href="/admin/tasks/recurring"
            tone={counts.active_recurring > 0 ? "blue" : "gray"}
            hint="Manage templates"
          />
          <ActionCard
            label={isSuperAdmin ? "Company Task History" : "Task History"}
            value="Open"
            href={isSuperAdmin ? "/admin/tasks/history?range=this_month" : "/admin/tasks"}
            tone="green"
            hint="Monthly completed stack"
          />
          {isSuperAdmin && (
            <ActionCard
              label="Add employee"
              value="New"
              href="/admin/employees/new"
              tone="blue"
              hint="Create login + HR profile"
            />
          )}
          {isSuperAdmin && (
            <ActionCard
              label="Task Maintenance"
              value="Clean"
              href="/admin/tasks/maintenance"
              tone="red"
              hint="Preview and delete test/stale tasks"
            />
          )}
        </div>
      </SectionCard>

      {redlined.length > 0 && (
        <SectionCard title={`Redlined (${redlined.length})`}>
          <div className="rounded-lg border border-red-200 bg-red-50/40 p-4 mt-2">
            <p className="text-xs text-red-800">
              Employees with 3+ overdue undone tasks. Conversation, then
              consider a payroll adjustment if warranted.
            </p>
            <ul className="mt-3 space-y-2">
              {redlined.map((r) => (
                <li
                  key={r.employee_id}
                  className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm shadow-sm"
                >
                  <span className="font-medium text-gray-900">
                    {r.full_name}
                  </span>
                  <span className="flex items-center gap-3">
                    <StatusBadge label={`${r.overdue_count} overdue`} tone="red" />
                    <Link
                      href={`/admin/tasks?filter=overdue`}
                      className="text-xs font-medium text-blue-600 hover:text-blue-500"
                    >
                      Review →
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </SectionCard>
      )}

      <SectionCard title={isSuperAdmin ? "Headcount & Payroll" : "Headcount"}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mt-2">
          <StatCard label="Employees" value={totalEmployees} />
          {isSuperAdmin && <StatCard label="Monthly payroll" value={PKR.format(totalPayroll)} />}
          <StatCard label="Attendance-exempt" value={exemptCount} hint="Yashal + Marketing" />
          <StatCard label="Remote-allowed" value={remoteAllowed} />
        </div>
      </SectionCard>

      <SectionCard title="Branch Overview">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 mt-2">
          {employeesByBranch.map(({ branch, count }) => {
            const defaultShift = shifts.find((s) => s.id === branch.default_shift_id);
            return (
              <div key={branch.id} className="rounded-lg bg-gray-50 p-4 border border-gray-100">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-semibold text-gray-900">{branch.name}</h3>
                  <StatusBadge label={branch.code} tone="gray" />
                </div>
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Employees</dt>
                    <dd className="font-medium">{count}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Shift</dt>
                    <dd className="font-medium">
                      {defaultShift ? `${defaultShift.start_time.slice(0, 5)}–${defaultShift.end_time.slice(0, 5)}` : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">IP whitelist</dt>
                    <dd className="font-medium">
                      {branch.ip_whitelist.length ? branch.ip_whitelist.join(", ") : "(none)"}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Departments">
        <div className="mt-4">
          <DataTable columns={["Department", "Employees"]}>
            {employeesByDept.map(({ dept, count }) => (
              <tr key={dept.id} className="hover:bg-gray-50">
                <Td>{dept.name}</Td>
                <Td className="text-right tabular-nums">{count}</Td>
              </tr>
            ))}
          </DataTable>
        </div>
      </SectionCard>

      <SectionCard title="Shifts">
        <div className="mt-4">
          <DataTable columns={["Shift", "Start", "End", "Late grace (min)", "Half-day < (min)"]}>
            {shifts.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <Td className="font-medium text-gray-900">{s.name}</Td>
                <Td className="tabular-nums">{s.start_time.slice(0, 5)}</Td>
                <Td className="tabular-nums">{s.end_time.slice(0, 5)}</Td>
                <Td className="text-right tabular-nums">{s.late_grace_minutes}</Td>
                <Td className="text-right tabular-nums">{s.half_day_threshold_minutes}</Td>
              </tr>
            ))}
          </DataTable>
        </div>
      </SectionCard>

      <SectionCard title="Remote Roster">
        <div className="mt-4">
          <DataTable columns={["Employee", "Branch", "Remote Days", "Attendance"]}>
            {employees
              .filter((e) => e.remote_allowed)
              .map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <Td>
                    <div className="font-medium text-gray-900">{e.full_name}</div>
                    <div className="text-xs text-gray-500">{e.email}</div>
                  </Td>
                  <Td>{e.branch_code ?? "—"}</Td>
                  <Td className="text-xs">{formatDays(e.remote_default_days)}</Td>
                  <Td>
                    {e.attendance_exempt ? (
                      <StatusBadge label="exempt — task-based" tone="gray" />
                    ) : (
                      <StatusBadge label="enforced" tone="green" />
                    )}
                  </Td>
                </tr>
              ))}
          </DataTable>
        </div>
      </SectionCard>

      <SectionCard title="Quick Actions">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
          <QuickLink
            href="/admin/leave"
            title="Leave admin"
            description="Approve / reject leave requests. Audit-logged."
            live
          />
          <QuickLink
            href="/admin/tasks"
            title="Tasks admin"
            description="Assign tasks. Approve marketing submissions."
            live
          />
          <QuickLink
            href="/admin/tasks/history?range=this_month"
            title="Company Task History"
            description="Review monthly completed tasks by employee."
            live
          />
          <QuickLink
            href="/admin/tasks/recurring"
            title="Recurring tasks"
            description="Templates that auto-generate task instances on scheduled days."
            live
          />
          {isSuperAdmin && (
            <QuickLink
              href="/admin/tasks/maintenance"
              title="Task Maintenance"
              description="Preview and delete test/stale HRM tasks."
              live
            />
          )}
          <QuickLink
            href="/admin/holidays"
            title="Paid holidays"
            description="Add/remove paid holidays that reduce monthly working days."
            live
          />
          <QuickLink
            href="/admin/payroll"
            title="Payroll preview"
            description="Monthly deduction preview using working-day baseline."
            live
          />
          <QuickLink
            href="/admin/employees/new"
            title="Add employee"
            description="Create a Supabase login, HR profile, salary, schedule links, and leave balance."
            live
          />
          <QuickLink
            href="/admin/cron"
            title="Scheduled maintenance"
            description="Manual test commands for attendance close, leave accrual, and recurring task cron routes."
            live
          />
          <PendingCard
            title="Audit log viewer"
            description="Searchable log of every manual override. Writes already happen — UI surfaces it."
          />
          <PendingCard
            title="Branch IP whitelists"
            description="Edit per-branch whitelist. Server-side check is live; UI editor pending."
          />
          <PendingCard
            title="System settings"
            description="Late grace, half-day threshold, payroll denominators, redline threshold. Stored in settings table."
          />
        </div>
      </SectionCard>
    </div>
  );
}

function ActionCard({
  label,
  value,
  href,
  tone,
  hint,
}: {
  label: string;
  value: string | number;
  href: string;
  tone: "green" | "amber" | "blue" | "gray" | "red";
  hint?: string;
}) {
  const ring = {
    green: "ring-green-200",
    amber: "ring-amber-200",
    blue: "ring-blue-200",
    gray: "ring-gray-200",
    red: "ring-red-200",
  }[tone];
  const valueClass = {
    green: "text-green-700",
    amber: "text-amber-700",
    blue: "text-blue-700",
    gray: "text-gray-900",
    red: "text-red-700",
  }[tone];
  return (
    <Link
      href={href}
      className={`block overflow-hidden rounded-lg bg-white p-4 shadow-sm ring-1 ${ring} transition hover:shadow-md hover:bg-gray-50/30`}
    >
      <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-gray-500">{hint}</p>}
    </Link>
  );
}

function QuickLink({
  href,
  title,
  description,
  live,
}: {
  href: string;
  title: string;
  description: string;
  live?: boolean;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-blue-200 bg-white p-4 shadow-sm transition hover:bg-blue-50/50"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {live && <StatusBadge label="live" tone="green" />}
      </div>
      <p className="mt-2 text-xs text-gray-500">{description}</p>
      <p className="mt-3 text-xs font-medium text-blue-600">Open →</p>
    </Link>
  );
}

function PendingCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <StatusBadge label="planned" tone="gray" />
      </div>
      <p className="mt-2 text-xs text-gray-500">{description}</p>
      <button
        type="button"
        disabled
        className="mt-3 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-400 cursor-not-allowed"
      >
        Open (disabled)
      </button>
    </div>
  );
}
