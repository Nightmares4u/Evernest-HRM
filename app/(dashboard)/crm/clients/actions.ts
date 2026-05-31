"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/server";
import { canRecordClientPayment, isClientTerminal } from "@/lib/crm/permissions-clients";
import type { CrmClient, CrmLead } from "@/lib/types/crm";

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function parsePakistanDateTime(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const zoned = new Date(trimmed);
  if (Number.isFinite(zoned.getTime()) && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
    return zoned;
  }

  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) return Number.isFinite(zoned.getTime()) ? zoned : null;

  const [, year, month, day, hour, minute, second = "0"] = match;
  const utcTime = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - 5,
    Number(minute),
    Number(second)
  );
  const date = new Date(utcTime);
  return Number.isFinite(date.getTime()) ? date : null;
}

function parseRequiredMoney(value: string): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function parseOptionalMoney(value: string): number | null {
  if (!value.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function requireActiveUser(me: CurrentUser | null): CurrentUser {
  if (!me) redirect("/login");
  if (!me.appUser.is_active) {
    redirect("/dashboard?error=Active%20user%20required");
  }
  return me;
}

function canConvertLead(me: CurrentUser, lead: CrmLead): boolean {
  // → clients.convert (future RBAC permission key)
  return me.appUser.role === "super_admin" || me.employee?.id === lead.assigned_agent_id;
}

function redirectLead(leadId: string, key: "ok" | "error", message: string): never {
  redirect(`/crm/leads/${leadId}?${key}=${encodeURIComponent(message)}`);
}

function redirectClient(
  clientId: string,
  key: "ok" | "error",
  message: string,
  returnTo?: string
): never {
  const path =
    returnTo === "financials"
      ? `/crm/clients/${clientId}/financials`
      : `/crm/clients/${clientId}`;
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
}

export async function convertLeadToClient(formData: FormData): Promise<void> {
  const me = requireActiveUser(await getCurrentUser());
  const leadId = readString(formData, "lead_id");
  if (!leadId) redirect("/crm/leads?error=Lead%20id%20is%20required");

  const clientType = readString(formData, "client_type") || "student";
  if (clientType !== "student") {
    redirectLead(leadId, "error", "Phase 2A only supports student clients.");
  }

  const agreementSignedAt = parsePakistanDateTime(readString(formData, "agreement_signed_at"));
  const advancePaidAt = parsePakistanDateTime(readString(formData, "advance_paid_at"));
  const advanceAmount = parseRequiredMoney(readString(formData, "advance_amount"));
  const totalFee = parseOptionalMoney(readString(formData, "total_fee"));
  const currency = readString(formData, "currency") || "PKR";
  const targetCountry = readString(formData, "target_country") || null;
  const targetLevel = readString(formData, "target_level") || null;

  if (!agreementSignedAt) {
    redirectLead(leadId, "error", "Agreement signed date/time is required.");
  }
  if (!advancePaidAt) {
    redirectLead(leadId, "error", "Advance paid date/time is required.");
  }
  if (advanceAmount == null) {
    redirectLead(leadId, "error", "Advance amount must be greater than zero.");
  }

  const admin = createAdminClient();
  const { data: leadData, error: leadError } = await admin
    .from("crm_leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError) redirectLead(leadId, "error", `Could not load lead: ${leadError.message}`);
  if (!leadData) redirectLead(leadId, "error", "Lead not found.");

  const lead = leadData as CrmLead;
  if (lead.status !== "converted") {
    redirectLead(lead.id, "error", "Only leads marked converted can become clients.");
  }
  if (!canConvertLead(me, lead)) {
    redirectLead(lead.id, "error", "Only the assigned counselor or super admin can convert this lead.");
  }

  const { data: existingClient, error: existingError } = await admin
    .from("crm_clients")
    .select("id, client_code")
    .eq("lead_id", lead.id)
    .maybeSingle();

  if (existingError) {
    redirectLead(lead.id, "error", `Could not check existing client: ${existingError.message}`);
  }
  if (existingClient) {
    redirectLead(lead.id, "ok", `Client already exists: ${existingClient.client_code}.`);
  }

  const { data: clientData, error: clientError } = await admin
    .from("crm_clients")
    .insert({
      lead_id: lead.id,
      client_type: "student",
      target_country: targetCountry,
      target_level: targetLevel,
      agreement_signed_at: agreementSignedAt.toISOString(),
      advance_paid_at: advancePaidAt.toISOString(),
      advance_amount: advanceAmount,
      total_fee: totalFee,
      currency,
      assigned_agent_id: lead.assigned_agent_id,
      branch_id: lead.branch_id,
      created_by_user_id: me.authUserId,
    })
    .select("*")
    .single();

  if (clientError || !clientData) {
    redirectLead(lead.id, "error", `Could not create client: ${clientError?.message ?? "No row returned."}`);
  }

  const client = clientData as CrmClient;
  const { error: paymentError } = await admin.from("crm_client_payments").insert({
    client_id: client.id,
    amount: advanceAmount,
    currency,
    paid_at: advancePaidAt.toISOString(),
    method: "other",
    reference: "Initial advance on conversion",
    recorded_by_user_id: me.authUserId,
  });

  if (paymentError) {
    // Compensation: delete the just-created client so the user can retry.
    // crm_client_payments has ON DELETE CASCADE so any partial payment
    // row would also be cleared — defensive against future schema changes.
    await admin.from("crm_clients").delete().eq("id", client.id);
    redirectLead(
      lead.id,
      "error",
      `Client created, but advance payment failed (rolled back): ${paymentError.message}`
    );
  }

  const { error: activityError } = await admin.from("crm_client_activities").insert({
    client_id: client.id,
    activity_type: "client_created",
    actor_user_id: me.authUserId,
    description: `Client created from lead ${lead.customer_phone}.`,
    payload: {
      lead_id: lead.id,
      client_code: client.client_code,
      advance_amount: advanceAmount,
      currency,
    },
  });

  if (activityError) {
    // Compensation: delete the client; cascades wipe the payment row and
    // any orphan activity rows would be cleared too. User can retry.
    await admin.from("crm_clients").delete().eq("id", client.id);
    redirectLead(
      lead.id,
      "error",
      `Client created, but activity log failed (rolled back): ${activityError.message}`
    );
  }

  revalidatePath("/crm/clients");
  revalidatePath(`/crm/clients/${client.id}`);
  revalidatePath(`/crm/leads/${lead.id}`);
  revalidatePath("/admin/crm/clients/conversion-queue");
  redirectLead(lead.id, "ok", `Client created: ${client.client_code}.`);
}

export async function recordClientPayment(formData: FormData): Promise<void> {
  const me = requireActiveUser(await getCurrentUser());
  const clientId = readString(formData, "client_id");
  const returnTo = readString(formData, "return_to");
  if (!clientId) redirect("/crm/clients?error=Client%20id%20is%20required");
  if (!canRecordClientPayment(me)) {
    redirectClient(clientId, "error", "Only super admin can record client payments.", returnTo);
  }

  const amount = parseRequiredMoney(readString(formData, "amount"));
  const paidAt = parsePakistanDateTime(readString(formData, "paid_at"));
  const method = readString(formData, "method");
  const currency = readString(formData, "currency") || "PKR";
  const reference = readString(formData, "reference") || null;
  const notes = readString(formData, "notes") || null;
  if (amount == null) redirectClient(clientId, "error", "Payment amount must be greater than zero.", returnTo);
  if (!paidAt) redirectClient(clientId, "error", "Payment date/time is required.", returnTo);
  if (!method) redirectClient(clientId, "error", "Payment method is required.", returnTo);

  const admin = createAdminClient();

  // Terminal state guard: do NOT allow new payments against alumni or
  // withdrawn clients. Refunds for withdrawn clients go through the
  // closure refund flow, not this action.
  const { data: clientRow } = await admin
    .from("crm_clients")
    .select("status")
    .eq("id", clientId)
    .maybeSingle();
  if (!clientRow) {
    redirectClient(clientId, "error", "Client not found.", returnTo);
  }
  if (isClientTerminal(clientRow as Pick<CrmClient, "status">)) {
    redirectClient(
      clientId,
      "error",
      `Cannot record a payment against a ${(clientRow as Pick<CrmClient, "status">).status} client.`,
      returnTo
    );
  }
  const { data: paymentRow, error: paymentError } = await admin
    .from("crm_client_payments")
    .insert({
      client_id: clientId,
      amount,
      currency,
      paid_at: paidAt.toISOString(),
      method,
      reference,
      notes,
      recorded_by_user_id: me.authUserId,
    })
    .select("id")
    .single();

  if (paymentError || !paymentRow) {
    redirectClient(
      clientId,
      "error",
      `Could not record payment: ${paymentError?.message ?? "unknown error"}`,
      returnTo
    );
  }

  const { error: activityError } = await admin.from("crm_client_activities").insert({
    client_id: clientId,
    activity_type: "payment_recorded",
    actor_user_id: me.authUserId,
    description: `Payment recorded: ${currency} ${amount.toFixed(2)}.`,
    payload: {
      payment_id: paymentRow.id,
      amount,
      currency,
      paid_at: paidAt.toISOString(),
      method,
      reference,
    },
  });

  if (activityError) {
    await admin.from("crm_client_payments").delete().eq("id", paymentRow.id);
    redirectClient(
      clientId,
      "error",
      `Payment recorded, but activity failed (rolled back): ${activityError.message}`,
      returnTo
    );
  }

  revalidatePath("/crm/clients");
  revalidatePath(`/crm/clients/${clientId}`);
  revalidatePath(`/crm/clients/${clientId}/financials`);
  redirectClient(clientId, "ok", "Payment recorded.", returnTo);
}
