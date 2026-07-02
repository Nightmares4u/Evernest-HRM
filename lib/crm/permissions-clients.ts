import { isBranchManagerOrAboveRole } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/current-user";
import type { CrmClient, CrmClientStatus } from "@/lib/types/crm";

/**
 * Terminal client statuses. Once a client reaches one of these, normal
 * workflow actions (doc upload, milestone updates, application changes,
 * status transitions) must refuse to mutate. Only super_admin escape
 * hatches (currently absent — would be a future task) can move out.
 */
export const CRM_CLIENT_TERMINAL_STATUSES: ReadonlyArray<CrmClientStatus> = [
  "alumni",
  "withdrawn_refunded",
];

export function isClientTerminal(client: Pick<CrmClient, "status">): boolean {
  return CRM_CLIENT_TERMINAL_STATUSES.includes(client.status);
}

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
  // Ops processes converted/client-stage work across ALL branches.
  if (me.appUser.role === "ops") return true;
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
 * Financial visibility (payment history + financials page + invoice PDF).
 * Since the 2026-07 direct-client-shell pivot this matches canViewCrmClient:
 * ops runs the full client lifecycle including financials, and counselors
 * see the financials of their own client shells.
 */
export function canViewClientFinancials(
  me: CurrentUser,
  client: { assigned_agent_id: string | null; branch_id: string | null }
): boolean {
  // → clients.financials.view
  return canViewCrmClient(me, client);
}

/**
 * Invoice editing (header fields + steps, including marking steps
 * paid/due/waived, which creates/removes crm_client_payments rows).
 * Per the direct-client-shell pivot: super_admin, ops (all clients),
 * assigned counselor (own clients), and branch managers (their branch)
 * may all edit — every change is written to the client activity audit
 * trail by the invoice RPCs. Refunds remain super_admin-only.
 */
export function canEditClientInvoice(
  me: CurrentUser,
  client: { assigned_agent_id: string | null; branch_id: string | null }
): boolean {
  // → clients.invoice.edit
  return canViewCrmClient(me, client);
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
  if (me.appUser.role === "ops") return true;
  if (me.employee?.id && me.employee.id === client.assigned_agent_id) return true;
  if (meDepartmentName === OPS_DEPARTMENT_NAME) return true;
  return false;
}

export function canEditClientApplication(
  me: CurrentUser,
  client: Pick<CrmClient, "assigned_agent_id">
): boolean {
  // → clients.applications.edit
  if (!me.appUser.is_active) return false;
  if (me.appUser.role === "super_admin") return true;
  if (me.appUser.role === "ops") return true;
  if (me.employee?.id && me.employee.id === client.assigned_agent_id) return true;
  return false;
}

export function canEditClientMilestone(
  me: CurrentUser,
  client: Pick<CrmClient, "assigned_agent_id">,
  meDepartmentName: string | null
): boolean {
  // → clients.milestones.edit
  if (!me.appUser.is_active) return false;
  if (me.appUser.role === "super_admin") return true;
  if (me.appUser.role === "ops") return true;
  if (me.employee?.id && me.employee.id === client.assigned_agent_id) return true;
  if (meDepartmentName === OPS_DEPARTMENT_NAME) return true;
  return false;
}

export function canEditClientStatus(
  me: CurrentUser,
  client: Pick<CrmClient, "assigned_agent_id">
): boolean {
  // → clients.status.edit
  if (!me.appUser.is_active) return false;
  if (me.appUser.role === "super_admin") return true;
  if (me.appUser.role === "ops") return true;
  if (me.employee?.id && me.employee.id === client.assigned_agent_id) return true;
  return false;
}

/**
 * Direct client shell creation (post-pivot lifecycle entry point).
 * Counselors (sales) create shells for themselves; ops and global admins
 * create shells for any branch/counselor; branch managers for their branch.
 * Everyone with an admin-tier role may create; other roles need an employee
 * record so the shell can be assigned to them.
 */
export function canCreateClientShell(me: CurrentUser): boolean {
  // → clients.shell.create
  if (!me.appUser.is_active) return false;
  if (
    me.appUser.role === "super_admin" ||
    me.appUser.role === "admin_hr" ||
    me.appUser.role === "ops" ||
    isBranchManagerOrAboveRole(me.appUser.role)
  ) {
    return true;
  }
  return Boolean(me.employee?.id);
}

export function canWithdrawClient(me: CurrentUser): boolean {
  // → clients.withdraw
  if (!me.appUser.is_active) return false;
  return me.appUser.role === "super_admin";
}

export function canRecordClientPayment(me: CurrentUser): boolean {
  // → clients.payments.record
  if (!me.appUser.is_active) return false;
  return me.appUser.role === "super_admin";
}

export function canRecordClientRefund(me: CurrentUser): boolean {
  // → clients.refunds.record
  if (!me.appUser.is_active) return false;
  return me.appUser.role === "super_admin";
}
