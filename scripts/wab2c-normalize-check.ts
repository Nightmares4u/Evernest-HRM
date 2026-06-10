// Pure-function check of the WAB2C normalizer against the 4 required cases.
// No DB writes. Run: npx tsx scripts/wab2c-normalize-check.ts
import { normalizeWab2cEvent } from "../lib/wab2c/normalize";

const BUSINESS_PNID = "835340242988778";
const BUSINESS_DISPLAY = "+923711005492";
const CUSTOMER = "923001234567";

function metaInbound(text: string, msgId: string) {
  return {
    event_type: "whatsapp.message.received",
    id: "evt_" + msgId,
    whatsapp: {
      original_payload: {
        object: "whatsapp_business_account",
        entry: [{ id: "WABA", changes: [{ value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: BUSINESS_DISPLAY, phone_number_id: BUSINESS_PNID },
          contacts: [{ wa_id: CUSTOMER, profile: { name: "Test User" } }],
          messages: [{ id: msgId, from: CUSTOMER, timestamp: "1717400000", type: "text", text: { body: text } }],
        } }] }],
      },
    },
  };
}

const cases: Array<{ name: string; payload: unknown; expectDirection: string }> = [
  { name: "Test 1 — complete inbound", expectDirection: "inbound",
    payload: metaInbound("I want Italy study visa from Lahore. Intermediate, 72%, 1 year gap, budget 25 lac, no IELTS.", "wamid.T1") },
  { name: "Test 2 — minimal inbound", expectDirection: "inbound",
    payload: metaInbound("I want Australia. Please guide me.", "wamid.T2") },
  { name: "Test 3 — outbound echo", expectDirection: "outbound",
    payload: { event_type: "whatsapp.message.sent", id: "evt_echo",
      message_id: "wamid.OUT1", from: BUSINESS_DISPLAY, to: CUSTOMER, phone_number_id: BUSINESS_PNID,
      text: "Thanks for reaching out, how can we help?", timestamp: "1717400100" } },
  { name: "Test 4 — delivered status", expectDirection: "status",
    payload: { event_type: "whatsapp.message.delivered", id: "evt_dlv",
      whatsapp: { original_payload: { object: "whatsapp_business_account", entry: [{ changes: [{ value: {
        metadata: { display_phone_number: BUSINESS_DISPLAY, phone_number_id: BUSINESS_PNID },
        statuses: [{ id: "wamid.OUT1", status: "delivered", recipient_id: CUSTOMER, timestamp: "1717400200" }],
      } }] }] } } } },
];

let pass = 0;
for (const c of cases) {
  const n = normalizeWab2cEvent(c.payload);
  const ok = n.direction === c.expectDirection;
  pass += ok ? 1 : 0;
  console.log(`\n${c.name}: ${ok ? "PASS" : "FAIL"} (direction=${n.direction}, expected ${c.expectDirection})`);
  console.log(`  msgId=${n.whatsappMessageId} customer=${n.customerPhone} pnid=${n.phoneNumberId} type=${n.messageType} text=${n.textBody ? JSON.stringify(n.textBody.slice(0,40)+"...") : null}`);
}
console.log(`\n${pass}/${cases.length} direction checks passed`);
if (pass !== cases.length) process.exit(1);
