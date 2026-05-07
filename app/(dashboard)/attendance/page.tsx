import { Chip, StatusChip } from "@/components/StatusChip";
import {
  formatTimePKT,
  formatWorkedMinutes,
  isSundayPKT,
  weekdayPKT,
} from "@/lib/attendance/format";
import {
  isSupabaseConfigured,
  listEmployees,
  listTodayAttendance,
} from "@/lib/db/queries";
import type { AttendanceStatus } from "@/lib/types/hrm";

const PRESENT_STATES: AttendanceStatus[] = [
  "present",
  "remote_present",
  "approved_manually",
];
const LATE_STATES: AttendanceStatus[] = ["late", "remote_late"];
const HALF_DAY_STATES: AttendanceStatus[] = ["half_day", "remote_half_day"];
const PENDING_STATES: AttendanceStatus[] = [
  "pending_review",
  "remote_pending_review",
];

export default async function AttendancePage() {
  const today = new Date();
  const live = isSupabaseConfigured();
  const [records, employees] = await Promise.all([
    listTodayAttendance(),
    listEmployees(),
  ]);

  const presentCount = records.filter((r) => PRESENT_STATES.includes(r.status)).length;
  const lateCount = records.filter((r) => LATE_STATES.includes(r.status)).length;
  const halfDayCount = records.filter((r) => HALF_DAY_STATES.includes(r.status)).length;
  const absentCount = records.filter((r) => r.status === "absent").length;
  const pendingCount = records.filter((r) => PENDING_STATES.includes(r.status)).length;

  const trackedTotal = employees.filter((e) => !e.attendance_exempt).length;
  const exemptTotal = employees.filter((e) => e.attendance_exempt).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Today</h1>
          <p className="text-sm text-gray-500">
            {weekdayPKT(today)} — {trackedTotal} attendance-tracked staff &middot;{" "}
            {exemptTotal} exempt
          </p>
        </div>
        {isSundayPKT(today) && (
          <Chip label="Sunday — weekly off (locked)" tone="gray" />
        )}
      </header>

      {!live && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Mock attendance (no Supabase env).
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard label="Present" value={presentCount} tone="green" />
        <SummaryCard label="Late" value={lateCount} tone="amber" />
        <SummaryCard label="Half-day" value={halfDayCount} tone="orange" />
        <SummaryCard label="Absent" value={absentCount} tone="red" />
        <SummaryCard label="Pending review" value={pendingCount} tone="yellow" />
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <Th>Employee</Th>
              <Th>Branch</Th>
              <Th>Mode</Th>
              <Th>Expected</Th>
              <Th>Check-in</Th>
              <Th>Check-out</Th>
              <Th>Worked</Th>
              <Th>Status</Th>
              <Th className="text-right">Action</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <Td>
                  <div className="font-medium text-gray-900">
                    {r.employee_full_name}
                  </div>
                </Td>
                <Td>{r.branch_code ?? "—"}</Td>
                <Td>
                  <Chip
                    label={r.mode}
                    tone={r.mode === "remote" ? "indigo" : "gray"}
                  />
                </Td>
                <Td className="tabular-nums text-xs text-gray-500">
                  {formatTimePKT(r.expected_start)} – {formatTimePKT(r.expected_end)}
                </Td>
                <Td className="tabular-nums">
                  {formatTimePKT(r.check_in_at)}
                  {r.is_late && r.late_minutes > 0 && (
                    <span className="ml-1 text-xs text-amber-700">
                      (+{r.late_minutes}m)
                    </span>
                  )}
                </Td>
                <Td className="tabular-nums">{formatTimePKT(r.check_out_at)}</Td>
                <Td className="tabular-nums">
                  {formatWorkedMinutes(r.worked_minutes)}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <StatusChip status={r.status} />
                    {r.requires_review && (
                      <Chip label="needs review" tone="yellow" />
                    )}
                  </div>
                </Td>
                <Td className="text-right">
                  <button
                    type="button"
                    disabled
                    title="Override actions land in Phase 8"
                    className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-400"
                  >
                    Override
                  </button>
                </Td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-sm text-gray-500">
                  No attendance records yet for today. Records appear once
                  someone checks in.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {exemptTotal > 0 && (
        <p className="text-xs text-gray-500">
          {exemptTotal} attendance-exempt staff (Yashal, Marketing team) don't
          appear in the Today panel — they're verified by task completion.
        </p>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "amber" | "orange" | "red" | "yellow";
}) {
  const valueClass = {
    green: "text-green-700",
    amber: "text-amber-700",
    orange: "text-orange-700",
    red: "text-red-700",
    yellow: "text-yellow-700",
  }[tone];

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
      <div className="p-4">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">
          {label}
        </p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>
          {value}
        </p>
      </div>
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
