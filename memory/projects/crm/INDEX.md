# EN CRM Documentation Index

## 1. Purpose

This index serves as the master entry point and source of truth for the EN CRM module. It tells agents (Claude, Codex, Gemini, GPT) which documents to read, outlines the current implementation state, and provides operating rules to prevent architectural drift or scope creep.

## 2. Current Source of Truth

- **Repo:** `~/EN HRM` (EN CRM is a module built inside the existing HRM monorepo)
- **Branch:** `crm-dev`
- **Warning:** The old `evernest-crm-starter` repo is for reference/inspiration only. Do not treat its code or docs as the current implementation state. `crm-dev` is the only source of truth.

## 3. Read These First

Agents should read only the active docs below first. Archived audits,
reference extractions, and old plans are historical context only; they
must not be treated as current implementation state or current scope.

1. **`CURRENT_STATE.md`** - The factual record of what is actually implemented and shipped.
2. **`CRM_BOARD.md`** - The operational task board, backlog, and immediate next steps.
3. **`CLIENT_LIFECYCLE_STAGE_2_PLAN.md`** - Detailed lifecycle rules for Stage 2 (Conversion, Docs, Applications, Visa, Closure, Financials).
4. **`STAGE_1_DECISIONS.md`** - Locked architectural and assignment rules for Stage 1 (WhatsApp intake, assignment routing).
5. **`CRM_AI_HANDOFF_AND_REFERENCE_ARCHITECTURE.md`** - Long-form architectural overview and agent handoff guide.

> **Warning:** Do not treat stale docs or plans as implementation truth. Always verify against `CURRENT_STATE.md` and the actual codebase.

## 3.1 Archive

The `archive/` directory contains historical-only material. Read it only
when a user explicitly asks for audit history, provenance, or old
reference material. Future agents should not treat archived audits as current implementation truth.

- `archive/GEMINI_AUDIT_2026_05_23.md` - historical audit findings only.
- `archive/CRM_SMOKE_TEST_AUDIT_2026_05_31.md` - historical smoke-test report only.
- `archive/REFERENCE_CRM_INTEGRATION_AUDIT.md` - historical reference audit only.
- `archive/REFERENCE_CODE_EXTRACTION_MAP.md` - historical extraction/reference notes only.
- `archive/CRM_MASTER_CONTEXT.md` - historical planning context only.
- `archive/CRM_HRM_INTEGRATION.md` - historical integration notes only.
- `archive/CRM_SETTINGS_INTEGRATION_NOTES.md` - historical settings notes only.
- `archive/WHATSAPP_META_PIPELINE.md` - historical WhatsApp pipeline notes only.
- `archive/WHATSAPP_STAGE_1_INTAKE.md` - historical Stage 1 intake notes only.

Do not use archived audits to override `CURRENT_STATE.md`, `CRM_BOARD.md`,
`CLIENT_LIFECYCLE_STAGE_2_PLAN.md`, or the actual codebase.

## 4. Current Implementation Snapshot

- **Stage 1 (Lead Management):** Complete.
- **Stage 2A-2E (Client Lifecycle):** Complete (Phase 2 mutations RPC hardened).
- **Phase 2F-1 (Client Financials & Refund Policy):** Complete.
- **Admin Financials MVP:** Complete.
- **Admin Task Maintenance:** Complete.
- **Internal CRM Assistant MVP:** Complete.
- **WhatsApp API:** Pending (Meta/WABA setup pending).
- **Gemini Parser / Chatbot:** Deferred.

## 5. Current Route Map

**Staff CRM (Lead Management):**
- `/crm/inbox` & `/crm/inbox/[id]`
- `/crm/leads` & `/crm/leads/[id]`
- `/crm/leads/follow-ups`
- `/crm/transfers`

**Client Lifecycle (Stage 2):**
- `/crm/clients` & `/crm/clients/[id]`
- `/crm/clients/[id]/documents`
- `/crm/clients/[id]/applications`
- `/crm/clients/[id]/visa`
- `/crm/clients/[id]/closure`

**Financials:**
- `/crm/clients/[id]/financials` (Client-level financials)

**Assistant:**
- `/crm/assistant` (Internal CRM docs-grounded assistant)

**Admin CRM:**
- `/admin/crm`
- `/admin/crm/whatsapp-numbers`
- `/admin/crm/campaign-sources`
- `/admin/crm/assignment-rules`
- `/admin/crm/transfers`
- `/admin/crm/clients/conversion-queue`
- `/admin/crm/clients/doc-review`
- `/admin/financials` (Company-wide CRM/HRM dashboard)
- `/admin/tasks/maintenance` (DB cleanup tool)

**Future / Planned Routes:**
- `/api/webhooks/whatsapp` (WhatsApp API Webhook)

## 6. Current Migration Map

- `0009_crm_stage_1_foundation.sql`
- `0010_crm_assignment_rules_phase_4.sql`
- `0011_crm_number_ownership.sql`
- `0012_crm_whatsapp_number_fallback.sql`
- `0013_crm_lead_transfers.sql`
- `0014_crm_followup_activity_types.sql`
- `0015_crm_clients_phase_2a.sql`
- `0017_crm_client_documents_phase_2b.sql`
- `0018_crm_client_applications_phase_2c.sql`
- `0019_crm_client_country_milestones_phase_2d.sql`
- `0020_crm_client_closure_phase_2e.sql`
- `0021_crm_refund_policy_hardening.sql`
- `0022_crm_phase_2a_2d_rpc_backfill.sql`

## 7. Current Next Tasks

1. **Full Regression Testing:** (Manual smoke tests across Stage 1, Stage 2, Financials, and Assistant before internal rollout).
2. **Manual Migrations Check:** Verify `0022` is applied in Supabase.
3. **WhatsApp API MVP:** (Webhook verification, receive message, map to `phone_number_id`, create raw inbox, auto-parse).
4. **UX Polish:** (After functional regression).
5. **Gemini Parser Fallback:** (Later).
6. **Stage 3 Client Portal:** (Later).

## 8. Deferred / Do Not Build Yet

- **Stage 3 Client Portal:** (Deferred until staff-side CRM is stable).
- **Gemini Chatbot / Parser:** (Rule-based parser remains default).
- **Multi-Currency:** (Financials remains PKR-only until explicit currency feature).
- **Invoices:** (Not needed yet).
- **Commissions:** (Out of scope for now).
- **HRM Task Sync:** (CRM has its own follow-up tracking).
- **Ad-spend Automation:** (Meta spend sync is deferred).

## 9. Agent Operating Rules

- **Read current docs first:** Always check `INDEX.md`, `CURRENT_STATE.md`, and `CRM_BOARD.md` before coding. `crm-dev` is the source of truth. Archived docs are historical only.
- **No broad feature creep:** Stick to the immediate task. Do not build WhatsApp API / Gemini parser / client portal unless explicitly requested. Keep financials PKR-only.
- **No `git add .`:** Do not blindly stage files.
- **No commit / push:** Do not commit or push unless explicitly asked by the user.
- **Always report:** Detail the files changed, build/typecheck status, and migrations needed. Provide a safe `git add` command for the user.
- **Schema changes = Migrations:** Never alter the database without a new migration file.
- **Multi-table mutations:** MUST use Postgres RPCs (functions) or, if unavoidable in legacy code, implement careful manual compensation.