import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/require-role";
import {
  deleteSelectedTaskCleanup,
  listTaskMaintenanceRows,
  type TaskMaintenanceFilters,
  type TaskMaintenanceStatusFilter,
} from "./actions";
import { TaskBulkDeleteForm } from "./TaskBulkDeleteForm";

type Search = {
  q?: string;
  status?: string;
  test_only?: string;
  created_before?: string;
  error?: string;
  ok?: string;
};

const STATUS_FILTERS: Array<{ value: TaskMaintenanceStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "open", label: "Pending/open" },
  { value: "done", label: "Completed/done" },
  { value: "overdue", label: "Overdue" },
];

function normalizeStatus(value: string | undefined): TaskMaintenanceStatusFilter {
  if (value === "open" || value === "done" || value === "overdue") return value;
  return "all";
}

function normalizeFilters(sp: Search): TaskMaintenanceFilters {
  return {
    q: String(sp.q ?? "").trim() || undefined,
    status: normalizeStatus(sp.status),
    testOnly: sp.test_only === "on",
    createdBefore: /^\d{4}-\d{2}-\d{2}$/.test(String(sp.created_before ?? ""))
      ? String(sp.created_before)
      : undefined,
  };
}

export default async function TaskMaintenancePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  await requireSuperAdmin("/dashboard");

  const filters = normalizeFilters(sp);
  const taskList = await listTaskMaintenanceRows(filters);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Task Maintenance</h1>
          <p className="text-sm text-gray-500">
            Select HRM task rows for permanent cleanup.
          </p>
        </div>
        <Link
          href="/admin/tasks"
          className="rounded-md bg-white px-3 py-1.5 text-sm text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
        >
          Back to tasks admin
        </Link>
      </header>

      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {sp.ok && <Notice tone="green">{sp.ok}</Notice>}

      <WarningCard />

      <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Find tasks</h2>
            <p className="mt-1 text-sm text-gray-500">
              Default view shows the latest {taskList.limit} matching tasks.
            </p>
          </div>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
            {taskList.total.toLocaleString("en-PK")} matched
          </span>
        </div>

        <form action="/admin/tasks/maintenance" className="mt-5 grid gap-4 lg:grid-cols-4">
          <label className="space-y-1 text-xs font-medium text-gray-600 lg:col-span-2">
            <span>Search title / description</span>
            <input
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="Search task text"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
            />
          </label>

          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Status</span>
            <select
              name="status"
              defaultValue={filters.status ?? "all"}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
            >
              {STATUS_FILTERS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Created before</span>
            <input
              name="created_before"
              type="date"
              defaultValue={filters.createdBefore ?? ""}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700 lg:col-span-3">
            <input
              type="checkbox"
              name="test_only"
              defaultChecked={filters.testOnly}
              className="rounded border-gray-300"
            />
            Test-only: title/description contains TEST or title starts with [TEST]
          </label>

          <div className="flex items-end gap-2">
            <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
              Apply filters
            </button>
            <Link
              href="/admin/tasks/maintenance"
              className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
            >
              Reset
            </Link>
          </div>
        </form>
      </section>

      <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Tasks</h2>
            <p className="mt-1 text-sm text-gray-500">
              Showing {taskList.rows.length.toLocaleString("en-PK")} visible row(s).
              {taskList.total > taskList.limit
                ? ` Narrow filters to act beyond the latest ${taskList.limit}.`
                : ""}
            </p>
          </div>
        </div>

        {taskList.rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
            No tasks match these filters.
          </p>
        ) : (
          <TaskBulkDeleteForm
            tasks={taskList.rows}
            deleteAction={deleteSelectedTaskCleanup}
          />
        )}
      </section>
    </div>
  );
}

function WarningCard() {
  return (
    <section className="rounded-lg border border-red-200 bg-red-50 p-5">
      <h2 className="text-sm font-semibold text-red-900">Destructive deletion</h2>
      <div className="mt-2 space-y-2 text-sm text-red-800">
        <p>
          Deletion is permanent. Selected rows are removed from `tasks`, not hidden or archived.
        </p>
        <p>
          Related `task_updates` and `task_attachments` are removed by verified FK cascades.
          Recurring task templates, employees, users, attendance, payroll, leave, and CRM data
          are not touched.
        </p>
      </div>
    </section>
  );
}

function Notice({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "green" | "red";
}) {
  const classes =
    tone === "green"
      ? "border-green-200 bg-green-50 text-green-700"
      : "border-red-200 bg-red-50 text-red-700";
  return <div className={`rounded-md border px-4 py-2 text-sm ${classes}`}>{children}</div>;
}
