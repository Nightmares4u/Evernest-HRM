import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron/auth";
import { isIsoDate, isoWeekday } from "@/lib/cron/utils";
import { todayPKT } from "@/lib/attendance/format";
import { createAdminClient } from "@/lib/supabase/server";
import type { RecurrenceType } from "@/lib/types/hrm";

export const dynamic = "force-dynamic";

type RecurringTemplate = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  assigned_by: string;
  branch_id: string | null;
  department_id: string | null;
  recurrence_type: RecurrenceType;
  recurrence_days: number[] | null;
  priority: string;
  requires_approval: boolean;
  active: boolean;
  due_time: string | null;
};

function templateRunsOnDate(template: RecurringTemplate, date: string): boolean {
  const weekday = isoWeekday(date);
  if (weekday === 7) return false;
  if (template.recurrence_type === "daily") return true;
  if (template.recurrence_type === "weekly") {
    return (template.recurrence_days ?? []).includes(weekday);
  }
  if (template.recurrence_type === "monthly") {
    const dayOfMonth = Number.parseInt(date.slice(8, 10), 10);
    return (template.recurrence_days ?? []).includes(dayOfMonth);
  }
  return false;
}

export async function POST(request: Request) {
  return handle(request);
}

// Vercel scheduled cron triggers send GET. Same handler, same auth check.
export async function GET(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  const unauthorized = authorizeCronRequest(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const targetDate = url.searchParams.get("date") ?? todayPKT();
  if (!isIsoDate(targetDate)) {
    return NextResponse.json(
      { ok: false, error: "date must be YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const summary = {
    ok: true,
    date: targetDate,
    templates_checked: 0,
    tasks_created: 0,
    already_existing: 0,
    skipped_inactive: 0,
    errors: [] as string[],
  };

  const admin = createAdminClient();
  const { data: templates, error: templateError } = await admin
    .from("recurring_tasks")
    .select(
      `
      id, title, description, assigned_to, assigned_by, branch_id, department_id,
      recurrence_type, recurrence_days, priority, requires_approval, active,
      due_time
      `
    );

  if (templateError) {
    return NextResponse.json(
      { ok: false, error: `Could not load recurring tasks: ${templateError.message}` },
      { status: 500 }
    );
  }

  for (const template of (templates ?? []) as unknown as RecurringTemplate[]) {
    summary.templates_checked += 1;

    if (!template.active) {
      summary.skipped_inactive += 1;
      continue;
    }
    if (!templateRunsOnDate(template, targetDate)) {
      continue;
    }

    const { data: existing, error: existingError } = await admin
      .from("tasks")
      .select("id")
      .eq("recurring_task_id", template.id)
      .eq("assigned_to", template.assigned_to)
      .eq("due_date", targetDate)
      .limit(1);
    if (existingError) {
      summary.errors.push(`template ${template.id}: ${existingError.message}`);
      continue;
    }
    if ((existing ?? []).length > 0) {
      summary.already_existing += 1;
      continue;
    }

    const { data: task, error: insertError } = await admin
      .from("tasks")
      .insert({
        title: template.title,
        description: template.description,
        assigned_to: template.assigned_to,
        assigned_by: template.assigned_by,
        branch_id: template.branch_id,
        department_id: template.department_id,
        due_date: targetDate,
        due_time: template.due_time ?? null,
        priority: template.priority,
        status: "to_do",
        workflow_type: "assigned",
        accepted_at: new Date().toISOString(),
        origin: "recurring",
        recurring_task_id: template.id,
        requires_approval: template.requires_approval,
      })
      .select("id")
      .single();

    if (insertError || !task) {
      summary.errors.push(
        `template ${template.id}: ${insertError?.message ?? "insert failed"}`
      );
      continue;
    }

    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: null,
      target_type: "task",
      target_id: task.id,
      action: "cron_generate_recurring_task",
      old_value: null,
      new_value: {
        recurring_task_id: template.id,
        due_date: targetDate,
        assigned_to: template.assigned_to,
      },
      reason: "Daily cron generated recurring task instance",
    });
    if (auditError) {
      summary.errors.push(`audit ${task.id}: ${auditError.message}`);
    }
    summary.tasks_created += 1;
  }

  revalidatePath("/tasks");
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/tasks/recurring");
  revalidatePath("/calendar");

  return NextResponse.json(summary);
}
