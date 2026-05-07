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

import { createClient } from "@/lib/supabase/server";
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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select(
      `
      id, user_id, full_name, phone,
      branch_id, department_id, manager_id, shift_id,
      monthly_salary, role_description, employment_status,
      attendance_exempt, payroll_exempt, remote_allowed, remote_default_days,
      hire_date, termination_date, created_at, updated_at,
      app_users:user_id ( email, role ),
      branches ( name, code ),
      departments ( name ),
      shifts ( name )
      `
    )
    .eq("employment_status", "active")
    .order("full_name");

  if (error) throw new Error(`listEmployees: ${error.message}`);

  type Row = {
    id: string;
    user_id: string;
    full_name: string;
    phone: string | null;
    branch_id: string | null;
    department_id: string | null;
    manager_id: string | null;
    shift_id: string | null;
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

  return ((data ?? []) as Row[]).map((row) => {
    const appUser = pickOne(row.app_users);
    const branch = pickOne(row.branches);
    const dept = pickOne(row.departments);
    const shift = pickOne(row.shifts);
    return {
      id: row.id,
      user_id: row.user_id,
      full_name: row.full_name,
      phone: row.phone,
      branch_id: row.branch_id,
      department_id: row.department_id,
      manager_id: row.manager_id,
      shift_id: row.shift_id,
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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_records")
    .select(
      `
      *,
      employees!inner ( full_name, branches ( code ) )
      `
    )
    .eq("date", targetDate);

  if (error) throw new Error(`listTodayAttendance: ${error.message}`);

  type Row = AttendanceRecord & {
    employees:
      | {
          full_name: string;
          branches: { code: string } | { code: string }[] | null;
        }
      | {
          full_name: string;
          branches: { code: string } | { code: string }[] | null;
        }[]
      | null;
  };

  return ((data ?? []) as Row[]).map((row) => {
    const emp = pickOne(row.employees);
    const branch = emp ? pickOne(emp.branches) : null;
    return {
      ...row,
      employee_full_name: emp?.full_name ?? "?",
      branch_code: branch?.code ?? null,
    };
  });
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

  const supabase = await createClient();
  let query = supabase
    .from("leave_requests")
    .select(
      `
      id, start_date, end_date, days_count, reason, status,
      review_note, reviewed_at, created_at, employee_id,
      employees!inner ( full_name, branches ( code ) )
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
          full_name: string;
          branches: { code: string } | { code: string }[] | null;
        }
      | {
          full_name: string;
          branches: { code: string } | { code: string }[] | null;
        }[]
      | null;
  };

  return ((data ?? []) as Row[]).map((r) => {
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
