import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { endOfMonth, shortDatePKT, startOfMonth, todayPKT } from "@/lib/attendance/format";
import { listEmployees } from "@/lib/db/queries";
import { listAttendanceForPayroll, listHolidays } from "@/lib/db/payroll";
import { buildPayrollPreview } from "@/lib/payroll/preview";
import type { AttendanceRecord } from "@/lib/types/hrm";

type Search = { month?: string };

const PKR = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0,
});

function isMonthKey(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}$/.test(value));
}

function addMonths(monthKey: string, n: number): string {
  const [year, month] = monthKey.split("-").map((p) => Number.parseInt(p, 10));
  const dt = new Date(Date.UTC(year, month - 1 + n, 1));
  return dt.toISOString().slice(0, 7);
}

function monthLabel(monthKey: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${monthKey}-01T00:00:00Z`));
}

export default async function AdminPayrollPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.appUser.role !== "super_admin") {
    redirect("/dashboard?error=Super-admin%20access%20required");
  }

  const monthKey = isMonthKey(sp.month) ? sp.month : todayPKT().slice(0, 7);
  const monthStart = startOfMonth(`${monthKey}-01`);
  const monthEnd = endOfMonth(monthStart);

  const [employees, attendance, holidays] = await Promise.all([
    listEmployees(),
    listAttendanceForPayroll(monthStart, monthEnd),
    listHolidays(monthStart, monthEnd),
  ]);

  const recordsByEmployee = new Map<string, AttendanceRecord[]>();
  for (const record of attendance) {
    const current = recordsByEmployee.get(record.employee_id) ?? [];
    current.push(record);
    recordsByEmployee.set(record.employee_id, current);
  }

  const previews = employees.map((employee) =>
    buildPayrollPreview({
      employee,
      records: recordsByEmployee.get(employee.id) ?? [],
      holidays,
      monthStart,
      monthEnd,
    })
  );

  const totalSalary = previews.reduce((sum, row) => sum + row.monthlySalary, 0);
  const totalDeduction = previews.reduce((sum, row) => sum + row.deductionAmount, 0);
  const totalPayable = previews.reduce((sum, row) => sum + row.estimatedPayable, 0);
  const paidHolidays = holidays.filter((holiday) => holiday.is_paid);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Payroll-ready preview
          </h1>
          <p className="text-sm text-gray-500">
            Monthly working-day baseline for {monthLabel(monthKey)}. This does not
            generate payslips or mark salaries paid.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Link
            href={`/admin/payroll?month=${addMonths(monthKey, -1)}`}
            className="rounded-md bg-white px-3 py-1 text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
          >
            {monthLabel(addMonths(monthKey, -1))}
          </Link>
          <Link
            href={`/admin/payroll?month=${todayPKT().slice(0, 7)}`}
            className="rounded-md bg-white px-3 py-1 text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
          >
            Current month
          </Link>
          <Link
            href={`/admin/payroll?month=${addMonths(monthKey, 1)}`}
            className="rounded-md bg-white px-3 py-1 text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
          >
            {monthLabel(addMonths(monthKey, 1))}
          </Link>
        </div>
      </header>

      <section className="rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
        <form action="/admin/payroll" className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Month</span>
            <input
              type="month"
              name="month"
              defaultValue={monthKey}
              className="rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
          >
            Load month
          </button>
          <Link
            href="/admin/holidays"
            className="rounded-md bg-white px-4 py-2 text-sm text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
          >
            Manage holidays
          </Link>
          <Link
            href={`/admin/payroll/export?mode=monthly&month=${monthKey}`}
            className="rounded-md bg-white px-4 py-2 text-sm text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
          >
            Export center
          </Link>
        </form>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Employees" value={previews.length} />
        <Stat label="Gross monthly salary" value={PKR.format(totalSalary)} />
        <Stat label="Estimated deductions" value={PKR.format(totalDeduction)} />
        <Stat label="Estimated payable" value={PKR.format(totalPayable)} />
      </div>

      <section className="rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
        <h2 className="text-sm font-semibold text-gray-700">Paid holidays in month</h2>
        {paidHolidays.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">
            No paid holidays recorded for this month. Sundays are still excluded automatically.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {paidHolidays.map((holiday) => (
              <span
                key={holiday.id}
                className="rounded-full bg-gray-100 px-2 py-1 text-gray-700"
              >
                {shortDatePKT(holiday.date)} · {holiday.name}
                {!holiday.company_wide &&
                  ` · ${holiday.branch_code ?? holiday.branch_name ?? "branch"}`}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <Th>Name</Th>
              <Th>Branch</Th>
              <Th className="text-right">Salary</Th>
              <Th className="text-right">Working days</Th>
              <Th className="text-right">Daily rate</Th>
              <Th className="text-right">Absent</Th>
              <Th className="text-right">Late</Th>
              <Th className="text-right">Late ded.</Th>
              <Th className="text-right">Half-day</Th>
              <Th className="text-right">Half ded.</Th>
              <Th className="text-right">Total ded. days</Th>
              <Th className="text-right">Deduction</Th>
              <Th className="text-right">Payable</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {previews.map((row) => (
              <tr key={row.employeeId} className="hover:bg-gray-50">
                <Td className="font-medium text-gray-900">{row.employeeName}</Td>
                <Td>{row.branchCode ?? row.branchName ?? "—"}</Td>
                <Td className="text-right tabular-nums">{PKR.format(row.monthlySalary)}</Td>
                <Td className="text-right tabular-nums">{row.scheduledWorkingDays}</Td>
                <Td className="text-right tabular-nums">{PKR.format(row.dailyDeductionRate)}</Td>
                <Td className="text-right tabular-nums">{row.absentDays}</Td>
                <Td className="text-right tabular-nums">{row.lateCount}</Td>
                <Td className="text-right tabular-nums">{row.lateDeductionDays}</Td>
                <Td className="text-right tabular-nums">{row.halfDayCount}</Td>
                <Td className="text-right tabular-nums">{row.halfDayDeductionDays.toFixed(1)}</Td>
                <Td className="text-right tabular-nums">{row.totalDeductionDays.toFixed(1)}</Td>
                <Td className="text-right tabular-nums">{PKR.format(row.deductionAmount)}</Td>
                <Td className="text-right font-semibold tabular-nums text-green-700">
                  {PKR.format(row.estimatedPayable)}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="overflow-hidden rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
      <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-3 align-top ${className}`}>{children}</td>;
}
