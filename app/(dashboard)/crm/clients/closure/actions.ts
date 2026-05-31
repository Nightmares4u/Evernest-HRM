"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCrmClientForClosurePage } from "@/lib/db/crm";
import { createAdminClient } from "@/lib/supabase/server";
import type { CrmClientVisaDecisionOutcome } from "@/lib/types/crm";

const VISA_DECISION_OUTCOMES: CrmClientVisaDecisionOutcome[] = [
  "granted",
  "refused",
  "additional_info_requested",
];

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function requireActiveUserId(authUserId: string | null | undefined): string {
  if (!authUserId) redirect("/login");
  return authUserId;
}

async function requireClosureAccess(clientId: string) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.appUser.is_active) redirect("/dashboard?error=Active%20user%20required");

  const data = await getCrmClientForClosurePage(clientId);
  if (!data) redirect(`/crm/clients?error=${encodeURIComponent("Client not found or not accessible.")}`);
  return { me, data };
}

function redirectVisa(clientId: string, key: "ok" | "error", message: string): never {
  redirect(`/crm/clients/${clientId}/visa?${key}=${encodeURIComponent(message)}`);
}

function redirectClosure(clientId: string, key: "ok" | "error", message: string): never {
  redirect(`/crm/clients/${clientId}/closure?${key}=${encodeURIComponent(message)}`);
}

function parseOptionalDate(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function parseRequiredDate(value: string): string | null {
  return parseOptionalDate(value);
}

function parseOptionalMoney(value: string): number | null {
  if (!value) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : NaN;
}

function revalidateClientClosurePaths(clientId: string): void {
  revalidatePath("/crm/clients");
  revalidatePath(`/crm/clients/${clientId}`);
  revalidatePath(`/crm/clients/${clientId}/visa`);
  revalidatePath(`/crm/clients/${clientId}/closure`);
  revalidatePath(`/crm/clients/${clientId}/financials`);
}

export async function recordVisaDecisionAction(formData: FormData): Promise<void> {
  const clientId = readString(formData, "client_id");
  if (!clientId) redirect("/crm/clients?error=Client%20id%20is%20required");

  const { me, data } = await requireClosureAccess(clientId);
  if (!data.canTransitionStatus) {
    redirectVisa(clientId, "error", "Only the assigned counselor or super admin can record visa decisions.");
  }

  const outcome = readString(formData, "outcome") as CrmClientVisaDecisionOutcome;
  const decidedAt = parseOptionalDate(readString(formData, "decided_at")) ?? new Date().toISOString();
  const note = readString(formData, "note") || null;
  if (!VISA_DECISION_OUTCOMES.includes(outcome)) {
    redirectVisa(clientId, "error", "Invalid visa decision outcome.");
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("crm_record_visa_decision", {
    p_client_id: clientId,
    p_outcome: outcome,
    p_decided_at: decidedAt,
    p_note: note,
    p_actor_user_id: requireActiveUserId(me.authUserId),
  });
  if (error) redirectVisa(clientId, "error", error.message);

  revalidateClientClosurePaths(clientId);
  redirectVisa(clientId, "ok", "Visa decision recorded.");
}

export async function moveToPreDepartureAction(formData: FormData): Promise<void> {
  const clientId = readString(formData, "client_id");
  if (!clientId) redirect("/crm/clients?error=Client%20id%20is%20required");

  const { me, data } = await requireClosureAccess(clientId);
  if (!data.canTransitionStatus) {
    redirectVisa(clientId, "error", "Only the assigned counselor or super admin can move clients to pre-departure.");
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("crm_transition_to_pre_departure", {
    p_client_id: clientId,
    p_note: readString(formData, "note") || null,
    p_actor_user_id: requireActiveUserId(me.authUserId),
  });
  if (error) redirectVisa(clientId, "error", error.message);

  revalidateClientClosurePaths(clientId);
  redirectClosure(clientId, "ok", "Client moved to pre-departure.");
}

export async function rollbackToVisaPrepAction(formData: FormData): Promise<void> {
  const clientId = readString(formData, "client_id");
  if (!clientId) redirect("/crm/clients?error=Client%20id%20is%20required");

  const { me, data } = await requireClosureAccess(clientId);
  if (!data.canTransitionStatus) {
    redirectVisa(clientId, "error", "Only the assigned counselor or super admin can roll back for re-application.");
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("crm_rollback_to_visa_prep", {
    p_client_id: clientId,
    p_note: readString(formData, "note") || null,
    p_actor_user_id: requireActiveUserId(me.authUserId),
  });
  if (error) redirectVisa(clientId, "error", error.message);

  revalidateClientClosurePaths(clientId);
  redirectVisa(clientId, "ok", "Client rolled back to visa prep.");
}

export async function updatePreDepartureFieldsAction(formData: FormData): Promise<void> {
  const clientId = readString(formData, "client_id");
  if (!clientId) redirect("/crm/clients?error=Client%20id%20is%20required");

  const { me, data } = await requireClosureAccess(clientId);
  if (!data.canTransitionStatus) {
    redirectClosure(clientId, "error", "Only the assigned counselor or super admin can update pre-departure details.");
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("crm_update_pre_departure_fields", {
    p_client_id: clientId,
    p_flight_date: parseOptionalDate(readString(formData, "flight_date")),
    p_flight_details: readString(formData, "flight_details") || null,
    p_accommodation_details: readString(formData, "accommodation_details") || null,
    p_briefing_completed_at: parseOptionalDate(readString(formData, "briefing_completed_at")),
    p_briefing_notes: readString(formData, "briefing_notes") || null,
    p_actor_user_id: requireActiveUserId(me.authUserId),
  });
  if (error) redirectClosure(clientId, "error", error.message);

  revalidateClientClosurePaths(clientId);
  redirectClosure(clientId, "ok", "Pre-departure details updated.");
}

export async function markDepartedAction(formData: FormData): Promise<void> {
  const clientId = readString(formData, "client_id");
  if (!clientId) redirect("/crm/clients?error=Client%20id%20is%20required");

  const { me, data } = await requireClosureAccess(clientId);
  if (!data.canTransitionStatus) {
    redirectClosure(clientId, "error", "Only the assigned counselor or super admin can mark departure.");
  }

  const departureDate = parseRequiredDate(readString(formData, "departure_date"));
  if (!departureDate) redirectClosure(clientId, "error", "Departure date is required.");

  const admin = createAdminClient();
  const { error } = await admin.rpc("crm_transition_to_departed", {
    p_client_id: clientId,
    p_departure_date: departureDate,
    p_note: readString(formData, "note") || null,
    p_actor_user_id: requireActiveUserId(me.authUserId),
  });
  if (error) redirectClosure(clientId, "error", error.message);

  revalidateClientClosurePaths(clientId);
  redirectClosure(clientId, "ok", "Client marked departed.");
}

export async function markAlumniAction(formData: FormData): Promise<void> {
  const clientId = readString(formData, "client_id");
  if (!clientId) redirect("/crm/clients?error=Client%20id%20is%20required");

  const { me, data } = await requireClosureAccess(clientId);
  if (!data.canTransitionStatus) {
    redirectClosure(clientId, "error", "Only the assigned counselor or super admin can mark alumni.");
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("crm_transition_to_alumni", {
    p_client_id: clientId,
    p_arrival_date: parseOptionalDate(readString(formData, "arrival_date")),
    p_alumni_notes: readString(formData, "alumni_notes") || null,
    p_actor_user_id: requireActiveUserId(me.authUserId),
  });
  if (error) redirectClosure(clientId, "error", error.message);

  revalidateClientClosurePaths(clientId);
  redirectClosure(clientId, "ok", "Client marked alumni.");
}

export async function withdrawClientAction(formData: FormData): Promise<void> {
  const clientId = readString(formData, "client_id");
  if (!clientId) redirect("/crm/clients?error=Client%20id%20is%20required");

  const { me, data } = await requireClosureAccess(clientId);
  if (!data.canWithdraw) {
    redirectClosure(clientId, "error", "Only super admins can withdraw clients.");
  }

  const reason = readString(formData, "reason");
  if (!reason) redirectClosure(clientId, "error", "Withdrawal reason is required.");
  const refundAmount = parseOptionalMoney(readString(formData, "refund_amount"));
  if (Number.isNaN(refundAmount)) {
    redirectClosure(clientId, "error", "Refund amount must be greater than zero.");
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("crm_withdraw_client", {
    p_client_id: clientId,
    p_reason: reason,
    p_refund_amount: refundAmount,
    p_refund_currency: readString(formData, "refund_currency") || "PKR",
    p_actor_user_id: requireActiveUserId(me.authUserId),
  });
  if (error) redirectClosure(clientId, "error", error.message);

  revalidateClientClosurePaths(clientId);
  redirectClosure(clientId, "ok", "Client withdrawn.");
}

export async function recordClientRefundAction(formData: FormData): Promise<void> {
  const clientId = readString(formData, "client_id");
  if (!clientId) redirect("/crm/clients?error=Client%20id%20is%20required");

  const { me, data } = await requireClosureAccess(clientId);
  if (!data.canRecordRefund) {
    redirectClosure(clientId, "error", "Only super admins can record refunds.");
  }
  if (data.client.status !== "withdrawn_refunded") {
    redirectClosure(clientId, "error", "Refunds can only be recorded for withdrawn/refunded clients.");
  }

  const amount = parseOptionalMoney(readString(formData, "amount"));
  const reason = readString(formData, "reason");
  if (!amount || Number.isNaN(amount)) {
    redirectClosure(clientId, "error", "Refund amount must be greater than zero.");
  }
  if (!reason) redirectClosure(clientId, "error", "Refund reason is required.");

  const admin = createAdminClient();
  const { error } = await admin.rpc("crm_record_client_refund", {
    p_client_id: clientId,
    p_amount: amount,
    p_currency: readString(formData, "currency") || "PKR",
    p_reason: reason,
    p_actor_user_id: requireActiveUserId(me.authUserId),
  });
  if (error) redirectClosure(clientId, "error", error.message);

  revalidateClientClosurePaths(clientId);
  redirectClosure(clientId, "ok", "Refund recorded.");
}
