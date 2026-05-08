"use server";

// Server actions for the tasks module.
// - Employee actions: markTaskDone (only if !requires_approval), submitForApproval.
// - Admin actions:    createTask, approveTask, rejectTask.
//
// All admin actions write to audit_logs via the service-role client. Identity
// (auth.uid()) is captured explicitly.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { TaskPriority } from "@/lib/types/hrm";

function fail(path: string, msg: string): never {
  redirect(`${path}?error=${encodeURIComponent(msg)}`);
}

function ok(path: string, msg: string): never {
  redirect(`${path}?ok=${encodeURIComponent(msg)}`);
}

async function logAudit(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    actor_id: string;
    target_type: string;
    target_id: string;
    action: string;
    old_value?: unknown;
    new_value?: unknown;
    reason?: string | null;
  }
) {
  await admin.from("audit_logs").insert({
    actor_id: args.actor_id,
    target_type: args.target_type,
    target_id: args.target_id,
    action: args.action,
    old_value: args.old_value ?? null,
    new_value: args.new_value ?? null,
    reason: args.reason ?? null,
  });
}

// ---------- employee actions ----------

/**
 * Employee marks a task done. Only valid if requires_approval = false.
 * Approval-required tasks must go through submitForApproval -> approveTask.
 */
export async function markTaskDone(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) fail("/tasks", "Missing task id.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: task, error } = await supabase
    .from("tasks")
    .select("id, assigned_to, requires_approval, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !task) fail("/tasks", "Task not found.");
  if (task.assigned_to !== user.id)
    fail("/tasks", "You can't update someone else's task.");
  if (task.requires_approval)
    fail(
      "/tasks",
      "This task requires approval. Use 'Submit for approval' instead."
    );
  if (task.status === "done") fail("/tasks", "Task is already done.");

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("tasks")
    .update({ status: "done", completed_at: now })
    .eq("id", id);
  if (updErr) fail("/tasks", `Update failed: ${updErr.message}`);

  await supabase.from("task_updates").insert({
    task_id: id,
    user_id: user.id,
    note: null,
    status_update: "done",
  });

  revalidatePath("/tasks");
  revalidatePath("/admin/tasks");
  ok("/tasks", "Task marked done.");
}

/**
 * Employee submits an approval-required task for review.
 * Moves status to 'in_progress', records a task_update with the note.
 */
export async function submitForApproval(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!id) fail("/tasks", "Missing task id.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: task, error } = await supabase
    .from("tasks")
    .select("id, assigned_to, requires_approval, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !task) fail("/tasks", "Task not found.");
  if (task.assigned_to !== user.id)
    fail("/tasks", "You can't update someone else's task.");
  if (!task.requires_approval)
    fail("/tasks", "This task does not need approval — mark it done directly.");
  if (task.status === "done") fail("/tasks", "Task is already done.");

  const { error: updErr } = await supabase
    .from("tasks")
    .update({ status: "in_progress" })
    .eq("id", id);
  if (updErr) fail("/tasks", `Update failed: ${updErr.message}`);

  await supabase.from("task_updates").insert({
    task_id: id,
    user_id: user.id,
    note,
    status_update: "in_progress",
  });

  revalidatePath("/tasks");
  revalidatePath("/admin/tasks");
  ok("/tasks", "Submitted for approval.");
}

// ---------- admin actions ----------

const PRIORITIES: TaskPriority[] = ["low", "normal", "urgent"];

function normaliseDueTime(raw: string): string | null {
  // Accept "HH:MM" or "HH:MM:SS"; reject anything else; empty -> null.
  const v = raw.trim();
  if (!v) return null;
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(v)) {
    return v.length === 5 ? `${v}:00` : v;
  }
  return null;
}

/**
 * Super-admin creates a one-off task assigned to anyone (employee or admin).
 * Optional `due_time` lets the schedule grid place it in the right hour cell.
 * `redirect_to` lets the form post from anywhere (e.g., dashboard quick-assign).
 */
export async function createTask(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const description =
    String(formData.get("description") ?? "").trim() || null;
  const assigned_to = String(formData.get("assigned_to") ?? "").trim();
  const due_date = String(formData.get("due_date") ?? "").trim();
  const due_time = normaliseDueTime(String(formData.get("due_time") ?? ""));
  const priorityRaw = String(formData.get("priority") ?? "normal").trim();
  const priority = (PRIORITIES.includes(priorityRaw as TaskPriority)
    ? priorityRaw
    : "normal") as TaskPriority;
  const requires_approval = formData.get("requires_approval") === "on";
  const redirectToRaw = String(formData.get("redirect_to") ?? "").trim();
  const redirectTo =
    redirectToRaw === "/dashboard" || redirectToRaw === "/admin/tasks"
      ? redirectToRaw
      : "/admin/tasks";

  if (!title) fail(redirectTo, "Title is required.");
  if (!assigned_to) fail(redirectTo, "Pick an assignee.");
  if (!due_date) fail(redirectTo, "Due date is required.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tasks")
    .insert({
      title,
      description,
      assigned_to,
      assigned_by: user.id,
      due_date,
      due_time,
      priority,
      status: "to_do",
      origin: "hrm",
      requires_approval,
    })
    .select("id")
    .single();
  if (error || !data)
    fail(redirectTo, `Create failed: ${error?.message ?? "unknown"}`);

  await logAudit(admin, {
    actor_id: user.id,
    target_type: "task",
    target_id: data.id,
    action: "create_task",
    new_value: {
      title,
      assigned_to,
      due_date,
      due_time,
      priority,
      requires_approval,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/admin/tasks");
  revalidatePath("/dashboard");
  ok(redirectTo, `Task assigned (${title}).`);
}

/**
 * Super-admin approves an approval-required task that's been submitted.
 * Sets status='done', approved_by/at, completed_at, writes audit + task_update.
 */
export async function approveTask(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!id) fail("/admin/tasks", "Missing task id.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: task, error: fetchErr } = await admin
    .from("tasks")
    .select("id, requires_approval, status, title")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !task) fail("/admin/tasks", "Task not found.");
  if (!task.requires_approval)
    fail("/admin/tasks", "Task does not require approval.");
  if (task.status === "done")
    fail("/admin/tasks", "Task is already approved/done.");

  const now = new Date().toISOString();
  const { error: updErr } = await admin
    .from("tasks")
    .update({
      status: "done",
      approved_by: user.id,
      approved_at: now,
      completed_at: now,
    })
    .eq("id", id);
  if (updErr) fail("/admin/tasks", `Approve failed: ${updErr.message}`);

  await admin.from("task_updates").insert({
    task_id: id,
    user_id: user.id,
    note,
    status_update: "done",
  });

  await logAudit(admin, {
    actor_id: user.id,
    target_type: "task",
    target_id: id,
    action: "approve_task",
    old_value: { status: task.status },
    new_value: { status: "done", approved_by: user.id },
    reason: note,
  });

  revalidatePath("/tasks");
  revalidatePath("/admin/tasks");
  ok("/admin/tasks", `Approved: ${task.title}`);
}

/**
 * Super-admin rejects an approval-required task back to 'to_do' with a note.
 */
export async function rejectTask(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!id) fail("/admin/tasks", "Missing task id.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: task, error: fetchErr } = await admin
    .from("tasks")
    .select("id, status, title")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !task) fail("/admin/tasks", "Task not found.");
  if (task.status === "done") fail("/admin/tasks", "Task is already done.");

  const { error: updErr } = await admin
    .from("tasks")
    .update({ status: "to_do" })
    .eq("id", id);
  if (updErr) fail("/admin/tasks", `Reject failed: ${updErr.message}`);

  await admin.from("task_updates").insert({
    task_id: id,
    user_id: user.id,
    note,
    status_update: "to_do",
  });

  await logAudit(admin, {
    actor_id: user.id,
    target_type: "task",
    target_id: id,
    action: "reject_task",
    old_value: { status: task.status },
    new_value: { status: "to_do" },
    reason: note,
  });

  revalidatePath("/tasks");
  revalidatePath("/admin/tasks");
  ok("/admin/tasks", `Rejected back to to-do: ${task.title}`);
}
