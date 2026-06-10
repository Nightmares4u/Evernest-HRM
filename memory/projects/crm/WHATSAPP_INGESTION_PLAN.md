# WhatsApp Ingestion & Gemini Parser Plan

> **Phase:** Testing & Ingestion Validation
> **Date:** 2026-06-03

## 1. Overview
Moving from manual CRM intake to automated WhatsApp Cloud API ingestion with Gemini-assisted parser fallback for low-confidence messages.

## 2. Phase 1 — Audit Findings (Completed 2026-06-03)

- **Webhook Route:** Missing. No `/api/webhooks/whatsapp`.
- **Meta Signature Verification:** Missing.
- **Message Extraction:** `lib/crm/intake.ts` and `lib/crm/parser.ts` handle text parsing but not raw WhatsApp JSON payload extraction.
- **Deduplication:** DB Unique index exists on `crm_raw_inbox(first_wa_message_id)`, but logic is missing.
- **Rule-based Parser:** `parseSevenQuestionReply` in `lib/crm/parser.ts` is fully functional.
- **Gemini Client:** `lib/ai/gemini.ts` REST wrapper is ready.

## 3. Phase 2 — Minimal Inbound Webhook

### Implementation Goals:
- `GET /api/webhooks/whatsapp`: Verification.
- `POST /api/webhooks/whatsapp`: Ingestion.
- Verify `X-Hub-Signature-256`.
- Extract: `phone_number_id`, `wa_id`, `profile_name`, `message_id`, `timestamp`, `text_body`.
- Insert into `crm_raw_inbox`.
- Run rule-based parser.
- Mark `needs_review` if confidence < 0.5.

### Env Vars Required:
- `META_WHATSAPP_VERIFY_TOKEN`
- `META_WHATSAPP_APP_SECRET`
- `META_WHATSAPP_ACCESS_TOKEN`

## 4. Phase 3 — Test Number Configuration

**Test Number Details:**
- **Display:** +92 371 1005492
- **ID:** `835340242988778`
- **WABA ID:** `1843052152952141`
- **Label:** Cloud API Test Number

**Action:** Ensure this exists in `crm_whatsapp_numbers` via Admin UI or SQL.

## 5. Phase 6 — Gemini Parser Fallback

### Purpose:
- Trigger only on low-confidence rule-based results.
- Extract structured fields from messy/non-standard text.
- Suggest missing fields.
- **Constraint:** Never auto-reply or auto-promote.

### Output Schema (Strict JSON):
```json
{
  "is_relevant": boolean,
  "confidence": number,
  "country_interest": string | null,
  "city": string | null,
  "qualification": string | null,
  "marks_or_cgpa": string | null,
  "study_gap": string | null,
  "budget_range": string | null,
  "english_test": string | null,
  "program_interest": string | null,
  "intent_summary": string,
  "missing_fields": string[],
  "recommended_internal_note": string
}
```

## 6. Testing & Regression (Phases 5 & 7)

- **Test Message 1:** High confidence study visa inquiry.
- **Test Message 2:** Low confidence vague inquiry.
- **Test Message 3:** Irrelevant "beef burger" message.
- **Manual Regression:** Promote raw -> lead -> client -> application -> visa -> closure.
- **Financials:** Verify PKR-only flow and admin dashboard reflection.

## 7. Operational Constraints
- No automated replies.
- No touching live staff numbers.
- PKR-only financials.

## 8. Phase A — Intake assignment + enrichment fix (DONE, branch `whatsapp-integration`)

Fixes the core operational break: a bad/partial inquiry was lost because
ownership was computed only at promotion and promotion hard-blocked on
missing country/city, while counselors could not even see unpromoted raw
rows. Philosophy now enforced: **the receiving EN number's owner owns the
inquiry at receipt regardless of message quality.**

- **Ownership at receipt.** Webhook (`app/api/webhooks/whatsapp/route.ts`)
  and `createManualRawIntake` now resolve the number owner via
  `resolveRawIntakeAssignment` (`lib/crm/assignment.ts`, reusing the existing
  source-owner waterfall) and write `assigned_employee_id`, `branch_id`,
  `assignment_method`, `assignment_reason` onto the raw row. No owner →
  admin/unassigned queue.
- **Quality ≠ ownership.** Parser/Gemini now classify a raw row only as
  `ready_for_promotion`, `needs_enrichment`, or `spam_duplicate`
  (`classifyRawIntake` in `lib/crm/intake.ts`, `toRawStatus` in
  `lib/crm/gemini-parser.ts`). Confidence never decides ownership.
- **Visibility.** `canViewRawInboxRow` (`lib/db/crm.ts`) now delegates to
  `canViewRawIntake` (`lib/crm/permissions-leads.ts`): assigned counselor +
  branch manager (same branch) + global admin see raw rows pre-promotion.
- **Enrichment.** New `enrichRawIntake` action + editable form on
  `/crm/inbox/[id]` let the owner/branch manager fill missing fields;
  country+city present ⇒ `ready_for_promotion`.
- **Promotion relaxed.** `promoteRawInboxToLead` no longer requires
  super_admin and no longer hard-blocks on missing country/city. The
  assigned owner/branch manager can promote; an incomplete lead is created
  with `crm_leads.needs_enrichment = true`. Spam rows cannot be promoted
  until re-classified via enrichment. Missing fields block QUALIFICATION,
  never ownership or lead existence.
- **Roles.** New `ops` value on `user_role` (Layer-1 only; behaviour in
  helpers, no capability table yet). Ops is intentionally NOT granted
  raw-intake access — raw stays with counselor/branch-manager/admin.

**Migrations:** `0024_crm_raw_intake_ownership.sql` (raw owner/branch/
enrichment columns + `needs_enrichment`/`ready_for_promotion` raw statuses +
assigned-counselor RLS), `0025_crm_lead_needs_enrichment_and_ops_role.sql`
(`crm_leads.needs_enrichment` + `ops` role). Both contain
`ALTER TYPE ... ADD VALUE` — apply out of transaction per the 0007/0011
precedent.

**Still pending (later phases):** Phase B role helpers across all CRM list
queries, Phase C manual `crm_ad_campaigns` shell, Phase D performance
dashboards, Phase E Meta API.

## 9. WAB2C / BSP coexistence webhook (LIVE on `main`)

> Merged to `main`. `WAB2C_WEBHOOK_SECRET` (+ `WAB2C_API_*`) are configured in
> Vercel; migrations are applied; production redeployed.

EN uses WAB2C/BSP for WhatsApp Business coexistence: Rabia keeps using the
native WhatsApp Business mobile app while WAB2C mirrors events. WAB2C forwards
WhatsApp events to our CRM via an outbound webhook.

### Correct WAB2C configuration
- **Page:** Tenant Panel → **WhatsMark Settings → Web Hooks**
  (`/{subdomain}/settings/whatsapp-web-hooks`). **NOT** "Ecom Webhooks" —
  those forward external store/order payloads INTO WAB2C to trigger templates;
  they are not the WhatsApp-event forwarding section.
- **Enable WebHooks Re-send:** ON · **Method:** POST
- **Webhook URL:** `https://evernest-hrm.vercel.app/api/webhooks/wab2c?secret=YOUR_SECRET`
- **Event fields (MVP):** Messages, Message Echoes, SMB Message Echoes.
  (Messages = inbound customer messages; Message Echoes = outbound echoes;
  SMB Message Echoes = native WhatsApp Business app coexistence replies.)
- **Do NOT subscribe** (noisy, defer to monitoring): Phone Number Name/Quality
  Update, Payment Config, Partner Solutions, Template Status/Quality, Account
  Alert, Web Message Echoes, Web App, Data Security.

### Route
- **`app/api/webhooks/wab2c/route.ts`** — POST ingest, GET health JSON.
  Coexists with the direct Meta route (`/api/webhooks/whatsapp`); both funnel
  inbound through the shared helper `lib/crm/whatsapp-ingestion.ts`.
- **Secret:** `WAB2C_WEBHOOK_SECRET`. Accepted via `x-webhook-secret`,
  `x-wab2c-secret`, `x-api-key`, `Authorization: Bearer`, or `?secret=` query
  (the WAB2C UI lacks an explicit secret field, so the query param is the
  practical option). Constant-time compare. If unset: allowed in development,
  **fail closed (401) in production**. Secret never logged.

### Payload handling
- **Normalizer:** `lib/wab2c/normalize.ts` → `NormalizedWab2cEvent`.
  Extraction priority: transformed/flat WAB2C fields → embedded Meta payload at
  `whatsapp.original_payload` → direct Meta shape. Full event kept in
  `rawPayload`. `customerPhone` is direction-aware (inbound = sender;
  outbound/status = recipient).
- **Inbound** (`whatsapp.message.received` / Meta `messages[]`, text only):
  create `crm_raw_inbox` + `crm_lead_messages` with **receipt-time ownership**
  (Phase A `resolveRawIntakeAssignment`), rule parser + Gemini fallback,
  status `ready_for_promotion`/`needs_enrichment`. No auto-promotion, no reply.
- **Outbound echo** (`whatsapp.message.sent`, message_echoes, smb_message_echoes):
  never creates a lead/raw intake. Attaches as an outbound `crm_lead_messages`
  row to an existing thread (lead by `customer_phone`, else raw intake by
  `sender_phone`) only if safely matched; otherwise 200 ignored. Deduped by
  `wa_message_id`.
- **Status** (delivered/read/failed/status.updated) and all other event types
  (template/account/phone/call/flow): 200 acknowledged + ignored, no mutation.

### Dedupe
- Inbound: `crm_raw_inbox.first_wa_message_id` using the **raw Meta WhatsApp
  message id** (no prefix), so the direct Meta route and WAB2C dedupe against
  each other if both ever receive the same event.
- Outbound: `crm_lead_messages.wa_message_id` (unique index).

### Limitations / notes
- WAB2C does not guarantee local WAB2C chat/contact ids in transformed
  attributes; mapping uses WhatsApp message id, customer phone, and
  phone_number_id. WAB2C API enrichment (`WAB2C_API_*`) is reserved for later.
- **Polling remains fallback only** — `GET /messages` is not called.
- **No outbound sending** — no WAB2C/WhatsApp send API, no templates, no auto-reply.
- Non-text inbound is skipped (matches the direct Meta route); revisit later.

### Env
`WAB2C_WEBHOOK_SECRET`, `WAB2C_API_BASE_URL`, `WAB2C_TENANT_SUBDOMAIN`,
`WAB2C_API_TOKEN` (API token optional/future). See `.env.local.example`.

### Test artifacts
- `scripts/wab2c-normalize-check.ts` — pure normalizer check, 4 cases (no DB).
- `scripts/wab2c-webhook-sim.mjs` — POST simulation against a local dev server.
