import { isBranchManagerOrAboveRole } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/current-user";
import type { CrmClient } from "@/lib/types/crm";

// Resolved from supabase/migrations/0001_init.sql:
//   INSERT INTO departments (name) VALUES (..., ('Operations'), ...);
// → crm.settings.ops_department_name
export const OPS_DEPARTMENT_NAME = "Operations";

/**
 * Broad read predicate for client records.
 * Mirrors lead visibility (Plan §10 — "Same scoping as lead today"):
 *   - super_admin sees all
 *   - assigned counselor sees their own
 *   - branch_manager / assistant_manager / manager / admin_hr sees their branch
 *
 * Use this to gate: listCrmClients, getCrmClientDetail, getCrmClientForLead,
 * document read/download, and doc-review queue scope.
 */
export function canViewCrmClient(
  me: CurrentUser,
  client: { assigned_agent_id: string | null; branch_id: string | null }
): boolean {
  // → clients.view
  if (!me.appUser.is_active) return false;
  if (me.appUser.role === "super_admin") return true;
  if (me.employee?.id && me.employee.id === client.assigned_agent_id) return true;
  if (
    isBranchManagerOrAboveRole(me.appUser.role) &&
    me.employee?.branch_id &&
    client.branch_id &&
    me.employee.branch_id === client.branch_id
  ) {
    return true;
  }
  return false;
}

/**
 * Narrow write predicate for document verification / approval / rejection.
 * Per Plan §10 Q4: super_admin OR assigned counselor OR Operations department.
 * Branch managers can VIEW (canViewCrmClient) but cannot verify unless they
 * are also the assigned counselor or in Ops.
 */
export function canVerifyClientDoc(
  me: CurrentUser,
  client: Pick<CrmClient, "assigned_agent_id">,
  meDepartmentName: string | null
): boolean {
  // → clients.docs.verify
  if (!me.appUser.is_active) return false;
  if (me.appUser.role === "super_admin") return true;
  if (me.employee?.id && me.employee.id === client.assigned_agent_id) return true;
  if (meDepartmentName === OPS_DEPARTMENT_NAME) return true;
  return false;
}
