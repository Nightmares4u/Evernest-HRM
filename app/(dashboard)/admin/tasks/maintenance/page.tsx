import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/require-role";
import {
  deleteSelectedTaskCleanup,
  listTaskMaintenanceRows,
  type TaskMaintenanceFilters,
  type TaskMaintenanceStatusFilter,
} from "./actions";
import { TaskBulkDeleteForm } from "./TaskBulkDeleteForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { DangerZone } from "@/components/ui/DangerZone";
import { SectionCard } from "@/components/ui/SectionCard";

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
      <PageHeader
        title="Task Maintenance"
        description="Select HRM task rows for permanent cleanup."
        action={
          <Link
            href="/admin/tasks"
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
          >
            Back to tasks admin
          </Link>
        }
      />

      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {sp.ok && <Notice tone="green">{sp.ok}</Notice>}

      <DangerZone
        title="Destructive deletion"
        warningText="Deletion is permanent. Selected rows are removed from `tasks`, not hidden or archived."
      >
        <p className="text-sm text-red-800">
          Related `task_updates` and `task_attachments` are removed by verified FK cascades.
          Recurring task templates, employees, users, attendance, payroll, leave, and CRM data
          are not touched.
        </p>
      </DangerZone>

      <SectionCard
        title="Find tasks"
        description={`Default view shows the latest ${taskList.limit} matching tasks.`}
        action={
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
            {taskList.total.toLocaleString("en-PK")} matched
          </span>
        }
      >
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
            <button className="rounded-md bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 transition-colors">
              Apply filters
            </button>
            <Link
              href="/admin/tasks/maintenance"
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 transition-colors"
            >
              Reset
            </Link>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Tasks"
        description={`Showing ${taskList.rows.length.toLocaleString("en-PK")} visible row(s). ${
          taskList.total > taskList.limit
            ? `Narrow filters to act beyond the latest ${taskList.limit}.`
            : ""
        }`}
      >
        {taskList.rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
            No tasks match these filters.
          </p>
        ) : (
          <div className="mt-4">
            <TaskBulkDeleteForm
              tasks={taskList.rows}
              deleteAction={deleteSelectedTaskCleanup}
            />
          </div>
        )}
      </SectionCard>
    </div>
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
