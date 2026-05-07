import Link from "next/link";
import { Chip } from "@/components/StatusChip";
import { weekdayPKT } from "@/lib/attendance/format";
import { MOCK_EMPLOYEES, makeMockTodayAttendance } from "@/lib/mock/hrm";
import type { AttendanceStatus } from "@/lib/types/hrm";

const PRESENT_STATES: AttendanceStatus[] = [
  "present",
  "remote_present",
  "approved_manually",
];
const LATE_STATES: AttendanceStatus[] = ["late", "remote_late"];
const PENDING_STATES: AttendanceStatus[] = [
  "pending_review",
  "remote_pending_review",
];

const PKR = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0,
});

export default function DashboardPage() {
  const today = new Date();
  const records = makeMockTodayAttendance(today);

  const presentToday = records.filter((r) => PRESENT_STATES.includes(r.status)).length;
  const lateToday = records.filter((r) => LATE_STATES.includes(r.status)).length;
  const absentToday = records.filter((r) => r.status === "absent").length;
  const pendingToday = records.filter((r) => PENDING_STATES.includes(r.status)).length;

  const totalEmployees = MOCK_EMPLOYEES.length;
  const totalPayroll = MOCK_EMPLOYEES.reduce((sum, e) => sum + e.monthly_salary, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">
          {weekdayPKT(today)} — quick view of today
        </p>
      </header>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
        Numbers below are derived from mock data. Live counts arrive once
        Supabase is configured and check-in is wired.
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Present today" value={presentToday} tone="text-green-700" />
        <StatCard label="Late today" value={lateToday} tone="text-amber-700" />
        <StatCard label="Absent today" value={absentToday} tone="text-red-700" />
        <StatCard label="Pending review" value={pendingToday} tone="text-yellow-700" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Headcount & payroll">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-gray-500">Total employees</dt>
            <dd className="text-right font-medium text-gray-900">{totalEmployees}</dd>
            <dt className="text-gray-500">Monthly payroll</dt>
            <dd className="text-right font-medium tabular-nums text-gray-900">
              {PKR.format(totalPayroll)}
            </dd>
            <dt className="text-gray-500">Branches</dt>
            <dd className="text-right font-medium text-gray-900">3 (KHI, LHE, RMT)</dd>
            <dt className="text-gray-500">Departments</dt>
            <dd className="text-right font-medium text-gray-900">6</dd>
          </dl>
          <Link
            href="/employees"
            className="mt-4 inline-block text-sm text-indigo-600 hover:text-indigo-500"
          >
            View directory →
          </Link>
        </Panel>

        <Panel title="Attendance snapshot">
          <div className="flex flex-wrap gap-2">
            <Chip label={`${presentToday} present`} tone="green" />
            <Chip label={`${lateToday} late`} tone="amber" />
            <Chip label={`${absentToday} absent`} tone="red" />
            <Chip label={`${pendingToday} pending`} tone="yellow" />
          </div>
          <Link
            href="/attendance"
            className="mt-4 inline-block text-sm text-indigo-600 hover:text-indigo-500"
          >
            Open Today panel →
          </Link>
        </Panel>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
      <div className="p-5">
        <p className="truncate text-sm font-medium text-gray-500">{label}</p>
        <p className={`mt-1 text-3xl font-semibold tabular-nums ${tone}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
