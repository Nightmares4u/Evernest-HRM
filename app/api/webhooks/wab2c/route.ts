import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { normalizeWab2cEvent } from "@/lib/wab2c/normalize";
import {
  attachOutboundWhatsappEcho,
  ingestInboundWhatsappMessage,
} from "@/lib/crm/whatsapp-ingestion";

// WAB2C / BSP WhatsApp coexistence webhook (inbound + echo MIRROR only).
// Coexists with the direct Meta webhook at /api/webhooks/whatsapp; both
// funnel inbound messages through the same shared ingestion helper.
//
// No outbound sending, no auto-reply, no polling. Inbound creates raw intake
// with receipt-time ownership (Phase A); outbound echoes attach to an
// existing thread only if safe; status/other events are acknowledged + ignored.

const WEBHOOK_SECRET = process.env.WAB2C_WEBHOOK_SECRET ?? "";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Constant-time, length-safe comparison (compares SHA-256 digests).
function secretMatches(provided: string): boolean {
  if (!WEBHOOK_SECRET || !provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(WEBHOOK_SECRET).digest();
  return timingSafeEqual(a, b);
}

// Accept the secret from any common header, bearer token, or ?secret= query.
function extractProvidedSecret(request: NextRequest): string {
  const h = request.headers;
  const auth = h.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  return (
    h.get("x-webhook-secret") ??
    h.get("x-wab2c-secret") ??
    h.get("x-api-key") ??
    (bearer || null) ??
    request.nextUrl.searchParams.get("secret") ??
    ""
  );
}

// Returns null if authorized, or a NextResponse to short-circuit with.
function authorize(request: NextRequest): NextResponse | null {
  if (WEBHOOK_SECRET) {
    if (!secretMatches(extractProvidedSecret(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return null;
  }
  // No secret configured: allow in development, fail closed in production.
  if (IS_PRODUCTION) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 401 }
    );
  }
  return null;
}

export async function GET() {
  // Health check only — never echoes secrets or config values.
  return NextResponse.json({ ok: true, service: "wab2c-webhook" });
}

export async function POST(request: NextRequest) {
  const denied = authorize(request);
  if (denied) return denied;

  const rawBody = await request.text();
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = normalizeWab2cEvent(body);

  // INBOUND customer message → create raw intake (Phase A ownership + parser).
  if (event.direction === "inbound") {
    // Text-only for MVP, matching the direct Meta webhook.
    if (event.messageType && event.messageType !== "text") {
      return NextResponse.json({ ok: true, ignored: "non_text_inbound" });
    }
    if (!event.textBody || !event.whatsappMessageId || !event.customerPhone) {
      return NextResponse.json({ ok: true, ignored: "incomplete_inbound" });
    }
    const result = await ingestInboundWhatsappMessage({
      source: "wab2c",
      sourceLabel: "WAB2C",
      phoneNumberId: event.phoneNumberId,
      businessPhoneNumber: event.businessPhoneNumber,
      waId: event.customerPhone,
      profileName: event.customerName,
      messageId: event.whatsappMessageId,
      timestamp: event.timestamp,
      textBody: event.textBody,
    });
    return NextResponse.json({ ok: true, inbound: result });
  }

  // OUTBOUND / ECHO (staff or coexistence reply) → attach to existing thread
  // if safe. Never creates a lead or raw intake.
  if (event.direction === "outbound") {
    const result = await attachOutboundWhatsappEcho({
      source: "wab2c_echo",
      customerPhone: event.customerPhone,
      businessPhoneNumberId: event.phoneNumberId,
      messageId: event.whatsappMessageId,
      textBody: event.textBody,
      timestamp: event.timestamp,
      rawPayload: body,
    });
    return NextResponse.json({ ok: true, outbound: result });
  }

  // STATUS (delivered/read/failed/status.updated) and everything else →
  // acknowledge and ignore. No CRM mutation in this phase.
  return NextResponse.json({
    ok: true,
    ignored: event.direction === "status" ? "status_event" : "other_event",
    eventType: event.eventType,
  });
}
