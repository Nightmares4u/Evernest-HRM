"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/server";

export type TaskCleanupMode =
  | "completed_test"
  | "pending_test"
  | "all_test"
  | "stale_completed"
  | "exact_test_match";

export type TaskCleanupCriteria = {
  mode: TaskCleanupMode;
  staleBefore?: string;
  exactQuery?: string;
};

export type TaskCleanupSample = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  assigned_to: string;
  assigned_by: string;
  due_date: string;
  created_at: string;
  completed_at: string | null;
  assignee_name: string | null;
  assigner_name: string | null;
};

export type TaskCleanupPreview = {
  criteria: TaskCleanupCriteria;
  taskCount: number;
  taskUpdateCount: number;
  taskAttachmentCount: number;
  samples: TaskCleanupSample[];
  error: string | null;
};

const MAINTENANCE_PATH = "/admin/tasks/maintenance";
const CONFIRMATION_TEXT = "DELETE TASK DATA";
const MAX_DELETE_ROWS = 5000;

const TASK_SAMPLE_SELECT = `
  id, title, description, status, assigned_to, assigned_by, due_date,
  created_at, completed_at,
  assignee:app_users!tasks_assigned_to_fkey(display_name),
  assigner:app_users!tasks_assigned_by_fkey(display_name)
`;

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function isTaskCleanupMode(value: string): value is TaskCleanupMode {
  return [
    "completed_test",
    "pending_test",
    "all_test",
    "stale_completed",
    "exact_test_match",
  ].includes(value);
}

function taskCleanupCriteriaFromFormData(formData: FormData): TaskCleanupCriteria | null {
  const mode = readString(formData, "mode");
  if (!isTaskCleanupMode(mode)) return null;
  return {
    mode,
    staleBefore: readString(formData, "stale_before") || undefined,
    exactQuery: readString(formData, "exact_query") || undefined,
  };
}

function validateCriteria(criteria: TaskCleanupCriteria): string | null {
  if (criteria.mode === "stale_completed") {
    if (!criteria.staleBefore || !/^\d{4}-\d{2}-\d{2}$/.test(criteria.staleBefore)) {
      return "Choose a valid stale-before date.";
    }
  }
  if (criteria.mode === "exact_test_match" && !criteria.exactQuery) {
    return "Enter an exact task ID or exact test task title.";
  }
  return null;
}

function uuidLooksValid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function staleBeforeIso(date: string): string {
  return `${date}T00:00:00.000Z`;
}

function applyTestTaskPredicate(query: any) {
  return query.or("title.ilike.%TEST%,description.ilike.%TEST%,title.ilike.[TEST]%");
}

function applyCriteria(query: any, criteria: TaskCleanupCriteria) {
  if (criteria.mode === "completed_test") {
    return applyTestTaskPredicate(query.eq("status", "done"));
  }
  if (criteria.mode === "pending_test") {
    return applyTestTaskPredicate(query.neq("status", "done"));
  }
  if (criteria.mode === "all_test") {
    return applyTestTaskPredicate(query);
  }
  if (criteria.mode === "stale_completed" && criteria.staleBefore) {
    return query
      .eq("status", "done")
      .not("completed_at", "is", null)
      .lt("completed_at", staleBeforeIso(criteria.staleBefore));
  }
  if (criteria.mode === "exact_test_match" && criteria.exactQuery) {
    const exact = uuidLooksValid(criteria.exactQuery)
      ? query.eq("id", criteria.exactQuery)
      : query.eq("title", criteria.exactQuery);
    return applyTestTaskPredicate(exact);
  }
  return query.limit(0);
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
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

async function matchingTaskIds(
  admin: ReturnType<typeof createAdminClient>,
  criteria: TaskCleanupCriteria,
  limit: number
): Promise<string[]> {
  const { data, error } = await applyCriteria(
    admin.from("tasks").select("id").order("created_at", { ascending: true }).limit(limit),
    criteria
  );
  if (error) throw new Error(`Could not load matching task ids: ${error.message}`);
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

export async function previewTaskCleanup(
  criteria: TaskCleanupCriteria
): Promise<TaskCleanupPreview> {
  await requireSuperAdmin(MAINTENANCE_PATH);

  const validationError = validateCriteria(criteria);
  if (validationError) {
    return {
      criteria,
      taskCount: 0,
      taskUpdateCount: 0,
      taskAttachmentCount: 0,
      samples: [],
      error: validationError,
    };
  }

  const admin = createAdminClient();
  const { data, error, count } = await applyCriteria(
    admin
      .from("tasks")
      .select(TASK_SAMPLE_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(20),
    criteria
  );
  if (error) {
    return {
      criteria,
      taskCount: 0,
      taskUpdateCount: 0,
      taskAttachmentCount: 0,
      samples: [],
      error: error.message,
    };
  }

  const samples = ((data ?? []) as Array<TaskCleanupSample & {
    assignee: { display_name: string | null } | { display_name: string | null }[] | null;
    assigner: { display_name: string | null } | { display_name: string | null }[] | null;
  }>).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    assigned_to: row.assigned_to,
    assigned_by: row.assigned_by,
    due_date: row.due_date,
    created_at: row.created_at,
    completed_at: row.completed_at,
    assignee_name: pickOne(row.assignee)?.display_name ?? null,
    assigner_name: pickOne(row.assigner)?.display_name ?? null,
  }));

  const taskIds = await matchingTaskIds(admin, criteria, MAX_DELETE_ROWS + 1);
  const childCounts = await childCountsForTaskIds(admin, taskIds.slice(0, MAX_DELETE_ROWS));

  return {
    criteria,
    taskCount: count ?? 0,
    ...childCounts,
    samples,
    error: null,
  };
}

export async function deleteTaskCleanup(formData: FormData): Promise<void> {
  await requireSuperAdmin(MAINTENANCE_PATH);

  const criteria = taskCleanupCriteriaFromFormData(formData);
  if (!criteria) {
    redirect(`${MAINTENANCE_PATH}?error=${encodeURIComponent("Choose a cleanup mode first.")}`);
  }

  const confirmation = readString(formData, "confirmation");
  const previewAck = readString(formData, "preview_ack");
  if (previewAck !== "previewed") {
    redirect(`${MAINTENANCE_PATH}?error=${encodeURIComponent("Preview the cleanup before deleting.")}`);
  }
  if (confirmation !== CONFIRMATION_TEXT) {
    redirect(`${MAINTENANCE_PATH}?error=${encodeURIComponent("Typed confirmation did not match.")}`);
  }

  const validationError = validateCriteria(criteria);
  if (validationError) {
    redirect(`${MAINTENANCE_PATH}?error=${encodeURIComponent(validationError)}`);
  }

  const admin = createAdminClient();
  const taskIds = await matchingTaskIds(admin, criteria, MAX_DELETE_ROWS + 1);
  if (taskIds.length === 0) {
    redirect(`${MAINTENANCE_PATH}?error=${encodeURIComponent("No matching tasks found.")}`);
  }
  if (taskIds.length > MAX_DELETE_ROWS) {
    redirect(
      `${MAINTENANCE_PATH}?error=${encodeURIComponent(
        `Cleanup matched more than ${MAX_DELETE_ROWS} tasks. Narrow the criteria before deleting.`
      )}`
    );
  }

  const childCounts = await childCountsForTaskIds(admin, taskIds);
  const { error } = await admin.from("tasks").delete().in("id", taskIds);
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
    ok: `Deleted ${taskIds.length} task(s), cascading ${childCounts.taskUpdateCount} task update(s) and ${childCounts.taskAttachmentCount} attachment(s).`,
  });
  redirect(`${MAINTENANCE_PATH}?${params.toString()}`);
}
