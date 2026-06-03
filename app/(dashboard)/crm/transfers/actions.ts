"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/server";
import type { CrmLead, CrmLeadTransfer } from "@/lib/types/crm";
import type { Employee } from "@/lib/types/hrm";

type ActionResult = {
  ok: boolean;
  message: string;
  leadId?: string;
  transferId?: string;
};

type EmployeeLite = Pick<
  Employee,
  "id" | "full_name" | "branch_id" | "employment_status"
>;

type TransferWithLead = CrmLeadTransfer & {
  lead: CrmLead;
};

function ok(message: string, ids: Partial<Pick<ActionResult, "leadId" | "transferId">> = {}): ActionResult {
  return { ok: true, message, ...ids };
}

function error(message: string): ActionResult {
  return { ok: false, message };
}

function isSuperAdmin(me: CurrentUser): boolean {
  return me.appUser.is_active && me.appUser.role === "super_admin";
}

function currentEmployeeId(me: CurrentUser): string | null {
  return me.employee?.id ?? null;
}

function isAssignedCounselor(me: CurrentUser, lead: CrmLead): boolean {
  return Boolean(currentEmployeeId(me) && lead.assigned_agent_id === currentEmployeeId(me));
}

function canDecideTransfer(me: CurrentUser, transfer: CrmLeadTransfer): boolean {
  return isSuperAdmin(me) || transfer.to_employee_id === currentEmployeeId(me);
}

function canCancelTransfer(me: CurrentUser, transfer: CrmLeadTransfer): boolean {
  return isSuperAdmin(me) || transfer.requested_by_user_id === me.authUserId;
}

function requireActiveUser(me: CurrentUser | null): ActionResult | null {
  if (!me) return error("Sign in required.");
  if (!me.appUser.is_active) return error("Active user required.");
  return null;
}

function revalidateCrmTransferPaths(leadId: string, transferId?: string) {
  revalidatePath("/crm/leads");
  revalidatePath(`/crm/leads/${leadId}`);
  revalidatePath("/crm/transfers");
  revalidatePath("/admin/crm/transfers");
  revalidatePath("/admin/crm");
  if (transferId) revalidatePath(`/crm/transfers/${transferId}`);
}

async function loadLead(leadId: string): Promise<{ lead: CrmLead | null; message?: string }> {
  const admin = createAdminClient();
  const { data, error: leadError } = await admin
    .from("crm_leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError) return { lead: null, message: `Could not load lead: ${leadError.message}` };
  return { lead: (data as CrmLead | null) ?? null };
}

async function loadEmployee(employeeId: string): Promise<{
  employee: EmployeeLite | null;
  message?: string;
}> {
  const admin = createAdminClient();
  const { data, error: employeeError } = await admin
    .from("employees")
    .select("id, full_name, branch_id, employment_status")
    .eq("id", employeeId)
    .maybeSingle();

  if (employeeError) {
    return { employee: null, message: `Could not load employee: ${employeeError.message}` };
  }
  return { employee: (data as EmployeeLite | null) ?? null };
}

async function loadTransferWithLead(transferId: string): Promise<{
  transfer: TransferWithLead | null;
  message?: string;
}> {
  const admin = createAdminClient();
  const { data, error: transferError } = await admin
    .from("crm_lead_transfers")
    .select("*, lead:crm_leads (*)")
    .eq("id", transferId)
    .maybeSingle();

  if (transferError) {
    return { transfer: null, message: `Could not load transfer: ${transferError.message}` };
  }
  if (!data) return { transfer: null };

  type Row = CrmLeadTransfer & { lead: CrmLead | CrmLead[] | null };
  const row = data as Row;
  const lead = Array.isArray(row.lead) ? row.lead[0] ?? null : row.lead;
  if (!lead) return { transfer: null, message: "Transfer lead not found." };

  return {
    transfer: {
      ...row,
      lead,
    },
  };
}

async function hasPendingTransfer(leadId: string): Promise<{ hasPending: boolean; message?: string }> {
  const admin = createAdminClient();
  const { data, error: pendingError } = await admin
    .from("crm_lead_transfers")
    .select("id")
    .eq("lead_id", leadId)
    .eq("status", "pending")
    .maybeSingle();

  if (pendingError) {
    return {
      hasPending: false,
      message: `Could not check pending transfers: ${pendingError.message}`,
    };
  }
  return { hasPending: Boolean(data) };
}

async function employeeNames(employeeIds: Array<string | null>): Promise<Map<string, string>> {
  const ids = Array.from(new Set(employeeIds.filter(Boolean) as string[]));
  if (ids.length === 0) return new Map();

  const admin = createAdminClient();
  const { data } = await admin.from("employees").select("id, full_name").in("id", ids);
  return new Map(
    ((data ?? []) as Array<{ id: string; full_name: string | null }>).map((employee) => [
      employee.id,
      employee.full_name ?? employee.id,
    ])
  );
}

export async function requestLeadTransfer(
  leadId: string,
  toEmployeeId: string,
  reason: string
): Promise<ActionResult> {
  const me = await getCurrentUser();
  const authError = requireActiveUser(me);
  if (authError || !me) return authError ?? error("Sign in required.");

  const cleanLeadId = leadId.trim();
  const cleanToEmployeeId = toEmployeeId.trim();
  const cleanReason = reason.trim();
  if (!cleanLeadId) return error("Lead id is required.");
  if (!cleanToEmployeeId) return error("Target counselor is required.");
  if (!cleanReason) return error("Transfer reason is required.");

  const [{ lead, message: leadMessage }, { employee: target, message: targetMessage }] =
    await Promise.all([loadLead(cleanLeadId), loadEmployee(cleanToEmployeeId)]);
  if (leadMessage) return error(leadMessage);
  if (!lead) return error("Lead not found.");
  if (targetMessage) return error(targetMessage);
  if (!target) return error("Target counselor not found.");
  if (target.employment_status !== "active") return error("Target counselor is not active.");
  if (!isSuperAdmin(me) && !isAssignedCounselor(me, lead)) {
    return error("Only the assigned counselor or super admin can request transfer.");
  }
  if (lead.assigned_agent_id && lead.assigned_agent_id === target.id) {
    return error("Lead is already assigned to that counselor.");
  }

  const pending = await hasPendingTransfer(lead.id);
  if (pending.message) return error(pending.message);
  if (pending.hasPending) return error("Lead already has a pending transfer.");

  const admin = createAdminClient();
  const { data: transfer, error: insertError } = await admin
    .from("crm_lead_transfers")
    .insert({
      lead_id: lead.id,
      from_employee_id: lead.assigned_agent_id,
      from_branch_id: lead.branch_id,
      to_employee_id: target.id,
      to_branch_id: target.branch_id,
      requested_by_user_id: me.authUserId,
      reason: cleanReason,
      status: "pending",
    })
    .select("*")
    .single();

  if (insertError || !transfer) {
    return error(`Could not request transfer: ${insertError?.message ?? "unknown error"}`);
  }

  const names = await employeeNames([lead.assigned_agent_id, target.id]);
  const { error: activityError } = await admin.from("crm_lead_activities").insert({
    lead_id: lead.id,
    raw_inbox_id: lead.raw_inbox_id,
    activity_type: "transfer_requested",
    actor_user_id: me.authUserId,
    description: `Transfer requested to ${names.get(target.id) ?? target.full_name}.`,
    payload: {
      transfer_id: transfer.id,
      from_employee_id: lead.assigned_agent_id,
      from_employee_name: lead.assigned_agent_id ? names.get(lead.assigned_agent_id) ?? null : null,
      to_employee_id: target.id,
      to_employee_name: names.get(target.id) ?? target.full_name,
      reason: cleanReason,
    },
  });

  if (activityError) {
    return error(`Transfer requested, but activity failed: ${activityError.message}`);
  }

  revalidateCrmTransferPaths(lead.id, transfer.id);
  return ok("Transfer requested.", { leadId: lead.id, transferId: transfer.id });
}

export async function acceptLeadTransfer(
  transferId: string,
  note = ""
): Promise<ActionResult> {
  const me = await getCurrentUser();
  const authError = requireActiveUser(me);
  if (authError || !me) return authError ?? error("Sign in required.");

  const cleanTransferId = transferId.trim();
  const cleanNote = note.trim();
  if (!cleanTransferId) return error("Transfer id is required.");

  const { transfer, message } = await loadTransferWithLead(cleanTransferId);
  if (message) return error(message);
  if (!transfer) return error("Transfer not found.");
  if (transfer.status !== "pending") return error("Only pending transfers can be accepted.");
  if (!canDecideTransfer(me, transfer)) {
    return error("Only the target counselor or super admin can accept transfer.");
  }

  return decideTransferWithAssignment(transfer, me, {
    transferStatus: "accepted",
    assignmentMethod: "transfer_accept",
    activityType: "transfer_accepted",
    note: cleanNote,
    successMessage: "Transfer accepted.",
  });
}

export async function rejectLeadTransfer(
  transferId: string,
  note: string
): Promise<ActionResult> {
  const me = await getCurrentUser();
  const authError = requireActiveUser(me);
  if (authError || !me) return authError ?? error("Sign in required.");

  const cleanTransferId = transferId.trim();
  const cleanNote = note.trim();
  if (!cleanTransferId) return error("Transfer id is required.");
  if (!cleanNote) return error("Rejection note is required.");

  const { transfer, message } = await loadTransferWithLead(cleanTransferId);
  if (message) return error(message);
  if (!transfer) return error("Transfer not found.");
  if (transfer.status !== "pending") return error("Only pending transfers can be rejected.");
  if (!canDecideTransfer(me, transfer)) {
    return error("Only the target counselor or super admin can reject transfer.");
  }

  return closeTransferWithoutAssignment(transfer, me, {
    transferStatus: "rejected",
    activityType: "transfer_rejected",
    note: cleanNote,
    successMessage: "Transfer rejected.",
  });
}

export async function cancelLeadTransfer(transferId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  const authError = requireActiveUser(me);
  if (authError || !me) return authError ?? error("Sign in required.");

  const cleanTransferId = transferId.trim();
  if (!cleanTransferId) return error("Transfer id is required.");

  const { transfer, message } = await loadTransferWithLead(cleanTransferId);
  if (message) return error(message);
  if (!transfer) return error("Transfer not found.");
  if (transfer.status !== "pending") return error("Only pending transfers can be cancelled.");
  if (!canCancelTransfer(me, transfer)) {
    return error("Only the requester or super admin can cancel transfer.");
  }

  return closeTransferWithoutAssignment(transfer, me, {
    transferStatus: "cancelled",
    activityType: "transfer_cancelled",
    note: "",
    successMessage: "Transfer cancelled.",
  });
}

export async function adminOverrideTransfer(
  transferId: string,
  note = ""
): Promise<ActionResult> {
  const me = await getCurrentUser();
  const authError = requireActiveUser(me);
  if (authError || !me) return authError ?? error("Sign in required.");
  if (!isSuperAdmin(me)) return error("Super-admin access required.");

  const cleanTransferId = transferId.trim();
  const cleanNote = note.trim();
  if (!cleanTransferId) return error("Transfer id is required.");

  const { transfer, message } = await loadTransferWithLead(cleanTransferId);
  if (message) return error(message);
  if (!transfer) return error("Transfer not found.");
  if (transfer.status !== "pending") return error("Only pending transfers can be overridden.");

  return decideTransferWithAssignment(transfer, me, {
    transferStatus: "admin_override",
    assignmentMethod: "transfer_admin_override",
    activityType: "transfer_admin_override",
    note: cleanNote,
    successMessage: "Transfer overridden by admin.",
  });
}

async function decideTransferWithAssignment(
  transfer: TransferWithLead,
  me: CurrentUser,
  options: {
    transferStatus: "accepted" | "admin_override";
    assignmentMethod: "transfer_accept" | "transfer_admin_override";
    activityType: "transfer_accepted" | "transfer_admin_override";
    note: string;
    successMessage: string;
  }
): Promise<ActionResult> {
  const admin = createAdminClient();
  const nextBranchId = transfer.to_branch_id ?? transfer.lead.branch_id;
  const assignmentStatus = transfer.lead.assigned_agent_id ? "reassigned" : "assigned";
  const names = await employeeNames([
    transfer.from_employee_id,
    transfer.to_employee_id,
    transfer.lead.assigned_agent_id,
  ]);

  const { error: transferError } = await admin
    .from("crm_lead_transfers")
    .update({
      status: options.transferStatus,
      decision_note: options.note || null,
      decided_by_user_id: me.authUserId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", transfer.id)
    .eq("status", "pending");
  if (transferError) return error(`Could not update transfer: ${transferError.message}`);

  const { error: leadError } = await admin
    .from("crm_leads")
    .update({
      assigned_agent_id: transfer.to_employee_id,
      branch_id: nextBranchId,
      status: transfer.lead.status === "new" ? "assigned" : transfer.lead.status,
    })
    .eq("id", transfer.lead_id);
  if (leadError) return error(`Transfer decided, but lead assignment failed: ${leadError.message}`);

  const { error: assignmentError } = await admin.from("crm_lead_assignments").insert({
    lead_id: transfer.lead_id,
    status: assignmentStatus,
    from_employee_id: transfer.lead.assigned_agent_id,
    to_employee_id: transfer.to_employee_id,
    from_branch_id: transfer.lead.branch_id,
    to_branch_id: nextBranchId,
    assigned_by: me.authUserId,
    method: options.assignmentMethod,
    matched_rule_id: null,
    reason: options.note || `Lead transfer ${options.transferStatus}.`,
  });
  if (assignmentError) {
    return error(`Lead assigned, but assignment history failed: ${assignmentError.message}`);
  }

  const [{ error: transferActivityError }, { error: assignmentActivityError }] =
    await Promise.all([
      admin.from("crm_lead_activities").insert({
        lead_id: transfer.lead_id,
        raw_inbox_id: transfer.lead.raw_inbox_id,
        activity_type: options.activityType,
        actor_user_id: me.authUserId,
        description:
          options.transferStatus === "accepted"
            ? "Lead transfer accepted."
            : "Lead transfer overridden by admin.",
        payload: transferPayload(transfer, names, options.note),
      }),
      admin.from("crm_lead_activities").insert({
        lead_id: transfer.lead_id,
        raw_inbox_id: transfer.lead.raw_inbox_id,
        activity_type: assignmentStatus,
        actor_user_id: me.authUserId,
        description: `Lead reassigned to ${
          names.get(transfer.to_employee_id) ?? transfer.to_employee_id
        } via transfer.`,
        payload: {
          method: options.assignmentMethod,
          transfer_id: transfer.id,
          from_employee_id: transfer.lead.assigned_agent_id,
          to_employee_id: transfer.to_employee_id,
          from_branch_id: transfer.lead.branch_id,
          to_branch_id: nextBranchId,
        },
      }),
    ]);

  if (transferActivityError) {
    return error(`Lead assigned, but transfer activity failed: ${transferActivityError.message}`);
  }
  if (assignmentActivityError) {
    return error(`Lead assigned, but reassignment activity failed: ${assignmentActivityError.message}`);
  }

  revalidateCrmTransferPaths(transfer.lead_id, transfer.id);
  return ok(options.successMessage, { leadId: transfer.lead_id, transferId: transfer.id });
}

async function closeTransferWithoutAssignment(
  transfer: TransferWithLead,
  me: CurrentUser,
  options: {
    transferStatus: "rejected" | "cancelled";
    activityType: "transfer_rejected" | "transfer_cancelled";
    note: string;
    successMessage: string;
  }
): Promise<ActionResult> {
  const admin = createAdminClient();
  const names = await employeeNames([transfer.from_employee_id, transfer.to_employee_id]);
  const { error: transferError } = await admin
    .from("crm_lead_transfers")
    .update({
      status: options.transferStatus,
      decision_note: options.note || null,
      decided_by_user_id: me.authUserId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", transfer.id)
    .eq("status", "pending");
  if (transferError) return error(`Could not update transfer: ${transferError.message}`);

  const { error: activityError } = await admin.from("crm_lead_activities").insert({
    lead_id: transfer.lead_id,
    raw_inbox_id: transfer.lead.raw_inbox_id,
    activity_type: options.activityType,
    actor_user_id: me.authUserId,
    description:
      options.transferStatus === "rejected"
        ? "Lead transfer rejected."
        : "Lead transfer cancelled.",
    payload: transferPayload(transfer, names, options.note),
  });
  if (activityError) {
    return error(`Transfer updated, but activity failed: ${activityError.message}`);
  }

  revalidateCrmTransferPaths(transfer.lead_id, transfer.id);
  return ok(options.successMessage, { leadId: transfer.lead_id, transferId: transfer.id });
}

function transferPayload(
  transfer: CrmLeadTransfer,
  names: Map<string, string>,
  note: string
) {
  return {
    transfer_id: transfer.id,
    from_employee_id: transfer.from_employee_id,
    from_employee_name: transfer.from_employee_id
      ? names.get(transfer.from_employee_id) ?? null
      : null,
    to_employee_id: transfer.to_employee_id,
    to_employee_name: names.get(transfer.to_employee_id) ?? null,
    reason: transfer.reason,
    decision_note: note || null,
  };
}
