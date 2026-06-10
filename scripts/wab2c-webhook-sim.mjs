// Simulate WAB2C webhook POSTs against a LOCAL dev server.
// Usage:
//   1) npm run dev   (in another terminal)
//   2) WAB2C_WEBHOOK_SECRET=yoursecret node scripts/wab2c-webhook-sim.mjs [baseUrl]
// Default baseUrl: http://localhost:3000
// Sends inbound (complete + minimal), an outbound echo, and a delivered status.
// WARNING: writes raw intake rows to whatever DB the dev server is pointed at.

const BASE = process.argv[2] || "http://localhost:3000";
const SECRET = process.env.WAB2C_WEBHOOK_SECRET || "";
const URL = `${BASE}/api/webhooks/wab2c${SECRET ? `?secret=${encodeURIComponent(SECRET)}` : ""}`;

const PNID = "835340242988778";
const DISPLAY = "+923711005492";
const CUSTOMER = "923001234567";

const metaInbound = (text, id) => ({
  event_type: "whatsapp.message.received", id: "evt_" + id,
  whatsapp: { original_payload: { object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ value: {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: DISPLAY, phone_number_id: PNID },
    contacts: [{ wa_id: CUSTOMER, profile: { name: "Sim User" } }],
    messages: [{ id, from: CUSTOMER, timestamp: String(Math.floor(Date.now()/1000)), type: "text", text: { body: text } }],
  } }] }] } },
});

const cases = [
  ["Test 1 complete inbound", metaInbound("I want Italy study visa from Lahore. Intermediate, 72%, 1 year gap, budget 25 lac, no IELTS.", "wamid.SIM-T1-" + Date.now())],
  ["Test 2 minimal inbound", metaInbound("I want Australia. Please guide me.", "wamid.SIM-T2-" + Date.now())],
  ["Test 3 outbound echo", { event_type: "whatsapp.message.sent", id: "evt_echo",
    message_id: "wamid.SIM-OUT-" + Date.now(), from: DISPLAY, to: CUSTOMER, phone_number_id: PNID,
    text: "Thanks for reaching out!", timestamp: String(Math.floor(Date.now()/1000)) }],
  ["Test 4 delivered status", { event_type: "whatsapp.message.delivered", id: "evt_dlv",
    whatsapp: { original_payload: { object: "whatsapp_business_account", entry: [{ changes: [{ value: {
      metadata: { display_phone_number: DISPLAY, phone_number_id: PNID },
      statuses: [{ id: "wamid.SIM-OUT", status: "delivered", recipient_id: CUSTOMER, timestamp: String(Math.floor(Date.now()/1000)) }],
    } }] }] } } }],
];

for (const [name, payload] of cases) {
  try {
    const res = await fetch(URL, { method: "POST", headers: { "content-type": "application/json", "x-webhook-secret": SECRET }, body: JSON.stringify(payload) });
    console.log(`${name}: ${res.status} ${await res.text()}`);
  } catch (e) {
    console.log(`${name}: ERROR ${e.message}`);
  }
}
