import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { endOfMonth, startOfMonth, todayPKT } from "@/lib/attendance/format";
import { listEmployees } from "@/lib/db/queries";
import { listAttendanceForPayroll, listHolidays } from "@/lib/db/payroll";
import { buildPayrollPreview } from "@/lib/payroll/preview";
import {
  getAdminFinancialsAllTime,
  getAdminFinancialsMonthly,
  type AdminPaymentRow,
  type AdminRefundRow,
} from "@/lib/db/financials";
import type { AttendanceRecord } from "@/lib/types/hrm";

type Search = { month?: string };

const PKR = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0,
});

const RECENT_LIMIT = 20;

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

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default async function AdminFinancialsPage({
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
  if (!me.appUser.is_active) {
    redirect("/dashboard?error=Active%20user%20required");
  }

  const monthKey = isMonthKey(sp.month) ? sp.month : todayPKT().slice(0, 7);
  const monthStart = startOfMonth(`${monthKey}-01`);
  const monthEnd = endOfMonth(monthStart);

  const [monthly, allTime, employees, attendance, holidays] = await Promise.all([
    getAdminFinancialsMonthly(monthKey),
    getAdminFinancialsAllTime(),
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
  const payrollOutflow = previews.reduce((sum, row) => sum + row.estimatedPayable, 0);
  const netAfterPayroll = monthly.pkrNetInflow - payrollOutflow;

  const hasNonPkr =
    monthly.skippedNonPkrPayments + monthly.skippedNonPkrRefunds > 0 ||
    allTime.skippedNonPkrPayments + allTime.skippedNonPkrRefunds > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Admin Financials</h1>
          <p className="text-sm text-gray-500">
            Company-wide CRM inflow vs HRM payroll outflow for {monthLabel(monthKey)}. Read-only.
            All amounts are in PKR.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Link
            href={`/admin/financials?month=${addMonths(monthKey, -1)}`}
            className="rounded-md bg-white px-3 py-1 text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
          >
            {monthLabel(addMonths(monthKey, -1))}
          </Link>
          <Link
            href={`/admin/financials?month=${todayPKT().slice(0, 7)}`}
            className="rounded-md bg-white px-3 py-1 text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
          >
            Current month
          </Link>
          <Link
            href={`/admin/financials?month=${addMonths(monthKey, 1)}`}
            className="rounded-md bg-white px-3 py-1 text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
          >
            {monthLabel(addMonths(monthKey, 1))}
          </Link>
        </div>
      </header>

      <section className="rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
        <form action="/admin/financials" className="flex flex-wrap items-end gap-3">
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
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Load month
          </button>
          <Link
            href="/admin/payroll"
            className="rounded-md bg-white px-4 py-2 text-sm text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
          >
            Payroll preview
          </Link>
        </form>
      </section>

      {hasNonPkr && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Non-PKR payments or refunds detected (
          {monthly.nonPkrCurrencies.concat(allTime.nonPkrCurrencies).join(", ") || "unknown"}
          ). They are excluded from totals below. PKR-only is the MVP base; multi-currency support
          will land in a later feature.
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">This month</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="PKR received" value={PKR.format(monthly.pkrReceived)} tone="green" />
          <Stat label="PKR refunded" value={PKR.format(monthly.pkrRefunded)} tone="red" />
          <Stat
            label="Net CRM inflow"
            value={PKR.format(monthly.pkrNetInflow)}
            tone={monthly.pkrNetInflow >= 0 ? "green" : "red"}
          />
          <Stat
            label="PKR payroll outflow"
            value={PKR.format(payrollOutflow)}
            tone="amber"
            hint="Preview-based estimate"
          />
          <Stat
            label="Net after payroll"
            value={PKR.format(netAfterPayroll)}
            tone={netAfterPayroll >= 0 ? "green" : "red"}
          />
        </div>
        <p className="text-xs text-gray-500">
          Payroll outflow uses the existing payroll preview helper (no finalized payroll-run table
          exists yet). Treat it as an estimate until payroll runs are finalized in a future phase.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">All time (CRM)</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="PKR received" value={PKR.format(allTime.pkrReceived)} tone="green" />
          <Stat label="PKR refunded" value={PKR.format(allTime.pkrRefunded)} tone="red" />
          <Stat
            label="Net CRM inflow"
            value={PKR.format(allTime.pkrNetInflow)}
            tone={allTime.pkrNetInflow >= 0 ? "green" : "red"}
          />
        </div>
      </section>

      <RecentPayments rows={monthly.payments.slice(0, RECENT_LIMIT)} />
      <RecentRefunds rows={monthly.refunds.slice(0, RECENT_LIMIT)} />
    </div>
  );
}

function RecentPayments({ rows }: { rows: AdminPaymentRow[] }) {
  return (
    <section className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-700">Recent payments this month</h2>
        <span className="text-xs text-gray-500">{rows.length} shown</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-gray-500">No payments recorded in this month.</p>
      ) : (
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <Th>Paid at</Th>
              <Th>Client</Th>
              <Th>Branch</Th>
              <Th>Counselor</Th>
              <Th className="text-right">Amount</Th>
              <Th>Currency</Th>
              <Th>Method</Th>
              <Th>Recorded by</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <Td>{formatDateTime(row.paid_at)}</Td>
                <Td>
                  <div className="font-medium text-gray-900">{row.client_code}</div>
                  <div className="text-xs text-gray-500">{row.customer_name ?? "—"}</div>
                </Td>
                <Td>{row.branch_code ?? row.branch_name ?? "—"}</Td>
                <Td>{row.agent_name ?? "—"}</Td>
                <Td className="text-right tabular-nums">{row.amount.toLocaleString("en-PK")}</Td>
                <Td>{row.currency}</Td>
                <Td>{row.method ?? "—"}</Td>
                <Td>{row.recorder_name ?? "—"}</Td>
                <Td>
                  <Link
                    href={`/crm/clients/${row.client_id}/financials`}
                    className="text-xs text-indigo-600 hover:text-indigo-500"
                  >
                    Open →
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function RecentRefunds({ rows }: { rows: AdminRefundRow[] }) {
  return (
    <section className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-700">Recent refunds this month</h2>
        <span className="text-xs text-gray-500">{rows.length} shown</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-gray-500">No refunds recorded in this month.</p>
      ) : (
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <Th>Refunded at</Th>
              <Th>Client</Th>
              <Th>Branch</Th>
              <Th>Counselor</Th>
              <Th className="text-right">Amount</Th>
              <Th>Currency</Th>
              <Th>Reason</Th>
              <Th>Recorded by</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <Td>{formatDateTime(row.refunded_at)}</Td>
                <Td>
                  <div className="font-medium text-gray-900">{row.client_code}</div>
                  <div className="text-xs text-gray-500">{row.customer_name ?? "—"}</div>
                </Td>
                <Td>{row.branch_code ?? row.branch_name ?? "—"}</Td>
                <Td>{row.agent_name ?? "—"}</Td>
                <Td className="text-right tabular-nums">{row.amount.toLocaleString("en-PK")}</Td>
                <Td>{row.currency}</Td>
                <Td>{row.reason}</Td>
                <Td>{row.recorder_name ?? "—"}</Td>
                <Td>
                  <Link
                    href={`/crm/clients/${row.client_id}/closure`}
                    className="text-xs text-indigo-600 hover:text-indigo-500"
                  >
                    Open →
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "green" | "red" | "amber" | "gray";
}) {
  const valueClass = {
    green: "text-green-700",
    red: "text-red-700",
    amber: "text-amber-700",
    gray: "text-gray-900",
  }[tone];
  return (
    <div className="overflow-hidden rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
      <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
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
