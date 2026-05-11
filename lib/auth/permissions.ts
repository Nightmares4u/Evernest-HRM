import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import type { Employee, UserRole } from "@/lib/types/hrm";

export type ActorForPermissions = {
  id: string;
  role: UserRole;
  is_active: boolean;
  employee_id: string | null;
  branch_id: string | null;
};

export type TargetEmployeeForPermissions = {
  id: string;
  user_id: string;
  branch_id: string | null;
  user_role: UserRole;
};

const ROLE_RANK: Record<UserRole, number> = {
  super_admin: 500,
  admin_hr: 450,
  branch_manager: 300,
  assistant_manager: 200,
  manager: 200,
  employee: 100,
  team_member: 100,
};

export const EMPLOYEE_MANAGER_ROLES: UserRole[] = [
  "super_admin",
  "admin_hr",
  "branch_manager",
  "assistant_manager",
  "manager",
];

export function roleRank(role: UserRole): number {
  return ROLE_RANK[role] ?? 0;
}

export function isSuperAdminRole(role: UserRole): boolean {
  return role === "super_admin";
}

export function isGlobalAdminRole(role: UserRole): boolean {
  return role === "super_admin" || role === "admin_hr";
}

export function isBranchManagerOrAboveRole(role: UserRole): boolean {
  return EMPLOYEE_MANAGER_ROLES.includes(role);
}

export function isTeamMemberRole(role: UserRole): boolean {
  return role === "employee" || role === "team_member";
}

export function actorFromCurrentUser(me: CurrentUser): ActorForPermissions {
  return {
    id: me.authUserId,
    role: me.appUser.role,
    is_active: me.appUser.is_active,
    employee_id: me.employee?.id ?? null,
    branch_id: me.employee?.branch_id ?? null,
  };
}

export function targetFromEmployee(
  employee: Pick<Employee, "id" | "user_id" | "branch_id"> & { user_role: UserRole }
): TargetEmployeeForPermissions {
  return {
    id: employee.id,
    user_id: employee.user_id,
    branch_id: employee.branch_id,
    user_role: employee.user_role,
  };
}

export function canSeeEmployee(
  actor: ActorForPermissions,
  target: TargetEmployeeForPermissions
): boolean {
  if (!actor.is_active) return false;
  if (isGlobalAdminRole(actor.role)) return true;
  if (isTeamMemberRole(actor.role)) return actor.employee_id === target.id;
  return Boolean(actor.branch_id && actor.branch_id === target.branch_id);
}

export function canManageEmployee(
  actor: ActorForPermissions,
  target: TargetEmployeeForPermissions
): boolean {
  if (!canSeeEmployee(actor, target)) return false;
  if (isGlobalAdminRole(actor.role)) return true;
  if (target.user_role === "super_admin") return false;
  if (actor.employee_id === target.id) return false;
  return roleRank(actor.role) > roleRank(target.user_role);
}

export function canEditEmployee(
  actor: ActorForPermissions,
  target: TargetEmployeeForPermissions
): boolean {
  return canManageEmployee(actor, target);
}

export function canEditSensitiveEmployeeFields(
  actor: ActorForPermissions,
  target: TargetEmployeeForPermissions
): boolean {
  if (!actor.is_active) return false;
  if (actor.role === "super_admin") return true;
  return actor.role === "admin_hr" && target.user_role !== "super_admin";
}

export function canViewPersonalPayrollDetails(
  actor: ActorForPermissions,
  target: TargetEmployeeForPermissions
): boolean {
  if (!actor.is_active) return false;
  return actor.role === "super_admin" || actor.employee_id === target.id;
}

export function canEditPersonalPayrollDetails(
  actor: ActorForPermissions,
  target: TargetEmployeeForPermissions
): boolean {
  return canViewPersonalPayrollDetails(actor, target);
}

export function canOverrideAttendance(
  actor: ActorForPermissions,
  target: TargetEmployeeForPermissions
): boolean {
  if (!actor.is_active) return false;
  if (isGlobalAdminRole(actor.role)) return true;
  if (actor.employee_id === target.id) return false;
  if (!actor.branch_id || actor.branch_id !== target.branch_id) return false;
  if (target.user_role === "super_admin") return false;
  return roleRank(actor.role) > roleRank(target.user_role);
}

export function canAssignTask(
  actor: ActorForPermissions,
  target: TargetEmployeeForPermissions | null
): boolean {
  if (!actor.is_active) return false;
  if (isGlobalAdminRole(actor.role)) return true;
  if (!target) return false;
  if (!actor.branch_id || actor.branch_id !== target.branch_id) return false;
  if (target.user_role === "super_admin") return false;
  return roleRank(actor.role) > roleRank(target.user_role) || actor.id === target.user_id;
}

export function canApproveLeave(
  actor: ActorForPermissions,
  target: TargetEmployeeForPermissions
): boolean {
  return canOverrideAttendance(actor, target);
}

export async function requireBranchManagerOrAbove(
  errorRedirect: string
): Promise<CurrentUser> {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.appUser.is_active || !isBranchManagerOrAboveRole(me.appUser.role)) {
    redirect(
      `${errorRedirect}?error=${encodeURIComponent("Manager access required.")}`
    );
  }
  return me;
}
