"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { todayPKT } from "@/lib/attendance/format";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  actorFromCurrentUser,
  canEditEmployee,
  canEditSensitiveEmployeeFields,
} from "@/lib/auth/permissions";
import { isValidEmail } from "@/lib/email/send";
import { createAdminClient } from "@/lib/supabase/server";
import type { EmploymentStatus, UserRole } from "@/lib/types/hrm";

const USER_ROLES: UserRole[] = [
  "super_admin",
  "admin_hr",
  "branch_manager",
  "assistant_manager",
  "manager",
  "employee",
  "team_member",
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

function readOptionalEmail(formData: FormData, key: string): string | null {
  const value = readString(formData, key).toLowerCase();
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

function parseRemoteDays(formData: FormData): number[] {
  return formData
    .getAll("remote_default_days")
    .map((value) => Number.parseInt(String(value), 10))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7)
    .filter((value, index, array) => array.indexOf(value) === index)
    .sort((a, b) => a - b);
}

function parseTime(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) return null;
  return trimmed.length === 5 ? `${trimmed}:00` : trimmed;
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
  const contactEmail = readOptionalEmail(formData, "contact_email");
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
  const remoteDefaultDays = parseRemoteDays(formData);
  const customShiftEnabled = formData.get("custom_shift_enabled") === "on";
  const customShiftStart = parseTime(readString(formData, "custom_shift_start"));
  const customShiftEnd = parseTime(readString(formData, "custom_shift_end"));

  if (!fullName) fail(errorPath, "Full name is required.");
  if (!email || !email.includes("@")) fail(errorPath, "A valid email is required.");
  if (contactEmail && !isValidEmail(contactEmail)) {
    fail(errorPath, "Contact email must be a valid email address.");
  }
  if (!branchId) fail(errorPath, "Branch is required.");
  if (!departmentId) fail(errorPath, "Department/category is required.");
  if (!shiftId) fail(errorPath, "Shift is required.");
  if (!role) fail(errorPath, "Role is required.");
  if (!employmentStatus) fail(errorPath, "Employment status is required.");
  if (salary === null) fail(errorPath, "Monthly salary must be zero or higher.");
  if (password.length < 8) {
    fail(errorPath, "Initial password must be at least 8 characters.");
  }
  if (customShiftEnabled && (!customShiftStart || !customShiftEnd)) {
    fail(errorPath, "Custom shift start and end are required when override is enabled.");
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
      contact_email: contactEmail,
      branch_id: branchId,
      department_id: departmentId,
      manager_id: managerId,
      shift_id: shiftId,
      custom_shift_enabled: customShiftEnabled,
      custom_shift_start: customShiftEnabled ? customShiftStart : null,
      custom_shift_end: customShiftEnabled ? customShiftEnd : null,
      monthly_salary: salary,
      role_description: roleDescription || null,
      employment_status: employmentStatus,
      attendance_exempt: attendanceExempt,
      payroll_exempt: false,
      remote_allowed: remoteAllowed,
      remote_default_days: remoteAllowed ? remoteDefaultDays : [],
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
      contact_email_set: Boolean(contactEmail),
      branch_id: branchId,
      department_id: departmentId,
      manager_id: managerId,
      shift_id: shiftId,
      custom_shift_enabled: customShiftEnabled,
      monthly_salary: salary,
      role,
      role_description: roleDescription || null,
      employment_status: employmentStatus,
      attendance_exempt: attendanceExempt,
      remote_allowed: remoteAllowed,
      remote_default_days: remoteAllowed ? remoteDefaultDays : [],
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

export async function updateEmployee(formData: FormData) {
  const employeeId = readString(formData, "employee_id");
  const errorPath = employeeId ? `/admin/employees/${employeeId}` : "/employees";
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!employeeId) fail(errorPath, "Missing employee id.");

  const fullName = readString(formData, "full_name");
  const contactEmail = readOptionalEmail(formData, "contact_email");
  const phone = readString(formData, "phone") || null;
  const branchId = readOptionalId(formData, "branch_id");
  const departmentId = readOptionalId(formData, "department_id");
  const shiftId = readOptionalId(formData, "shift_id");
  const managerId = readOptionalId(formData, "manager_id");
  const roleDescription = readString(formData, "role_description") || null;
  const role = parseRole(readString(formData, "role"));
  const employmentStatus = parseEmploymentStatus(readString(formData, "employment_status"));
  const salary = parseSalary(readString(formData, "monthly_salary"));
  const attendanceExempt = formData.get("attendance_exempt") === "on";
  const remoteAllowed = formData.get("remote_allowed") === "on";
  const remoteDefaultDays = parseRemoteDays(formData);
  const customShiftEnabled = formData.get("custom_shift_enabled") === "on";
  const customShiftStart = parseTime(readString(formData, "custom_shift_start"));
  const customShiftEnd = parseTime(readString(formData, "custom_shift_end"));
  const reason = readString(formData, "reason");

  if (!fullName) fail(errorPath, "Full name is required.");
  if (contactEmail && !isValidEmail(contactEmail)) {
    fail(errorPath, "Contact email must be a valid email address.");
  }
  if (!branchId) fail(errorPath, "Branch is required.");
  if (!departmentId) fail(errorPath, "Department/category is required.");
  if (!shiftId) fail(errorPath, "Shift is required.");
  if (managerId === employeeId) fail(errorPath, "Employee cannot be their own manager.");
  if (!role) fail(errorPath, "Role is required.");
  if (!employmentStatus) fail(errorPath, "Employment status is required.");
  if (salary === null) fail(errorPath, "Monthly salary must be zero or higher.");
  if (customShiftEnabled && (!customShiftStart || !customShiftEnd)) {
    fail(errorPath, "Custom shift start and end are required when override is enabled.");
  }
  if (!reason) fail(errorPath, "Update reason is required.");

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("employees")
    .select(
      `
      id, user_id, full_name, phone, contact_email,
      branch_id, department_id, manager_id, shift_id,
      custom_shift_enabled, custom_shift_start, custom_shift_end,
      monthly_salary, role_description, employment_status,
      attendance_exempt, remote_allowed, remote_default_days,
      app_users:user_id ( display_name, email, role, is_active )
      `
    )
    .eq("id", employeeId)
    .maybeSingle();
  if (fetchError || !existing) fail(errorPath, "Employee not found.");

  const existingUser = Array.isArray(existing.app_users)
    ? existing.app_users[0]
    : existing.app_users;
  const actor = actorFromCurrentUser(me);
  const target = {
    id: existing.id,
    user_id: existing.user_id,
    branch_id: existing.branch_id,
    user_role: existingUser?.role ?? "employee",
  };
  if (!canEditEmployee(actor, target)) {
    fail(errorPath, "You do not have permission to edit this employee.");
  }
  const canEditSensitive = canEditSensitiveEmployeeFields(actor, target);
  const sensitiveChanged =
    branchId !== existing.branch_id ||
    role !== existingUser?.role ||
    salary !== Number(existing.monthly_salary) ||
    employmentStatus !== existing.employment_status ||
    attendanceExempt !== existing.attendance_exempt;
  if (sensitiveChanged && !canEditSensitive) {
    fail(errorPath, "Only super-admins can change role, branch, salary, status, or exemptions.");
  }

  const nextEmployee = {
    full_name: fullName,
    phone,
    contact_email: contactEmail,
    branch_id: canEditSensitive ? branchId : existing.branch_id,
    department_id: departmentId,
    manager_id: managerId,
    shift_id: shiftId,
    custom_shift_enabled: customShiftEnabled,
    custom_shift_start: customShiftEnabled ? customShiftStart : null,
    custom_shift_end: customShiftEnabled ? customShiftEnd : null,
    monthly_salary: canEditSensitive ? salary : existing.monthly_salary,
    role_description: roleDescription,
    employment_status: canEditSensitive ? employmentStatus : existing.employment_status,
    attendance_exempt: canEditSensitive
      ? attendanceExempt
      : existing.attendance_exempt,
    remote_allowed: remoteAllowed,
    remote_default_days: remoteAllowed ? remoteDefaultDays : [],
    updated_at: new Date().toISOString(),
  };
  const nextRole = canEditSensitive ? role : existingUser?.role ?? "employee";
  const nextIsActive =
    canEditSensitive && employmentStatus
      ? employmentStatus === "active"
      : existingUser?.is_active ?? true;

  const changedFields = [
    ["full_name", existing.full_name, nextEmployee.full_name],
    ["phone", existing.phone, nextEmployee.phone],
    ["contact_email", existing.contact_email, nextEmployee.contact_email],
    ["branch_id", existing.branch_id, nextEmployee.branch_id],
    ["department_id", existing.department_id, nextEmployee.department_id],
    ["manager_id", existing.manager_id, nextEmployee.manager_id],
    ["shift_id", existing.shift_id, nextEmployee.shift_id],
    ["custom_shift_enabled", existing.custom_shift_enabled, nextEmployee.custom_shift_enabled],
    ["custom_shift_start", existing.custom_shift_start, nextEmployee.custom_shift_start],
    ["custom_shift_end", existing.custom_shift_end, nextEmployee.custom_shift_end],
    ["monthly_salary", Number(existing.monthly_salary), Number(nextEmployee.monthly_salary)],
    ["role_description", existing.role_description, nextEmployee.role_description],
    ["employment_status", existing.employment_status, nextEmployee.employment_status],
    ["attendance_exempt", existing.attendance_exempt, nextEmployee.attendance_exempt],
    ["remote_allowed", existing.remote_allowed, nextEmployee.remote_allowed],
    ["remote_default_days", existing.remote_default_days ?? [], nextEmployee.remote_default_days],
    ["role", existingUser?.role, nextRole],
    ["is_active", existingUser?.is_active, nextIsActive],
  ]
    .filter(([, oldValue, newValue]) => JSON.stringify(oldValue) !== JSON.stringify(newValue))
    .map(([field]) => field as string);

  if (changedFields.length === 0) {
    redirect(`${errorPath}?ok=${encodeURIComponent("No employee changes detected.")}`);
  }

  const { error: employeeError } = await admin
    .from("employees")
    .update(nextEmployee)
    .eq("id", employeeId);
  if (employeeError) fail(errorPath, `Could not update employee: ${employeeError.message}`);

  const { error: userError } = await admin
    .from("app_users")
    .update({
      display_name: fullName,
      role: nextRole,
      is_active: nextIsActive,
    })
    .eq("id", existing.user_id);
  if (userError) fail(errorPath, `Employee updated, but user update failed: ${userError.message}`);

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: me.authUserId,
    target_type: "employee",
    target_id: employeeId,
    action: changedFields.some((field) => field.startsWith("custom_shift_") || field === "shift_id")
      ? "update_employee_profile_and_shift"
      : "update_employee_profile",
    old_value: { changed_fields: changedFields },
    new_value: { changed_fields: changedFields },
    reason,
  });
  if (auditError) fail(errorPath, `Employee updated, but audit log failed: ${auditError.message}`);

  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/employees");
  revalidatePath("/admin");
  revalidatePath("/admin/payroll");
  revalidatePath("/dashboard");
  revalidatePath("/attendance");
  redirect(`/admin/employees/${employeeId}?ok=${encodeURIComponent("Employee updated.")}`);
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
