import { NextRequest, NextResponse } from "next/server";
import { ingestInboundWhatsappMessage } from "@/lib/crm/whatsapp-ingestion";

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
        const result = await ingestInboundWhatsappMessage({
          source: "whatsapp_cloud_api",
          sourceLabel: "WhatsApp Cloud API",
          phoneNumberId: metadata.phone_number_id,
          waId: msg.from,
          profileName: contact?.profile?.name ?? null,
          messageId: msg.id,
          timestamp: msg.timestamp,
          textBody: msg.text.body,
        });
        results.push(
          result.status === "ingested"
            ? `ingested:${result.rawInboxId}`
            : result.status === "duplicate"
              ? `duplicate:${result.messageId}`
              : `error:${result.reason}`
        );
      }
    }
  }

  return NextResponse.json({ ok: true, results });
}
