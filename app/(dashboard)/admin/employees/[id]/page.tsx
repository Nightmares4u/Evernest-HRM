import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Chip, StatusChip } from "@/components/StatusChip";
import { updateEmployee } from "@/app/(dashboard)/admin/employees/actions";
import { overrideAttendanceRecord } from "@/app/(dashboard)/attendance/actions";
import {
  dateRangeToTimestamps,
  formatTimePKT,
  formatWorkedMinutes,
  shortDatePKT,
  todayPKT,
} from "@/lib/attendance/format";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getEmployeeProfile,
  getEmployeeLeaveBalanceThisMonth,
  listBranches,
  listDepartments,
  listAttendanceOverrideNotes,
  listEmployeeAttendanceRange,
  listEmployees,
  listShifts,
} from "@/lib/db/queries";
import { isBranchManagerOrAboveRole } from "@/lib/auth/permissions";
import { listHolidays, type HolidayRowVM } from "@/lib/db/payroll";
import { buildPayrollPreview, type PayrollPreview } from "@/lib/payroll/preview";
import {
  listDoneTasks,
  listTasksInRange,
  type TaskRowVM,
} from "@/lib/db/tasks";
import type { AttendanceRecord, AttendanceStatus, EmploymentStatus, UserRole } from "@/lib/types/hrm";

const PKR = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0,
});

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
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const OVERRIDE_STATUSES: AttendanceStatus[] = [
  "present",
  "late",
  "half_day",
  "absent",
  "on_leave",
  "day_off",
  "remote_present",
  "remote_late",
  "remote_half_day",
];
const USER_ROLES: { value: UserRole; label: string }[] = [
  { value: "team_member", label: "Team member" },
  { value: "employee", label: "Employee (legacy)" },
  { value: "assistant_manager", label: "Assistant manager" },
  { value: "branch_manager", label: "Branch manager" },
  { value: "admin_hr", label: "Admin HR" },
  { value: "super_admin", label: "Super admin" },
];
const EMPLOYMENT_STATUSES: EmploymentStatus[] = ["active", "inactive", "terminated"];
const INPUT_CLASS =
  "mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

type Search = { year?: string; month?: string; day?: string; error?: string; ok?: string };

type AttendanceTotals = {
  present: number;
  late: number;
  halfDay: number;
  absent: number;
  onLeave: number;
  dayOff: number;
  remote: number;
  pendingReview: number;
  workedMinutes: number;
};

export default async function EmployeeControlPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Search>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isBranchManagerOrAboveRole(me.appUser.role)) {
    redirect("/dashboard?error=Admin access required");
  }

  const employee = await getEmployeeProfile(id);
  if (!employee) notFound();
  const isSuperAdmin = me.appUser.role === "super_admin";

  const today = todayPKT();
  const currentYear = Number.parseInt(today.slice(0, 4), 10);
  const currentMonth = Number.parseInt(today.slice(5, 7), 10);
  const year = clampInt(sp.year, 2000, 2100, currentYear);
  const month = clampInt(sp.month, 1, 12, currentMonth);
  const startOfYear = `${year}-01-01`;
  const endOfYear = `${year}-12-31`;
  const monthStart = `${year}-${pad2(month)}-01`;
  const monthEnd = endOfMonth(monthStart);
  const selectedDay = validDay(sp.day) ? sp.day! : null;
  const yearTimestampRange = dateRangeToTimestamps(startOfYear, endOfYear);

  const [
    yearRecords,
    tasks,
    doneTasks,
    leaveBalance,
    holidays,
    branches,
    departments,
    shifts,
    employees,
  ] = await Promise.all([
    listEmployeeAttendanceRange(id, startOfYear, endOfYear),
    listTasksInRange(startOfYear, endOfYear, employee.user_id),
    listDoneTasks(yearTimestampRange.since, yearTimestampRange.until, employee.user_id),
    getEmployeeLeaveBalanceThisMonth(id),
    listHolidays(startOfYear, endOfYear),
    listBranches(),
    listDepartments(),
    listShifts(),
    listEmployees(),
  ]);

  const recordIds = yearRecords.map((r) => r.id);
  const notes = await listAttendanceOverrideNotes(recordIds);
  const notesByRecord = new Map(notes.map((n) => [n.target_id, n]));
  const recordsByDate = new Map(yearRecords.map((r) => [r.date, r]));
  const relevantHolidays = holidays.filter((holiday) =>
    holidayAppliesToEmployee(holiday, employee.branch_id, id)
  );
  const holidaysByDate = groupByDate(relevantHolidays, (holiday) => holiday.date);
  const tasksByDate = groupByDate(tasks, (task) => task.due_date);
  const selectedRecord = selectedDay ? recordsByDate.get(selectedDay) ?? null : null;
  const selectedHolidays = selectedDay ? holidaysByDate.get(selectedDay) ?? [] : [];
  const selectedTasks = selectedDay ? tasksByDate.get(selectedDay) ?? [] : [];
  const yearTotals = summarize(yearRecords);
  const monthRecords = yearRecords.filter(
    (r) => r.date >= monthStart && r.date <= monthEnd
  );
  const monthPreview = buildPayrollPreview({
    employee,
    records: monthRecords,
    holidays: relevantHolidays,
    monthStart,
    monthEnd,
  });
  const monthTotals = summarize(monthRecords);
  const taskOpen = tasks.filter((t) => t.status !== "done").length;
  const taskDone = doneTasks.length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-gray-500">
            <Link href="/employees" className="text-indigo-600 hover:text-indigo-500">
              Employees
            </Link>{" "}
            / Attendance control
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">
            {employee.full_name}
          </h1>
          <p className="text-sm text-gray-500">{employee.email}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Chip label={employee.branch_code ?? "no branch"} tone="gray" />
          <Chip label={employee.user_role} tone="indigo" />
          {employee.attendance_exempt && <Chip label="attendance exempt" tone="gray" />}
          {employee.remote_allowed && <Chip label="remote allowed" tone="blue" />}
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

      <ProfilePanel
        employee={employee}
        leaveBalance={leaveBalance?.balance ?? 0}
        canEdit={isSuperAdmin}
        branches={branches}
        departments={departments}
        shifts={shifts}
        employees={employees.filter((candidate) => candidate.id !== employee.id)}
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Present" value={yearTotals.present} tone="green" />
        <Stat label="Late" value={yearTotals.late} tone="amber" />
        <Stat label="Half-day" value={yearTotals.halfDay} tone="orange" />
        <Stat label="Absent" value={yearTotals.absent} tone="red" />
        <Stat label="Pending review" value={yearTotals.pendingReview} tone="yellow" />
        <Stat label="On leave" value={yearTotals.onLeave} tone="blue" />
        <Stat label="Day off" value={yearTotals.dayOff} tone="gray" />
        <Stat label="Remote" value={yearTotals.remote} tone="indigo" />
        <Stat label="Worked hours" value={Math.round(yearTotals.workedMinutes / 60)} tone="green" />
        <Stat
          label="Deduction days"
          value={monthPreview.totalDeductionDays.toFixed(1)}
          tone="red"
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-700">{year} overview</h2>
          <div className="flex gap-2 text-xs">
            <Link className="rounded-md bg-white px-3 py-1 text-gray-600 ring-1 ring-gray-200" href={`?year=${year - 1}&month=${month}`}>
              {year - 1}
            </Link>
            <Link className="rounded-md bg-white px-3 py-1 text-gray-600 ring-1 ring-gray-200" href={`?year=${currentYear}&month=${currentMonth}`}>
              This month
            </Link>
            <Link className="rounded-md bg-white px-3 py-1 text-gray-600 ring-1 ring-gray-200" href={`?year=${year + 1}&month=${month}`}>
              {year + 1}
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          {MONTHS.map((name, idx) => {
            const m = idx + 1;
            const start = `${year}-${pad2(m)}-01`;
            const end = endOfMonth(start);
            const totals = summarize(yearRecords.filter((r) => r.date >= start && r.date <= end));
            const monthTasks = tasks.filter((t) => t.due_date >= start && t.due_date <= end);
            const monthHolidays = relevantHolidays.filter((h) => h.date >= start && h.date <= end);
            return (
              <Link
                key={name}
                href={`?year=${year}&month=${m}`}
                className={`rounded-lg bg-white p-3 shadow ring-1 ring-black/5 hover:bg-gray-50 ${
                  m === month ? "outline outline-2 outline-indigo-300" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{name}</span>
                  {totals.pendingReview > 0 && (
                    <Chip label={`${totals.pendingReview} review`} tone="yellow" />
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-gray-600">
                  <span>P {totals.present}</span>
                  <span>L {totals.late}</span>
                  <span>H {totals.halfDay}</span>
                  <span>A {totals.absent}</span>
                  <span>Remote {totals.remote}</span>
                  <span>{Math.round(totals.workedMinutes / 60)}h</span>
                  <span>Tasks {monthTasks.length}</span>
                  <span>Hol {monthHolidays.length}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-700">
              {MONTHS[month - 1]} {year}
            </h2>
            <div className="flex flex-wrap gap-2 text-xs">
              <Chip label={`${monthTotals.present} present`} tone="green" />
              <Chip label={`${monthTotals.late} late`} tone="amber" />
              <Chip label={`${monthTotals.absent} absent`} tone="red" />
              <Chip label={`${monthTotals.pendingReview} review`} tone="yellow" />
            </div>
          </div>
          <CalendarGrid
            employeeId={id}
            year={year}
            month={month}
            recordsByDate={recordsByDate}
            holidaysByDate={holidaysByDate}
            tasksByDate={tasksByDate}
            selectedDay={selectedDay}
          />
        </section>

        <aside className="space-y-4">
          <PayrollPreviewPanel preview={monthPreview} salary={employee.monthly_salary} />
          <TaskPanel open={taskOpen} done={taskDone} />
          <DayPanel
            employeeId={id}
            date={selectedDay}
            record={selectedRecord}
            holidays={selectedHolidays}
            tasks={selectedTasks}
            note={selectedRecord ? notesByRecord.get(selectedRecord.id) ?? null : null}
            year={year}
            month={month}
          />
        </aside>
      </div>
    </div>
  );
}

function ProfilePanel({
  employee,
  leaveBalance,
  canEdit,
  branches,
  departments,
  shifts,
  employees,
}: {
  employee: Awaited<ReturnType<typeof getEmployeeProfile>>;
  leaveBalance: number;
  canEdit: boolean;
  branches: Awaited<ReturnType<typeof listBranches>>;
  departments: Awaited<ReturnType<typeof listDepartments>>;
  shifts: Awaited<ReturnType<typeof listShifts>>;
  employees: Awaited<ReturnType<typeof listEmployees>>;
}) {
  if (!employee) return null;
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Login email" value={employee.email} />
        <Info label="Contact email" value={employee.contact_email ?? "—"} />
        <Info label="Branch" value={employee.branch_name ?? "—"} />
        <Info label="Department/category" value={employee.department_name ?? "—"} />
        <Info label="Role" value={employee.role_description ?? employee.user_role} />
        <Info label="Salary" value={PKR.format(employee.monthly_salary)} />
        <Info label="Baseline shift" value={employee.shift_name ?? "—"} />
        <Info
          label="Custom shift"
          value={
            employee.custom_shift_enabled && employee.custom_shift_start && employee.custom_shift_end
              ? `${employee.custom_shift_start.slice(0, 5)}-${employee.custom_shift_end.slice(0, 5)}`
              : "—"
          }
        />
        <Info label="Manager" value={employee.manager_name ?? "—"} />
        <Info label="Leave balance" value={`${leaveBalance.toFixed(1)} day(s)`} />
        <Info label="Remote days" value={formatRemoteDays(employee.remote_default_days)} />
      </dl>

      {canEdit && (
        <form action={updateEmployee} className="mt-5 border-t border-gray-100 pt-4">
        <input type="hidden" name="employee_id" value={employee.id} />
          <h2 className="text-sm font-semibold text-gray-700">Edit employee</h2>
          <p className="mt-1 text-xs text-gray-500">
            Login/system email stays unchanged. Contact email is used for notifications.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Full name">
              <input name="full_name" required defaultValue={employee.full_name} className={INPUT_CLASS} />
            </Field>
            <Field label="Contact email">
              <input name="contact_email" type="email" defaultValue={employee.contact_email ?? ""} className={INPUT_CLASS} placeholder="Optional notification inbox" />
            </Field>
            <Field label="Phone">
              <input name="phone" defaultValue={employee.phone ?? ""} className={INPUT_CLASS} />
            </Field>
            <Field label="Monthly salary">
              <input name="monthly_salary" type="number" min="0" step="1" required defaultValue={employee.monthly_salary} className={INPUT_CLASS} />
            </Field>
            <Field label="Branch">
              <select name="branch_id" required defaultValue={employee.branch_id ?? ""} className={INPUT_CLASS}>
                <option value="">Choose branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>
                ))}
              </select>
            </Field>
            <Field label="Department/category">
              <select name="department_id" required defaultValue={employee.department_id ?? ""} className={INPUT_CLASS}>
                <option value="">Choose department/category</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Role">
              <select name="role" required defaultValue={employee.user_role} className={INPUT_CLASS}>
                {USER_ROLES.map((role) => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Manager">
              <select name="manager_id" defaultValue={employee.manager_id ?? ""} className={INPUT_CLASS}>
                <option value="">No manager</option>
                {employees.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.full_name} · {candidate.email}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Role / job title">
              <input name="role_description" defaultValue={employee.role_description ?? ""} className={INPUT_CLASS} />
            </Field>
            <Field label="Employment status">
              <select name="employment_status" required defaultValue={employee.employment_status} className={INPUT_CLASS}>
                {EMPLOYMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </Field>
            <Field label="Baseline shift">
              <select name="shift_id" required defaultValue={employee.shift_id ?? ""} className={INPUT_CLASS}>
                <option value="">Choose shift</option>
                {shifts.map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {shift.name} ({shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Custom shift start">
              <input name="custom_shift_start" type="time" defaultValue={employee.custom_shift_start?.slice(0, 5) ?? ""} className={INPUT_CLASS} />
            </Field>
            <Field label="Custom shift end">
              <input name="custom_shift_end" type="time" defaultValue={employee.custom_shift_end?.slice(0, 5) ?? ""} className={INPUT_CLASS} />
            </Field>
            <Field label="Update reason">
              <input name="reason" required className={INPUT_CLASS} placeholder="Role change, profile correction, shift update..." />
            </Field>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Checkbox name="attendance_exempt" label="Attendance exempt" checked={employee.attendance_exempt} />
            <Checkbox name="remote_allowed" label="Remote allowed" checked={employee.remote_allowed} />
            <Checkbox name="custom_shift_enabled" label="Use custom shift override" checked={employee.custom_shift_enabled} />
          </div>
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-700">Scheduled remote days</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAYS.map((day, index) => {
                const value = index + 1;
                return (
                  <label key={day} className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                    <input type="checkbox" name="remote_default_days" value={value} defaultChecked={employee.remote_default_days.includes(value)} className="rounded border-gray-300" />
                    {day}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
              Save employee
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function CalendarGrid({
  employeeId,
  year,
  month,
  recordsByDate,
  holidaysByDate,
  tasksByDate,
  selectedDay,
}: {
  employeeId: string;
  year: number;
  month: number;
  recordsByDate: Map<string, AttendanceRecord>;
  holidaysByDate: Map<string, HolidayRowVM[]>;
  tasksByDate: Map<string, TaskRowVM[]>;
  selectedDay: string | null;
}) {
  const days = monthCalendarDays(year, month);
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-2 text-center text-xs font-semibold text-gray-500">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const record = day.inMonth ? recordsByDate.get(day.iso) ?? null : null;
          const holidays = day.inMonth ? holidaysByDate.get(day.iso) ?? [] : [];
          const tasks = day.inMonth ? tasksByDate.get(day.iso) ?? [] : [];
          const display = dayDisplay(record, holidays, day.isSunday);
          return (
            <Link
              key={day.iso}
              href={`?year=${year}&month=${month}&day=${day.iso}`}
              className={`min-h-[8.25rem] border-b border-r border-gray-100 p-2 text-left transition hover:bg-gray-50 ${
                !day.inMonth ? "bg-gray-50/60 text-gray-400" : display.bg
              } ${selectedDay === day.iso ? "outline outline-2 outline-indigo-400" : ""}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold text-gray-700">{Number(day.iso.slice(8, 10))}</span>
                {record?.requires_review && <Chip label="review" tone="yellow" />}
                {holidays.length > 0 && <Chip label="holiday" tone="gray" />}
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <p className={`font-medium ${display.text}`}>{display.status}</p>
                <p className="tabular-nums text-gray-600">{display.times}</p>
                <p className="text-gray-600">{display.worked}</p>
                {holidays.slice(0, 2).map((holiday) => (
                  <p key={holiday.id} className="truncate text-purple-700">
                    {holiday.name}
                  </p>
                ))}
                {tasks.slice(0, 2).map((task) => (
                  <p key={task.id} className="truncate text-indigo-700">
                    {task.title}
                  </p>
                ))}
                {tasks.length > 2 && (
                  <p className="text-gray-500">+{tasks.length - 2} more tasks</p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function DayPanel({
  employeeId,
  date,
  record,
  holidays,
  tasks,
  note,
  year,
  month,
}: {
  employeeId: string;
  date: string | null;
  record: AttendanceRecord | null;
  holidays: HolidayRowVM[];
  tasks: TaskRowVM[];
  note: { reason: string | null; created_at: string; actor_name: string | null } | null;
  year: number;
  month: number;
}) {
  if (!date) {
    return (
      <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
        <h2 className="text-sm font-semibold text-gray-700">Day detail</h2>
        <p className="mt-3 text-sm text-gray-500">Select a day to review or override.</p>
      </section>
    );
  }

  const redirectTo = `/admin/employees/${employeeId}?year=${year}&month=${month}&day=${date}`;
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Day detail</h2>
          <p className="mt-1 text-lg font-semibold text-gray-900">{shortDatePKT(date)}</p>
        </div>
        {record ? <StatusChip status={record.status} /> : <Chip label="not marked" tone="gray" />}
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <Info label="Check-in" value={formatTimePKT(record?.check_in_at ?? null)} />
        <Info label="Check-out" value={formatTimePKT(record?.check_out_at ?? null)} />
        <Info label="Worked" value={formatWorkedMinutes(record?.worked_minutes ?? null)} />
        <Info label="Geolocation" value={record?.verification_status?.replaceAll("_", " ") ?? record?.geolocation?.status ?? "—"} />
        <Info label="Distance" value={distanceLabel(record)} />
        <Info label="Review reason" value={record?.review_reason?.replaceAll("_", " ") ?? "—"} />
        <Info
          label="Holidays"
          value={holidays.length ? holidays.map((h) => h.name).join(", ") : "—"}
        />
        <Info
          label="Tasks"
          value={tasks.length ? tasks.map((t) => t.title).join(", ") : "—"}
        />
        <Info
          label="Audit note"
          value={
            note?.reason
              ? `${note.reason} (${note.actor_name ?? "admin"}, ${shortDatePKT(note.created_at.slice(0, 10))})`
              : "—"
          }
        />
      </dl>

      <form action={overrideAttendanceRecord} className="mt-5 space-y-3">
        <input type="hidden" name="id" value={record?.id ?? ""} />
        <input type="hidden" name="employee_id" value={employeeId} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="redirect_to" value={redirectTo} />
        <div>
          <label className="block text-xs font-medium text-gray-700">Corrected status</label>
          <select
            name="status"
            defaultValue={record?.status && OVERRIDE_STATUSES.includes(record.status) ? record.status : "present"}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            {OVERRIDE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700">Check-in</label>
            <input
              type="time"
              name="check_in_time"
              defaultValue={timeInputPKT(record?.check_in_at ?? null)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Check-out</label>
            <input
              type="time"
              name="check_out_time"
              defaultValue={timeInputPKT(record?.check_out_at ?? null)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            name="requires_review"
            defaultChecked={record?.requires_review ?? false}
            className="rounded border-gray-300"
          />
          Requires review
        </label>
        <div>
          <label className="block text-xs font-medium text-gray-700">Admin note/reason</label>
          <textarea
            name="reason"
            rows={3}
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            placeholder="Why is this correction being made?"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Link
            href={`/admin/employees/${employeeId}?year=${year}&month=${month}`}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Save override
          </button>
        </div>
      </form>
    </section>
  );
}

function PayrollPreviewPanel({ preview, salary }: { preview: PayrollPreview; salary: number }) {
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-gray-700">Payroll-ready preview</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <Info label="Salary" value={PKR.format(salary)} />
        <Info label="Scheduled working days" value={String(preview.scheduledWorkingDays)} />
        <Info label="Daily deduction rate" value={PKR.format(preview.dailyDeductionRate)} />
        <Info label="Late count" value={String(preview.lateCount)} />
        <Info label="Late deduction days" value={String(preview.lateDeductionDays)} />
        <Info label="Half-day count" value={String(preview.halfDayCount)} />
        <Info label="Extra half-days beyond 2" value={String(preview.extraHalfDays)} />
        <Info label="Half-day deduction days" value={preview.halfDayDeductionDays.toFixed(1)} />
        <Info label="Absence days" value={String(preview.absentDays)} />
        <Info label="Total deduction days" value={preview.totalDeductionDays.toFixed(1)} />
        <Info label="Estimated deduction" value={PKR.format(preview.deductionAmount)} />
        <Info label="Estimated payable" value={PKR.format(preview.estimatedPayable)} />
      </dl>
    </section>
  );
}

function TaskPanel({
  open,
  done,
}: {
  open: number;
  done: number;
}) {
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-gray-700">Tasks</h2>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <Chip label={`${open} open`} tone={open > 0 ? "yellow" : "gray"} />
        <Chip label={`${done} done`} tone="green" />
      </div>
      <Link
        href="/admin/tasks/history?range=this_month"
        className="mt-3 inline-block text-sm text-indigo-600 hover:text-indigo-500"
      >
        Done task history →
      </Link>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone: "green" | "amber" | "orange" | "red" | "blue" | "gray" | "indigo" | "yellow" }) {
  const valueClass = {
    green: "text-green-700",
    amber: "text-amber-700",
    orange: "text-orange-700",
    red: "text-red-700",
    blue: "text-blue-700",
    gray: "text-gray-700",
    indigo: "text-indigo-700",
    yellow: "text-yellow-700",
  }[tone];
  return (
    <div className="rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
      <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-gray-700">
      {label}
      {children}
    </label>
  );
}

function Checkbox({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
      <input
        type="checkbox"
        name={name}
        defaultChecked={checked}
        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
      />
      {label}
    </label>
  );
}

function dayDisplay(
  record: AttendanceRecord | null,
  holidays: HolidayRowVM[],
  isSunday: boolean
) {
  if (!record) {
    if (holidays.length > 0) {
      return {
        status: "Paid holiday",
        times: holidays.map((holiday) => holiday.name).join(", "),
        worked: "Excluded from working days",
        bg: "bg-purple-50/70",
        text: "text-purple-700",
      };
    }
    return isSunday
      ? { status: "Day off", times: "—", worked: "Weekly off", bg: "bg-gray-50", text: "text-gray-700" }
      : { status: "Not marked", times: "No record", worked: "—", bg: "bg-white", text: "text-gray-500" };
  }
  return {
    status: record.status.replaceAll("_", " "),
    times: `${formatTimePKT(record.check_in_at)} → ${formatTimePKT(record.check_out_at)}`,
    worked: formatWorkedMinutes(record.worked_minutes),
    bg: statusBg(record.status),
    text: statusText(record.status),
  };
}

function holidayAppliesToEmployee(
  holiday: HolidayRowVM,
  branchId: string | null,
  employeeId: string
): boolean {
  if (holiday.employee_id === employeeId) return true;
  if (holiday.company_wide) return true;
  return Boolean(branchId && holiday.branch_id === branchId);
}

function groupByDate<T>(items: T[], getDate: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const date = getDate(item);
    const current = grouped.get(date) ?? [];
    current.push(item);
    grouped.set(date, current);
  }
  return grouped;
}

function statusBg(status: AttendanceStatus): string {
  if (status === "present") return "bg-green-50/60";
  if (status === "late" || status === "remote_late") return "bg-amber-50/70";
  if (status === "half_day" || status === "remote_half_day") return "bg-orange-50/70";
  if (status === "absent") return "bg-red-50/70";
  if (status === "on_leave") return "bg-purple-50/70";
  if (status === "remote_present") return "bg-blue-50/70";
  if (status === "day_off" || status === "public_holiday") return "bg-gray-50";
  return "bg-white";
}

function statusText(status: AttendanceStatus): string {
  if (status === "absent") return "text-red-700";
  if (status === "late" || status === "remote_late") return "text-amber-800";
  if (status === "half_day" || status === "remote_half_day") return "text-orange-700";
  if (status === "on_leave") return "text-purple-700";
  if (status.startsWith("remote_")) return "text-blue-700";
  if (status === "present") return "text-green-700";
  return "text-gray-700";
}

function summarize(records: AttendanceRecord[]): AttendanceTotals {
  return records.reduce<AttendanceTotals>(
    (acc, r) => {
      if (r.status === "present") acc.present += 1;
      if (r.status === "late" || r.status === "remote_late") acc.late += 1;
      if (r.status === "half_day" || r.status === "remote_half_day") acc.halfDay += 1;
      if (r.status === "absent") acc.absent += 1;
      if (r.status === "on_leave") acc.onLeave += 1;
      if (r.status === "day_off" || r.status === "public_holiday") acc.dayOff += 1;
      if (r.status.startsWith("remote_")) acc.remote += 1;
      if (r.requires_review) acc.pendingReview += 1;
      acc.workedMinutes += r.worked_minutes ?? 0;
      return acc;
    },
    {
      present: 0,
      late: 0,
      halfDay: 0,
      absent: 0,
      onLeave: 0,
      dayOff: 0,
      remote: 0,
      pendingReview: 0,
      workedMinutes: 0,
    }
  );
}

function monthCalendarDays(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - mondayOffset);
  const days: Array<{ iso: string; inMonth: boolean; isSunday: boolean }> = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    days.push({
      iso: d.toISOString().slice(0, 10),
      inMonth: d.getUTCMonth() === month - 1,
      isSunday: d.getUTCDay() === 0,
    });
  }
  while (days.length > 35 && !days.slice(-7).some((d) => d.inMonth)) {
    days.splice(-7);
  }
  void last;
  return days;
}


function endOfMonth(startIso: string): string {
  const [y, m] = startIso.split("-").map((p) => Number.parseInt(p, 10));
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function clampInt(raw: string | undefined, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function validDay(raw: string | undefined): boolean {
  return Boolean(raw && /^\d{4}-\d{2}-\d{2}$/.test(raw));
}

function timeInputPKT(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function distanceLabel(record: AttendanceRecord | null): string {
  if (!record) return "—";
  const distance = record.check_in_distance_meters ?? record.check_out_distance_meters;
  return distance == null ? "—" : `${distance}m`;
}

function formatRemoteDays(days: number[]): string {
  if (!days.length) return "—";
  return days
    .filter((d) => d >= 1 && d <= 7)
    .map((d) => WEEKDAYS[d - 1])
    .join(", ");
}
