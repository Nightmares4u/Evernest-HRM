import Link from "next/link";
import { redirect } from "next/navigation";
import { Chip, StatusChip } from "@/components/StatusChip";
import {
  dateRangeToTimestamps,
  formatTimePKT,
  formatWorkedMinutes,
  shortDatePKT,
  todayPKT,
} from "@/lib/attendance/format";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listEmployeeAttendanceRange } from "@/lib/db/queries";
import { listHolidays, type HolidayRowVM } from "@/lib/db/payroll";
import { listTasksInRange, type TaskRowVM } from "@/lib/db/tasks";
import type { AttendanceRecord, AttendanceStatus } from "@/lib/types/hrm";

type Search = { year?: string; month?: string; day?: string };

type MonthTotals = {
  present: number;
  late: number;
  halfDay: number;
  absent: number;
  holidays: number;
  tasks: number;
  workedMinutes: number;
};

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

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const today = todayPKT();
  const currentYear = Number.parseInt(today.slice(0, 4), 10);
  const currentMonth = Number.parseInt(today.slice(5, 7), 10);
  const year = clampInt(sp.year, 2000, 2100, currentYear);
  const month = clampInt(sp.month, 1, 12, currentMonth);
  const monthStart = `${year}-${pad2(month)}-01`;
  const monthEnd = endOfMonth(monthStart);
  const startOfYear = `${year}-01-01`;
  const endOfYear = `${year}-12-31`;
  const selectedDay = validDay(sp.day) ? sp.day! : null;

  const [records, tasks, holidays] = await Promise.all([
    me.employee
      ? listEmployeeAttendanceRange(me.employee.id, startOfYear, endOfYear)
      : Promise.resolve<AttendanceRecord[]>([]),
    listTasksInRange(startOfYear, endOfYear, me.authUserId),
    listHolidays(startOfYear, endOfYear),
  ]);

  const relevantHolidays = holidays.filter((holiday) =>
    holidayAppliesToUser(holiday, me.employee?.branch_id ?? null, me.employee?.id ?? null)
  );
  const recordsByDate = groupByDate(records, (record) => record.date);
  const tasksByDate = groupByDate(tasks, (task) => task.due_date);
  const holidaysByDate = groupByDate(relevantHolidays, (holiday) => holiday.date);
  const selectedRecords = selectedDay ? recordsByDate.get(selectedDay) ?? [] : [];
  const selectedTasks = selectedDay ? tasksByDate.get(selectedDay) ?? [] : [];
  const selectedHolidays = selectedDay ? holidaysByDate.get(selectedDay) ?? [] : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Calendar</h1>
          <p className="text-sm text-gray-500">
            Your monthly view of attendance, tasks, and holidays.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <Link
            className="rounded-md bg-white px-3 py-1 text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
            href={`/calendar?year=${year - 1}&month=${month}`}
          >
            {year - 1}
          </Link>
          <Link
            className="rounded-md bg-white px-3 py-1 text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
            href={`/calendar?year=${currentYear}&month=${currentMonth}`}
          >
            This month
          </Link>
          <Link
            className="rounded-md bg-white px-3 py-1 text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
            href={`/calendar?year=${year + 1}&month=${month}`}
          >
            {year + 1}
          </Link>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">{year} overview</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          {MONTHS.map((name, index) => {
            const m = index + 1;
            const start = `${year}-${pad2(m)}-01`;
            const end = endOfMonth(start);
            const totals = summarizeMonth({
              records: records.filter((record) => record.date >= start && record.date <= end),
              tasks: tasks.filter((task) => task.due_date >= start && task.due_date <= end),
              holidays: relevantHolidays.filter(
                (holiday) => holiday.date >= start && holiday.date <= end
              ),
            });
            return (
              <Link
                key={name}
                href={`/calendar?year=${year}&month=${m}`}
                className={`rounded-lg bg-white p-3 shadow ring-1 ring-black/5 hover:bg-gray-50 ${
                  m === month ? "outline outline-2 outline-blue-300" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{name}</span>
                  {totals.holidays > 0 && (
                    <Chip label={`${totals.holidays} hol`} tone="gray" />
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-gray-600">
                  <span>P {totals.present}</span>
                  <span>L {totals.late}</span>
                  <span>H {totals.halfDay}</span>
                  <span>A {totals.absent}</span>
                  <span>Tasks {totals.tasks}</span>
                  <span>{Math.round(totals.workedMinutes / 60)}h</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-700">
              {MONTHS[month - 1]} {year}
            </h2>
            <div className="flex flex-wrap gap-2 text-xs">
              <Chip label={`${tasksByDateCount(tasksByDate, monthStart, monthEnd)} tasks`} tone="blue" />
              <Chip label={`${holidaysByDateCount(holidaysByDate, monthStart, monthEnd)} holidays`} tone="gray" />
            </div>
          </div>
          <CalendarGrid
            year={year}
            month={month}
            recordsByDate={recordsByDate}
            tasksByDate={tasksByDate}
            holidaysByDate={holidaysByDate}
            selectedDay={selectedDay}
          />
        </section>

        <DayPanel
          date={selectedDay}
          records={selectedRecords}
          tasks={selectedTasks}
          holidays={selectedHolidays}
          year={year}
          month={month}
        />
      </div>
    </div>
  );
}

function CalendarGrid({
  year,
  month,
  recordsByDate,
  tasksByDate,
  holidaysByDate,
  selectedDay,
}: {
  year: number;
  month: number;
  recordsByDate: Map<string, AttendanceRecord[]>;
  tasksByDate: Map<string, TaskRowVM[]>;
  holidaysByDate: Map<string, HolidayRowVM[]>;
  selectedDay: string | null;
}) {
  const days = monthCalendarDays(year, month);
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
        {WEEKDAYS.map((day) => (
          <div key={day} className="px-2 py-2 text-center text-xs font-semibold text-gray-500">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const records = day.inMonth ? recordsByDate.get(day.iso) ?? [] : [];
          const tasks = day.inMonth ? tasksByDate.get(day.iso) ?? [] : [];
          const holidays = day.inMonth ? holidaysByDate.get(day.iso) ?? [] : [];
          const record = records[0] ?? null;
          const display = dayDisplay(record, holidays, day.isSunday);
          return (
            <Link
              key={day.iso}
              href={`/calendar?year=${year}&month=${month}&day=${day.iso}`}
              className={`min-h-[8.25rem] border-b border-r border-gray-100 p-2 text-left transition hover:bg-gray-50 ${
                !day.inMonth ? "bg-gray-50/60 text-gray-400" : display.bg
              } ${selectedDay === day.iso ? "outline outline-2 outline-blue-400" : ""}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold text-gray-700">
                  {Number(day.iso.slice(8, 10))}
                </span>
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
                  <p key={task.id} className="truncate text-blue-700">
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
  date,
  records,
  tasks,
  holidays,
  year,
  month,
}: {
  date: string | null;
  records: AttendanceRecord[];
  tasks: TaskRowVM[];
  holidays: HolidayRowVM[];
  year: number;
  month: number;
}) {
  if (!date) {
    return (
      <aside className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
        <h2 className="text-sm font-semibold text-gray-700">Day detail</h2>
        <p className="mt-3 text-sm text-gray-500">Select a day to inspect.</p>
      </aside>
    );
  }

  const record = records[0] ?? null;
  return (
    <aside className="space-y-4">
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
          <Info label="Holidays" value={holidays.length ? holidays.map((h) => h.name).join(", ") : "—"} />
          <Info label="Tasks" value={tasks.length ? tasks.map((t) => t.title).join(", ") : "—"} />
        </dl>
      </section>

      {tasks.length > 0 && (
        <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
          <h2 className="text-sm font-semibold text-gray-700">Tasks</h2>
          <ol className="mt-3 space-y-2">
            {tasks.map((task) => (
              <li key={task.id} className="rounded-md border border-gray-100 p-3 text-sm">
                <div className="font-medium text-gray-900">{task.title}</div>
                <div className="mt-1 text-xs text-gray-500">
                  {task.status.replaceAll("_", " ")}
                  {task.due_time && ` · ${task.due_time.slice(0, 5)}`}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <Link
        href={`/calendar?year=${year}&month=${month}`}
        className="inline-block text-sm text-blue-600 hover:text-blue-500"
      >
        Clear selected day
      </Link>
    </aside>
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

function summarizeMonth({
  records,
  tasks,
  holidays,
}: {
  records: AttendanceRecord[];
  tasks: TaskRowVM[];
  holidays: HolidayRowVM[];
}): MonthTotals {
  return records.reduce<MonthTotals>(
    (acc, record) => {
      if (record.status === "present") acc.present += 1;
      if (record.status === "late" || record.status === "remote_late") acc.late += 1;
      if (record.status === "half_day" || record.status === "remote_half_day") acc.halfDay += 1;
      if (record.status === "absent") acc.absent += 1;
      acc.workedMinutes += record.worked_minutes ?? 0;
      return acc;
    },
    {
      present: 0,
      late: 0,
      halfDay: 0,
      absent: 0,
      holidays: holidays.length,
      tasks: tasks.length,
      workedMinutes: 0,
    }
  );
}

function monthCalendarDays(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - mondayOffset);
  const days: Array<{ iso: string; inMonth: boolean; isSunday: boolean }> = [];
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + i);
    days.push({
      iso: day.toISOString().slice(0, 10),
      inMonth: day.getUTCMonth() === month - 1,
      isSunday: day.getUTCDay() === 0,
    });
  }
  while (days.length > 35 && !days.slice(-7).some((day) => day.inMonth)) {
    days.splice(-7);
  }
  return days;
}

function endOfMonth(startIso: string): string {
  const [year, month] = startIso.split("-").map((p) => Number.parseInt(p, 10));
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
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

function holidayAppliesToUser(
  holiday: HolidayRowVM,
  branchId: string | null,
  employeeId: string | null
): boolean {
  if (employeeId && holiday.employee_id === employeeId) return true;
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

function tasksByDateCount(
  tasksByDate: Map<string, TaskRowVM[]>,
  startDate: string,
  endDate: string
): number {
  let count = 0;
  for (const [date, tasks] of tasksByDate) {
    if (date >= startDate && date <= endDate) count += tasks.length;
  }
  return count;
}

function holidaysByDateCount(
  holidaysByDate: Map<string, HolidayRowVM[]>,
  startDate: string,
  endDate: string
): number {
  let count = 0;
  for (const [date, holidays] of holidaysByDate) {
    if (date >= startDate && date <= endDate) count += holidays.length;
  }
  return count;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-900">{value}</dd>
    </div>
  );
}
