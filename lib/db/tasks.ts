// Read-side queries for tasks (one-off and recurring).
// Same pattern as lib/db/queries.ts: server-side, mock-fallback, throw on error.

import { createClient } from "@/lib/supabase/server";
import { todayPKT } from "@/lib/attendance/format";
import { isSupabaseConfigured } from "@/lib/db/queries";
import type {
  RecurringTask,
  Task,
  TaskPriority,
  TaskStatus,
  UserRole,
} from "@/lib/types/hrm";

export type TaskRowVM = Task & {
  assignee_name: string;
  assignee_email: string;
  assignee_role: UserRole;
  assigner_name: string;
  branch_code: string | null;
  department_name: string | null;
};

export type AssignableUser = {
  id: string; // app_users.id
  display_name: string;
  email: string;
  role: UserRole;
  employee_id: string | null; // null for system-only users (e.g. Sir Raza)
  branch_code: string | null;
};

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const TASK_SELECT = `
  id, title, description, assigned_to, assigned_by,
  branch_id, department_id, due_date, due_time, priority, status, origin,
  recurring_task_id, requires_approval, approved_by, approved_at,
  created_at, completed_at,
  assignee:app_users!tasks_assigned_to_fkey ( display_name, email, role ),
  assigner:app_users!tasks_assigned_by_fkey ( display_name ),
  branches ( code ),
  departments ( name )
`;

type TaskRowRaw = Task & {
  assignee:
    | { display_name: string; email: string; role: UserRole }
    | { display_name: string; email: string; role: UserRole }[]
    | null;
  assigner:
    | { display_name: string }
    | { display_name: string }[]
    | null;
  branches: { code: string } | { code: string }[] | null;
  departments: { name: string } | { name: string }[] | null;
};

function rowToVM(row: TaskRowRaw): TaskRowVM {
  const assignee = pickOne(row.assignee);
  const assigner = pickOne(row.assigner);
  const branch = pickOne(row.branches);
  const dept = pickOne(row.departments);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    assigned_to: row.assigned_to,
    assigned_by: row.assigned_by,
    branch_id: row.branch_id,
    department_id: row.department_id,
    due_date: row.due_date,
    due_time: row.due_time ?? null,
    priority: row.priority,
    status: row.status,
    origin: row.origin,
    recurring_task_id: row.recurring_task_id,
    requires_approval: row.requires_approval,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    created_at: row.created_at,
    completed_at: row.completed_at,
    assignee_name: assignee?.display_name ?? "?",
    assignee_email: assignee?.email ?? "",
    assignee_role: assignee?.role ?? "employee",
    assigner_name: assigner?.display_name ?? "?",
    branch_code: branch?.code ?? null,
    department_name: dept?.name ?? null,
  };
}

/**
 * Done tasks within a (since..until) timestamp range, ordered by completed_at desc.
 * Used by the history pages — employee (own) and admin (everyone).
 */
export async function listDoneTasks(
  sinceIso: string,
  untilIso: string,
  userId?: string
): Promise<TaskRowVM[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  let query = supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("status", "done")
    .gte("completed_at", sinceIso)
    .lte("completed_at", untilIso)
    .order("completed_at", { ascending: false })
    .limit(1000);

  if (userId) query = query.eq("assigned_to", userId);

  const { data, error } = await query;
  if (error) throw new Error(`listDoneTasks: ${error.message}`);
  return ((data ?? []) as unknown as TaskRowRaw[]).map(rowToVM);
}

/**
 * Tasks for a date range — used by the schedule grid.
 * If userId is provided, restricts to tasks assigned to that user.
 */
export async function listTasksInRange(
  startDate: string,
  endDate: string,
  userId?: string
): Promise<TaskRowVM[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  let query = supabase
    .from("tasks")
    .select(TASK_SELECT)
    .gte("due_date", startDate)
    .lte("due_date", endDate)
    .order("due_date", { ascending: true })
    .order("due_time", { ascending: true, nullsFirst: false });

  if (userId) query = query.eq("assigned_to", userId);

  const { data, error } = await query;
  if (error) throw new Error(`listTasksInRange: ${error.message}`);
  return ((data ?? []) as unknown as TaskRowRaw[]).map(rowToVM);
}

// ---------- employee-side ----------

export type MyTasksGrouped = {
  today: TaskRowVM[];
  upcoming: TaskRowVM[];
  overdue: TaskRowVM[];
  awaiting_approval: TaskRowVM[];
  recently_done: TaskRowVM[];
};

export async function listMyTasks(): Promise<MyTasksGrouped> {
  const empty: MyTasksGrouped = {
    today: [],
    upcoming: [],
    overdue: [],
    awaiting_approval: [],
    recently_done: [],
  };
  if (!isSupabaseConfigured()) return empty;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;

  const today = todayPKT();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("assigned_to", user.id)
    .order("due_date", { ascending: true })
    .limit(200);
  if (error) throw new Error(`listMyTasks: ${error.message}`);

  const all = ((data ?? []) as unknown as TaskRowRaw[]).map(rowToVM);

  for (const t of all) {
    if (t.status === "done") {
      empty.recently_done.push(t);
      continue;
    }
    if (t.requires_approval && t.status === "in_progress") {
      empty.awaiting_approval.push(t);
      continue;
    }
    if (t.due_date < today) empty.overdue.push(t);
    else if (t.due_date === today) empty.today.push(t);
    else empty.upcoming.push(t);
  }
  // recently_done: keep most recent 10
  empty.recently_done.sort((a, b) =>
    (b.completed_at ?? b.created_at).localeCompare(a.completed_at ?? a.created_at)
  );
  empty.recently_done = empty.recently_done.slice(0, 10);

  return empty;
}

// ---------- admin-side ----------

export type AdminTaskFilter = "open" | "pending_approval" | "overdue" | "all";

export async function listTasksForAdmin(
  filter: AdminTaskFilter = "open"
): Promise<TaskRowVM[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  let query = supabase
    .from("tasks")
    .select(TASK_SELECT)
    .order("due_date", { ascending: true })
    .limit(500);

  const today = todayPKT();
  if (filter === "open") {
    query = query.neq("status", "done");
  } else if (filter === "pending_approval") {
    query = query.eq("requires_approval", true).eq("status", "in_progress");
  } else if (filter === "overdue") {
    query = query.neq("status", "done").lt("due_date", today);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listTasksForAdmin: ${error.message}`);
  return ((data ?? []) as unknown as TaskRowRaw[]).map(rowToVM);
}

export async function listTasksForEmployeeAdmin(
  userId: string,
  limit = 200
): Promise<TaskRowVM[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("assigned_to", userId)
    .order("due_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listTasksForEmployeeAdmin: ${error.message}`);
  return ((data ?? []) as unknown as TaskRowRaw[]).map(rowToVM);
}

export async function listAssignableUsers(): Promise<AssignableUser[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_users")
    .select(
      `
      id, display_name, email, role,
      employees!app_users_id_fkey ( id, branches ( code ) )
      `
    )
    .eq("is_active", true)
    .order("display_name");
  if (error) {
    // Fallback: select without the implicit FK alias if Postgres can't resolve it.
    const fallback = await supabase
      .from("app_users")
      .select("id, display_name, email, role")
      .eq("is_active", true)
      .order("display_name");
    if (fallback.error) throw new Error(`listAssignableUsers: ${fallback.error.message}`);
    return ((fallback.data ?? []) as Array<{
      id: string;
      display_name: string;
      email: string;
      role: UserRole;
    }>).map((r) => ({
      id: r.id,
      display_name: r.display_name,
      email: r.email,
      role: r.role,
      employee_id: null,
      branch_code: null,
    }));
  }

  type Row = {
    id: string;
    display_name: string;
    email: string;
    role: UserRole;
    employees:
      | { id: string; branches: { code: string } | { code: string }[] | null }
      | { id: string; branches: { code: string } | { code: string }[] | null }[]
      | null;
  };

  return ((data ?? []) as Row[]).map((r) => {
    const emp = pickOne(r.employees);
    const branch = emp ? pickOne(emp.branches) : null;
    return {
      id: r.id,
      display_name: r.display_name,
      email: r.email,
      role: r.role,
      employee_id: emp?.id ?? null,
      branch_code: branch?.code ?? null,
    };
  });
}

// ---------- recurring tasks ----------

export type RecurringTaskRowVM = RecurringTask & {
  assignee_name: string;
  assignee_email: string;
};

export async function listRecurringTasks(): Promise<RecurringTaskRowVM[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recurring_tasks")
    .select(
      `
      id, title, description, assigned_to, assigned_by, branch_id, department_id,
      recurrence_type, recurrence_days, priority, requires_approval, active,
      due_time, created_at, updated_at,
      assignee:app_users!recurring_tasks_assigned_to_fkey ( display_name, email )
      `
    )
    .order("active", { ascending: false })
    .order("title");
  if (error) throw new Error(`listRecurringTasks: ${error.message}`);

  type Row = RecurringTask & {
    assignee:
      | { display_name: string; email: string }
      | { display_name: string; email: string }[]
      | null;
  };

  return ((data ?? []) as Row[]).map((r) => {
    const a = pickOne(r.assignee);
    return {
      ...(r as RecurringTask),
      assignee_name: a?.display_name ?? "?",
      assignee_email: a?.email ?? "",
    };
  });
}

// ---------- redline view ----------

export type RedlinedEmployee = {
  employee_id: string;
  user_id: string;
  full_name: string;
  branch_id: string | null;
  overdue_count: number;
};

export async function listRedlinedEmployees(): Promise<RedlinedEmployee[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_overdue_tasks")
    .select("*")
    .eq("is_redlined", true);
  if (error) {
    // The view returns 0 rows when no one is redlined; only real DB errors throw.
    throw new Error(`listRedlinedEmployees: ${error.message}`);
  }
  return ((data ?? []) as Array<{
    employee_id: string;
    user_id: string;
    full_name: string;
    branch_id: string | null;
    overdue_count: number;
  }>).map((r) => ({
    employee_id: r.employee_id,
    user_id: r.user_id,
    full_name: r.full_name,
    branch_id: r.branch_id,
    overdue_count: Number(r.overdue_count),
  }));
}

// ---------- helpers exposed to UI ----------

export const TASK_PRIORITIES: TaskPriority[] = ["low", "normal", "urgent"];
export const TASK_STATUSES: TaskStatus[] = ["to_do", "in_progress", "done", "blocked"];
