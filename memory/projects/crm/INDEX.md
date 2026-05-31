# EN CRM Documentation Index

## 1. Purpose

This index serves as the master entry point and source of truth for the EN CRM module. It tells agents (Claude, Codex, Gemini, GPT) which documents to read, outlines the current implementation state, and provides operating rules to prevent architectural drift or scope creep.

## 2. Current Source of Truth

- **Repo:** `~/EN HRM` (EN CRM is a module built inside the existing HRM monorepo)
- **Branch:** `crm-dev`
- **Warning:** The old `evernest-crm-starter` repo is for reference/inspiration only. Do not treat its code or docs as the current implementation state. `crm-dev` is the only source of truth.

## 3. Read These First

1. **`CURRENT_STATE.md`** - The factual record of what is actually implemented and shipped.
2. **`CRM_BOARD.md`** - The operational task board, backlog, and immediate next steps.
3. **`CLIENT_LIFECYCLE_STAGE_2_PLAN.md`** - Detailed lifecycle rules for Stage 2 (Conversion, Docs, Applications, Visa, Closure, Financials).
4. **`STAGE_1_DECISIONS.md`** - Locked architectural and assignment rules for Stage 1 (WhatsApp intake, assignment routing).
5. **`CRM_AI_HANDOFF_AND_REFERENCE_ARCHITECTURE.md`** - Long-form architectural overview and agent handoff guide.

> **Warning:** Do not treat stale docs or plans as implementation truth. Always verify against `CURRENT_STATE.md` and the actual codebase.

## 4. Current Implementation Snapshot

- **Stage 1 (Lead Management):** Complete.
- **Stage 2A-2E (Client Lifecycle):** Complete.
- **Phase 2F-1 (Client Financials & Refund Policy):** Complete.
- **Admin Financials:** Planned / Next.
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

**Admin CRM:**
- `/admin/crm`
- `/admin/crm/whatsapp-numbers`
- `/admin/crm/campaign-sources`
- `/admin/crm/assignment-rules`
- `/admin/crm/transfers`
- `/admin/crm/clients/conversion-queue`
- `/admin/crm/clients/doc-review`

**Future / Planned Routes:**
- `/admin/financials` or `/admin/crm/financials` (Admin Financials)
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

## 7. Current Next Tasks

1. **Admin Financials:** (Company-wide inflow/outflow, combining CRM and HRM).
2. **Full Regression Testing:** (Manual smoke tests for Stage 2 features).
3. **WhatsApp API MVP:** (Webhook verification, receive message, map to `phone_number_id`, create raw inbox, auto-parse).
4. **UX Polish:** (After functional completion).
5. **RPC Backlog:** (Opportunistically migrate older Stage 2A-2D multi-table writes to RPCs).

## 8. Deferred / Do Not Build Yet

- **Stage 3 Client Portal:** (Deferred until staff-side CRM is stable).
- **Gemini Chatbot / Parser:** (Rule-based parser remains default).
- **Invoices:** (Not needed yet).
- **Commissions:** (Out of scope for now).
- **HRM Task Sync:** (CRM has its own follow-up tracking).
- **Ad-spend Automation:** (Meta spend sync is deferred).

## 9. Agent Operating Rules

- **Read current docs first:** Always check `INDEX.md`, `CURRENT_STATE.md`, and `CRM_BOARD.md` before coding.
- **No broad feature creep:** Stick to the immediate task. Do not build deferred features.
- **No `git add .`:** Do not blindly stage files.
- **No commit / push:** Do not commit or push unless explicitly asked by the user.
- **Always report:** Detail the files changed, build/typecheck status, and migrations needed. Provide a safe `git add` command for the user.
- **Schema changes = Migrations:** Never alter the database without a new migration file.
- **Multi-table mutations:** MUST use Postgres RPCs (functions) or, if unavoidable in legacy code, implement manual compensation to prevent orphan rows.
