"use server";

// Server actions for the tasks module.
// - Employee actions: markTaskDone (only if !requires_approval), submitForApproval.
// - Admin actions:    createTask, approveTask, rejectTask.
//
// All admin actions write to audit_logs via the service-role client. Identity
// (auth.uid()) is captured explicitly.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTaskAdmin } from "@/lib/auth/require-role";
import {
  actorFromCurrentUser,
  canAssignTask,
  canCreateSelfTask,
  canRequestFrom,
} from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getUserNotificationTarget } from "@/lib/email/recipients";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { sendEmail, sendEmailSafely } from "@/lib/email/send";
import {
  taskAssignedEmail,
  taskRequestAcceptedEmail,
  taskRequestDeclinedEmail,
  taskRequestedEmail,
} from "@/lib/email/templates";
import type { TaskPriority, UserRole } from "@/lib/types/hrm";

function fail(path: string, msg: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}error=${encodeURIComponent(msg)}`);
}

function ok(path: string, msg: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}ok=${encodeURIComponent(msg)}`);
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

const ADMIN_TASK_ROLES: UserRole[] = [
  "super_admin",
  "admin_hr",
  "branch_manager",
  "assistant_manager",
  "manager",
];

function isTaskAdmin(role: UserRole | null | undefined): boolean {
  return Boolean(role && ADMIN_TASK_ROLES.includes(role));
}

function revalidateTaskSurfaces() {
  revalidatePath("/tasks");
  revalidatePath("/tasks/history");
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/tasks/history");
  revalidatePath("/dashboard");
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

  const admin = createAdminClient();
  const [{ data: task, error }, { data: appUser, error: userErr }] = await Promise.all([
    admin
      .from("tasks")
      .select("id, assigned_to, requires_approval, status")
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("app_users")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  if (userErr || !appUser?.is_active) fail("/tasks", "Could not verify your account.");
  const canAdminComplete = isTaskAdmin(appUser.role as UserRole);
  if (error || !task) fail("/tasks", "Task not found.");
  if (task.assigned_to !== user.id) {
    if (!canAdminComplete) fail("/tasks", "You can't update someone else's task.");
    const me = await getCurrentUser();
    if (!me) redirect("/login");
    const actor = actorFromCurrentUser(me);
    const { data: assigneeEmployee } = await admin
      .from("employees")
      .select("id, user_id, branch_id, app_users:user_id ( role )")
      .eq("user_id", task.assigned_to)
      .maybeSingle();
    const assigneeAppUser = assigneeEmployee
      ? Array.isArray(assigneeEmployee.app_users)
        ? assigneeEmployee.app_users[0]
        : assigneeEmployee.app_users
      : null;
    if (
      !canAssignTask(
        actor,
        assigneeEmployee
          ? {
              id: assigneeEmployee.id,
              user_id: assigneeEmployee.user_id,
              branch_id: assigneeEmployee.branch_id,
              user_role: assigneeAppUser?.role ?? "employee",
            }
          : null
      )
    ) {
      fail("/tasks", "You can't update someone else's task.");
    }
  }
  if (task.requires_approval && !canAdminComplete)
    fail(
      "/tasks",
      "This task requires approval. Use 'Submit for approval' instead."
    );
  if (task.status === "done") fail("/tasks", "Task is already done.");

  const now = new Date().toISOString();
  const updatePayload: {
    status: "done";
    completed_at: string;
    approved_by?: string;
    approved_at?: string;
  } = { status: "done", completed_at: now };
  if (task.requires_approval && canAdminComplete) {
    updatePayload.approved_by = user.id;
    updatePayload.approved_at = now;
  }

  const { error: updErr } = await admin
    .from("tasks")
    .update(updatePayload)
    .eq("id", id);
  if (updErr) fail("/tasks", `Update failed: ${updErr.message}`);

  const { error: updateErr } = await admin.from("task_updates").insert({
    task_id: id,
    user_id: user.id,
    note: null,
    status_update: "done",
  });
  if (updateErr) fail("/tasks", `Task updated, but history note failed: ${updateErr.message}`);

  revalidateTaskSurfaces();
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

  const admin = createAdminClient();
  const { data: task, error } = await admin
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

  const { error: updErr } = await admin
    .from("tasks")
    .update({ status: "in_progress" })
    .eq("id", id);
  if (updErr) fail("/tasks", `Update failed: ${updErr.message}`);

  const { error: updateErr } = await admin.from("task_updates").insert({
    task_id: id,
    user_id: user.id,
    note,
    status_update: "in_progress",
  });
  if (updateErr) fail("/tasks", `Task submitted, but history note failed: ${updateErr.message}`);

  revalidateTaskSurfaces();
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

function normalisePriority(raw: string): TaskPriority {
  return (PRIORITIES.includes(raw as TaskPriority) ? raw : "normal") as TaskPriority;
}

function assertFormMode(
  formData: FormData,
  expected: "assigned" | "self" | "request",
  path: string
) {
  const mode = String(formData.get("mode") ?? "").trim();
  if (mode && mode !== expected) fail(path, "Invalid task form mode.");
}

/**
 * Super-admin creates a one-off task assigned to anyone (employee or admin).
 * Optional `due_time` lets the schedule grid place it in the right hour cell.
 * `redirect_to` lets the form post from anywhere (e.g., dashboard quick-assign).
 */
export async function createTask(formData: FormData) {
  assertFormMode(formData, "assigned", "/tasks");
  const title = String(formData.get("title") ?? "").trim();
  const description =
    String(formData.get("description") ?? "").trim() || null;
  const assigned_to = String(formData.get("assigned_to") ?? "").trim();
  const due_date = String(formData.get("due_date") ?? "").trim();
  const due_time = normaliseDueTime(String(formData.get("due_time") ?? ""));
  const priorityRaw = String(formData.get("priority") ?? "normal").trim();
  const priority = normalisePriority(priorityRaw);
  const requires_approval = formData.get("requires_approval") === "on";
  const redirectToRaw = String(formData.get("redirect_to") ?? "").trim();
  const redirectTo =
    redirectToRaw === "/dashboard" ||
    redirectToRaw === "/admin/tasks" ||
    redirectToRaw === "/tasks"
      ? redirectToRaw
      : "/admin/tasks";

  if (!title) fail(redirectTo, "Title is required.");
  if (!assigned_to) fail(redirectTo, "Pick an assignee.");
  if (!due_date) fail(redirectTo, "Due date is required.");

  const me = await requireTaskAdmin(redirectTo);
  const user = { id: me.authUserId };
  const actor = actorFromCurrentUser(me);

  const admin = createAdminClient();
  const { data: assigneeEmployee } = await admin
    .from("employees")
    .select("id, user_id, branch_id, app_users:user_id ( role )")
    .eq("user_id", assigned_to)
    .maybeSingle();
  const assigneeAppUser = assigneeEmployee
    ? Array.isArray(assigneeEmployee.app_users)
      ? assigneeEmployee.app_users[0]
      : assigneeEmployee.app_users
    : null;
  const target = assigneeEmployee
    ? {
        id: assigneeEmployee.id,
        user_id: assigneeEmployee.user_id,
        branch_id: assigneeEmployee.branch_id,
        user_role: assigneeAppUser?.role ?? "employee",
      }
    : null;
  if (!canAssignTask(actor, target)) {
    fail(redirectTo, "You do not have permission to assign tasks to this user.");
  }

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
      workflow_type: "assigned",
      accepted_at: new Date().toISOString(),
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
      workflow_type: "assigned",
    },
  });

  // Notify the assignee (and capture assigner name for the email body).
  await sendEmailSafely(async () => {
    const [assigneeRow, { data: assignerRow }] = await Promise.all([
      getUserNotificationTarget(admin, assigned_to),
      admin
        .from("app_users")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle(),
    ]);
    if (!assigneeRow?.email) return;
    const tpl = taskAssignedEmail({
      to_name: assigneeRow.name ?? assigneeRow.email,
      title,
      description,
      due_date,
      due_time,
      priority,
      assigner_name: assignerRow?.display_name ?? "Admin",
      requires_approval,
    });
    await sendEmail({
      to: assigneeRow.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
  });

  revalidatePath("/tasks");
  revalidatePath("/admin/tasks");
  revalidatePath("/dashboard");
  ok(redirectTo, `Task assigned (${title}).`);
}

export async function createSelfTask(formData: FormData) {
  assertFormMode(formData, "self", "/tasks");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const due_date = String(formData.get("due_date") ?? "").trim();
  const due_time = normaliseDueTime(String(formData.get("due_time") ?? ""));
  const priority = normalisePriority(String(formData.get("priority") ?? "normal").trim());

  if (!title) fail("/tasks", "Title is required.");
  if (!due_date) fail("/tasks", "Due date is required.");

  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const actor = actorFromCurrentUser(me);
  if (!canCreateSelfTask(actor)) fail("/tasks", "Your account is not active.");

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("tasks")
    .insert({
      title,
      description,
      assigned_to: actor.id,
      assigned_by: actor.id,
      due_date,
      due_time,
      priority,
      status: "to_do",
      workflow_type: "self",
      accepted_at: now,
      requires_approval: false,
      origin: "hrm",
    })
    .select("id")
    .single();
  if (error || !data) fail("/tasks", `Create failed: ${error?.message ?? "unknown"}`);

  const { error: updateErr } = await admin.from("task_updates").insert({
    task_id: data.id,
    user_id: actor.id,
    note: "self-created",
    status_update: null,
  });
  if (updateErr) fail("/tasks", `Task created, but history note failed: ${updateErr.message}`);

  await logAudit(admin, {
    actor_id: actor.id,
    target_type: "task",
    target_id: data.id,
    action: "create_self_task",
    new_value: { title, due_date, due_time, priority, workflow_type: "self" },
  });

  revalidateTaskSurfaces();
  ok("/tasks", `Task created (${title}).`);
}

export async function createRequestTask(formData: FormData) {
  assertFormMode(formData, "request", "/tasks");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const assigned_to = String(formData.get("assigned_to") ?? "").trim();
  const due_date = String(formData.get("due_date") ?? "").trim();
  const due_time = normaliseDueTime(String(formData.get("due_time") ?? ""));
  const priority = normalisePriority(String(formData.get("priority") ?? "normal").trim());

  if (!title) fail("/tasks", "Title is required.");
  if (!assigned_to) fail("/tasks", "Pick the person you want to request from.");
  if (!due_date) fail("/tasks", "Due date is required.");

  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const actor = actorFromCurrentUser(me);
  if (actor.id === assigned_to) fail("/tasks", "Use self task for your own work.");

  const admin = createAdminClient();
  const [{ data: targetUser, error: targetErr }, { data: targetEmployee }] =
    await Promise.all([
      admin
        .from("app_users")
        .select("id, role, is_active, display_name")
        .eq("id", assigned_to)
        .maybeSingle(),
      admin
        .from("employees")
        .select("branch_id, departments ( name )")
        .eq("user_id", assigned_to)
        .maybeSingle(),
    ]);
  if (targetErr || !targetUser) fail("/tasks", "Request target not found.");
  const departmentJoin = targetEmployee?.departments as
    | { name: string }
    | { name: string }[]
    | null
    | undefined;
  const targetDepartment = Array.isArray(departmentJoin)
    ? departmentJoin[0]?.name ?? null
    : departmentJoin?.name ?? null;
  if (
    !canRequestFrom(actor, {
      user_id: targetUser.id,
      role: targetUser.role as UserRole,
      branch_id: targetEmployee?.branch_id ?? null,
      is_active: Boolean(targetUser.is_active),
      department_name: targetDepartment,
    })
  ) {
    fail("/tasks", "You cannot request tasks from that user.");
  }

  const { data, error } = await admin
    .from("tasks")
    .insert({
      title,
      description,
      assigned_to,
      assigned_by: actor.id,
      due_date,
      due_time,
      priority,
      status: "to_do",
      workflow_type: "request",
      accepted_at: null,
      declined_at: null,
      requires_approval: false,
      origin: "hrm",
    })
    .select("id")
    .single();
  if (error || !data) fail("/tasks", `Create failed: ${error?.message ?? "unknown"}`);

  const { error: updateErr } = await admin.from("task_updates").insert({
    task_id: data.id,
    user_id: actor.id,
    note: "request created",
    status_update: null,
  });
  if (updateErr) fail("/tasks", `Request created, but history note failed: ${updateErr.message}`);

  await logAudit(admin, {
    actor_id: actor.id,
    target_type: "task",
    target_id: data.id,
    action: "create_request_task",
    new_value: { title, assigned_to, due_date, due_time, priority, workflow_type: "request" },
  });

  await sendEmailSafely(async () => {
    const target = await getUserNotificationTarget(admin, assigned_to);
    if (!target?.email) return;
    const tpl = taskRequestedEmail({
      to_name: target.name ?? target.email,
      title,
      description,
      due_date,
      due_time,
      priority,
      requester_name: me.appUser.display_name,
    });
    await sendEmail({
      to: target.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
  });

  revalidateTaskSurfaces();
  ok("/tasks?tab=requests-out", `Request sent to ${targetUser.display_name}.`);
}

export async function acceptRequest(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) fail("/tasks?tab=requests-in", "Missing task id.");

  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const admin = createAdminClient();
  const { data: task, error } = await admin
    .from("tasks")
    .select("id, title, assigned_to, assigned_by, workflow_type, accepted_at, declined_at, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !task) fail("/tasks?tab=requests-in", "Request not found.");
  if (
    task.workflow_type !== "request" ||
    task.accepted_at !== null ||
    task.declined_at !== null ||
    task.assigned_to !== me.authUserId
  ) {
    fail("/tasks?tab=requests-in", "This request cannot be accepted.");
  }

  const now = new Date().toISOString();
  const { error: updErr } = await admin
    .from("tasks")
    .update({ accepted_at: now })
    .eq("id", id);
  if (updErr) fail("/tasks?tab=requests-in", `Accept failed: ${updErr.message}`);

  const { error: updateErr } = await admin.from("task_updates").insert({
    task_id: id,
    user_id: me.authUserId,
    note: "request accepted",
    status_update: null,
  });
  if (updateErr)
    fail("/tasks?tab=requests-in", `Accepted, but history note failed: ${updateErr.message}`);

  await logAudit(admin, {
    actor_id: me.authUserId,
    target_type: "task",
    target_id: id,
    action: "accept_request",
    old_value: { accepted_at: null },
    new_value: { accepted_at: now },
  });

  await sendEmailSafely(async () => {
    const requester = await getUserNotificationTarget(admin, task.assigned_by);
    if (!requester?.email) return;
    const tpl = taskRequestAcceptedEmail({
      to_name: requester.name ?? requester.email,
      title: task.title,
      accepter_name: me.appUser.display_name,
    });
    await sendEmail({
      to: requester.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
  });

  revalidateTaskSurfaces();
  ok("/tasks", `Request accepted: ${task.title}`);
}

export async function declineRequest(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id) fail("/tasks?tab=requests-in", "Missing task id.");
  if (!reason) fail("/tasks?tab=requests-in", "Reason required.");

  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const admin = createAdminClient();
  const { data: task, error } = await admin
    .from("tasks")
    .select("id, title, assigned_to, assigned_by, workflow_type, accepted_at, declined_at, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !task) fail("/tasks?tab=requests-in", "Request not found.");
  if (
    task.workflow_type !== "request" ||
    task.accepted_at !== null ||
    task.declined_at !== null ||
    task.assigned_to !== me.authUserId
  ) {
    fail("/tasks?tab=requests-in", "This request cannot be declined.");
  }

  const now = new Date().toISOString();
  const { error: updErr } = await admin
    .from("tasks")
    .update({ declined_at: now, declined_reason: reason, status: "blocked" })
    .eq("id", id);
  if (updErr) fail("/tasks?tab=requests-in", `Decline failed: ${updErr.message}`);

  const { error: updateErr } = await admin.from("task_updates").insert({
    task_id: id,
    user_id: me.authUserId,
    note: reason,
    status_update: "blocked",
  });
  if (updateErr)
    fail("/tasks?tab=requests-in", `Declined, but history note failed: ${updateErr.message}`);

  await logAudit(admin, {
    actor_id: me.authUserId,
    target_type: "task",
    target_id: id,
    action: "decline_request",
    old_value: { status: task.status },
    new_value: { status: "blocked", declined_at: now },
    reason,
  });

  await sendEmailSafely(async () => {
    const requester = await getUserNotificationTarget(admin, task.assigned_by);
    if (!requester?.email) return;
    const tpl = taskRequestDeclinedEmail({
      to_name: requester.name ?? requester.email,
      title: task.title,
      decliner_name: me.appUser.display_name,
      reason,
    });
    await sendEmail({
      to: requester.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
  });

  revalidateTaskSurfaces();
  ok("/tasks?tab=requests-in", `Request declined: ${task.title}`);
}

/**
 * Super-admin approves an approval-required task that's been submitted.
 * Sets status='done', approved_by/at, completed_at, writes audit + task_update.
 */
export async function approveTask(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!id) fail("/admin/tasks", "Missing task id.");

  const me = await requireTaskAdmin("/admin/tasks");
  const user = { id: me.authUserId };
  const actor = actorFromCurrentUser(me);

  const admin = createAdminClient();
  const { data: task, error: fetchErr } = await admin
    .from("tasks")
    .select("id, assigned_to, requires_approval, status, title")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !task) fail("/admin/tasks", "Task not found.");
  if (!task.requires_approval)
    fail("/admin/tasks", "Task does not require approval.");
  if (task.status === "done")
    fail("/admin/tasks", "Task is already approved/done.");

  const { data: assigneeEmployee } = await admin
    .from("employees")
    .select("id, user_id, branch_id, app_users:user_id ( role )")
    .eq("user_id", task.assigned_to)
    .maybeSingle();
  const assigneeAppUser = assigneeEmployee
    ? Array.isArray(assigneeEmployee.app_users)
      ? assigneeEmployee.app_users[0]
      : assigneeEmployee.app_users
    : null;
  if (
    !canAssignTask(
      actor,
      assigneeEmployee
        ? {
            id: assigneeEmployee.id,
            user_id: assigneeEmployee.user_id,
            branch_id: assigneeEmployee.branch_id,
            user_role: assigneeAppUser?.role ?? "employee",
          }
        : null
    )
  ) {
    fail("/admin/tasks", "You do not have permission to approve this task.");
  }

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

  const { error: updateErr } = await admin.from("task_updates").insert({
    task_id: id,
    user_id: user.id,
    note,
    status_update: "done",
  });
  if (updateErr)
    fail("/admin/tasks", `Approved, but history note failed: ${updateErr.message}`);

  await logAudit(admin, {
    actor_id: user.id,
    target_type: "task",
    target_id: id,
    action: "approve_task",
    old_value: { status: task.status },
    new_value: { status: "done", approved_by: user.id },
    reason: note,
  });

  revalidateTaskSurfaces();
  ok("/admin/tasks", `Approved: ${task.title}`);
}

/**
 * Super-admin rejects an approval-required task back to 'to_do' with a note.
 */
export async function rejectTask(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!id) fail("/admin/tasks", "Missing task id.");

  const me = await requireTaskAdmin("/admin/tasks");
  const user = { id: me.authUserId };
  const actor = actorFromCurrentUser(me);

  const admin = createAdminClient();
  const { data: task, error: fetchErr } = await admin
    .from("tasks")
    .select("id, assigned_to, status, title")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !task) fail("/admin/tasks", "Task not found.");
  if (task.status === "done") fail("/admin/tasks", "Task is already done.");

  const { data: assigneeEmployee } = await admin
    .from("employees")
    .select("id, user_id, branch_id, app_users:user_id ( role )")
    .eq("user_id", task.assigned_to)
    .maybeSingle();
  const assigneeAppUser = assigneeEmployee
    ? Array.isArray(assigneeEmployee.app_users)
      ? assigneeEmployee.app_users[0]
      : assigneeEmployee.app_users
    : null;
  if (
    !canAssignTask(
      actor,
      assigneeEmployee
        ? {
            id: assigneeEmployee.id,
            user_id: assigneeEmployee.user_id,
            branch_id: assigneeEmployee.branch_id,
            user_role: assigneeAppUser?.role ?? "employee",
          }
        : null
    )
  ) {
    fail("/admin/tasks", "You do not have permission to reject this task.");
  }

  const { error: updErr } = await admin
    .from("tasks")
    .update({ status: "to_do" })
    .eq("id", id);
  if (updErr) fail("/admin/tasks", `Reject failed: ${updErr.message}`);

  const { error: updateErr } = await admin.from("task_updates").insert({
    task_id: id,
    user_id: user.id,
    note,
    status_update: "to_do",
  });
  if (updateErr)
    fail("/admin/tasks", `Rejected, but history note failed: ${updateErr.message}`);

  await logAudit(admin, {
    actor_id: user.id,
    target_type: "task",
    target_id: id,
    action: "reject_task",
    old_value: { status: task.status },
    new_value: { status: "to_do" },
    reason: note,
  });

  revalidateTaskSurfaces();
  ok("/admin/tasks", `Rejected back to to-do: ${task.title}`);
}
