"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  actorFromCurrentUser,
  canEditPersonalPayrollDetails,
} from "@/lib/auth/permissions";
import {
  changedPersonalProfileFields,
  personalProfileUpdatePayload,
  readPersonalProfileInput,
  validatePersonalProfileInput,
} from "@/lib/employees/personal-profile";
import { createAdminClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types/hrm";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function safeRedirectPath(formData: FormData, fallbackEmployeeId: string): string {
  const requested = readString(formData, "redirect_to");
  if (requested === "/profile") return requested;
  if (requested === `/admin/employees/${fallbackEmployeeId}`) return requested;
  return "/profile";
}

export async function updatePersonalPayrollProfile(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const requestedEmployeeId = readString(formData, "employee_id");
  const targetEmployeeId = requestedEmployeeId || me.employee?.id;
  const errorPath = targetEmployeeId
    ? safeRedirectPath(formData, targetEmployeeId)
    : "/profile";
  if (!targetEmployeeId) fail(errorPath, "No employee profile is linked to this account.");

  const admin = createAdminClient();
  const { data: existing, error } = await admin
    .from("employees")
    .select(
      `
      id, user_id, branch_id,
      first_name, middle_name, last_name, contact_number, contact_email,
      cnic, emergency_contact_number, bank_name, bank_branch_name,
      bank_account_or_iban,
      app_users:user_id ( role )
      `
    )
    .eq("id", targetEmployeeId)
    .maybeSingle();

  if (error || !existing) fail(errorPath, "Employee profile was not found.");

  const appUsers = Array.isArray(existing.app_users)
    ? existing.app_users
    : existing.app_users
      ? [existing.app_users]
      : [];
  const target = {
    id: existing.id as string,
    user_id: existing.user_id as string,
    branch_id: (existing.branch_id as string | null) ?? null,
    user_role: (appUsers[0]?.role ?? "employee") as UserRole,
  };
  const actor = actorFromCurrentUser(me);
  if (!canEditPersonalPayrollDetails(actor, target)) {
    fail(errorPath, "Only the employee or a super-admin can edit these details.");
  }

  const isSelfEdit = me.employee?.id === target.id;
  const reason = readString(formData, "reason");
  if (!isSelfEdit && !reason) {
    fail(errorPath, "Admin profile correction reason is required.");
  }

  const input = readPersonalProfileInput(formData);
  const validationError = validatePersonalProfileInput(input);
  if (validationError) fail(errorPath, validationError);

  const changedFields = changedPersonalProfileFields(existing, input);
  if (changedFields.length === 0) {
    redirect(`${errorPath}?ok=${encodeURIComponent("No profile changes detected.")}`);
  }

  const { error: updateError } = await admin
    .from("employees")
    .update({
      ...personalProfileUpdatePayload(input),
      updated_at: new Date().toISOString(),
    })
    .eq("id", target.id);
  if (updateError) fail(errorPath, `Could not update profile: ${updateError.message}`);

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: me.authUserId,
    target_type: "employee",
    target_id: target.id,
    action: "update_employee_personal_payroll_profile",
    old_value: { changed_fields: changedFields },
    new_value: { changed_fields: changedFields },
    reason: isSelfEdit ? "Employee self-profile update" : reason,
  });
  if (auditError) fail(errorPath, `Profile updated, but audit log failed: ${auditError.message}`);

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  revalidatePath("/employees");
  revalidatePath(`/admin/employees/${target.id}`);
  revalidatePath("/admin/payroll/export");
  redirect(`${errorPath}?ok=${encodeURIComponent("Profile details updated.")}`);
}
