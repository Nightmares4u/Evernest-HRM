// Read-side queries for tasks (one-off and recurring).
// Same pattern as lib/db/queries.ts: server-side, mock-fallback, throw on error.

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { todayPKT } from "@/lib/attendance/format";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  actorFromCurrentUser,
  canAssignTask,
  canRequestFrom,
  canSeeEmployee,
  isBranchManagerOrAboveRole,
  isGlobalAdminRole,
} from "@/lib/auth/permissions";
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
  assigner_email: string;
  branch_name: string | null;
  branch_code: string | null;
  department_name: string | null;
};

export type AssignableUser = {
  id: string; // app_users.id
  display_name: string;
  email: string;
  role: UserRole;
  employee_id: string | null; // null for system-only users (e.g. Sir Raza)
  branch_id: string | null;
  branch_code: string | null;
  department_name?: string | null;
};

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function visibleUserIdsForCurrentActor(): Promise<string[] | null> {
  const me = await getCurrentUser();
  if (!me) return [];
  const actor = actorFromCurrentUser(me);
  if (isGlobalAdminRole(actor.role)) return null;
  if (!isBranchManagerOrAboveRole(actor.role)) return [actor.id];
  if (!actor.branch_id) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("employees")
    .select("user_id")
    .eq("branch_id", actor.branch_id)
    .eq("employment_status", "active");
  return ((data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id);
}

const TASK_SELECT = `
  id, title, description, assigned_to, assigned_by,
  branch_id, department_id, due_date, due_time, priority, status,
  workflow_type, accepted_at, declined_at, declined_reason, origin,
  recurring_task_id, requires_approval, approved_by, approved_at,
  created_at, completed_at,
  assignee:app_users!tasks_assigned_to_fkey ( display_name, email, role ),
  assigner:app_users!tasks_assigned_by_fkey ( display_name, email ),
  branches ( name, code ),
  departments ( name )
`;

type TaskRowRaw = Task & {
  assignee:
    | { display_name: string; email: string; role: UserRole }
    | { display_name: string; email: string; role: UserRole }[]
    | null;
  assigner:
    | { display_name: string; email: string }
    | { display_name: string; email: string }[]
    | null;
  branches: { name: string; code: string } | { name: string; code: string }[] | null;
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
    workflow_type: row.workflow_type,
    accepted_at: row.accepted_at,
    declined_at: row.declined_at,
    declined_reason: row.declined_reason,
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
    assigner_email: assigner?.email ?? "",
    branch_name: branch?.name ?? null,
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

  if (userId) {
    const visible = await visibleUserIdsForCurrentActor();
    if (visible && !visible.includes(userId)) return [];
  }

  const supabase = userId ? createAdminClient() : await createClient();
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
 * Company-wide done tasks. Must only be called after the route/action verifies
 * the current user is a super_admin because this uses the service-role client.
 */
export async function listCompanyDoneTasks(
  sinceIso: string,
  untilIso: string
): Promise<TaskRowVM[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("status", "done")
    .not("completed_at", "is", null)
    .gte("completed_at", sinceIso)
    .lte("completed_at", untilIso)
    .order("completed_at", { ascending: false })
    .limit(5000);

  if (error) throw new Error(`listCompanyDoneTasks: ${error.message}`);
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

  const scopedUserIds = userId ? undefined : await visibleUserIdsForCurrentActor();
  if (scopedUserIds && scopedUserIds.length === 0) return [];

  if (userId) {
    const visible = await visibleUserIdsForCurrentActor();
    if (visible && !visible.includes(userId)) return [];
  }

  const supabase = createAdminClient();
  let query = supabase
    .from("tasks")
    .select(TASK_SELECT)
    .or("workflow_type.neq.request,accepted_at.not.is.null")
    .is("declined_at", null)
    .gte("due_date", startDate)
    .lte("due_date", endDate)
    .order("due_date", { ascending: true })
    .order("due_time", { ascending: true, nullsFirst: false });

  if (userId) query = query.eq("assigned_to", userId);
  else if (scopedUserIds) query = query.in("assigned_to", scopedUserIds);

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

  const all = ((data ?? []) as unknown as TaskRowRaw[])
    .map(rowToVM)
    .filter(
      (row) =>
        !(row.workflow_type === "request" && row.accepted_at === null) &&
        row.declined_at === null
    );

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

  const scopedUserIds = await visibleUserIdsForCurrentActor();
  if (scopedUserIds && scopedUserIds.length === 0) return [];

  const supabase = createAdminClient();
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
  if (scopedUserIds) query = query.in("assigned_to", scopedUserIds);

  const { data, error } = await query;
  if (error) throw new Error(`listTasksForAdmin: ${error.message}`);
  return ((data ?? []) as unknown as TaskRowRaw[]).map(rowToVM);
}

export async function listTasksForEmployeeAdmin(
  userId: string,
  limit = 200
): Promise<TaskRowVM[]> {
  if (!isSupabaseConfigured()) return [];

  const visible = await visibleUserIdsForCurrentActor();
  if (visible && !visible.includes(userId)) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("assigned_to", userId)
    .order("due_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listTasksForEmployeeAdmin: ${error.message}`);
  return ((data ?? []) as unknown as TaskRowRaw[]).map(rowToVM);
}

export type RequestRowVM = TaskRowVM & {
  requester_name: string;
  requester_email: string;
};

export async function listRequestsToMe(): Promise<RequestRowVM[]> {
  if (!isSupabaseConfigured()) return [];

  const me = await getCurrentUser();
  if (!me) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("assigned_to", me.authUserId)
    .eq("workflow_type", "request")
    .is("accepted_at", null)
    .is("declined_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`listRequestsToMe: ${error.message}`);

  return ((data ?? []) as unknown as TaskRowRaw[]).map((row) => {
    const vm = rowToVM(row);
    return {
      ...vm,
      requester_name: vm.assigner_name,
      requester_email: vm.assigner_email,
    };
  });
}

export async function listRequestsISent(): Promise<TaskRowVM[]> {
  if (!isSupabaseConfigured()) return [];

  const me = await getCurrentUser();
  if (!me) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("assigned_by", me.authUserId)
    .eq("workflow_type", "request")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`listRequestsISent: ${error.message}`);
  return ((data ?? []) as unknown as TaskRowRaw[]).map(rowToVM);
}

export async function listAssignableUsers(): Promise<AssignableUser[]> {
  if (!isSupabaseConfigured()) return [];

  const me = await getCurrentUser();
  if (!me) return [];
  const actor = actorFromCurrentUser(me);
  if (!isBranchManagerOrAboveRole(actor.role)) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("app_users")
    .select(
      `
      id, display_name, email, role,
      employees!app_users_id_fkey ( id, branch_id, branches ( code ) )
      `
    )
    .eq("is_active", true)
    .order("display_name");
  if (error) {
    // Fallback: select without the implicit FK alias if Postgres can't resolve it.
    if (!isGlobalAdminRole(actor.role)) return [];
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
      branch_id: null,
      branch_code: null,
    }));
  }

  type Row = {
    id: string;
    display_name: string;
    email: string;
    role: UserRole;
    employees:
      | { id: string; branch_id: string | null; branches: { code: string } | { code: string }[] | null }
      | { id: string; branch_id: string | null; branches: { code: string } | { code: string }[] | null }[]
      | null;
  };

  return ((data ?? []) as Row[])
    .filter((r) => {
      const emp = pickOne(r.employees);
      const target = emp
        ? {
            id: emp.id,
            user_id: r.id,
            branch_id: emp.branch_id,
            user_role: r.role,
          }
        : null;
      return canAssignTask(actor, target);
    })
    .map((r) => {
      const emp = pickOne(r.employees);
      const branch = emp ? pickOne(emp.branches) : null;
      return {
        id: r.id,
        display_name: r.display_name,
        email: r.email,
        role: r.role,
        employee_id: emp?.id ?? null,
        branch_id: emp?.branch_id ?? null,
        branch_code: branch?.code ?? null,
      };
    });
}

export async function listUsersICanRequestFrom(): Promise<AssignableUser[]> {
  if (!isSupabaseConfigured()) return [];

  const me = await getCurrentUser();
  if (!me) return [];
  const actor = actorFromCurrentUser(me);

  const supabase = createAdminClient();
  const [{ data: users, error: usersError }, { data: employees, error: employeesError }] =
    await Promise.all([
      supabase
        .from("app_users")
        .select("id, display_name, email, role, is_active")
        .eq("is_active", true)
        .order("display_name"),
      supabase
        .from("employees")
        .select("id, user_id, branch_id, branches ( code ), departments ( name )")
        .eq("employment_status", "active"),
    ]);

  if (usersError) {
    throw new Error(`listUsersICanRequestFrom: ${usersError.message}`);
  }
  if (employeesError) {
    throw new Error(`listUsersICanRequestFrom: ${employeesError.message}`);
  }

  type UserRow = {
    id: string;
    display_name: string;
    email: string;
    role: UserRole;
    is_active: boolean;
  };
  type EmployeeRow = {
    id: string;
    user_id: string;
    branch_id: string | null;
    branches: { code: string } | { code: string }[] | null;
    departments: { name: string } | { name: string }[] | null;
  };

  const employeeByUserId = new Map(
    ((employees ?? []) as EmployeeRow[]).map((employee) => [
      employee.user_id,
      employee,
    ])
  );

  return ((users ?? []) as UserRow[])
    .filter((user) => {
      const employee = employeeByUserId.get(user.id);
      return canRequestFrom(actor, {
        user_id: user.id,
        role: user.role,
        branch_id: employee?.branch_id ?? null,
        is_active: user.is_active,
        department_name: employee ? pickOne(employee.departments)?.name ?? null : null,
      });
    })
    .map((user) => {
      const employee = employeeByUserId.get(user.id);
      const branch = employee ? pickOne(employee.branches) : null;
      const department = employee ? pickOne(employee.departments) : null;
      return {
        id: user.id,
        display_name: user.display_name,
        email: user.email,
        role: user.role,
        employee_id: employee?.id ?? null,
        branch_id: employee?.branch_id ?? null,
        branch_code: branch?.code ?? null,
        department_name: department?.name ?? null,
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

  const scopedUserIds = await visibleUserIdsForCurrentActor();
  if (scopedUserIds && scopedUserIds.length === 0) return [];

  const supabase = createAdminClient();
  let query = supabase
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
  if (scopedUserIds) query = query.in("assigned_to", scopedUserIds);

  const { data, error } = await query;
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

  const me = await getCurrentUser();
  if (!me) return [];
  const actor = actorFromCurrentUser(me);
  const supabase = createAdminClient();
  let query = supabase
    .from("employee_overdue_tasks")
    .select("*")
    .eq("is_redlined", true);
  if (!isGlobalAdminRole(actor.role)) {
    if (!actor.branch_id || !isBranchManagerOrAboveRole(actor.role)) return [];
    query = query.eq("branch_id", actor.branch_id);
  }
  const { data, error } = await query;
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
