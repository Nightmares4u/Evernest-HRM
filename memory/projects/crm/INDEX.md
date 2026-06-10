# EN CRM Documentation Index

## 1. Purpose

This index serves as the master entry point and source of truth for the EN CRM module. It tells agents (Claude, Codex, Gemini, GPT) which documents to read, outlines the current implementation state, and provides operating rules to prevent architectural drift or scope creep.

## 2. Current Source of Truth

- **Repo:** `~/EN HRM` (EN CRM is a module built inside the existing HRM monorepo)
- **Status:** Integrated into `main`.
- **Base:** `main`

## 3. Read These First

Agents should read only the active docs below first. Archived audits,
reference extractions, and old plans are historical context only; they
must not be treated as current implementation state or current scope.

1. **`CURRENT_STATE.md`** - The factual record of what is actually implemented and shipped.
2. **`WHATSAPP_INGESTION_PLAN.md`** - The active plan for WhatsApp Cloud API ingestion and Gemini parser fallback.
3. **`CRM_BOARD.md`** - The operational task board, backlog, and immediate next steps.
4. **`CLIENT_LIFECYCLE_STAGE_2_PLAN.md`** - Detailed lifecycle rules for Stage 2 (Conversion, Docs, Applications, Visa, Closure, Financials).
5. **`STAGE_1_DECISIONS.md`** - Locked architectural and assignment rules for Stage 1 (WhatsApp intake, assignment routing).
6. **`CRM_AI_HANDOFF_AND_REFERENCE_ARCHITECTURE.md`** - Long-form architectural overview and agent handoff guide.

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

- **Current Integration State:** `review/main-plus-ui` contains the staged merge of `ui-revamp-experiment` plus CRM work from `crm-dev` and blocker fixes found during audit.
- **Stage 1 (Lead Management):** Complete.
- **Stage 2A-2E (Client Lifecycle):** Complete (Phase 2 mutations RPC hardened).
- **Phase 2F-1 (Client Financials & Refund Policy):** Complete.
- **Admin Financials MVP:** Complete.
- **Admin Task Maintenance:** Complete.
- **Internal CRM Assistant MVP:** Complete and production-hardened for missing docs / missing Gemini env.
- **UI/UX Revamp:** Broad dashboard/admin/CRM shell and page polish is staged from `ui-revamp-experiment`. Manual browser smoke testing is still required before final main merge.
- **Production/Main Fixes Preserved:** origin/main payroll preview/export attendance exemption fix is preserved, including `attendanceExempt`, `presentDays`, and export exemption behavior. `0016_task_workflow.sql` is preserved.
- **WhatsApp API:** Inbound ingestion is LIVE. Direct Meta Cloud API webhook (`/api/webhooks/whatsapp`, signature-verified) + Intake Phase A (ownership-at-receipt + enrichment + relaxed promotion + `ops` role, migrations `0024`/`0025`) merged to `main` via PR #7 — see `WHATSAPP_INGESTION_PLAN.md` §8. **WAB2C/BSP coexistence webhook** (`/api/webhooks/wab2c`) is LIVE on `main`, coexisting via shared helper `lib/crm/whatsapp-ingestion.ts` (env keys configured, production redeployed) — see §9. Outbound sending, auto-reply, and WAB2C polling remain out of scope.
- **Gemini Parser / Chatbot:** Parser fallback is LIVE for low-confidence intake extraction only (no auto-reply, no auto-promote, no lifecycle mutation). Client-facing chatbot still deferred.

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

**Webhook Routes (live):**
- `/api/webhooks/whatsapp` (direct Meta Cloud API webhook)
- `/api/webhooks/wab2c` (WAB2C/BSP coexistence webhook)

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
- `0023_crm_convert_lead_to_client_rpc.sql`
- `0024_crm_raw_intake_ownership.sql`
- `0025_crm_lead_needs_enrichment_and_ops_role.sql`

### 6.1 Migration 0023 Apply Status

`0023_crm_convert_lead_to_client_rpc.sql` has already been applied manually in Supabase before app deployment. It creates `public.crm_convert_lead_to_client`, which atomically creates the client shell, initial advance payment, and client-created activity. The app now calls this RPC from `convertLeadToClient`, so deployment must not happen against a database where `0023` is missing.

`0023` also adds `NOT VALID` PKR-only constraints for new/future CRM financial writes:

- `crm_clients.currency = 'PKR'`
- `crm_client_payments.currency = 'PKR'`
- `crm_client_refunds.currency = 'PKR'`
- `crm_client_applications.offer_amount_currency = 'PKR'`

`NOT VALID` means historical rows are not scanned/validated at apply time, but new inserts and future updates must satisfy the checks.

## 7. Current Next Tasks

1. **Claude Final Staged-Diff Audit:** Review all 143 staged files before committing the integration branch.
2. **Manual Browser Regression:** Smoke test Stage 1, Stage 2, financials, assistant, admin task maintenance, payroll preview/export, and UI responsive behavior.
3. **Lead Conversion Test:** Verify lead to client conversion now works through `crm_convert_lead_to_client` after manual `0023` apply.
4. **Permission/RLS-Sensitive Review:** Confirm refund controls, task maintenance, signed document URLs, and terminal-client mutation locks.
5. **WhatsApp API / Coexistence:** Future external work only. Do not add to this merge.
6. **Gemini Parser Fallback and Stage 3 Client Portal:** Later.

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
- **Final integration caution:** This branch is staged for audit only. Do not push, commit, or merge to `main` until the user explicitly approves after Claude/manual regression.
