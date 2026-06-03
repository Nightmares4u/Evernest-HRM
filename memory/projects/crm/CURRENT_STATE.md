# Current State

> **Last updated:** 2026-06-03 (Integration branch final-audit prep)
> **Branch under audit:** `review/main-plus-ui`
> **Base:** `origin/main`
> **Merged source:** `ui-revamp-experiment`
> **CRM source included:** `crm-dev`
> **Commit status:** all integration changes are staged; no integration commit, push, or merge into `main` yet.

## Status Summary

The CRM is feature-complete through Stage 2F-1 (Client Financials & Refund Policy), with Phase 2A/2D multi-table mutations atomically hardened via RPC (migration 0022).
A read-only **Admin Financials MVP** now lives at `/admin/financials` and combines CRM payment/refund inflow with HRM payroll-preview outflow (PKR-only).
An **Internal CRM Assistant MVP** lives at `/crm/assistant` allowing staff to query the CRM planning documentation via Gemini. The integration branch includes production hardening so missing markdown docs fail clearly and missing `GEMINI_API_KEY` does not break the build.
An **Admin Task Maintenance** cleanup tool is available at `/admin/tasks/maintenance` for reducing test pollution.

The core workflow from raw WhatsApp/manual intake, rule-based parsing, assignment, lead qualification, client conversion, application tracking, visa gating, closure, and basic client financials is staged on `review/main-plus-ui`.

### Current Integration State

- Integration branch: `review/main-plus-ui`.
- Base: `origin/main`.
- Merged source: `ui-revamp-experiment`.
- CRM source branch included: `crm-dev`.
- No commit, push, or merge into `main` has been performed.
- All integration changes are currently staged for a final Claude/manual audit.
- `0023_crm_convert_lead_to_client_rpc.sql` has already been applied manually in Supabase and must exist before deploying the app code.
- Production/main payroll preview fixes are preserved: `attendanceExempt` handling, `presentDays` preview visibility, and payroll export exemption logic.
- `0016_task_workflow.sql` is preserved.

### Latest Known Feature / Hardening Commits
- `69b8506 feat: add internal CRM assistant`
- `d5ba1f3 feat: add admin task maintenance cleanup`
- `da5c04b feat: add admin financials dashboard`
- `fe34141 docs: mark CRM RPC hardening complete`
- `81c287f refactor: harden CRM Phase 2 mutations with RPCs`
- `6453589 docs: archive historical CRM planning and audit files`
- `907be8f docs: refresh CRM source of truth after financials`
- `52bed07 feat: add CRM client financials and refund policy hardening`
- `7df4746 fix(crm): production-hardening sweep across Stage 1/2 — A-1, terminal locks, activity union`

## Feature State by Stage

### Stage 1 (Lead Management) - Completed
- **Raw Inbox vs. Leads:** Raw incoming messages are separate from qualified leads.
- **Explicit Promotion:** Lead promotion from the raw inbox is a deliberate manual action.
- **Parser:** A rule-based structured parser extracts data on intake creation. (Gemini AI parser is deferred).
- **Assignment Routing:** The receiving source WhatsApp number drives primary ownership. Fallback counselor routing is supported per number. Assignment rules engine acts strictly as a fallback mechanism for complex cases.
- **Transfers:** Counselor-to-counselor transfers/handoffs are a first-class workflow with an explicit request/accept/reject flow.
- **Workbenches:** Lead detail includes a counselor workbench for notes, status changes, and follow-up scheduling. A read-only follow-up board tracks due tasks.

### Stage 2A-2E (Client Lifecycle) - Completed
- **Phase 2A (Conversion):** A lead only converts to a client when `agreement_signed_at` and `advance_paid_at` are provided. A unique client code is generated. The integration branch now uses `public.crm_convert_lead_to_client` from migration `0023` so client creation, initial advance payment, and client-created activity are one atomic RPC.
- **Phase 2B (Documents):** Private document registry utilizing Supabase Storage and 15-minute signed URLs. Re-uploads use a `superseded_by_id` pointer for audit trails.
- **Phase 2C (Applications):** Per-university application rows. A client can have at most one accepted application.
- **Phase 2D (Visa Milestones):** Country-driven milestone checklists. A client cannot enter `visa_submitted` unless required milestones are `done` or `not_applicable`.
- **Phase 2E (Closure):** Closure states include `pre_departure`, `departed`, `alumni` (successful completion), and `withdrawn_refunded` (failure/withdrawal). Terminal clients (`alumni`, `withdrawn_refunded`) are locked from normal workflow mutations. Phase 2E actions are fully RPC-first for atomic writes.
- **RPC Hardening:** Migration `0022_crm_phase_2a_2d_rpc_backfill.sql` added Postgres RPC hardening for Phase 2A/2D multi-table mutations. Audit backlog items A-2 (`recordClientPayment`), A-8, A-9, and A-10 are completed by commit `81c287f`.
- **RPC Hardening Follow-up:** Migration `0023_crm_convert_lead_to_client_rpc.sql` completes the conversion RPC path for `convertLeadToClient`, replacing the prior sequential/manual-compensation risk.

### Phase 2F-1 (Client Financials) - Completed
- **Financials Tab:** `/crm/clients/[id]/financials` tracks client-level payments and refunds.
- **Terminal State Lock:** Payments are allowed only on non-terminal clients. Refunds are NOT allowed on `alumni` clients (hardened in both UI and Postgres RPC `crm_record_client_refund`).
- **Refund Policy:** Refunds are restricted to the `withdrawn_refunded` closure path and are strictly a `super_admin` action.
- **PKR-only hardening:** Editable currency inputs are removed/hidden from conversion, payment, refund, and application financial forms. UI displays fixed "PKR only"; server actions force PKR and no longer trust submitted currency values.
- **Migration 0023 constraints:** `NOT VALID` checks enforce PKR for new/future writes to `crm_clients.currency`, `crm_client_payments.currency`, `crm_client_refunds.currency`, and `crm_client_applications.offer_amount_currency`. Historical rows are not validated by the migration apply.

### Admin Financials MVP - Completed
- **Route:** `/admin/financials` (super_admin only). Read-only company-wide dashboard.
- **CRM inflow:** This-month and all-time totals for PKR payments received and refunds. Recent payment / refund tables (last 20 each) with links to the client financials/closure pages.
- **HRM outflow:** Monthly payroll outflow computed from the existing `buildPayrollPreview` helper (no finalized payroll-run table exists yet). Labeled as a preview-based estimate.
- **Currency:** PKR-only MVP. Non-PKR rows are excluded from totals and surface an amber warning banner. FX / multi-currency support is deferred to a separate feature.
- **No new tables / migrations.** Pure read-only aggregation over `crm_client_payments`, `crm_client_refunds`, and HRM payroll preview inputs.

### Admin Task Maintenance - Completed
- **Route:** `/admin/tasks/maintenance` (super_admin only).
- **Function:** Deletes test/stale task data from DB to reduce test pollution and conserve database space.
- **Safety:** Preview + typed confirmation. Does not touch payroll, attendance, leave, CRM records, employees, branches, or real HRM data.

### Internal CRM Assistant MVP - Completed
- **Route:** `/crm/assistant` (any authenticated active staff user).
- **Model:** Uses Gemini API (`GEMINI_API_KEY` in environment, `GEMINI_MODEL` optional/default). Server-side REST call only; key never reaches the client.
- **Knowledge source:** Static CRM planning docs (INDEX, CURRENT_STATE, CRM_BOARD, CLIENT_LIFECYCLE_STAGE_2_PLAN, STAGE_1_DECISIONS, CRM_AI_HANDOFF_AND_REFERENCE_ARCHITECTURE) loaded from `memory/projects/crm/` and injected into the prompt. `next.config.ts` includes these markdown files in Next/Vercel output tracing for `/crm/assistant`.
- **Safety & Scope:** Internal staff guidance only. System prompt forbids inventing routes/actions/RPCs, performing mutations, giving legal/visa guarantees, and revealing secrets. No database mutations/action execution.
- **Failure mode:** Missing `GEMINI_API_KEY` disables answers gracefully and does not break build. If docs cannot be loaded on the server, the assistant fails clearly instead of asking Gemini without grounding.
- **Limitations:** Static-context MVP. Vector search/embeddings are deferred. No chat history storage. No WhatsApp integration. No automated WhatsApp replies. No client-facing chatbot. No parser fallback yet.

### UI/UX Revamp - Staged for Final Audit
- **Source:** `ui-revamp-experiment` merged into `review/main-plus-ui` with `--no-ff --no-commit`.
- **Scope included:** dashboard/admin/CRM UI polish, grouped app shell/sidebar, logo/icon work, shared UI components, lifecycle tabs, data tables, cards, status badges, and task maintenance danger-zone styling.
- **Server/client boundary fix:** Sidebar receives icon string keys from the server layout and maps them to Lucide components inside the client component.
- **Still required:** Manual browser smoke testing for desktop/mobile layout, forms, server actions, responsive tables, sidebar behavior, and assistant access.

### WhatsApp Status
- WhatsApp API/coexistence work is paused.
- No WhatsApp webhook/API implementation was added in this integration.
- CRM remains designed around WhatsApp-first operations, but automatic WhatsApp ingestion is not part of this merge.
- BSP/coexistence investigation remains external/future work.

## Pending / Planned Work

- **Final Claude Staged-Diff Audit:** Review all 143 staged files before committing the integration branch.
- **Full Regression Testing:** Manual smoke testing across Stage 1 + Stage 2 + Financials + Assistant + Admin Task Maintenance + Payroll before internal rollout.
- **Lead Conversion Test:** Verify `convertLeadToClient` works against the manually applied `0023` RPC.
- **UI Browser Smoke Test:** Verify sidebar/app shell, dashboard/admin pages, CRM pages, responsive tables, forms, and assistant routes.
- **WhatsApp API / Coexistence:** Paused for this merge; revisit later.
- **Gemini Chatbot / Parser:** Deferred.
- **Stage 3 Client Portal:** Deferred.

## Current Migrations Map
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

## Current Route Inventory

**Staff Routes:**
- `/crm/inbox` (List) & `/crm/inbox/[id]` (Detail)
- `/crm/leads` (List) & `/crm/leads/[id]` (Detail)
- `/crm/leads/follow-ups` (Board)
- `/crm/transfers` (Pending requests)
- `/crm/clients` (List)
- `/crm/clients/[id]` (Detail)
- `/crm/clients/[id]/documents`
- `/crm/clients/[id]/applications`
- `/crm/clients/[id]/visa`
- `/crm/clients/[id]/closure`
- `/crm/clients/[id]/financials`
- `/crm/assistant` (Internal CRM docs-grounded assistant)

**Admin Routes:**
- `/admin/crm`
- `/admin/crm/whatsapp-numbers`
- `/admin/crm/campaign-sources`
- `/admin/crm/assignment-rules`
- `/admin/crm/transfers`
- `/admin/crm/clients/conversion-queue`
- `/admin/crm/clients/doc-review`
- `/admin/financials` (super_admin only)
- `/admin/tasks/maintenance` (DB cleanup tool)

## Known Backlog & Technical Deb
- Phase 2A/2D audit items A-2, A-8, A-9, and A-10 are closed by commit `81c287f` and migration `0022`. They are no longer on the immediate backlog for RPC conversion.
- Final audit must still verify destructive Admin Task Maintenance, CRM permission gates, signed document URL checks, terminal-client mutation locks, payroll preview/export exemption behavior, and assistant behavior with and without `GEMINI_API_KEY`.
