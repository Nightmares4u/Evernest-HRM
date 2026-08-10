"use client";

import { useState } from "react";
import { Chip, StatusChip } from "@/components/StatusChip";
import { formatTimePKT, shortDatePKT } from "@/lib/attendance/format";
import type { AttendanceRowVM } from "@/lib/db/queries";
import type { AttendanceStatus } from "@/lib/types/hrm";

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

function statusLabel(status: AttendanceStatus): string {
  return status.replaceAll("_", " ");
}

export function BulkAttendanceReview({
  records,
  bulkOverrideAction,
}: {
  records: AttendanceRowVM[];
  bulkOverrideAction: (formData: FormData) => void | Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkAction, setBulkAction] = useState<"approve" | "override">("approve");
  const [status, setStatus] = useState<AttendanceStatus>("present");
  const [reason, setReason] = useState("");

  const allSelected = records.length > 0 && selectedIds.size === records.length;
  const selectedCount = selectedIds.size;
  const selectedIdsList = Array.from(selectedIds);

  function toggleRecord(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((current) => {
      if (records.length > 0 && current.size === records.length) return new Set();
      return new Set(records.map((r) => r.id));
    });
  }

  if (records.length === 0) {
    return (
      <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
        <h2 className="text-sm font-semibold text-gray-700">Pending reviews</h2>
        <p className="mt-2 text-sm text-gray-500">
          No attendance records currently require review.
        </p>
      </section>
    );
  }

  return (
    <form action={bulkOverrideAction} className="space-y-4">
      {selectedIdsList.map((id) => (
        <input key={id} type="hidden" name="record_ids" value={id} />
      ))}

      <section className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-700">
            Pending reviews ({records.length})
          </h2>
          <Chip label={`${selectedCount} selected`} tone={selectedCount > 0 ? "yellow" : "gray"} />
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <Th>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all pending reviews"
                  className="rounded border-gray-300"
                />
              </Th>
              <Th>Employee</Th>
              <Th>Date</Th>
              <Th>Branch</Th>
              <Th>Check-in</Th>
              <Th>Check-out</Th>
              <Th>Status</Th>
              <Th>Review reason</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {records.map((record) => {
              const checked = selectedIds.has(record.id);
              return (
                <tr key={record.id} className={checked ? "bg-yellow-50/40" : "hover:bg-gray-50"}>
                  <Td>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRecord(record.id)}
                      aria-label={`Select ${record.employee_full_name} ${record.date}`}
                      className="rounded border-gray-300"
                    />
                  </Td>
                  <Td className="font-medium text-gray-900">{record.employee_full_name}</Td>
                  <Td>{shortDatePKT(record.date)}</Td>
                  <Td>{record.branch_code ?? "—"}</Td>
                  <Td className="tabular-nums">{formatTimePKT(record.check_in_at)}</Td>
                  <Td className="tabular-nums">{formatTimePKT(record.check_out_at)}</Td>
                  <Td>
                    <StatusChip status={record.status} />
                  </Td>
                  <Td className="text-xs text-gray-500">
                    {record.review_reason?.replaceAll("_", " ") ?? "—"}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-blue-200 bg-white p-5 shadow ring-1 ring-black/5">
        <h2 className="text-sm font-semibold text-gray-900">Bulk action (super-admin only)</h2>
        <p className="mt-1 text-sm text-gray-600">
          Applies to the <span className="font-semibold text-gray-900">{selectedCount}</span> selected
          record(s).
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="block text-xs font-medium text-gray-700">
            Action
            <select
              name="bulk_action"
              value={bulkAction}
              onChange={(event) => setBulkAction(event.target.value as "approve" | "override")}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="approve">Approve selected as-is</option>
              <option value="override">Override selected to a status</option>
            </select>
          </label>

          {bulkAction === "override" && (
            <label className="block text-xs font-medium text-gray-700">
              Corrected status
              <select
                name="status"
                value={status}
                onChange={(event) => setStatus(event.target.value as AttendanceStatus)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
              >
                {OVERRIDE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block text-xs font-medium text-gray-700 md:col-span-3">
            Reason (applies to whole batch)
            <textarea
              name="reason"
              rows={2}
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              placeholder="Attendance reviewed by Super Admin"
            />
          </label>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={selectedCount === 0 || !reason.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Apply to {selectedCount} record{selectedCount === 1 ? "" : "s"}
          </button>
        </div>
      </section>
    </form>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 text-sm text-gray-700 ${className}`}>{children}</td>;
}
