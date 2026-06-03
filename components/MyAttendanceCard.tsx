import { CheckInButton, CheckOutButton } from "@/components/CheckInButton";
import { StatusChip, Chip } from "@/components/StatusChip";
import {
  formatTimePKT,
  formatWorkedMinutes,
} from "@/lib/attendance/format";
import { getMyTodayAttendance } from "@/lib/db/queries";
import { isoWeekdayPKT } from "@/lib/attendance/policy";
import type { CurrentUser } from "@/lib/auth/current-user";

export async function MyAttendanceCard({ me }: { me: CurrentUser | null }) {
  if (!me || !me.employee) return null;
  if (me.employee.attendance_exempt) {
    return (
      <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
        <h2 className="text-sm font-semibold text-gray-700">Today</h2>
        <p className="mt-2 text-sm text-gray-600">
          Your account is attendance-exempt. No check-in is required — your work
          is verified via task completion.
        </p>
      </section>
    );
  }

  const isoDay = isoWeekdayPKT();
  if (isoDay === 7) {
    return (
      <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
        <h2 className="text-sm font-semibold text-gray-700">Today</h2>
        <Chip label="Sunday — weekly off" tone="gray" />
      </section>
    );
  }

  const record = await getMyTodayAttendance();

  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Today</h2>
        {record && <StatusChip status={record.status} />}
      </div>

      <div className="mt-4">
        {!record && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              You haven&apos;t checked in yet today.
            </p>
            <CheckInButton />
          </div>
        )}

        {record && !record.check_out_at && (
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-gray-500">Checked in</dt>
              <dd className="text-right font-medium tabular-nums text-gray-900">
                {formatTimePKT(record.check_in_at)}
                {record.is_late && (
                  <span className="ml-1 text-xs text-amber-700">
                    (+{record.late_minutes}m late)
                  </span>
                )}
              </dd>
              <dt className="text-gray-500">Expected end</dt>
              <dd className="text-right font-medium tabular-nums text-gray-900">
                {formatTimePKT(record.expected_end)}
              </dd>
              <dt className="text-gray-500">Mode</dt>
              <dd className="text-right">
                <Chip
                  label={record.mode}
                  tone={record.mode === "remote" ? "blue" : "gray"}
                />
              </dd>
            </dl>
            <CheckOutButton />
          </div>
        )}

        {record && record.check_out_at && (
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-gray-500">Checked in</dt>
            <dd className="text-right font-medium tabular-nums text-gray-900">
              {formatTimePKT(record.check_in_at)}
            </dd>
            <dt className="text-gray-500">Checked out</dt>
            <dd className="text-right font-medium tabular-nums text-gray-900">
              {formatTimePKT(record.check_out_at)}
            </dd>
            <dt className="text-gray-500">Worked</dt>
            <dd className="text-right font-medium tabular-nums text-gray-900">
              {formatWorkedMinutes(record.worked_minutes)}
            </dd>
            <dt className="text-gray-500">Mode</dt>
            <dd className="text-right">
              <Chip
                label={record.mode}
                tone={record.mode === "remote" ? "blue" : "gray"}
              />
            </dd>
          </dl>
        )}
      </div>
    </section>
  );
}
