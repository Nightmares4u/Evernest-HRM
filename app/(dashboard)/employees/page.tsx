import { listEmployees, isSupabaseConfigured } from "@/lib/db/queries";
import type { EmployeeWithJoins } from "@/lib/types/hrm";

const PKR = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0,
});

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatRemoteDays(days: number[]): string {
  if (!days || days.length === 0) return "—";
  return days
    .filter((d) => d >= 1 && d <= 7)
    .map((d) => WEEKDAY_LABELS[d - 1])
    .join(", ");
}

function exemptionBadges(e: EmployeeWithJoins): string[] {
  const out: string[] = [];
  if (e.attendance_exempt) out.push("attendance-exempt");
  if (e.payroll_exempt) out.push("payroll-exempt");
  if (e.remote_allowed) out.push("remote-allowed");
  return out;
}

export default async function EmployeesPage() {
  const employees = await listEmployees();
  const live = isSupabaseConfigured();

  const total = employees.length;
  const totalSalary = employees.reduce((sum, e) => sum + e.monthly_salary, 0);
  const byBranch = employees.reduce<Record<string, number>>((acc, e) => {
    const k = e.branch_code ?? "—";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500">
            {total} active &middot; total monthly payroll {PKR.format(totalSalary)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(byBranch).map(([code, count]) => (
            <span
              key={code}
              className="rounded-full border border-gray-200 bg-white px-3 py-1 text-gray-600"
            >
              {code}: {count}
            </span>
          ))}
        </div>
      </header>

      {!live && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Mock directory (no Supabase env). Real data activates once{" "}
          <code className="font-mono">.env.local</code> is set.
        </div>
      )}

      <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <Th>Employee</Th>
              <Th>Branch</Th>
              <Th>Department</Th>
              <Th>Role</Th>
              <Th>Shift</Th>
              <Th className="text-right">Salary (PKR)</Th>
              <Th>Remote days</Th>
              <Th>Flags</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {employees.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <Td>
                  <div className="font-medium text-gray-900">{e.full_name}</div>
                  <div className="text-xs text-gray-500">{e.email}</div>
                </Td>
                <Td>{e.branch_code ?? "—"}</Td>
                <Td>{e.department_name ?? "—"}</Td>
                <Td>
                  <div>{e.role_description ?? "—"}</div>
                  <div className="text-xs text-gray-500">{e.user_role}</div>
                </Td>
                <Td>{e.shift_name ?? "—"}</Td>
                <Td className="text-right tabular-nums">
                  {PKR.format(e.monthly_salary)}
                </Td>
                <Td className="text-xs">{formatRemoteDays(e.remote_default_days)}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {exemptionBadges(e).map((b) => (
                      <span
                        key={b}
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-600"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                </Td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-500">
                  No employees visible to your account.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 text-sm text-gray-700 ${className}`}>{children}</td>;
}
