# EN CRM Documentation Index

## 1. Purpose

This index serves as the master entry point and source of truth for the EN CRM module. It tells agents (Claude, Codex, Gemini, GPT) which documents to read, outlines the current implementation state, and provides operating rules to prevent architectural drift or scope creep.

## 2. Current Source of Truth

- **Repo:** `~/EN HRM` (EN CRM is a module built inside the existing HRM monorepo)
- **Integration branch under final audit:** `review/main-plus-ui`
- **Base:** `origin/main`
- **Merged source:** `ui-revamp-experiment`
- **CRM source branch included:** `crm-dev`
- **Commit status:** integration changes are staged only; no integration commit, push, or merge into `main` has been performed yet.
- **Warning:** The old `evernest-crm-starter` repo is for reference/inspiration only. Do not treat its code or docs as the current implementation state. For the final merge audit, inspect the staged diff on `review/main-plus-ui` against `origin/main`.

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

- **Current Integration State:** `review/main-plus-ui` contains the staged merge of `ui-revamp-experiment` plus CRM work from `crm-dev` and blocker fixes found during audit.
- **Stage 1 (Lead Management):** Complete.
- **Stage 2A-2E (Client Lifecycle):** Complete (Phase 2 mutations RPC hardened).
- **Phase 2F-1 (Client Financials & Refund Policy):** Complete.
- **Admin Financials MVP:** Complete.
- **Admin Task Maintenance:** Complete.
- **Internal CRM Assistant MVP:** Complete and production-hardened for missing docs / missing Gemini env.
- **UI/UX Revamp:** Broad dashboard/admin/CRM shell and page polish is staged from `ui-revamp-experiment`. Manual browser smoke testing is still required before final main merge.
- **Production/Main Fixes Preserved:** origin/main payroll preview/export attendance exemption fix is preserved, including `attendanceExempt`, `presentDays`, and export exemption behavior. `0016_task_workflow.sql` is preserved.
- **WhatsApp API:** Paused. No WhatsApp webhook/API/coexistence implementation is included in this integration.
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
- `0023_crm_convert_lead_to_client_rpc.sql`

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
