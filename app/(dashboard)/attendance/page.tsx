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
import { getCurrentUser } from "@/lib/auth/current-user";
import type { AttendanceStatus } from "@/lib/types/hrm";
import { overrideAttendanceRecord } from "./actions";

const PRESENT_STATES: AttendanceStatus[] = [
  "present",
  "remote_present",
  "approved_manually",
];
const LATE_STATES: AttendanceStatus[] = ["late", "remote_late"];
const HALF_DAY_STATES: AttendanceStatus[] = ["half_day", "remote_half_day"];
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

type AttendanceGeo = {
  status?: string;
  review_signal?: string;
  verification_status?: string;
  distance_meters?: number;
  check_out_status?: string;
  check_out_verification_status?: string;
  check_out_distance_meters?: number;
} | null;

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const sp = await searchParams;
  const today = new Date();
  const live = isSupabaseConfigured();
  const [records, employees, me] = await Promise.all([
    listTodayAttendance(),
    listEmployees(),
    getCurrentUser(),
  ]);
  const isSuperAdmin = me?.appUser.role === "super_admin";

  const presentCount = records.filter((r) => PRESENT_STATES.includes(r.status)).length;
  const lateCount = records.filter((r) => LATE_STATES.includes(r.status)).length;
  const halfDayCount = records.filter((r) => HALF_DAY_STATES.includes(r.status)).length;
  const absentCount = records.filter((r) => r.status === "absent").length;
  const pendingCount = records.filter((r) => r.requires_review).length;

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
                      <Chip label="pending review" tone="yellow" />
                    )}
                    <VerificationChips record={r} />
                  </div>
                </Td>
                <Td className="text-right">
                  {isSuperAdmin ? (
                    <OverrideForm record={r} />
                  ) : (
                    <button
                      type="button"
                      disabled
                      title="Only super-admins can override attendance"
                      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-400"
                    >
                      Override
                    </button>
                  )}
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

function timeInputPKT(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function statusLabel(status: AttendanceStatus): string {
  return status.replaceAll("_", " ");
}

function OverrideForm({
  record,
}: {
  record: Awaited<ReturnType<typeof listTodayAttendance>>[number];
}) {
  return (
    <details className="group relative inline-block text-left">
      <summary className="cursor-pointer list-none rounded-md border border-indigo-200 bg-white px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50">
        Override
      </summary>
      <div className="mt-2 w-80 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-lg ring-1 ring-black/5">
        <form action={overrideAttendanceRecord} className="space-y-3">
          <input type="hidden" name="id" value={record.id} />
          <div>
            <label className="block text-xs font-medium text-gray-700">
              Corrected status
            </label>
            <select
              name="status"
              defaultValue={
                OVERRIDE_STATUSES.includes(record.status)
                  ? record.status
                  : "present"
              }
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
            >
              {OVERRIDE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Check-in
              </label>
              <input
                type="time"
                name="check_in_time"
                defaultValue={timeInputPKT(record.check_in_at)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Check-out
              </label>
              <input
                type="time"
                name="check_out_time"
                defaultValue={timeInputPKT(record.check_out_at)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              name="requires_review"
              defaultChecked={record.requires_review}
              className="rounded border-gray-300"
            />
            Requires review
          </label>
          <div>
            <label className="block text-xs font-medium text-gray-700">
              Reason
            </label>
            <textarea
              name="reason"
              rows={3}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              placeholder="Why is this correction being made?"
            />
          </div>
          <div className="flex justify-end gap-2">
            <a
              href="/attendance"
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600"
            >
              Cancel
            </a>
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              Save override
            </button>
          </div>
        </form>
      </div>
    </details>
  );
}

function VerificationChips({
  record,
}: {
  record: Awaited<ReturnType<typeof listTodayAttendance>>[number];
}) {
  const status = record.verification_status ?? record.geolocation?.verification_status;
  const browserStatus = record.geolocation?.status;
  const distance =
    record.check_in_distance_meters ?? record.geolocation?.distance_meters ?? null;
  return (
    <>
      <VerificationStatusChip status={status} browserStatus={browserStatus} />
      {distance != null && <Chip label={`${distance}m from office`} tone="gray" />}
      {record.review_reason && (
        <Chip label={reviewReasonLabel(record.review_reason)} tone="orange" />
      )}
      {record.check_out_distance_meters != null && (
        <Chip label={`checkout ${record.check_out_distance_meters}m`} tone="gray" />
      )}
    </>
  );
}

function VerificationStatusChip({
  status,
  browserStatus,
}: {
  status?: string | null;
  browserStatus?: string;
}) {
  if (status === "location_verified") {
    return <Chip label="location verified" tone="green" />;
  }
  if (status === "outside_geofence") {
    return <Chip label="outside geofence" tone="red" />;
  }
  if (status === "remote_location_captured") {
    return <Chip label="remote location captured" tone="indigo" />;
  }
  if (status === "remote_location_missing") {
    return <Chip label="remote location missing" tone="yellow" />;
  }
  if (status === "office_geofence_not_configured") {
    return <Chip label="geofence not configured" tone="gray" />;
  }
  if (status?.startsWith("location_")) {
    return <Chip label={reviewReasonLabel(status)} tone="yellow" />;
  }

  const fallback = browserStatus;
  if (fallback === "granted") return <Chip label="location captured" tone="green" />;
  if (fallback === "denied") return <Chip label="location denied" tone="yellow" />;
  if (fallback === "unavailable")
    return <Chip label="location unavailable" tone="amber" />;
  if (fallback === "timeout") return <Chip label="location timeout" tone="amber" />;
  if (fallback === "not_supported")
    return <Chip label="location unsupported" tone="gray" />;
  if (fallback === "not_provided")
    return <Chip label="no location proof" tone="gray" />;
  if (fallback) return <Chip label={`location ${fallback}`} tone="gray" />;
  return <Chip label="location unknown" tone="gray" />;
}

function reviewReasonLabel(reason: string): string {
  return reason.replaceAll("_", " ");
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
