import { Chip } from "@/components/StatusChip";
import {
  isSupabaseConfigured,
  listBranches,
  listDepartments,
  listEmployees,
  listShifts,
} from "@/lib/db/queries";

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
  const live = isSupabaseConfigured();
  const [employees, branches, departments, shifts] = await Promise.all([
    listEmployees(),
    listBranches(),
    listDepartments(),
    listShifts(),
  ]);

  const totalEmployees = employees.length;
  const totalPayroll = employees.reduce((s, e) => s + e.monthly_salary, 0);
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Admin</h1>
          <p className="text-sm text-gray-500">
            Configuration overview and placeholders for upcoming controls.
          </p>
        </div>
      </header>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
        Read-only foundations. Destructive actions (edit, delete, override,
        approve) land in Phase 7+ alongside audit logging.
        {!live && " Showing mock data (no Supabase env)."}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Employees" value={totalEmployees} />
        <Stat label="Monthly payroll" value={PKR.format(totalPayroll)} />
        <Stat
          label="Attendance-exempt"
          value={exemptCount}
          hint="Yashal + Marketing"
        />
        <Stat label="Remote-allowed" value={remoteAllowed} />
      </div>

      <Section title="Branches">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {employeesByBranch.map(({ branch, count }) => {
            const defaultShift = shifts.find(
              (s) => s.id === branch.default_shift_id
            );
            return (
              <div
                key={branch.id}
                className="rounded-lg bg-white p-4 shadow ring-1 ring-black/5"
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="font-semibold text-gray-900">{branch.name}</h3>
                  <Chip label={branch.code} tone="gray" />
                </div>
                <dl className="mt-3 space-y-1 text-sm">
                  <Row label="Employees" value={String(count)} />
                  <Row
                    label="Default shift"
                    value={
                      defaultShift
                        ? `${defaultShift.name} (${defaultShift.start_time.slice(0, 5)}–${defaultShift.end_time.slice(0, 5)})`
                        : "—"
                    }
                  />
                  <Row
                    label="IP whitelist"
                    value={
                      branch.ip_whitelist.length
                        ? branch.ip_whitelist.join(", ")
                        : "(none — soft mode)"
                    }
                  />
                </dl>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Departments">
        <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <Th>Department</Th>
                <Th className="text-right">Employees</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employeesByDept.map(({ dept, count }) => (
                <tr key={dept.id} className="hover:bg-gray-50">
                  <Td>{dept.name}</Td>
                  <Td className="text-right tabular-nums">{count}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Shifts">
        <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <Th>Shift</Th>
                <Th>Start</Th>
                <Th>End</Th>
                <Th className="text-right">Late grace (min)</Th>
                <Th className="text-right">Half-day &lt; (min)</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shifts.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <Td className="font-medium text-gray-900">{s.name}</Td>
                  <Td className="tabular-nums">{s.start_time.slice(0, 5)}</Td>
                  <Td className="tabular-nums">{s.end_time.slice(0, 5)}</Td>
                  <Td className="text-right tabular-nums">{s.late_grace_minutes}</Td>
                  <Td className="text-right tabular-nums">{s.half_day_threshold_minutes}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Remote roster">
        <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <Th>Employee</Th>
                <Th>Branch</Th>
                <Th>Default remote days</Th>
                <Th>Attendance</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employees
                .filter((e) => e.remote_allowed)
                .map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <Td>
                      <div className="font-medium text-gray-900">{e.full_name}</div>
                      <div className="text-xs text-gray-500">{e.email}</div>
                    </Td>
                    <Td>{e.branch_code ?? "—"}</Td>
                    <Td className="text-xs">
                      {formatDays(e.remote_default_days)}
                    </Td>
                    <Td>
                      {e.attendance_exempt ? (
                        <Chip label="exempt — task-based" tone="gray" />
                      ) : (
                        <Chip label="enforced" tone="green" />
                      )}
                    </Td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Configuration panels (Phase 7+)">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <PendingCard
            title="Holidays & day-offs"
            description="Add public holidays and per-employee day-offs. Affects attendance auto-marking."
          />
          <PendingCard
            title="Recurring tasks"
            description="Define weekly recurring tasks (e.g., Aayan/Sufyan Mon–Tue lead-sheet cleanup). Daily cron generates per-day task instances."
          />
          <PendingCard
            title="Payroll runs"
            description="Generate monthly payslips, edit per-employee adjustments, record disbursement. Uses dual /30 + /26 denominator."
          />
          <PendingCard
            title="Audit log"
            description="Searchable log of every manual override (attendance, leave, salary, status). Append-only."
          />
          <PendingCard
            title="Branch IP whitelists"
            description="Soft IP whitelist per branch. Mismatched check-in is flagged as 'requires review', not blocked."
          />
          <PendingCard
            title="System settings"
            description="Late grace minutes, half-day threshold, payroll denominators, redline threshold. Stored in settings table."
          />
        </div>
      </Section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
      <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-right text-sm text-gray-700">{value}</dd>
    </div>
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
    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <Chip label="planned" tone="gray" />
      </div>
      <p className="mt-2 text-xs text-gray-500">{description}</p>
      <button
        type="button"
        disabled
        className="mt-3 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-400"
      >
        Open (disabled)
      </button>
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
    <th
      scope="col"
      className={`px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${className}`}
    >
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
  return <td className={`px-4 py-3 text-sm text-gray-700 ${className}`}>{children}</td>;
}
