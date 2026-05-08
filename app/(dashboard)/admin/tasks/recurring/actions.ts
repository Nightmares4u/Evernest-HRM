"use server";

// Recurring-task admin actions.
//   - createRecurringTask: weekly recurrence (most common). Days are passed as
//     a multi-checkbox; we collect them into an int[] of ISO weekdays.
//   - toggleRecurringActive: pause/resume a template.
//   - deleteRecurringTask: hard delete (we keep audit_logs so it's traceable).
//   - generateTasksForToday: manual trigger that creates tasks rows from
//     active templates matching today's ISO weekday. Idempotent on the
//     (recurring_task_id, assigned_to, due_date) tuple.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { todayPKT } from "@/lib/attendance/format";
import { isoWeekdayPKT } from "@/lib/attendance/policy";
import type { TaskPriority, RecurrenceType } from "@/lib/types/hrm";

const PATH = "/admin/tasks/recurring";

function fail(msg: string): never {
  redirect(`${PATH}?error=${encodeURIComponent(msg)}`);
}
function ok(msg: string): never {
  redirect(`${PATH}?ok=${encodeURIComponent(msg)}`);
}

const PRIORITIES: TaskPriority[] = ["low", "normal", "urgent"];
const RECURRENCE: RecurrenceType[] = ["weekly", "monthly", "daily"];

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

function normaliseDueTime(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(v)) {
    return v.length === 5 ? `${v}:00` : v;
  }
  return null;
}

export async function createRecurringTask(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const assigned_to = String(formData.get("assigned_to") ?? "").trim();
  const recurrenceTypeRaw = String(formData.get("recurrence_type") ?? "weekly").trim();
  const recurrence_type = (RECURRENCE.includes(recurrenceTypeRaw as RecurrenceType)
    ? recurrenceTypeRaw
    : "weekly") as RecurrenceType;
  const priorityRaw = String(formData.get("priority") ?? "normal").trim();
  const priority = (PRIORITIES.includes(priorityRaw as TaskPriority)
    ? priorityRaw
    : "normal") as TaskPriority;
  const requires_approval = formData.get("requires_approval") === "on";
  const due_time = normaliseDueTime(String(formData.get("due_time") ?? ""));

  // Collect recurrence_days from checkboxes (form sends repeated keys).
  const days = formData
    .getAll("days")
    .map((v) => Number.parseInt(String(v), 10))
    .filter((n) => Number.isFinite(n))
    .filter((n, i, a) => a.indexOf(n) === i)
    .sort((a, b) => a - b);

  if (!title) fail("Title is required.");
  if (!assigned_to) fail("Pick an assignee.");
  if (recurrence_type !== "daily" && days.length === 0) {
    fail("Pick at least one recurrence day.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("recurring_tasks")
    .insert({
      title,
      description,
      assigned_to,
      assigned_by: user.id,
      recurrence_type,
      recurrence_days: days,
      priority,
      requires_approval,
      due_time,
      active: true,
    })
    .select("id")
    .single();
  if (error || !data) fail(`Create failed: ${error?.message ?? "unknown"}`);

  await logAudit(admin, {
    actor_id: user.id,
    target_type: "recurring_task",
    target_id: data.id,
    action: "create_recurring_task",
    new_value: {
      title,
      assigned_to,
      recurrence_type,
      recurrence_days: days,
      priority,
      requires_approval,
      due_time,
    },
  });

  revalidatePath(PATH);
  ok(`Recurring task created: ${title}`);
}

export async function toggleRecurringActive(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) fail("Missing id.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: row, error: fetchErr } = await admin
    .from("recurring_tasks")
    .select("id, active, title")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !row) fail("Recurring task not found.");

  const next = !row.active;
  const { error } = await admin
    .from("recurring_tasks")
    .update({ active: next })
    .eq("id", id);
  if (error) fail(`Toggle failed: ${error.message}`);

  await logAudit(admin, {
    actor_id: user.id,
    target_type: "recurring_task",
    target_id: id,
    action: next ? "activate_recurring_task" : "pause_recurring_task",
    old_value: { active: row.active },
    new_value: { active: next },
  });

  revalidatePath(PATH);
  ok(next ? `Resumed: ${row.title}` : `Paused: ${row.title}`);
}

export async function deleteRecurringTask(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) fail("Missing id.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: row, error: fetchErr } = await admin
    .from("recurring_tasks")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !row) fail("Recurring task not found.");

  // Detach generated tasks (recurring_task_id -> null) before deleting the
  // template, so historic task rows survive even if we remove the template.
  await admin
    .from("tasks")
    .update({ recurring_task_id: null })
    .eq("recurring_task_id", id);

  const { error } = await admin.from("recurring_tasks").delete().eq("id", id);
  if (error) fail(`Delete failed: ${error.message}`);

  await logAudit(admin, {
    actor_id: user.id,
    target_type: "recurring_task",
    target_id: id,
    action: "delete_recurring_task",
    old_value: { title: row.title },
  });

  revalidatePath(PATH);
  revalidatePath("/tasks");
  revalidatePath("/admin/tasks");
  ok(`Deleted: ${row.title}`);
}

/**
 * Manually run today's recurring-task generator. Cron will replace this once
 * the route handler at /api/cron/recurring is wired (Phase later).
 *
 * For each active recurring template whose recurrence_days includes today's
 * ISO weekday (or recurrence_type='daily'), insert a tasks row if one doesn't
 * already exist for (recurring_task_id, assigned_to, due_date=today).
 */
export async function generateTasksForToday() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const today = todayPKT();
  const isoDay = isoWeekdayPKT();

  const { data: templates, error: tErr } = await admin
    .from("recurring_tasks")
    .select(
      "id, title, description, assigned_to, assigned_by, branch_id, department_id, priority, requires_approval, recurrence_type, recurrence_days, due_time"
    )
    .eq("active", true);
  if (tErr) fail(`Could not load templates: ${tErr.message}`);

  let created = 0;
  let skipped = 0;
  for (const t of templates ?? []) {
    const matchesToday =
      t.recurrence_type === "daily" ||
      (Array.isArray(t.recurrence_days) && t.recurrence_days.includes(isoDay));
    if (!matchesToday) {
      skipped += 1;
      continue;
    }

    // Idempotency: skip if a task already exists for this template + assignee
    // + today.
    const { data: existing } = await admin
      .from("tasks")
      .select("id")
      .eq("recurring_task_id", t.id)
      .eq("assigned_to", t.assigned_to)
      .eq("due_date", today)
      .maybeSingle();
    if (existing) {
      skipped += 1;
      continue;
    }

    const { error: insErr } = await admin.from("tasks").insert({
      title: t.title,
      description: t.description,
      assigned_to: t.assigned_to,
      assigned_by: t.assigned_by,
      branch_id: t.branch_id,
      department_id: t.department_id,
      due_date: today,
      due_time: t.due_time ?? null,
      priority: t.priority,
      status: "to_do",
      origin: "recurring",
      recurring_task_id: t.id,
      requires_approval: t.requires_approval,
    });
    if (insErr) {
      // Don't abort the whole batch on a single failure; surface a count.
      skipped += 1;
      continue;
    }

    await logAudit(admin, {
      actor_id: user.id,
      target_type: "recurring_task",
      target_id: t.id,
      action: "generate_task_instance",
      new_value: { due_date: today, assigned_to: t.assigned_to },
    });
    created += 1;
  }

  revalidatePath(PATH);
  revalidatePath("/tasks");
  revalidatePath("/admin/tasks");
  ok(`Generated ${created} task${created === 1 ? "" : "s"} for ${today} (skipped ${skipped}).`);
}
