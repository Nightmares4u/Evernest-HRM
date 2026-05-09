import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Chip, StatusChip } from "@/components/StatusChip";
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
  listAttendanceOverrideNotes,
  listEmployeeAttendanceRange,
} from "@/lib/db/queries";
import { listDoneTasks, listTasksForEmployeeAdmin } from "@/lib/db/tasks";
import type { AttendanceRecord, AttendanceStatus } from "@/lib/types/hrm";

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

type PayrollPreview = {
  workingDays: number;
  lateCount: number;
  lateDeductionDays: number;
  halfDayCount: number;
  extraHalfDays: number;
  halfDayDeductionDays: number;
  absenceDays: number;
  totalDeductionDays: number;
  estimatedDeductionAmount: number;
  estimatedPayableAmount: number;
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
  if (me.appUser.role !== "super_admin") redirect("/dashboard?error=Admin access required");

  const employee = await getEmployeeProfile(id);
  if (!employee) notFound();

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

  const [yearRecords, tasks, doneTasks, leaveBalance] = await Promise.all([
    listEmployeeAttendanceRange(id, startOfYear, endOfYear),
    listTasksForEmployeeAdmin(employee.user_id),
    listDoneTasks(yearTimestampRange.since, yearTimestampRange.until, employee.user_id),
    getEmployeeLeaveBalanceThisMonth(id),
  ]);

  const recordIds = yearRecords.map((r) => r.id);
  const notes = await listAttendanceOverrideNotes(recordIds);
  const notesByRecord = new Map(notes.map((n) => [n.target_id, n]));
  const recordsByDate = new Map(yearRecords.map((r) => [r.date, r]));
  const selectedRecord = selectedDay ? recordsByDate.get(selectedDay) ?? null : null;
  const yearTotals = summarize(yearRecords);
  const monthRecords = yearRecords.filter(
    (r) => r.date >= monthStart && r.date <= monthEnd
  );
  const monthPreview = payrollPreview(
    monthRecords,
    employee.monthly_salary,
    monthStart,
    monthEnd
  );
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

      <ProfilePanel employee={employee} leaveBalance={leaveBalance?.balance ?? 0} />

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
}: {
  employee: Awaited<ReturnType<typeof getEmployeeProfile>>;
  leaveBalance: number;
}) {
  if (!employee) return null;
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Branch" value={employee.branch_name ?? "—"} />
        <Info label="Department/category" value={employee.department_name ?? "—"} />
        <Info label="Role" value={employee.role_description ?? employee.user_role} />
        <Info label="Salary" value={PKR.format(employee.monthly_salary)} />
        <Info label="Shift" value={employee.shift_name ?? "—"} />
        <Info label="Manager" value={employee.manager_name ?? "—"} />
        <Info label="Leave balance" value={`${leaveBalance.toFixed(1)} day(s)`} />
        <Info label="Remote days" value={formatRemoteDays(employee.remote_default_days)} />
      </dl>
    </section>
  );
}

function CalendarGrid({
  employeeId,
  year,
  month,
  recordsByDate,
  selectedDay,
}: {
  employeeId: string;
  year: number;
  month: number;
  recordsByDate: Map<string, AttendanceRecord>;
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
          const display = dayDisplay(day.iso, record, day.isSunday);
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
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <p className={`font-medium ${display.text}`}>{display.status}</p>
                <p className="tabular-nums text-gray-600">{display.times}</p>
                <p className="text-gray-600">{display.worked}</p>
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
  note,
  year,
  month,
}: {
  employeeId: string;
  date: string | null;
  record: AttendanceRecord | null;
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
        <Info label="Working days" value={String(preview.workingDays)} />
        <Info label="Late count" value={String(preview.lateCount)} />
        <Info label="Late deduction days" value={String(preview.lateDeductionDays)} />
        <Info label="Half-day count" value={String(preview.halfDayCount)} />
        <Info label="Extra half-days beyond 2" value={String(preview.extraHalfDays)} />
        <Info label="Half-day deduction days" value={preview.halfDayDeductionDays.toFixed(1)} />
        <Info label="Absence days" value={String(preview.absenceDays)} />
        <Info label="Total deduction days" value={preview.totalDeductionDays.toFixed(1)} />
        <Info label="Estimated deduction" value={PKR.format(preview.estimatedDeductionAmount)} />
        <Info label="Estimated payable" value={PKR.format(preview.estimatedPayableAmount)} />
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

function dayDisplay(iso: string, record: AttendanceRecord | null, isSunday: boolean) {
  if (!record) {
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

function payrollPreview(
  records: AttendanceRecord[],
  salary: number,
  monthStart: string,
  monthEnd: string
): PayrollPreview {
  const lateCount = records.filter((r) => r.status === "late" || r.status === "remote_late").length;
  const halfDayCount = records.filter((r) => r.status === "half_day" || r.status === "remote_half_day").length;
  const absenceDays = records.filter((r) => r.status === "absent").length;
  const lateDeductionDays = Math.floor(lateCount / 3);
  const extraHalfDays = Math.max(0, halfDayCount - 2);
  const halfDayDeductionDays = extraHalfDays * 0.5;
  const totalDeductionDays = absenceDays + lateDeductionDays + halfDayDeductionDays;
  const workingDays = countWorkingDays(monthStart, monthEnd);
  const perDay = workingDays > 0 ? salary / workingDays : 0;
  const estimatedDeductionAmount = Math.round(perDay * totalDeductionDays);
  return {
    workingDays,
    lateCount,
    lateDeductionDays,
    halfDayCount,
    extraHalfDays,
    halfDayDeductionDays,
    absenceDays,
    totalDeductionDays,
    estimatedDeductionAmount,
    estimatedPayableAmount: Math.max(0, salary - estimatedDeductionAmount),
  };
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

function countWorkingDays(startIso: string, endIso: string): number {
  let count = 0;
  const d = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (d <= end) {
    if (d.getUTCDay() !== 0) count += 1;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
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
