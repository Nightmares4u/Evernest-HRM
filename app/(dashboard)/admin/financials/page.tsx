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

import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { DataTable, Td } from "@/components/ui/DataTable";

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
      <PageHeader
        title="Admin Financials"
        description={`Company-wide CRM inflow vs HRM payroll outflow for ${monthLabel(monthKey)}. Read-only. All amounts are in PKR.`}
        action={
          <div className="flex flex-wrap gap-2 text-xs">
            <Link
              href={`/admin/financials?month=${addMonths(monthKey, -1)}`}
              className="rounded-md bg-white px-3 py-1.5 font-medium text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 transition-colors"
            >
              {monthLabel(addMonths(monthKey, -1))}
            </Link>
            <Link
              href={`/admin/financials?month=${todayPKT().slice(0, 7)}`}
              className="rounded-md bg-white px-3 py-1.5 font-medium text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 transition-colors"
            >
              Current month
            </Link>
            <Link
              href={`/admin/financials?month=${addMonths(monthKey, 1)}`}
              className="rounded-md bg-white px-3 py-1.5 font-medium text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 transition-colors"
            >
              {monthLabel(addMonths(monthKey, 1))}
            </Link>
          </div>
        }
      />

      <SectionCard>
        <form action="/admin/financials" className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Month</span>
            <input
              type="month"
              name="month"
              defaultValue={monthKey}
              className="rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 outline-none"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
          >
            Load month
          </button>
          <Link
            href="/admin/payroll"
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 transition-colors"
          >
            Payroll preview
          </Link>
        </form>
      </SectionCard>

      {hasNonPkr && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
          <strong>Non-PKR detected:</strong> {monthly.nonPkrCurrencies.concat(allTime.nonPkrCurrencies).join(", ") || "unknown"}.
          Excluded from totals below. Multi-currency support deferred.
        </div>
      )}

      <SectionCard title="This month">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5 mt-2">
          <StatCard label="PKR received" value={PKR.format(monthly.pkrReceived)} />
          <StatCard label="PKR refunded" value={PKR.format(monthly.pkrRefunded)} />
          <StatCard
            label="Net CRM inflow"
            value={PKR.format(monthly.pkrNetInflow)}
          />
          <StatCard
            label="PKR payroll outflow"
            value={PKR.format(payrollOutflow)}
            hint="Preview-based estimate"
          />
          <StatCard
            label="Net after payroll"
            value={PKR.format(netAfterPayroll)}
          />
        </div>
        <p className="mt-4 text-xs text-gray-500">
          Payroll outflow uses the existing payroll preview helper (no finalized payroll-run table
          exists yet). Treat it as an estimate until payroll runs are finalized in a future phase.
        </p>
      </SectionCard>

      <SectionCard title="All time (CRM)">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 mt-2">
          <StatCard label="PKR received" value={PKR.format(allTime.pkrReceived)} />
          <StatCard label="PKR refunded" value={PKR.format(allTime.pkrRefunded)} />
          <StatCard
            label="Net CRM inflow"
            value={PKR.format(allTime.pkrNetInflow)}
          />
        </div>
      </SectionCard>

      <RecentPayments rows={monthly.payments.slice(0, RECENT_LIMIT)} />
      <RecentRefunds rows={monthly.refunds.slice(0, RECENT_LIMIT)} />
    </div>
  );
}

function RecentPayments({ rows }: { rows: AdminPaymentRow[] }) {
  if (rows.length === 0) {
    return (
      <SectionCard title="Recent payments this month">
        <p className="text-sm text-gray-500">No payments recorded in this month.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Recent payments this month" description={`${rows.length} shown`}>
      <div className="mt-4">
        <DataTable columns={["Paid at", "Client", "Branch", "Counselor", "Amount", "Currency", "Method", "Recorded by", ""]}>
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
              <Td>{formatDateTime(row.paid_at)}</Td>
              <Td>
                <div className="font-medium text-gray-900">{row.client_code}</div>
                <div className="text-xs text-gray-500">{row.customer_name ?? "—"}</div>
              </Td>
              <Td>{row.branch_code ?? row.branch_name ?? "—"}</Td>
              <Td>{row.agent_name ?? "—"}</Td>
              <Td className="text-right tabular-nums font-medium">{row.amount.toLocaleString("en-PK")}</Td>
              <Td>{row.currency}</Td>
              <Td>{row.method ?? "—"}</Td>
              <Td>{row.recorder_name ?? "—"}</Td>
              <Td>
                <Link
                  href={`/crm/clients/${row.client_id}/financials`}
                  className="text-xs font-medium text-blue-600 hover:text-blue-500"
                >
                  Open →
                </Link>
              </Td>
            </tr>
          ))}
        </DataTable>
      </div>
    </SectionCard>
  );
}

function RecentRefunds({ rows }: { rows: AdminRefundRow[] }) {
  if (rows.length === 0) {
    return (
      <SectionCard title="Recent refunds this month">
        <p className="text-sm text-gray-500">No refunds recorded in this month.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Recent refunds this month" description={`${rows.length} shown`}>
      <div className="mt-4">
        <DataTable columns={["Refunded at", "Client", "Branch", "Counselor", "Amount", "Currency", "Reason", "Recorded by", ""]}>
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
              <Td>{formatDateTime(row.refunded_at)}</Td>
              <Td>
                <div className="font-medium text-gray-900">{row.client_code}</div>
                <div className="text-xs text-gray-500">{row.customer_name ?? "—"}</div>
              </Td>
              <Td>{row.branch_code ?? row.branch_name ?? "—"}</Td>
              <Td>{row.agent_name ?? "—"}</Td>
              <Td className="text-right tabular-nums font-medium">{row.amount.toLocaleString("en-PK")}</Td>
              <Td>{row.currency}</Td>
              <Td>{row.reason}</Td>
              <Td>{row.recorder_name ?? "—"}</Td>
              <Td>
                <Link
                  href={`/crm/clients/${row.client_id}/closure`}
                  className="text-xs font-medium text-blue-600 hover:text-blue-500"
                >
                  Open →
                </Link>
              </Td>
            </tr>
          ))}
        </DataTable>
      </div>
    </SectionCard>
  );
}
