// Normalizer for WAB2C/BSP forwarded WhatsApp webhook payloads.
//
// WAB2C forwards "N8N-style" JSON. The exact transformed field names are not
// fully documented and WAB2C does not guarantee local chat/contact ids, so
// this normalizer is deliberately defensive. Extraction priority:
//   1. Transformed/flat WAB2C fields.
//   2. The embedded Meta payload at `whatsapp.original_payload`.
//   3. A direct Meta payload shape (if WAB2C forwards Meta verbatim, or if a
//      Meta webhook is ever pointed at this route).
//
// We always keep the full original event in `rawPayload` for debugging.

export type Wab2cDirection = "inbound" | "outbound" | "status" | "unknown";

export type NormalizedWab2cEvent = {
  eventId: string | null;
  eventType: string | null;
  direction: Wab2cDirection;
  whatsappMessageId: string | null;
  customerPhone: string | null;
  customerName: string | null;
  businessPhoneNumber: string | null;
  phoneNumberId: string | null;
  messageType: string | null;
  textBody: string | null;
  timestamp: string | null;
  rawPayload: unknown;
};

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

// Pick the first non-empty string found at any of the given dotted paths.
function pickString(root: unknown, paths: string[]): string | null {
  for (const path of paths) {
    const val = getPath(root, path);
    if (typeof val === "string" && val.trim() !== "") return val;
    if (typeof val === "number") return String(val);
  }
  return null;
}

function getPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split(".")) {
    if (!isObj(cur)) return undefined;
    cur = cur[seg];
  }
  return cur;
}

function classifyDirection(eventType: string | null): Wab2cDirection {
  const t = (eventType ?? "").toLowerCase();
  if (!t) return "unknown";
  if (t.includes("received")) return "inbound";
  if (t.includes("echo") || t.includes("sent")) return "outbound";
  if (
    t.includes("delivered") ||
    t.includes("read") ||
    t.includes("failed") ||
    t.includes("status")
  ) {
    return "status";
  }
  return "unknown";
}

// Locate an embedded Meta "whatsapp_business_account" payload if present.
function findMetaPayload(root: unknown): Json | null {
  const candidates = [
    "whatsapp.original_payload",
    "original_payload",
    "data.whatsapp.original_payload",
    "data.original_payload",
    "payload.original_payload",
  ];
  for (const path of candidates) {
    const v = getPath(root, path);
    if (isObj(v)) return v;
  }
  // The root itself may be a direct Meta payload.
  if (isObj(root) && root.object === "whatsapp_business_account") return root;
  return null;
}

type MetaExtract = {
  phoneNumberId: string | null;
  displayPhone: string | null;
  messageId: string | null;
  from: string | null;
  to: string | null;
  contactWaId: string | null;
  contactName: string | null;
  messageType: string | null;
  textBody: string | null;
  timestamp: string | null;
  statusRecipient: string | null;
  statusId: string | null;
  hasMessage: boolean;
  hasStatus: boolean;
};

function extractFromMeta(meta: Json | null): MetaExtract {
  const empty: MetaExtract = {
    phoneNumberId: null,
    displayPhone: null,
    messageId: null,
    from: null,
    to: null,
    contactWaId: null,
    contactName: null,
    messageType: null,
    textBody: null,
    timestamp: null,
    statusRecipient: null,
    statusId: null,
    hasMessage: false,
    hasStatus: false,
  };
  if (!meta) return empty;

  for (const entry of asArray(meta.entry)) {
    if (!isObj(entry)) continue;
    for (const change of asArray(entry.changes)) {
      if (!isObj(change)) continue;
      const value = isObj(change.value) ? change.value : null;
      if (!value) continue;

      const metadata = isObj(value.metadata) ? value.metadata : null;
      const phoneNumberId =
        (metadata?.phone_number_id as string | undefined) ?? null;
      const displayPhone =
        (metadata?.display_phone_number as string | undefined) ?? null;

      const messages = asArray(value.messages);
      const contacts = asArray(value.contacts);
      const statuses = asArray(value.statuses);

      if (messages.length > 0 && isObj(messages[0])) {
        const m = messages[0] as Json;
        const contact = isObj(contacts[0]) ? (contacts[0] as Json) : null;
        const profile = contact && isObj(contact.profile) ? contact.profile : null;
        const text = isObj(m.text) ? (m.text.body as string | undefined) : undefined;
        return {
          ...empty,
          phoneNumberId,
          displayPhone,
          messageId: (m.id as string | undefined) ?? null,
          from: (m.from as string | undefined) ?? null,
          to: (m.to as string | undefined) ?? null,
          contactWaId: (contact?.wa_id as string | undefined) ?? null,
          contactName: (profile?.name as string | undefined) ?? null,
          messageType: (m.type as string | undefined) ?? null,
          textBody: text ?? null,
          timestamp: (m.timestamp as string | undefined) ?? null,
          hasMessage: true,
        };
      }

      if (statuses.length > 0 && isObj(statuses[0])) {
        const s = statuses[0] as Json;
        return {
          ...empty,
          phoneNumberId,
          displayPhone,
          statusId: (s.id as string | undefined) ?? null,
          statusRecipient: (s.recipient_id as string | undefined) ?? null,
          timestamp: (s.timestamp as string | undefined) ?? null,
          hasStatus: true,
        };
      }

      // Metadata-only change (e.g., echo wrappers): still capture identifiers.
      if (phoneNumberId || displayPhone) {
        return { ...empty, phoneNumberId, displayPhone };
      }
    }
  }
  return empty;
}

export function normalizeWab2cEvent(body: unknown): NormalizedWab2cEvent {
  const root = body;

  const eventType = pickString(root, [
    "event_type",
    "type",
    "event.type",
    "event",
    "data.event_type",
    "whatsapp.event_type",
  ]);
  const eventId = pickString(root, [
    "id",
    "event_id",
    "uuid",
    "event.id",
    "data.id",
  ]);

  const meta = findMetaPayload(root);
  const m = extractFromMeta(meta);

  // Direction first — it decides which party is the "customer".
  let direction = classifyDirection(eventType);
  if (direction === "unknown") {
    if (m.hasMessage) direction = "inbound";
    else if (m.hasStatus) direction = "status";
  }

  // 1. Transformed/flat WAB2C fields take priority, then fall back to Meta.
  const whatsappMessageId =
    pickString(root, [
      "whatsapp_message_id",
      "message_id",
      "wamid",
      "message.id",
      "whatsapp.message_id",
      "data.message_id",
      "data.message.id",
    ]) ?? m.messageId ?? m.statusId;

  // The customer is the OTHER party. Inbound: the sender. Outbound/status:
  // the recipient (`to` / recipient_id), never the business `from`.
  const customerPhone =
    direction === "inbound"
      ? pickString(root, [
          "customer_phone",
          "from",
          "sender",
          "wa_id",
          "contact.wa_id",
          "message.from",
          "data.from",
          "data.contact.wa_id",
        ]) ??
        m.contactWaId ??
        m.from
      : pickString(root, [
          "customer_phone",
          "to",
          "recipient",
          "recipient_id",
          "contact.wa_id",
          "message.to",
          "data.to",
          "data.recipient_id",
        ]) ??
        m.to ??
        m.statusRecipient ??
        m.contactWaId;

  const customerName =
    pickString(root, [
      "profile_name",
      "contact_name",
      "sender_name",
      "contact.profile.name",
      "contact.name",
      "data.contact.profile.name",
    ]) ?? m.contactName;

  const businessPhoneNumber =
    pickString(root, [
      "display_phone_number",
      "business_phone_number",
      "business_phone",
      "to",
      "data.display_phone_number",
    ]) ?? m.displayPhone;

  const phoneNumberId =
    pickString(root, [
      "phone_number_id",
      "business_phone_number_id",
      "metadata.phone_number_id",
      "data.phone_number_id",
    ]) ?? m.phoneNumberId;

  const messageType =
    pickString(root, [
      "message_type",
      "message.type",
      "data.message_type",
      "data.message.type",
    ]) ?? m.messageType;

  const textBody =
    pickString(root, [
      "text_body",
      "text",
      "body",
      "message.text.body",
      "message.text",
      "message.body",
      "data.text",
      "data.message.text.body",
    ]) ?? m.textBody;

  const timestamp =
    pickString(root, [
      "timestamp",
      "message.timestamp",
      "created_at",
      "event_timestamp",
      "data.timestamp",
    ]) ?? m.timestamp;

  return {
    eventId,
    eventType,
    direction,
    whatsappMessageId,
    customerPhone,
    customerName,
    businessPhoneNumber,
    phoneNumberId,
    messageType,
    textBody,
    timestamp,
    rawPayload: body,
  };
}
