"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/server";
import { canRecordClientPayment } from "@/lib/crm/permissions-clients";
import type { CrmLead } from "@/lib/types/crm";

const CRM_FINANCIAL_CURRENCY = "PKR";

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

  const { data: convertedRows, error: conversionError } = await admin.rpc(
    "crm_convert_lead_to_client",
    {
      p_lead_id: lead.id,
      p_target_country: targetCountry,
      p_target_level: targetLevel,
      p_agreement_signed_at: agreementSignedAt.toISOString(),
      p_advance_paid_at: advancePaidAt.toISOString(),
      p_advance_amount: advanceAmount,
      p_total_fee: totalFee,
      p_actor_user_id: me.authUserId,
    }
  );

  const converted = Array.isArray(convertedRows) ? convertedRows[0] : null;
  if (conversionError || !converted) {
    redirectLead(
      lead.id,
      "error",
      `Could not create client: ${conversionError?.message ?? "No row returned."}`
    );
  }

  revalidatePath("/crm/clients");
  revalidatePath(`/crm/clients/${converted.client_id}`);
  revalidatePath(`/crm/leads/${lead.id}`);
  revalidatePath("/admin/crm/clients/conversion-queue");
  redirectLead(lead.id, "ok", `Client created: ${converted.client_code}.`);
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
  const reference = readString(formData, "reference") || null;
  const notes = readString(formData, "notes") || null;
  if (amount == null) redirectClient(clientId, "error", "Payment amount must be greater than zero.", returnTo);
  if (!paidAt) redirectClient(clientId, "error", "Payment date/time is required.", returnTo);
  if (!method) redirectClient(clientId, "error", "Payment method is required.", returnTo);

  const admin = createAdminClient();

  // Terminal-state guard, payment insert, and activity log run atomically
  // in crm_record_client_payment (migration 0022). Permission check above
  // stays in the action; data integrity belongs to the RPC.
  const { error: rpcError } = await admin.rpc("crm_record_client_payment", {
    p_client_id: clientId,
    p_amount: amount,
    p_currency: CRM_FINANCIAL_CURRENCY,
    p_paid_at: paidAt.toISOString(),
    p_method: method,
    p_reference: reference,
    p_notes: notes,
    p_actor_user_id: me.authUserId,
  });

  if (rpcError) {
    redirectClient(clientId, "error", `Could not record payment: ${rpcError.message}`, returnTo);
  }

  revalidatePath("/crm/clients");
  revalidatePath(`/crm/clients/${clientId}`);
  revalidatePath(`/crm/clients/${clientId}/financials`);
  redirectClient(clientId, "ok", "Payment recorded.", returnTo);
}
