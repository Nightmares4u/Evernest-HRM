import {
  isBranchManagerOrAboveRole,
  isGlobalAdminRole,
  isTeamMemberRole,
  type ActorForPermissions,
} from "@/lib/auth/permissions";
import type { CrmLead, CrmRawStatus } from "@/lib/types/crm";

// Phase A scoping for raw intake. Ownership is decided at receipt, so a raw
// row carries assigned_employee_id + branch_id. Visibility/mutation follow the
// same app-level branch scoping the rest of CRM uses (no capability table).
//
// Note: `ops` is intentionally NOT granted raw-intake access. Ops works
// converted/client-stage cases across branches; raw unqualified inquiries stay
// with the assigned counselor, their branch manager, and global admins.

export type RawIntakeSubject = {
  assigned_employee_id: string | null;
  branch_id: string | null;
  status: CrmRawStatus;
  lead_id: string | null;
};

export function canViewRawIntake(
  actor: ActorForPermissions,
  subject: RawIntakeSubject
): boolean {
  if (!actor.is_active) return false;
  if (isGlobalAdminRole(actor.role)) return true;
  if (isBranchManagerOrAboveRole(actor.role)) {
    return Boolean(
      actor.branch_id && subject.branch_id && actor.branch_id === subject.branch_id
    );
  }
  if (isTeamMemberRole(actor.role)) {
    return Boolean(
      actor.employee_id &&
        subject.assigned_employee_id &&
        actor.employee_id === subject.assigned_employee_id
    );
  }
  return false;
}

// Editing extracted/intake fields. Same audience as viewing.
export function canEnrichRawIntake(
  actor: ActorForPermissions,
  subject: RawIntakeSubject
): boolean {
  return canViewRawIntake(actor, subject);
}

// Promotion to a lead. Allowed for anyone who can enrich, except spam/duplicate
// rows (those stay raw until re-classified) and rows already promoted.
export function canPromoteRawIntake(
  actor: ActorForPermissions,
  subject: RawIntakeSubject
): boolean {
  if (subject.status === "spam_duplicate") return false;
  if (subject.lead_id) return false;
  return canEnrichRawIntake(actor, subject);
}

// ---------------------------------------------------------------------------
// Lead-level scoping (promoted leads). Mirrors the raw-intake model:
//   super_admin / admin_hr → all
//   branch_manager+        → same branch
//   counselor/team_member  → assigned only
//   ops / other            → none (ops is client-stage only, not raw leads)
// ---------------------------------------------------------------------------

export type LeadSubject = Pick<CrmLead, "assigned_agent_id" | "branch_id">;

export function canViewLead(
  actor: ActorForPermissions,
  lead: LeadSubject
): boolean {
  if (!actor.is_active) return false;
  if (isGlobalAdminRole(actor.role)) return true;
  if (isBranchManagerOrAboveRole(actor.role)) {
    return Boolean(actor.branch_id && actor.branch_id === lead.branch_id);
  }
  if (isTeamMemberRole(actor.role)) {
    return Boolean(actor.employee_id && actor.employee_id === lead.assigned_agent_id);
  }
  return false;
}

// Mutating a lead (notes, status, follow-up, field enrichment). Branch
// managers get branch-level control; counselors get their assigned leads.
export function canManageLead(
  actor: ActorForPermissions,
  lead: LeadSubject
): boolean {
  if (!actor.is_active) return false;
  if (isGlobalAdminRole(actor.role)) return true;
  if (isBranchManagerOrAboveRole(actor.role)) {
    return Boolean(actor.branch_id && actor.branch_id === lead.branch_id);
  }
  if (isTeamMemberRole(actor.role)) {
    return Boolean(actor.employee_id && actor.employee_id === lead.assigned_agent_id);
  }
  return false;
}

// Query-level scope descriptor for lead list/board queries.
export type LeadScope =
  | { mode: "all" }
  | { mode: "branch"; branchId: string }
  | { mode: "assigned"; employeeId: string }
  | { mode: "none" };

export function leadScopeForActor(actor: ActorForPermissions): LeadScope {
  if (!actor.is_active) return { mode: "none" };
  if (isGlobalAdminRole(actor.role)) return { mode: "all" };
  if (isBranchManagerOrAboveRole(actor.role)) {
    return actor.branch_id
      ? { mode: "branch", branchId: actor.branch_id }
      : { mode: "none" };
  }
  if (isTeamMemberRole(actor.role)) {
    return actor.employee_id
      ? { mode: "assigned", employeeId: actor.employee_id }
      : { mode: "none" };
  }
  return { mode: "none" };
}
