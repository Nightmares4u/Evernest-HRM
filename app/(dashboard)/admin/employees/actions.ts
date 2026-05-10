"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { todayPKT } from "@/lib/attendance/format";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/server";
import type { EmploymentStatus, UserRole } from "@/lib/types/hrm";

const USER_ROLES: UserRole[] = [
  "super_admin",
  "admin_hr",
  "branch_manager",
  "manager",
  "employee",
];

const EMPLOYMENT_STATUSES: EmploymentStatus[] = [
  "active",
  "inactive",
  "terminated",
];

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function requireSuperAdmin(errorPath: string) {
  const me = await getCurrentUser();
  if (!me) fail(errorPath, "Please sign in.");
  if (me.appUser.role !== "super_admin") {
    fail(errorPath, "Super-admin access required.");
  }
  return me;
}

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function readOptionalId(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return value || null;
}

function parseSalary(value: string): number | null {
  const salary = Number.parseFloat(value);
  if (!Number.isFinite(salary) || salary < 0) return null;
  return salary;
}

function parseRole(value: string): UserRole | null {
  return USER_ROLES.includes(value as UserRole) ? (value as UserRole) : null;
}

function parseEmploymentStatus(value: string): EmploymentStatus | null {
  return EMPLOYMENT_STATUSES.includes(value as EmploymentStatus)
    ? (value as EmploymentStatus)
    : null;
}

function currentYearMonth() {
  const today = todayPKT();
  return {
    year: Number.parseInt(today.slice(0, 4), 10),
    month: Number.parseInt(today.slice(5, 7), 10),
  };
}

export async function createEmployee(formData: FormData) {
  const errorPath = "/admin/employees/new";
  const me = await requireSuperAdmin(errorPath);
  const admin = createAdminClient();

  const fullName = readString(formData, "full_name");
  const email = readString(formData, "email").toLowerCase();
  const phone = readString(formData, "phone");
  const branchId = readOptionalId(formData, "branch_id");
  const departmentId = readOptionalId(formData, "department_id");
  const shiftId = readOptionalId(formData, "shift_id");
  const managerId = readOptionalId(formData, "manager_id");
  const roleDescription = readString(formData, "role_description");
  const role = parseRole(readString(formData, "role"));
  const employmentStatus = parseEmploymentStatus(readString(formData, "employment_status"));
  const salary = parseSalary(readString(formData, "monthly_salary"));
  const password = String(formData.get("initial_password") ?? "");
  const attendanceExempt = formData.get("attendance_exempt") === "on";
  const remoteAllowed = formData.get("remote_allowed") === "on";

  if (!fullName) fail(errorPath, "Full name is required.");
  if (!email || !email.includes("@")) fail(errorPath, "A valid email is required.");
  if (!branchId) fail(errorPath, "Branch is required.");
  if (!departmentId) fail(errorPath, "Department/category is required.");
  if (!shiftId) fail(errorPath, "Shift is required.");
  if (!role) fail(errorPath, "Role is required.");
  if (!employmentStatus) fail(errorPath, "Employment status is required.");
  if (salary === null) fail(errorPath, "Monthly salary must be zero or higher.");
  if (password.length < 8) {
    fail(errorPath, "Initial password must be at least 8 characters.");
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  const authUser = authData?.user;
  if (authError || !authUser) {
    fail(errorPath, `Could not create auth user: ${authError?.message ?? "unknown error"}`);
  }

  const rollbackAuthUser = async () => {
    await admin.auth.admin.deleteUser(authUser.id);
  };

  const { error: appUserError } = await admin.from("app_users").insert({
    id: authUser.id,
    display_name: fullName,
    email,
    role,
    is_active: employmentStatus === "active",
  });
  if (appUserError) {
    await rollbackAuthUser();
    fail(errorPath, `Could not create app user: ${appUserError.message}`);
  }

  const { data: employee, error: employeeError } = await admin
    .from("employees")
    .insert({
      user_id: authUser.id,
      full_name: fullName,
      phone: phone || null,
      branch_id: branchId,
      department_id: departmentId,
      manager_id: managerId,
      shift_id: shiftId,
      monthly_salary: salary,
      role_description: roleDescription || null,
      employment_status: employmentStatus,
      attendance_exempt: attendanceExempt,
      payroll_exempt: false,
      remote_allowed: remoteAllowed,
      remote_default_days: [],
      hire_date: todayPKT(),
    })
    .select("id")
    .single();
  if (employeeError || !employee) {
    await rollbackAuthUser();
    fail(errorPath, `Could not create employee profile: ${employeeError?.message ?? "unknown error"}`);
  }

  const { year, month } = currentYearMonth();
  const { error: leaveError } = await admin.from("leave_balances").upsert(
    {
      employee_id: employee.id,
      year,
      month,
      accrued: 1.0,
      used: 0.0,
      carry_forward_in: 0.0,
    },
    { onConflict: "employee_id,year,month" }
  );
  if (leaveError) {
    await rollbackAuthUser();
    fail(errorPath, `Could not initialise leave balance: ${leaveError.message}`);
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: me.authUserId,
    target_type: "employee",
    target_id: employee.id,
    action: "create_employee",
    old_value: null,
    new_value: {
      app_user_id: authUser.id,
      full_name: fullName,
      email,
      phone: phone || null,
      branch_id: branchId,
      department_id: departmentId,
      manager_id: managerId,
      shift_id: shiftId,
      monthly_salary: salary,
      role,
      role_description: roleDescription || null,
      employment_status: employmentStatus,
      attendance_exempt: attendanceExempt,
      remote_allowed: remoteAllowed,
      leave_balance_month: { year, month, accrued: 1.0 },
    },
    reason: "Employee onboarded by super-admin",
  });
  if (auditError) {
    await rollbackAuthUser();
    fail(errorPath, `Could not write audit log: ${auditError.message}`);
  }

  revalidatePath("/employees");
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  revalidatePath("/admin/payroll");
  revalidatePath(`/admin/employees/${employee.id}`);
  redirect(`/admin/employees/${employee.id}?ok=${encodeURIComponent("Employee created.")}`);
}

export async function updateEmployeeSalary(formData: FormData) {
  const employeeId = readString(formData, "employee_id");
  const errorPath = employeeId ? `/admin/employees/${employeeId}` : "/employees";
  const me = await requireSuperAdmin(errorPath);
  if (!employeeId) fail(errorPath, "Missing employee id.");

  const salary = parseSalary(readString(formData, "monthly_salary"));
  const reason = readString(formData, "reason");
  if (salary === null) fail(errorPath, "Monthly salary must be zero or higher.");
  if (!reason) fail(errorPath, "Salary update reason is required.");

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("employees")
    .select("id, full_name, monthly_salary")
    .eq("id", employeeId)
    .maybeSingle();
  if (fetchError || !existing) fail(errorPath, "Employee not found.");

  const { error: updateError } = await admin
    .from("employees")
    .update({ monthly_salary: salary, updated_at: new Date().toISOString() })
    .eq("id", employeeId);
  if (updateError) fail(errorPath, `Could not update salary: ${updateError.message}`);

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: me.authUserId,
    target_type: "employee",
    target_id: employeeId,
    action: "update_employee_salary",
    old_value: { monthly_salary: existing.monthly_salary },
    new_value: { monthly_salary: salary },
    reason,
  });
  if (auditError) fail(errorPath, `Salary updated, but audit log failed: ${auditError.message}`);

  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/employees");
  revalidatePath("/admin");
  revalidatePath("/admin/payroll");
  revalidatePath("/dashboard");
  redirect(`/admin/employees/${employeeId}?ok=${encodeURIComponent("Salary updated.")}`);
}
