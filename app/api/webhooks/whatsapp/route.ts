import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  parseRawIntakePayload,
  parserActivityPayload,
  parserActivityType,
} from "@/lib/crm/intake";
import { runGeminiParserFallback } from "@/lib/crm/gemini-parser";

const VERIFY_TOKEN = process.env.META_WHATSAPP_VERIFY_TOKEN ?? "";
const APP_SECRET = process.env.META_WHATSAPP_APP_SECRET ?? "";

function hexEncode(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifySignature(
  rawBody: string,
  signatureHeader: string | null
): Promise<boolean> {
  if (!APP_SECRET || !signatureHeader) return false;
  const expected = signatureHeader.replace("sha256=", "");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody)
  );
  return hexEncode(sig) === expected;
}

// ---------- GET: Meta webhook verification ----------

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ---------- POST: Inbound message ingestion ----------

type WaMessage = {
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  from: string;
};

type WaContact = {
  wa_id: string;
  profile?: { name?: string };
};

type WaMetadataValue = {
  display_phone_number: string;
  phone_number_id: string;
};

type WaChange = {
  value: {
    messaging_product: string;
    metadata: WaMetadataValue;
    contacts?: WaContact[];
    messages?: WaMessage[];
    statuses?: unknown[];
  };
};

type WaEntry = {
  id: string;
  changes: WaChange[];
};

type WaWebhookPayload = {
  object: string;
  entry: WaEntry[];
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const valid = await verifySignature(
    rawBody,
    request.headers.get("x-hub-signature-256")
  );
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: WaWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WaWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.object !== "whatsapp_business_account") {
    return NextResponse.json({ ok: true });
  }

  const results: string[] = [];

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const { metadata, contacts, messages } = change.value;
      if (!messages?.length) continue;

      for (const msg of messages) {
        if (msg.type !== "text" || !msg.text?.body) continue;

        const contact = contacts?.find((c) => c.wa_id === msg.from);
        const result = await ingestMessage({
          phoneNumberId: metadata.phone_number_id,
          waId: msg.from,
          profileName: contact?.profile?.name ?? null,
          messageId: msg.id,
          timestamp: msg.timestamp,
          textBody: msg.text.body,
        });
        results.push(result);
      }
    }
  }

  return NextResponse.json({ ok: true, results });
}

// ---------- Core ingestion logic ----------

type IngestInput = {
  phoneNumberId: string;
  waId: string;
  profileName: string | null;
  messageId: string;
  timestamp: string;
  textBody: string;
};

async function ingestMessage(input: IngestInput): Promise<string> {
  const admin = createAdminClient();

  // 1. Deduplicate by wa_message_id
  const { data: existing } = await admin
    .from("crm_raw_inbox")
    .select("id")
    .eq("first_wa_message_id", input.messageId)
    .maybeSingle();

  if (existing) {
    return `duplicate:${input.messageId}`;
  }

  // 2. Match phone_number_id → crm_whatsapp_numbers
  const { data: waNumber } = await admin
    .from("crm_whatsapp_numbers")
    .select("id, assigned_employee_id, label")
    .eq("phone_number_id", input.phoneNumberId)
    .eq("is_active", true)
    .maybeSingle();

  const receivedAt = new Date(Number(input.timestamp) * 1000).toISOString();

  // 3. Run rule-based parser
  const parsedPayload = parseRawIntakePayload(input.textBody);

  // 4. Insert into crm_raw_inbox
  const { data: rawRow, error: rawError } = await admin
    .from("crm_raw_inbox")
    .insert({
      whatsapp_number_id: waNumber?.id ?? null,
      campaign_source_id: null,
      sender_phone: input.waId,
      sender_name: input.profileName,
      first_wa_message_id: input.messageId,
      ...parsedPayload.rawUpdate,
      first_message_text: input.textBody,
      last_message_text: input.textBody,
      last_message_at: receivedAt,
    })
    .select("id")
    .single();

  if (rawError || !rawRow) {
    console.error("[whatsapp-webhook] raw_inbox insert failed:", rawError);
    return `error:insert_raw:${rawError?.message}`;
  }

  // 5. Insert into crm_lead_messages + crm_lead_activities
  const [{ error: messageError }, { error: activityError }] = await Promise.all(
    [
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
          source: "whatsapp_cloud_api",
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
        description: `Rule parser confidence ${parsedPayload.parsed.confidence.toFixed(2)} (WhatsApp Cloud API)`,
        payload: parserActivityPayload(parsedPayload.parsed),
      }),
    ]
  );

  if (messageError) {
    console.error("[whatsapp-webhook] message insert failed:", messageError);
  }
  if (activityError) {
    console.error("[whatsapp-webhook] activity insert failed:", activityError);
  }

  // 6. Gemini fallback for low-confidence results
  if (parsedPayload.parsed.confidence < 0.8) {
    const geminiResult = await runGeminiParserFallback(
      input.textBody,
      rawRow.id
    );
    if (geminiResult.ran && geminiResult.update) {
      await admin
        .from("crm_raw_inbox")
        .update(geminiResult.update)
        .eq("id", rawRow.id);
    }
  }

  return `ingested:${rawRow.id}`;
}
