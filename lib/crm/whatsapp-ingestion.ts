// Shared WhatsApp ingestion logic used by BOTH the direct Meta Cloud API
// webhook (`/api/webhooks/whatsapp`) and the WAB2C/BSP webhook
// (`/api/webhooks/wab2c`). Keeping one implementation means receipt-time
// ownership (Phase A), the rule parser, and the Gemini fallback behave
// identically no matter which transport delivered the message.
//
// This module is server-only (uses the service-role admin client). Never
// import it into a client component.

import { createAdminClient } from "@/lib/supabase/server";
import {
  parseRawIntakePayload,
  parserActivityPayload,
  parserActivityType,
} from "@/lib/crm/intake";
import { runGeminiParserFallback } from "@/lib/crm/gemini-parser";
import { resolveRawIntakeAssignment } from "@/lib/crm/assignment";

export type InboundWhatsappMessage = {
  /** Stored on raw_payload.source — distinguishes transports. */
  source: "whatsapp_cloud_api" | "wab2c";
  /** Human label used in the activity timeline description. */
  sourceLabel: string;
  /** Meta phone_number_id of the receiving EN number; null if unmatched. */
  phoneNumberId: string | null;
  /** Customer WhatsApp id / phone (digits, no plus). */
  waId: string;
  profileName: string | null;
  /** Meta WhatsApp message id (wamid...). Used for cross-transport dedupe. */
  messageId: string;
  /** Unix seconds, unix millis, or ISO-8601. Tolerant. */
  timestamp: string | null;
  textBody: string;
};

export type InboundIngestResult =
  | { status: "ingested"; rawInboxId: string }
  | { status: "duplicate"; messageId: string }
  | { status: "error"; reason: string };

// Tolerant timestamp → ISO. Meta sends unix seconds (10 digits); WAB2C may
// forward ISO or unix. Falls back to now() if unparseable so ingestion never
// fails on a bad timestamp.
function toReceivedAtIso(ts: string | null): string {
  if (!ts) return new Date().toISOString();
  const trimmed = ts.trim();
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    const ms = trimmed.length >= 13 ? n : n * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * Create a raw intake row from a normalized inbound WhatsApp text message:
 * dedupe → match receiving number → resolve receipt-time owner/branch →
 * rule parse → insert raw_inbox + message + activity → Gemini fallback.
 *
 * Idempotent on `crm_raw_inbox.first_wa_message_id`, so the same Meta message
 * arriving via both the direct webhook and WAB2C is ingested only once.
 */
export async function ingestInboundWhatsappMessage(
  input: InboundWhatsappMessage
): Promise<InboundIngestResult> {
  const admin = createAdminClient();

  // 1. Deduplicate by WhatsApp message id (cross-transport safe).
  const { data: existing } = await admin
    .from("crm_raw_inbox")
    .select("id")
    .eq("first_wa_message_id", input.messageId)
    .maybeSingle();
  if (existing) {
    return { status: "duplicate", messageId: input.messageId };
  }

  // 2. Match phone_number_id → crm_whatsapp_numbers (skip if no id).
  const { data: waNumber } = input.phoneNumberId
    ? await admin
        .from("crm_whatsapp_numbers")
        .select("id, assigned_employee_id, label, default_branch_id")
        .eq("phone_number_id", input.phoneNumberId)
        .eq("is_active", true)
        .maybeSingle()
    : { data: null };

  const receivedAt = toReceivedAtIso(input.timestamp);

  // 3. Resolve ownership at RECEIPT (Phase A) — the receiving EN number's
  //    counselor owns the inquiry regardless of message quality.
  const assignment = waNumber?.id
    ? await resolveRawIntakeAssignment({
        source_whatsapp_number_id: waNumber.id,
        campaign_source_id: null,
        fallback_branch_id: waNumber.default_branch_id ?? null,
      })
    : {
        assigned_employee_id: null,
        branch_id: null,
        assignment_method: null,
        assignment_reason: "No receiving WhatsApp number matched.",
      };

  // 4. Run rule-based parser (quality only).
  const parsedPayload = parseRawIntakePayload(input.textBody);

  // 5. Insert into crm_raw_inbox.
  const { data: rawRow, error: rawError } = await admin
    .from("crm_raw_inbox")
    .insert({
      whatsapp_number_id: waNumber?.id ?? null,
      campaign_source_id: null,
      sender_phone: input.waId,
      sender_name: input.profileName,
      first_wa_message_id: input.messageId,
      ...parsedPayload.rawUpdate,
      assigned_employee_id: assignment.assigned_employee_id,
      branch_id: assignment.branch_id,
      assignment_method: assignment.assignment_method,
      assignment_reason: assignment.assignment_reason,
      first_message_text: input.textBody,
      last_message_text: input.textBody,
      last_message_at: receivedAt,
    })
    .select("id")
    .single();

  if (rawError || !rawRow) {
    console.error("[whatsapp-ingestion] raw_inbox insert failed:", rawError);
    return { status: "error", reason: `insert_raw:${rawError?.message}` };
  }

  // 6. Insert inbound message + parser activity.
  const [{ error: messageError }, { error: activityError }] = await Promise.all([
    admin.from("crm_lead_messages").insert({
      raw_inbox_id: rawRow.id,
      lead_id: null,
      direction: "inbound",
      wa_message_id: input.messageId,
      from_phone: input.waId,
      to_phone: input.phoneNumberId,
      message_type: "text",
      content: input.textBody,
      raw_payload: {
        source: input.source,
        phone_number_id: input.phoneNumberId,
        profile_name: input.profileName,
        wa_timestamp: input.timestamp,
      },
      sent_by_employee_id: null,
      received_at: receivedAt,
    }),
    admin.from("crm_lead_activities").insert({
      lead_id: null,
      raw_inbox_id: rawRow.id,
      activity_type: parserActivityType(parsedPayload.parsed.confidence),
      actor_user_id: null,
      description: `Rule parser confidence ${parsedPayload.parsed.confidence.toFixed(
        2
      )} (${input.sourceLabel})`,
      payload: parserActivityPayload(parsedPayload.parsed),
    }),
  ]);
  if (messageError) {
    console.error("[whatsapp-ingestion] message insert failed:", messageError);
  }
  if (activityError) {
    console.error("[whatsapp-ingestion] activity insert failed:", activityError);
  }

  // 7. Log the receipt-time owner assignment (best-effort).
  if (assignment.assigned_employee_id) {
    const { error: assignActivityError } = await admin
      .from("crm_lead_activities")
      .insert({
        lead_id: null,
        raw_inbox_id: rawRow.id,
        activity_type: "assigned",
        actor_user_id: null,
        description:
          assignment.assignment_reason ??
          "Raw intake auto-assigned from WhatsApp number owner.",
        payload: {
          method: assignment.assignment_method,
          target_employee_id: assignment.assigned_employee_id,
          target_branch_id: assignment.branch_id,
          at: "receipt",
          source: input.source,
        },
      });
    if (assignActivityError) {
      console.error(
        "[whatsapp-ingestion] assignment activity insert failed:",
        assignActivityError
      );
    }
  }

  // 8. Gemini fallback for low-confidence results (extraction only).
  if (parsedPayload.parsed.confidence < 0.8) {
    const geminiResult = await runGeminiParserFallback(input.textBody, rawRow.id);
    if (geminiResult.ran && geminiResult.update) {
      await admin
        .from("crm_raw_inbox")
        .update(geminiResult.update)
        .eq("id", rawRow.id);
    }
  }

  return { status: "ingested", rawInboxId: rawRow.id };
}

export type OutboundWhatsappEcho = {
  source: string;
  /** The customer (other party) phone/wa_id — used to find the thread. */
  customerPhone: string | null;
  /** Receiving/business phone_number_id, if known. */
  businessPhoneNumberId: string | null;
  messageId: string | null;
  textBody: string | null;
  timestamp: string | null;
  rawPayload: unknown;
};

export type OutboundEchoResult = {
  status: "attached" | "ignored" | "duplicate" | "error";
  reason?: string;
};

/**
 * Attach an outbound/echo message (staff reply via API or native WhatsApp
 * Business app coexistence) to an EXISTING thread, if one can be matched
 * safely by customer phone. Never creates a raw intake or a lead — outbound
 * staff replies must never spawn a fresh lead. Failure to attach is not an
 * error; the webhook still returns 200.
 */
export async function attachOutboundWhatsappEcho(
  input: OutboundWhatsappEcho
): Promise<OutboundEchoResult> {
  // Need a message id (for dedupe) and a customer phone (to find the thread).
  if (!input.messageId) return { status: "ignored", reason: "no_message_id" };
  if (!input.customerPhone) {
    return { status: "ignored", reason: "no_customer_phone" };
  }

  const admin = createAdminClient();

  // Dedupe by WhatsApp message id.
  const { data: dupe } = await admin
    .from("crm_lead_messages")
    .select("id")
    .eq("wa_message_id", input.messageId)
    .maybeSingle();
  if (dupe) return { status: "duplicate", reason: input.messageId };

  // Safe thread match: most recent lead by customer phone, else most recent
  // raw intake by sender phone. No match → ignore (do not create anything).
  const { data: lead } = await admin
    .from("crm_leads")
    .select("id")
    .eq("customer_phone", input.customerPhone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let leadId: string | null = lead?.id ?? null;
  let rawInboxId: string | null = null;

  if (!leadId) {
    const { data: raw } = await admin
      .from("crm_raw_inbox")
      .select("id")
      .eq("sender_phone", input.customerPhone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    rawInboxId = raw?.id ?? null;
  }

  if (!leadId && !rawInboxId) {
    return { status: "ignored", reason: "no_thread_match" };
  }

  const receivedAt = input.timestamp
    ? toReceivedAtIso(input.timestamp)
    : new Date().toISOString();

  const { error } = await admin.from("crm_lead_messages").insert({
    raw_inbox_id: rawInboxId,
    lead_id: leadId,
    direction: "outbound",
    wa_message_id: input.messageId,
    from_phone: input.businessPhoneNumberId,
    to_phone: input.customerPhone,
    message_type: "text",
    content: input.textBody,
    raw_payload: { source: input.source, echo: true },
    sent_by_employee_id: null,
    received_at: receivedAt,
  });

  if (error) {
    // Unique wa_message_id index can race; treat as duplicate, not failure.
    console.error("[whatsapp-ingestion] outbound attach failed:", error.message);
    return { status: "error", reason: error.message };
  }

  return { status: "attached" };
}
