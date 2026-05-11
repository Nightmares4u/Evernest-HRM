// Read-side data access. All functions:
//   - run server-side (use createClient() — request-cookie-bound; RLS applies).
//   - fall back to mock data when Supabase env is missing (dev shell mode).
//   - throw with a clear message on Supabase errors so Next.js renders the
//     standard error boundary rather than silently showing wrong data.
//
// Conventions:
//   - numeric columns (e.g. monthly_salary) are normalised to JS number.
//   - join results that PostgREST may surface as either object or array are
//     normalised to a single object.

import { getCurrentUser } from "@/lib/auth/current-user";
import {
  actorFromCurrentUser,
  canSeeEmployee,
  canViewPersonalPayrollDetails,
  isBranchManagerOrAboveRole,
  isGlobalAdminRole,
} from "@/lib/auth/permissions";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  MOCK_BRANCHES,
  MOCK_DEPARTMENTS,
  MOCK_EMPLOYEES,
  MOCK_SHIFTS,
  makeMockTodayAttendance,
} from "@/lib/mock/hrm";
import { todayPKT } from "@/lib/attendance/format";
import type {
  AttendanceRecord,
  Branch,
  Department,
  EmployeeWithJoins,
  Shift,
} from "@/lib/types/hrm";

export type AttendanceRowVM = AttendanceRecord & {
  employee_full_name: string;
  branch_code: string | null;
};

export type EmployeeProfileVM = EmployeeWithJoins & {
  user_id: string;
  manager_name: string | null;
  manager_email: string | null;
};

export type AttendanceAuditNote = {
  target_id: string;
  reason: string | null;
  created_at: string;
  actor_name: string | null;
};

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toNum(v: unknown, fallback = 0): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

// ---------- employees ----------

export async function listEmployees(): Promise<EmployeeWithJoins[]> {
  if (!isSupabaseConfigured()) return MOCK_EMPLOYEES;

  const me = await getCurrentUser();
  if (!me) return [];

  const actor = actorFromCurrentUser(me);
  const supabase = createAdminClient();
  const includePersonalPayroll = actor.role === "super_admin";
  const selectColumns: string = `
    id, user_id, full_name, phone, contact_email,
    ${includePersonalPayroll ? "first_name, middle_name, last_name, contact_number, cnic, emergency_contact_number, bank_name, bank_branch_name, bank_account_or_iban," : ""}
    branch_id, department_id, manager_id, shift_id,
    custom_shift_enabled, custom_shift_start, custom_shift_end,
    monthly_salary, role_description, employment_status,
    attendance_exempt, payroll_exempt, remote_allowed, remote_default_days,
    hire_date, termination_date, created_at, updated_at,
    app_users:user_id ( email, role ),
    branches ( name, code ),
    departments ( name ),
    shifts ( name )
  `;
  let query = supabase
    .from("employees")
    .select(selectColumns)
    .eq("employment_status", "active")
    .order("full_name");

  if (!isGlobalAdminRole(actor.role)) {
    if (isBranchManagerOrAboveRole(actor.role)) {
      if (!actor.branch_id) return [];
      query = query.eq("branch_id", actor.branch_id);
    } else {
      query = query.eq("user_id", actor.id);
    }
  }

  const { data, error } = await query;

  if (error) throw new Error(`listEmployees: ${error.message}`);

  type Row = {
    id: string;
    user_id: string;
    full_name: string;
    phone: string | null;
    contact_email: string | null;
    first_name?: string | null;
    middle_name?: string | null;
    last_name?: string | null;
    contact_number?: string | null;
    cnic?: string | null;
    emergency_contact_number?: string | null;
    bank_name?: string | null;
    bank_branch_name?: string | null;
    bank_account_or_iban?: string | null;
    branch_id: string | null;
    department_id: string | null;
    manager_id: string | null;
    shift_id: string | null;
    custom_shift_enabled: boolean;
    custom_shift_start: string | null;
    custom_shift_end: string | null;
    monthly_salary: number | string;
    role_description: string | null;
    employment_status: EmployeeWithJoins["employment_status"];
    attendance_exempt: boolean;
    payroll_exempt: boolean;
    remote_allowed: boolean;
    remote_default_days: number[] | null;
    hire_date: string;
    termination_date: string | null;
    created_at: string;
    updated_at: string;
    app_users: { email: string; role: EmployeeWithJoins["user_role"] } | { email: string; role: EmployeeWithJoins["user_role"] }[] | null;
    branches: { name: string; code: string } | { name: string; code: string }[] | null;
    departments: { name: string } | { name: string }[] | null;
    shifts: { name: string } | { name: string }[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => {
    const appUser = pickOne(row.app_users);
    const branch = pickOne(row.branches);
    const dept = pickOne(row.departments);
    const shift = pickOne(row.shifts);
    return {
      id: row.id,
      user_id: row.user_id,
      full_name: row.full_name,
      phone: row.phone,
      contact_email: includePersonalPayroll ? row.contact_email : null,
      first_name: includePersonalPayroll ? row.first_name ?? null : null,
      middle_name: includePersonalPayroll ? row.middle_name ?? null : null,
      last_name: includePersonalPayroll ? row.last_name ?? null : null,
      contact_number: includePersonalPayroll ? row.contact_number ?? null : null,
      cnic: includePersonalPayroll ? row.cnic ?? null : null,
      emergency_contact_number: includePersonalPayroll
        ? row.emergency_contact_number ?? null
        : null,
      bank_name: includePersonalPayroll ? row.bank_name ?? null : null,
      bank_branch_name: includePersonalPayroll ? row.bank_branch_name ?? null : null,
      bank_account_or_iban: includePersonalPayroll
        ? row.bank_account_or_iban ?? null
        : null,
      branch_id: row.branch_id,
      department_id: row.department_id,
      manager_id: row.manager_id,
      shift_id: row.shift_id,
      custom_shift_enabled: row.custom_shift_enabled,
      custom_shift_start: row.custom_shift_start,
      custom_shift_end: row.custom_shift_end,
      monthly_salary: toNum(row.monthly_salary),
      role_description: row.role_description,
      employment_status: row.employment_status,
      attendance_exempt: row.attendance_exempt,
      payroll_exempt: row.payroll_exempt,
      remote_allowed: row.remote_allowed,
      remote_default_days: row.remote_default_days ?? [],
      hire_date: row.hire_date,
      termination_date: row.termination_date,
      created_at: row.created_at,
      updated_at: row.updated_at,
      branch_name: branch?.name ?? null,
      branch_code: branch?.code ?? null,
      department_name: dept?.name ?? null,
      shift_name: shift?.name ?? null,
      email: appUser?.email ?? "",
      user_role: appUser?.role ?? "employee",
    } satisfies EmployeeWithJoins;
  });
}

export async function getEmployeeProfile(
  employeeId: string
): Promise<EmployeeProfileVM | null> {
  if (!isSupabaseConfigured()) {
    const emp = MOCK_EMPLOYEES.find((e) => e.id === employeeId);
    return emp ? { ...emp, manager_name: null, manager_email: null } : null;
  }

  const me = await getCurrentUser();
  if (!me) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("employees")
    .select(
      `
      id, user_id, full_name, phone, contact_email,
      first_name, middle_name, last_name, contact_number, cnic,
      emergency_contact_number, bank_name, bank_branch_name, bank_account_or_iban,
      branch_id, department_id, manager_id, shift_id,
      custom_shift_enabled, custom_shift_start, custom_shift_end,
      monthly_salary, role_description, employment_status,
      attendance_exempt, payroll_exempt, remote_allowed, remote_default_days,
      hire_date, termination_date, created_at, updated_at,
      app_users:user_id ( email, role ),
      branches ( name, code ),
      departments ( name ),
      shifts ( name ),
      manager:manager_id ( full_name, app_users:user_id ( email ) )
      `
    )
    .eq("id", employeeId)
    .maybeSingle();

  if (error) throw new Error(`getEmployeeProfile: ${error.message}`);
  if (!data) return null;

  type Row = {
    id: string;
    user_id: string;
    full_name: string;
    phone: string | null;
    contact_email: string | null;
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
    contact_number: string | null;
    cnic: string | null;
    emergency_contact_number: string | null;
    bank_name: string | null;
    bank_branch_name: string | null;
    bank_account_or_iban: string | null;
    branch_id: string | null;
    department_id: string | null;
    manager_id: string | null;
    shift_id: string | null;
    custom_shift_enabled: boolean;
    custom_shift_start: string | null;
    custom_shift_end: string | null;
    monthly_salary: number | string;
    role_description: string | null;
    employment_status: EmployeeWithJoins["employment_status"];
    attendance_exempt: boolean;
    payroll_exempt: boolean;
    remote_allowed: boolean;
    remote_default_days: number[] | null;
    hire_date: string;
    termination_date: string | null;
    created_at: string;
    updated_at: string;
    app_users:
      | { email: string; role: EmployeeWithJoins["user_role"] }
      | { email: string; role: EmployeeWithJoins["user_role"] }[]
      | null;
    branches: { name: string; code: string } | { name: string; code: string }[] | null;
    departments: { name: string } | { name: string }[] | null;
    shifts: { name: string } | { name: string }[] | null;
    manager:
      | { full_name: string; app_users: { email: string } | { email: string }[] | null }
      | { full_name: string; app_users: { email: string } | { email: string }[] | null }[]
      | null;
  };

  const row = data as unknown as Row;
  const appUser = pickOne(row.app_users);
  const branch = pickOne(row.branches);
  const dept = pickOne(row.departments);
  const shift = pickOne(row.shifts);
  const manager = pickOne(row.manager);
  const managerUser = manager ? pickOne(manager.app_users) : null;
  const userRole = appUser?.role ?? "employee";

  const actor = actorFromCurrentUser(me);
  const canViewPersonalPayroll = canViewPersonalPayrollDetails(actor, {
    id: row.id,
    user_id: row.user_id,
    branch_id: row.branch_id,
    user_role: userRole,
  });
  if (
    !canSeeEmployee(actor, {
      id: row.id,
      user_id: row.user_id,
      branch_id: row.branch_id,
      user_role: userRole,
    })
  ) {
    return null;
  }

  return {
    id: row.id,
    user_id: row.user_id,
    full_name: row.full_name,
    phone: row.phone,
    contact_email: canViewPersonalPayroll ? row.contact_email : null,
    first_name: canViewPersonalPayroll ? row.first_name : null,
    middle_name: canViewPersonalPayroll ? row.middle_name : null,
    last_name: canViewPersonalPayroll ? row.last_name : null,
    contact_number: canViewPersonalPayroll ? row.contact_number : null,
    cnic: canViewPersonalPayroll ? row.cnic : null,
    emergency_contact_number: canViewPersonalPayroll
      ? row.emergency_contact_number
      : null,
    bank_name: canViewPersonalPayroll ? row.bank_name : null,
    bank_branch_name: canViewPersonalPayroll ? row.bank_branch_name : null,
    bank_account_or_iban: canViewPersonalPayroll
      ? row.bank_account_or_iban
      : null,
    branch_id: row.branch_id,
    department_id: row.department_id,
    manager_id: row.manager_id,
    shift_id: row.shift_id,
    custom_shift_enabled: row.custom_shift_enabled,
    custom_shift_start: row.custom_shift_start,
    custom_shift_end: row.custom_shift_end,
    monthly_salary: toNum(row.monthly_salary),
    role_description: row.role_description,
    employment_status: row.employment_status,
    attendance_exempt: row.attendance_exempt,
    payroll_exempt: row.payroll_exempt,
    remote_allowed: row.remote_allowed,
    remote_default_days: row.remote_default_days ?? [],
    hire_date: row.hire_date,
    termination_date: row.termination_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
    branch_name: branch?.name ?? null,
    branch_code: branch?.code ?? null,
    department_name: dept?.name ?? null,
    shift_name: shift?.name ?? null,
    email: appUser?.email ?? "",
    user_role: userRole,
    manager_name: manager?.full_name ?? null,
    manager_email: managerUser?.email ?? null,
  };
}

// ---------- attendance: my own ----------

export type MyTodayAttendance = AttendanceRecord & {
  expected_start_pkt: string;
  expected_end_pkt: string;
};

export async function getMyTodayAttendance(): Promise<MyTodayAttendance | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: empRow } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!empRow) return null;

  const today = todayPKT();
  const { data, error } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("employee_id", empRow.id)
    .eq("date", today)
    .maybeSingle();
  if (error) throw new Error(`getMyTodayAttendance: ${error.message}`);
  if (!data) return null;

  return {
    ...(data as AttendanceRecord),
    expected_start_pkt: data.expected_start,
    expected_end_pkt: data.expected_end,
  };
}

// ---------- attendance: today panel ----------

export async function listTodayAttendance(
  date?: string
): Promise<AttendanceRowVM[]> {
  if (!isSupabaseConfigured()) return makeMockTodayAttendance();

  const targetDate = date ?? todayPKT();
  const me = await getCurrentUser();
  if (!me) return [];
  const actor = actorFromCurrentUser(me);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("attendance_records")
    .select(
      `
      *,
      employees!inner ( id, user_id, branch_id, full_name, app_users:user_id ( role ), branches ( code ) )
      `
    )
    .eq("date", targetDate);

  if (error) throw new Error(`listTodayAttendance: ${error.message}`);

  type Row = AttendanceRecord & {
    employees:
      | {
          id: string;
          user_id: string;
          branch_id: string | null;
          full_name: string;
          app_users: { role: EmployeeWithJoins["user_role"] } | { role: EmployeeWithJoins["user_role"] }[] | null;
          branches: { code: string } | { code: string }[] | null;
        }
      | {
          id: string;
          user_id: string;
          branch_id: string | null;
          full_name: string;
          app_users: { role: EmployeeWithJoins["user_role"] } | { role: EmployeeWithJoins["user_role"] }[] | null;
          branches: { code: string } | { code: string }[] | null;
        }[]
      | null;
  };

  return ((data ?? []) as Row[])
    .filter((row) => {
      const emp = pickOne(row.employees);
      const appUser = emp ? pickOne(emp.app_users) : null;
      if (!emp) return false;
      return canSeeEmployee(actor, {
        id: emp.id,
        user_id: emp.user_id,
        branch_id: emp.branch_id,
        user_role: appUser?.role ?? "employee",
      });
    })
    .map((row) => {
      const emp = pickOne(row.employees);
      const branch = emp ? pickOne(emp.branches) : null;
      return {
        ...row,
        employee_full_name: emp?.full_name ?? "?",
        branch_code: branch?.code ?? null,
      };
    });
}

export async function listEmployeeAttendanceRange(
  employeeId: string,
  startDate: string,
  endDate: string
): Promise<AttendanceRecord[]> {
  if (!isSupabaseConfigured()) {
    return makeMockTodayAttendance().filter((r) => r.employee_id === employeeId);
  }

  const profile = await getEmployeeProfile(employeeId);
  if (!profile) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("employee_id", employeeId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });
  if (error) throw new Error(`listEmployeeAttendanceRange: ${error.message}`);
  return (data ?? []) as AttendanceRecord[];
}

export async function listAttendanceOverrideNotes(
  recordIds: string[]
): Promise<AttendanceAuditNote[]> {
  if (!isSupabaseConfigured() || recordIds.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select(
      `
      target_id, reason, created_at,
      app_users:actor_id ( display_name )
      `
    )
    .eq("target_type", "attendance_record")
    .eq("action", "override_attendance")
    .in("target_id", recordIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listAttendanceOverrideNotes: ${error.message}`);

  type Row = {
    target_id: string;
    reason: string | null;
    created_at: string;
    app_users:
      | { display_name: string }
      | { display_name: string }[]
      | null;
  };

  return ((data ?? []) as Row[]).map((r) => ({
    target_id: r.target_id,
    reason: r.reason,
    created_at: r.created_at,
    actor_name: pickOne(r.app_users)?.display_name ?? null,
  }));
}

// ---------- leave ----------

export type LeaveBalanceVM = {
  year: number;
  month: number;
  accrued: number;
  used: number;
  carry_forward_in: number;
  balance: number;
};

export async function getMyLeaveBalanceThisMonth(): Promise<LeaveBalanceVM | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: empRow } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!empRow) return null;

  const today = todayPKT();
  const [y, m] = today.split("-").map((p) => Number.parseInt(p, 10));

  const { data, error } = await supabase
    .from("leave_balances")
    .select("year, month, accrued, used, carry_forward_in, balance")
    .eq("employee_id", empRow.id)
    .eq("year", y)
    .eq("month", m)
    .maybeSingle();
  if (error) throw new Error(`getMyLeaveBalanceThisMonth: ${error.message}`);

  if (!data) {
    return {
      year: y,
      month: m,
      accrued: 0,
      used: 0,
      carry_forward_in: 0,
      balance: 0,
    };
  }
  return {
    year: data.year,
    month: data.month,
    accrued: toNum(data.accrued),
    used: toNum(data.used),
    carry_forward_in: toNum(data.carry_forward_in),
    balance: toNum(data.balance),
  };
}

export async function getEmployeeLeaveBalanceThisMonth(
  employeeId: string
): Promise<LeaveBalanceVM | null> {
  if (!isSupabaseConfigured()) return null;

  const profile = await getEmployeeProfile(employeeId);
  if (!profile) return null;

  const today = todayPKT();
  const [y, m] = today.split("-").map((p) => Number.parseInt(p, 10));
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("leave_balances")
    .select("year, month, accrued, used, carry_forward_in, balance")
    .eq("employee_id", employeeId)
    .eq("year", y)
    .eq("month", m)
    .maybeSingle();
  if (error) throw new Error(`getEmployeeLeaveBalanceThisMonth: ${error.message}`);
  if (!data) return null;
  return {
    year: data.year,
    month: data.month,
    accrued: toNum(data.accrued),
    used: toNum(data.used),
    carry_forward_in: toNum(data.carry_forward_in),
    balance: toNum(data.balance),
  };
}

export type MyLeaveRequestRow = {
  id: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export async function listMyLeaveRequests(): Promise<MyLeaveRequestRow[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: empRow } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!empRow) return [];

  const { data, error } = await supabase
    .from("leave_requests")
    .select("id, start_date, end_date, days_count, reason, status, review_note, reviewed_at, created_at")
    .eq("employee_id", empRow.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(`listMyLeaveRequests: ${error.message}`);
  return ((data ?? []) as MyLeaveRequestRow[]).map((r) => ({
    ...r,
    days_count: toNum(r.days_count),
  }));
}

export type LeaveRequestAdminRow = MyLeaveRequestRow & {
  employee_id: string;
  employee_full_name: string;
  branch_code: string | null;
};

export async function listLeaveRequestsForAdmin(
  filter: "pending" | "all" = "pending"
): Promise<LeaveRequestAdminRow[]> {
  if (!isSupabaseConfigured()) return [];

  const me = await getCurrentUser();
  if (!me) return [];
  const actor = actorFromCurrentUser(me);
  if (!isBranchManagerOrAboveRole(actor.role)) return [];

  const supabase = createAdminClient();
  let query = supabase
    .from("leave_requests")
    .select(
      `
      id, start_date, end_date, days_count, reason, status,
      review_note, reviewed_at, created_at, employee_id,
      employees!inner ( id, user_id, branch_id, full_name, app_users:user_id ( role ), branches ( code ) )
      `
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (filter === "pending") query = query.eq("status", "pending");

  const { data, error } = await query;
  if (error) throw new Error(`listLeaveRequestsForAdmin: ${error.message}`);

  type Row = MyLeaveRequestRow & {
    employee_id: string;
    employees:
      | {
          id: string;
          user_id: string;
          branch_id: string | null;
          full_name: string;
          app_users:
            | { role: EmployeeWithJoins["user_role"] }
            | { role: EmployeeWithJoins["user_role"] }[]
            | null;
          branches: { code: string } | { code: string }[] | null;
        }
      | {
          id: string;
          user_id: string;
          branch_id: string | null;
          full_name: string;
          app_users:
            | { role: EmployeeWithJoins["user_role"] }
            | { role: EmployeeWithJoins["user_role"] }[]
            | null;
          branches: { code: string } | { code: string }[] | null;
        }[]
      | null;
  };

  return ((data ?? []) as Row[])
    .filter((r) => {
      const emp = pickOne(r.employees);
      const appUser = emp ? pickOne(emp.app_users) : null;
      if (!emp) return false;
      return canSeeEmployee(actor, {
        id: emp.id,
        user_id: emp.user_id,
        branch_id: emp.branch_id,
        user_role: appUser?.role ?? "employee",
      });
    })
    .map((r) => {
      const emp = pickOne(r.employees);
      const branch = emp ? pickOne(emp.branches) : null;
      return {
        id: r.id,
        employee_id: r.employee_id,
        start_date: r.start_date,
        end_date: r.end_date,
        days_count: toNum(r.days_count),
        reason: r.reason,
        status: r.status,
        review_note: r.review_note,
        reviewed_at: r.reviewed_at,
        created_at: r.created_at,
        employee_full_name: emp?.full_name ?? "?",
        branch_code: branch?.code ?? null,
      } satisfies LeaveRequestAdminRow;
    });
}

// ---------- admin counters ----------

export type AdminPendingCounts = {
  pending_leave: number;
  pending_task_approvals: number;
  active_recurring: number;
  // today's attendance coverage among non-exempt active employees
  tracked_total: number;
  checked_in_today: number;
  redlined: number;
};

export async function getAdminPendingCounts(): Promise<AdminPendingCounts> {
  const empty: AdminPendingCounts = {
    pending_leave: 0,
    pending_task_approvals: 0,
    active_recurring: 0,
    tracked_total: 0,
    checked_in_today: 0,
    redlined: 0,
  };
  if (!isSupabaseConfigured()) return empty;

  const me = await getCurrentUser();
  if (!me) return empty;
  const actor = actorFromCurrentUser(me);
  if (!isBranchManagerOrAboveRole(actor.role)) return empty;

  const supabase = createAdminClient();
  const today = todayPKT();

  if (!isGlobalAdminRole(actor.role)) {
    const employees = await listEmployees();
    const employeeIds = employees.map((employee) => employee.id);
    const userIds = employees.map((employee) => employee.user_id);
    if (employeeIds.length === 0) return empty;

    const [pendingLeave, pendingApprovals, activeRecurring, checkedIn, redlined] =
      await Promise.all([
        supabase
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .in("employee_id", employeeIds),
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("requires_approval", true)
          .eq("status", "in_progress")
          .in("assigned_to", userIds),
        supabase
          .from("recurring_tasks")
          .select("id", { count: "exact", head: true })
          .eq("active", true)
          .in("assigned_to", userIds),
        supabase
          .from("attendance_records")
          .select("id", { count: "exact", head: true })
          .eq("date", today)
          .not("check_in_at", "is", null)
          .in("employee_id", employeeIds),
        supabase
          .from("employee_overdue_tasks")
          .select("employee_id", { count: "exact", head: true })
          .eq("is_redlined", true)
          .in("employee_id", employeeIds),
      ]);

    return {
      pending_leave: pendingLeave.count ?? 0,
      pending_task_approvals: pendingApprovals.count ?? 0,
      active_recurring: activeRecurring.count ?? 0,
      tracked_total: employees.filter((employee) => !employee.attendance_exempt).length,
      checked_in_today: checkedIn.count ?? 0,
      redlined: redlined.count ?? 0,
    };
  }

  const [pendingLeave, pendingApprovals, activeRecurring, tracked, checkedIn, redlined] =
    await Promise.all([
      supabase
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("requires_approval", true)
        .eq("status", "in_progress"),
      supabase
        .from("recurring_tasks")
        .select("id", { count: "exact", head: true })
        .eq("active", true),
      supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("employment_status", "active")
        .eq("attendance_exempt", false),
      supabase
        .from("attendance_records")
        .select("id", { count: "exact", head: true })
        .eq("date", today)
        .not("check_in_at", "is", null),
      supabase
        .from("employee_overdue_tasks")
        .select("employee_id", { count: "exact", head: true })
        .eq("is_redlined", true),
    ]);

  return {
    pending_leave: pendingLeave.count ?? 0,
    pending_task_approvals: pendingApprovals.count ?? 0,
    active_recurring: activeRecurring.count ?? 0,
    tracked_total: tracked.count ?? 0,
    checked_in_today: checkedIn.count ?? 0,
    redlined: redlined.count ?? 0,
  };
}

// ---------- taxonomy ----------

export async function listBranches(): Promise<Branch[]> {
  if (!isSupabaseConfigured()) return MOCK_BRANCHES;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branches")
    .select("*")
    .order("name");
  if (error) throw new Error(`listBranches: ${error.message}`);
  return (data ?? []) as Branch[];
}

export async function listDepartments(): Promise<Department[]> {
  if (!isSupabaseConfigured()) return MOCK_DEPARTMENTS;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .select("*")
    .order("name");
  if (error) throw new Error(`listDepartments: ${error.message}`);
  return (data ?? []) as Department[];
}

export async function listShifts(): Promise<Shift[]> {
  if (!isSupabaseConfigured()) return MOCK_SHIFTS;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shifts")
    .select("*")
    .order("start_time");
  if (error) throw new Error(`listShifts: ${error.message}`);
  return (data ?? []) as Shift[];
}
