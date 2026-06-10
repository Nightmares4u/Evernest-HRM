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
