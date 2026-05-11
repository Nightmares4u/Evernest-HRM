// Compact assign-a-task form used on the dashboard for super-admins.
// Server component. Submits to the same createTask server action as the
// /admin/tasks page; the redirect_to hidden input keeps the user on the
// dashboard after submission.

import { createTask } from "@/app/(dashboard)/tasks/actions";
import { todayPKT } from "@/lib/attendance/format";
import type { AssignableUser } from "@/lib/db/tasks";

export function QuickAssignTaskForm({
  assignees,
}: {
  assignees: AssignableUser[];
}) {
  const today = todayPKT();
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Assign a task</h2>
        <span className="text-[11px] uppercase tracking-wide text-gray-400">
          manager
        </span>
      </div>

      <form action={createTask} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input type="hidden" name="redirect_to" value="/dashboard" />

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-700">Title</label>
          <input
            type="text"
            name="title"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            placeholder="e.g. Reply to Italy leads from yesterday's batch"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">Assignee</label>
          <select
            name="assigned_to"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">— choose —</option>
            {assignees.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name} ({u.role}
                {u.branch_code ? ` · ${u.branch_code}` : ""})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">Priority</label>
          <select
            name="priority"
            defaultValue="normal"
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="low">low</option>
            <option value="normal">normal</option>
            <option value="urgent">urgent</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">Due date</label>
          <input
            type="date"
            name="due_date"
            required
            defaultValue={today}
            className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">
            Due time (optional)
          </label>
          <input
            type="time"
            name="due_time"
            className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            placeholder="e.g. 14:00"
          />
        </div>

        <div className="sm:col-span-2 flex items-center justify-between">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="requires_approval"
              className="rounded border-gray-300"
            />
            Requires my approval (marketing-style)
          </label>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Assign task
          </button>
        </div>
      </form>
    </section>
  );
}
