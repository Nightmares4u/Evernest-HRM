// Server-only role guards for server actions.
//
// Server actions that use createAdminClient() bypass RLS, so they MUST
// verify the caller's role explicitly before any privileged write.

import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import type { UserRole } from "@/lib/types/hrm";

export async function requireSuperAdmin(
  errorRedirect: string
): Promise<CurrentUser> {
  const me = await getCurrentUser();
  if (!me) {
    redirect("/login");
  }
  if (!me.appUser.is_active || me.appUser.role !== "super_admin") {
    redirect(
      `${errorRedirect}?error=${encodeURIComponent("Super-admin access required.")}`
    );
  }
  return me;
}

const TASK_ADMIN_ROLES: UserRole[] = ["super_admin", "admin_hr"];

export async function requireTaskAdmin(
  errorRedirect: string
): Promise<CurrentUser> {
  const me = await getCurrentUser();
  if (!me) {
    redirect("/login");
  }
  if (!me.appUser.is_active || !TASK_ADMIN_ROLES.includes(me.appUser.role)) {
    redirect(
      `${errorRedirect}?error=${encodeURIComponent("Admin access required.")}`
    );
  }
  return me;
}
