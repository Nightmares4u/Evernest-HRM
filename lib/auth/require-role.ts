// Server-only role guards for server actions.
//
// Server actions that use createAdminClient() bypass RLS, so they MUST
// verify the caller's role explicitly before any privileged write.

import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { isBranchManagerOrAboveRole, isGlobalAdminRole } from "@/lib/auth/permissions";

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

export async function requireTaskAdmin(
  errorRedirect: string
): Promise<CurrentUser> {
  const me = await getCurrentUser();
  if (!me) {
    redirect("/login");
  }
  if (!me.appUser.is_active || !isBranchManagerOrAboveRole(me.appUser.role)) {
    redirect(
      `${errorRedirect}?error=${encodeURIComponent("Admin access required.")}`
    );
  }
  return me;
}

export async function requireGlobalAdmin(
  errorRedirect: string
): Promise<CurrentUser> {
  const me = await getCurrentUser();
  if (!me) {
    redirect("/login");
  }
  if (!me.appUser.is_active || !isGlobalAdminRole(me.appUser.role)) {
    redirect(
      `${errorRedirect}?error=${encodeURIComponent("Global admin access required.")}`
    );
  }
  return me;
}
