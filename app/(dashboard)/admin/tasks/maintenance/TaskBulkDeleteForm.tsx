"use client";

import { useMemo, useState } from "react";
import type { TaskMaintenanceRow } from "./actions";

export function TaskBulkDeleteForm({
  tasks,
  deleteAction,
}: {
  tasks: TaskMaintenanceRow[];
  deleteAction: (formData: FormData) => void | Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmation, setConfirmation] = useState("");

  const allVisibleSelected = tasks.length > 0 && selectedIds.size === tasks.length;
  const selectedCount = selectedIds.size;
  const selectedTaskIds = useMemo(() => Array.from(selectedIds), [selectedIds]);

  function toggleTask(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      if (tasks.length > 0 && current.size === tasks.length) return new Set();
      return new Set(tasks.map((task) => task.id));
    });
  }

  return (
    <form action={deleteAction} className="space-y-4">
      {selectedTaskIds.map((id) => (
        <input key={id} type="hidden" name="task_ids" value={id} />
      ))}

      <div className="overflow-hidden rounded-md border border-gray-100">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <Th>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  disabled={tasks.length === 0}
                  onChange={toggleAllVisible}
                  aria-label="Select all visible tasks"
                  className="rounded border-gray-300"
                />
              </Th>
              <Th>Title</Th>
              <Th>Status</Th>
              <Th>Assignee</Th>
              <Th>Due</Th>
              <Th>Created</Th>
              <Th>Updated / completed</Th>
              <Th>Type</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tasks.map((task) => {
              const checked = selectedIds.has(task.id);
              return (
                <tr key={task.id} className={checked ? "bg-red-50/30" : undefined}>
                  <Td>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTask(task.id)}
                      aria-label={`Select ${task.title}`}
                      className="rounded border-gray-300"
                    />
                  </Td>
                  <Td>
                    <div className="font-medium text-gray-900">{task.title}</div>
                    {task.description && (
                      <div className="mt-1 line-clamp-2 text-xs text-gray-500">
                        {task.description}
                      </div>
                    )}
                    <code className="mt-1 block text-[11px] text-gray-400">{task.id}</code>
                  </Td>
                  <Td>{formatStatus(task.status)}</Td>
                  <Td>{task.assignee_name ?? task.assigned_to}</Td>
                  <Td>
                    <div>{task.due_date}</div>
                    <div className="text-xs text-gray-500">{formatTime(task.due_time)}</div>
                  </Td>
                  <Td>{formatDateTime(task.created_at)}</Td>
                  <Td>{formatDateTime(task.completed_at)}</Td>
                  <Td>
                    <div>{task.recurring_task_id ? "Recurring instance" : "One-off"}</div>
                    <div className="text-xs text-gray-500">
                      {task.requires_approval ? "Approval required" : "No approval"}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="rounded-lg border border-red-200 bg-white p-5 shadow ring-1 ring-black/5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-red-900">Bulk delete selected tasks</h2>
            <p className="mt-1 text-sm text-gray-600">
              Selected: <span className="font-semibold text-gray-900">{selectedCount}</span>. Type{" "}
              <span className="font-semibold text-gray-900">DELETE TASK DATA</span> exactly to
              permanently delete selected task rows.
            </p>
          </div>
          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
            Max 100
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Typed confirmation</span>
            <input
              name="confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={selectedCount === 0}
              className="w-full rounded-md border border-red-200 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
            />
          </label>
          <div className="flex items-end">
            <button
              disabled={selectedCount === 0 || confirmation !== "DELETE TASK DATA"}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              Delete selected
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top text-gray-700">{children}</td>;
}

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTime(value: string | null): string {
  if (!value) return "No time";
  return value.slice(0, 5);
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi",
  });
}
