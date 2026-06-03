"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { todayPKT } from "@/lib/attendance/format";
import { requireSuperAdmin } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/server";
import type { TaskStatus } from "@/lib/types/hrm";

export type TaskMaintenanceStatusFilter = "all" | "open" | "done" | "overdue";

export type TaskMaintenanceFilters = {
  q?: string;
  status?: TaskMaintenanceStatusFilter;
  testOnly?: boolean;
  createdBefore?: string;
};

export type TaskMaintenanceRow = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assigned_to: string;
  assigned_by: string;
  due_date: string;
  due_time: string | null;
  priority: string;
  origin: string;
  recurring_task_id: string | null;
  requires_approval: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  completed_at: string | null;
  assignee_name: string | null;
  assigner_name: string | null;
};

export type TaskMaintenanceList = {
  rows: TaskMaintenanceRow[];
  total: number;
  limit: number;
};

const MAINTENANCE_PATH = "/admin/tasks/maintenance";
const CONFIRMATION_TEXT = "DELETE TASK DATA";
const MAX_VISIBLE_TASKS = 100;
const MAX_BULK_DELETE = 100;

const TASK_MAINTENANCE_SELECT = `
  id, title, description, status, assigned_to, assigned_by, due_date, due_time,
  priority, origin, recurring_task_id, requires_approval, approved_by, approved_at,
  created_at, completed_at,
  assignee:app_users!tasks_assigned_to_fkey(display_name),
  assigner:app_users!tasks_assigned_by_fkey(display_name)
`;

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function normalizeStatusFilter(value: string | undefined): TaskMaintenanceStatusFilter {
  if (value === "open" || value === "done" || value === "overdue") return value;
  return "all";
}

function validDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function applyTaskMaintenanceFilters(query: any, filters: TaskMaintenanceFilters) {
  const q = filters.q?.trim();
  if (q) {
    const escaped = q.replaceAll("%", "\\%").replaceAll("_", "\\_").replace(/[,()]/g, " ");
    query = query.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%`);
  }

  if (filters.testOnly) {
    query = query.or("title.ilike.%TEST%,description.ilike.%TEST%,title.ilike.[TEST]%");
  }

  const status = normalizeStatusFilter(filters.status);
  if (status === "open") {
    query = query.neq("status", "done");
  } else if (status === "done") {
    query = query.eq("status", "done");
  } else if (status === "overdue") {
    query = query.neq("status", "done").lt("due_date", todayPKT());
  }

  const createdBefore = validDate(filters.createdBefore);
  if (createdBefore) {
    query = query.lt("created_at", `${createdBefore}T00:00:00.000Z`);
  }

  return query;
}

function normalizeTaskRows(data: unknown): TaskMaintenanceRow[] {
  type RawTaskRow = Omit<TaskMaintenanceRow, "assignee_name" | "assigner_name"> & {
    assignee: { display_name: string | null } | { display_name: string | null }[] | null;
    assigner: { display_name: string | null } | { display_name: string | null }[] | null;
  };

  return ((data ?? []) as RawTaskRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    assigned_to: row.assigned_to,
    assigned_by: row.assigned_by,
    due_date: row.due_date,
    due_time: row.due_time,
    priority: row.priority,
    origin: row.origin,
    recurring_task_id: row.recurring_task_id,
    requires_approval: row.requires_approval,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    created_at: row.created_at,
    completed_at: row.completed_at,
    assignee_name: pickOne(row.assignee)?.display_name ?? null,
    assigner_name: pickOne(row.assigner)?.display_name ?? null,
  }));
}

export async function listTaskMaintenanceRows(
  filters: TaskMaintenanceFilters
): Promise<TaskMaintenanceList> {
  await requireSuperAdmin(MAINTENANCE_PATH);

  const admin = createAdminClient();
  const query = applyTaskMaintenanceFilters(
    admin
      .from("tasks")
      .select(TASK_MAINTENANCE_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(MAX_VISIBLE_TASKS),
    filters
  );

  const { data, error, count } = await query;
  if (error) throw new Error(`listTaskMaintenanceRows: ${error.message}`);

  return {
    rows: normalizeTaskRows(data),
    total: count ?? 0,
    limit: MAX_VISIBLE_TASKS,
  };
}

function uuidLooksValid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function childCountsForTaskIds(
  admin: ReturnType<typeof createAdminClient>,
  taskIds: string[]
): Promise<{ taskUpdateCount: number; taskAttachmentCount: number }> {
  if (taskIds.length === 0) {
    return { taskUpdateCount: 0, taskAttachmentCount: 0 };
  }

  const { data: updates, error: updatesError, count: updateCount } = await admin
    .from("task_updates")
    .select("id", { count: "exact" })
    .in("task_id", taskIds)
    .limit(10000);
  if (updatesError) throw new Error(`Could not count task updates: ${updatesError.message}`);

  const updateIds = ((updates ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (updateIds.length === 0) {
    return { taskUpdateCount: updateCount ?? 0, taskAttachmentCount: 0 };
  }

  const { error: attachmentsError, count: attachmentCount } = await admin
    .from("task_attachments")
    .select("id", { count: "exact", head: true })
    .in("task_update_id", updateIds);
  if (attachmentsError) {
    throw new Error(`Could not count task attachments: ${attachmentsError.message}`);
  }

  return {
    taskUpdateCount: updateCount ?? 0,
    taskAttachmentCount: attachmentCount ?? 0,
  };
}

export async function deleteSelectedTaskCleanup(formData: FormData): Promise<void> {
  await requireSuperAdmin(MAINTENANCE_PATH);

  const confirmation = readString(formData, "confirmation");
  if (confirmation !== CONFIRMATION_TEXT) {
    redirect(`${MAINTENANCE_PATH}?error=${encodeURIComponent("Typed confirmation did not match.")}`);
  }

  const selectedIds = Array.from(new Set(
    formData
      .getAll("task_ids")
      .map((value) => String(value).trim())
      .filter(Boolean)
  ));

  if (selectedIds.length === 0) {
    redirect(`${MAINTENANCE_PATH}?error=${encodeURIComponent("Select at least one task to delete.")}`);
  }
  if (selectedIds.length > MAX_BULK_DELETE) {
    redirect(
      `${MAINTENANCE_PATH}?error=${encodeURIComponent(
        `Select ${MAX_BULK_DELETE} or fewer tasks per delete.`
      )}`
    );
  }
  if (selectedIds.some((id) => !uuidLooksValid(id))) {
    redirect(`${MAINTENANCE_PATH}?error=${encodeURIComponent("One or more selected task IDs are invalid.")}`);
  }

  const admin = createAdminClient();
  const { data: existingRows, error: existingError } = await admin
    .from("tasks")
    .select("id")
    .in("id", selectedIds);
  if (existingError) {
    redirect(`${MAINTENANCE_PATH}?error=${encodeURIComponent(`Could not validate selected tasks: ${existingError.message}`)}`);
  }

  const existingIds = ((existingRows ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (existingIds.length !== selectedIds.length) {
    redirect(`${MAINTENANCE_PATH}?error=${encodeURIComponent("Some selected tasks no longer exist. Refresh and try again.")}`);
  }

  const childCounts = await childCountsForTaskIds(admin, existingIds);
  const { error } = await admin.from("tasks").delete().in("id", existingIds);
  if (error) {
    redirect(`${MAINTENANCE_PATH}?error=${encodeURIComponent(`Delete failed: ${error.message}`)}`);
  }

  revalidatePath(MAINTENANCE_PATH);
  revalidatePath("/tasks");
  revalidatePath("/tasks/history");
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/tasks/history");
  revalidatePath("/dashboard");

  const params = new URLSearchParams({
    ok: `Deleted ${existingIds.length} task(s), cascading ${childCounts.taskUpdateCount} task update(s) and ${childCounts.taskAttachmentCount} attachment(s).`,
  });
  redirect(`${MAINTENANCE_PATH}?${params.toString()}`);
}
