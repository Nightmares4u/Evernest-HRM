import { Chip } from "@/components/StatusChip";
import {
  listAssignableUsers,
  listRecurringTasks,
  type RecurringTaskRowVM,
} from "@/lib/db/tasks";
import { isSupabaseConfigured } from "@/lib/db/queries";
import { isoWeekdayPKT } from "@/lib/attendance/policy";
import {
  createRecurringTask,
  deleteRecurringTask,
  generateTasksForToday,
  toggleRecurringActive,
} from "./actions";

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
] as const;

function formatDays(days: number[] | null | undefined): string {
  if (!days?.length) return "—";
  const map: Record<number, string> = {
    1: "Mon",
    2: "Tue",
    3: "Wed",
    4: "Thu",
    5: "Fri",
    6: "Sat",
    7: "Sun",
  };
  return days.map((d) => map[d] ?? `?${d}`).join(", ");
}

export default async function RecurringTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const live = isSupabaseConfigured();
  const [templates, assignees] = await Promise.all([
    listRecurringTasks(),
    listAssignableUsers(),
  ]);
  const todayDow = isoWeekdayPKT();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Recurring tasks</h1>
          <p className="text-sm text-gray-500">
            Templates that auto-generate task instances on their scheduled days.
            Used for Sufyan & Aayan&apos;s Mon/Tue checklists, weekly marketing
            content beats, etc.
          </p>
        </div>
        <form action={generateTasksForToday}>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Generate today&apos;s tasks
          </button>
        </form>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {ok && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          {ok}
        </div>
      )}
      {!live && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Mock mode (no Supabase env). Form submissions won&apos;t persist.
        </div>
      )}

      <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
        <h2 className="text-sm font-semibold text-gray-700">New recurring task</h2>
        <form action={createRecurringTask} className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-700">Title</label>
            <input
              type="text"
              name="title"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              placeholder="e.g. Clean up lead sheets"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-700">
              Description (optional)
            </label>
            <textarea
              name="description"
              rows={2}
              className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              placeholder="Steps, notes, expected output…"
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
            <label className="block text-xs font-medium text-gray-700">Recurrence</label>
            <select
              name="recurrence_type"
              defaultValue="weekly"
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="weekly">weekly (pick days)</option>
              <option value="daily">daily (Mon-Sat)</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-700">
              Recurrence days (used for weekly)
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => (
                <label
                  key={d.value}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
                >
                  <input
                    type="checkbox"
                    name="days"
                    value={d.value}
                    className="rounded border-gray-300"
                  />
                  {d.label}
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              Sunday is permanently locked off — never selectable.
            </p>
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
            <label className="block text-xs font-medium text-gray-700">
              Due time on each occurrence (optional)
            </label>
            <input
              type="time"
              name="due_time"
              className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Generated tasks land in this hour on the schedule grid; blank = EOD.
            </p>
          </div>

          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name="requires_approval"
                className="rounded border-gray-300"
              />
              Requires my approval (for marketing-style templates)
            </label>
          </div>

          <div className="lg:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              Create template
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">
          Active &amp; paused templates ({templates.length})
        </h2>
        {templates.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
            No recurring templates yet. Create one above.
          </p>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <RecurringRow key={t.id} t={t} todayDow={todayDow} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function priorityTone(p: string) {
  if (p === "urgent") return "red" as const;
  if (p === "low") return "gray" as const;
  return "indigo" as const;
}

function RecurringRow({
  t,
  todayDow,
}: {
  t: RecurringTaskRowVM;
  todayDow: number;
}) {
  const firesToday =
    t.recurrence_type === "daily" ||
    (Array.isArray(t.recurrence_days) && t.recurrence_days.includes(todayDow));
  return (
    <div
      className={`rounded-lg p-4 shadow ring-1 ring-black/5 ${
        t.active ? "bg-white" : "bg-gray-50/60"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">{t.title}</span>
            <Chip label={t.priority} tone={priorityTone(t.priority)} />
            {t.requires_approval && (
              <Chip label="approval required" tone="yellow" />
            )}
            {t.active ? (
              <Chip label="active" tone="green" />
            ) : (
              <Chip label="paused" tone="gray" />
            )}
            {t.active && firesToday && <Chip label="fires today" tone="indigo" />}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Assignee: {t.assignee_name} &middot; recurrence: {t.recurrence_type}
            {t.recurrence_type !== "daily" && (
              <> ({formatDays(t.recurrence_days)})</>
            )}
            {t.due_time && (
              <> &middot; at <span className="tabular-nums">{t.due_time.slice(0, 5)}</span></>
            )}
          </div>
          {t.description && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
              {t.description}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:min-w-[12rem]">
          <form action={toggleRecurringActive}>
            <input type="hidden" name="id" value={t.id} />
            <button
              type="submit"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {t.active ? "Pause" : "Resume"}
            </button>
          </form>
          <form action={deleteRecurringTask}>
            <input type="hidden" name="id" value={t.id} />
            <button
              type="submit"
              className="w-full rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
            >
              Delete template
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
