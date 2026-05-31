import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/require-role";
import {
  deleteTaskCleanup,
  previewTaskCleanup,
  type TaskCleanupCriteria,
  type TaskCleanupMode,
  type TaskCleanupPreview,
} from "./actions";

type Search = {
  mode?: string;
  stale_before?: string;
  exact_query?: string;
  error?: string;
  ok?: string;
};

const CLEANUP_MODES: Array<{
  value: TaskCleanupMode;
  label: string;
  description: string;
}> = [
  {
    value: "completed_test",
    label: "Delete completed test tasks",
    description: "Matches done tasks whose title or description contains TEST.",
  },
  {
    value: "pending_test",
    label: "Delete pending test tasks",
    description: "Matches not-done tasks whose title or description contains TEST.",
  },
  {
    value: "all_test",
    label: "Delete all test tasks",
    description: "Matches any task whose title or description contains TEST.",
  },
  {
    value: "stale_completed",
    label: "Delete stale completed tasks older than selected date",
    description: "Matches done tasks with completed_at before the selected date.",
  },
  {
    value: "exact_test_match",
    label: "Delete exact test task by ID/title",
    description: "Matches an exact task ID or exact title, but only when it is also a test task.",
  },
];

function isTaskCleanupMode(value: string): value is TaskCleanupMode {
  return CLEANUP_MODES.some((mode) => mode.value === value);
}

function criteriaFromSearch(sp: Search): TaskCleanupCriteria | null {
  const mode = String(sp.mode ?? "").trim();
  if (!isTaskCleanupMode(mode)) return null;
  return {
    mode,
    staleBefore: String(sp.stale_before ?? "").trim() || undefined,
    exactQuery: String(sp.exact_query ?? "").trim() || undefined,
  };
}

export default async function TaskMaintenancePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  await requireSuperAdmin("/dashboard");

  const criteria = criteriaFromSearch(sp);
  const preview = criteria ? await previewTaskCleanup(criteria) : null;
  const selectedMode = criteria?.mode ?? "completed_test";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Task Maintenance</h1>
          <p className="text-sm text-gray-500">
            Super-admin cleanup for HRM task rows created during testing or old completed work.
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
            <h2 className="text-sm font-semibold text-gray-900">Preview cleanup</h2>
            <p className="mt-1 text-sm text-gray-500">
              Choose a narrow cleanup mode first. Deletion is only available after a preview.
            </p>
          </div>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
            HRM tasks only
          </span>
        </div>

        <form action="/admin/tasks/maintenance" className="mt-5 grid gap-4 lg:grid-cols-3">
          <label className="space-y-1 text-xs font-medium text-gray-600 lg:col-span-2">
            <span>Cleanup mode</span>
            <select
              name="mode"
              defaultValue={selectedMode}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
            >
              {CLEANUP_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Stale-before date</span>
            <input
              name="stale_before"
              type="date"
              defaultValue={criteria?.staleBefore ?? ""}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
            />
          </label>

          <label className="space-y-1 text-xs font-medium text-gray-600 lg:col-span-2">
            <span>Exact task ID or exact test title</span>
            <input
              name="exact_query"
              defaultValue={criteria?.exactQuery ?? ""}
              placeholder="Only used by exact test task mode"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
            />
          </label>

          <div className="flex items-end">
            <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
              Preview
            </button>
          </div>
        </form>

        <ModeNotes selectedMode={selectedMode} />
      </section>

      <PreviewSection preview={preview} />

      {criteria && preview && !preview.error && (
        <DeleteSection criteria={criteria} preview={preview} />
      )}
    </div>
  );
}

function WarningCard() {
  return (
    <section className="rounded-lg border border-red-200 bg-red-50 p-5">
      <h2 className="text-sm font-semibold text-red-900">Destructive cleanup</h2>
      <div className="mt-2 space-y-2 text-sm text-red-800">
        <p>
          This tool permanently deletes matching rows from `tasks`. Related
          `task_updates` and `task_attachments` are removed by verified FK cascades.
        </p>
        <p>
          It never deletes employees, users, attendance, payroll, leave, recurring task
          templates, or CRM records.
        </p>
      </div>
    </section>
  );
}

function ModeNotes({ selectedMode }: { selectedMode: TaskCleanupMode }) {
  const mode = CLEANUP_MODES.find((item) => item.value === selectedMode);
  return (
    <div className="mt-4 rounded-md border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
      <div className="font-medium text-gray-800">{mode?.label}</div>
      <p className="mt-1">{mode?.description}</p>
      {selectedMode === "stale_completed" && (
        <p className="mt-1">
          The current task schema has `completed_at` but no `tasks.updated_at`, so stale
          cleanup uses `completed_at` only.
        </p>
      )}
    </div>
  );
}

function PreviewSection({ preview }: { preview: TaskCleanupPreview | null }) {
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-gray-900">Preview</h2>
      {!preview ? (
        <p className="mt-4 text-sm text-gray-500">No preview yet.</p>
      ) : preview.error ? (
        <Notice tone="red">{preview.error}</Notice>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Metric label="Tasks matched" value={preview.taskCount} />
            <Metric label="Task updates cascaded" value={preview.taskUpdateCount} />
            <Metric label="Attachments cascaded" value={preview.taskAttachmentCount} />
          </div>
          {preview.taskCount === 0 ? (
            <p className="text-sm text-gray-500">No matching task rows.</p>
          ) : (
            <SampleTable samples={preview.samples} />
          )}
        </div>
      )}
    </section>
  );
}

function DeleteSection({
  criteria,
  preview,
}: {
  criteria: TaskCleanupCriteria;
  preview: TaskCleanupPreview;
}) {
  const disabled = preview.taskCount === 0;
  return (
    <section className="rounded-lg border border-red-200 bg-white p-5 shadow ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-red-900">Delete matching task data</h2>
      <p className="mt-2 text-sm text-gray-600">
        Type <span className="font-semibold text-gray-900">DELETE TASK DATA</span> exactly to
        permanently delete the previewed task rows.
      </p>

      <form action={deleteTaskCleanup} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <input type="hidden" name="mode" value={criteria.mode} />
        <input type="hidden" name="stale_before" value={criteria.staleBefore ?? ""} />
        <input type="hidden" name="exact_query" value={criteria.exactQuery ?? ""} />
        <input type="hidden" name="preview_ack" value="previewed" />
        <label className="space-y-1 text-xs font-medium text-gray-600">
          <span>Typed confirmation</span>
          <input
            name="confirmation"
            disabled={disabled}
            className="w-full rounded-md border border-red-200 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
          />
        </label>
        <div className="flex items-end">
          <button
            disabled={disabled}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Delete task data
          </button>
        </div>
      </form>
    </section>
  );
}

function SampleTable({ samples }: { samples: TaskCleanupPreview["samples"] }) {
  return (
    <div className="overflow-hidden rounded-md border border-gray-100">
      <table className="min-w-full divide-y divide-gray-100 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <Th>Title</Th>
            <Th>Status</Th>
            <Th>Assignee</Th>
            <Th>Due</Th>
            <Th>Completed</Th>
            <Th>ID</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {samples.map((task) => (
            <tr key={task.id}>
              <Td>
                <div className="font-medium text-gray-900">{task.title}</div>
                {task.description && (
                  <div className="mt-1 line-clamp-2 text-xs text-gray-500">
                    {task.description}
                  </div>
                )}
              </Td>
              <Td>{task.status}</Td>
              <Td>{task.assignee_name ?? task.assigned_to}</Td>
              <Td>{task.due_date}</Td>
              <Td>{formatDateTime(task.completed_at)}</Td>
              <Td>
                <code className="text-xs text-gray-500">{task.id}</code>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-gray-100 bg-gray-50 px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-gray-900">{value.toLocaleString("en-PK")}</dd>
    </div>
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

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi",
  });
}
