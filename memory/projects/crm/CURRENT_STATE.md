# Current State

> **Last updated:** 2026-07-02 (Business pivot: direct client shells)
> **Branch:** `feature/direct-client-shells`
> **Status:** Intake pipeline paused; lifecycle starts at client shells.

## ⚠️ 2026-07 Business Pivot — Direct Client Shells

The WhatsApp-based raw-inbox → lead → client intake pipeline is **paused, not deleted**. The client lifecycle now starts directly at client shell creation. Key facts:

- **Feature flag:** `lib/crm/feature-flags.ts` → `CRM_INTAKE_ENABLED = false`. Intake routes (`/crm/inbox`, `/crm/leads`, `/crm/leads/follow-ups`, `/crm/transfers`, `/admin/crm/transfers`, `/admin/crm/clients/conversion-queue`) are gated by tiny `layout.tsx` redirects; nav items are commented out in `app/(dashboard)/layout.tsx`. All intake code (pages, actions, `lib/crm/whatsapp-ingestion.ts`, parsers, permissions-leads) is preserved for later re-wiring.
- **WhatsApp webhook APIs removed:** `app/api/webhooks/whatsapp` and `app/api/webhooks/wab2c` route handlers are deleted (recoverable from git history) so nothing writes intake data anymore. WhatsApp env keys remain in `.env.local` but are unused.
- **Database wiped of intake test data (2026-07-02):** all rows deleted from raw inbox, leads (+messages/assignments/activities/transfers), clients (+payments, refunds, invoices, steps, documents, applications, milestones, visa decisions, activities) — 573 rows + 47 storage files (`crm-client-docs` bucket). Config tables kept: `crm_whatsapp_numbers`, `crm_campaign_sources`, `crm_assignment_rules`. Script: `scripts/cleanup-crm-test-data.mjs --confirm`.
- **Direct client shells (migration `0027`):** `crm_clients.lead_id`, `agreement_signed_at`, `advance_paid_at` are now nullable; clients carry their own `customer_name`/`customer_phone`. New RPC `crm_create_client_shell` atomically creates client + invoice + DUE Step 1 "Registration / Agreement Fees" (advance optional — no payment row until a step is marked paid). UI: `/crm/clients/new` + "New client shell" button on the clients list.
- **Hierarchy:** counselors (sales) create their own shells (self-assigned, own branch); branch managers create within their branch; `ops`, `admin_hr`, `super_admin` create anywhere. Ops has full lifecycle access (docs, applications, visa, status) AND financials/invoice editing across all clients.
- **Financials permissions:** `canViewClientFinancials` = client view (ops + assigned counselor + branch + admins). New `canEditClientInvoice` — same audience — gates invoice header/step editing including marking steps paid. Refunds/withdraw remain super_admin. **Audit trail:** the 0027 invoice RPCs write field-level before/after diffs into `crm_client_activities` (`invoice_updated`, `invoice_step_added`, `invoice_step_edited`, plus existing `invoice_step_paid`/`invoice_step_status_changed`).
- **Lead conversion (`convertLeadToClient`/`crm_convert_lead_to_client`) still exists** but is unreachable while the intake flag is off.

Everything below this section describes the pre-pivot system; treat intake-related parts as dormant reference.

## Status Summary

The CRM is fully integrated into `main`. It is feature-complete through Stage 2F-1 (Client Financials & Refund Policy), with Phase 2A/2D multi-table mutations atomically hardened via RPC (migration 0022).
A read-only **Admin Financials MVP** now lives at `/admin/financials` and combines CRM payment/refund inflow with HRM payroll-preview outflow (PKR-only).
An **Internal CRM Assistant MVP** lives at `/crm/assistant` allowing staff to query the CRM planning documentation via Gemini.
An **Admin Task Maintenance** cleanup tool is available at `/admin/tasks/maintenance` for reducing test pollution.

The core workflow from raw WhatsApp/manual intake, rule-based parsing, assignment, lead qualification, client conversion, application tracking, visa gating, closure, and basic client financials is live on `main`.

### Current Integration State

- **Branch:** `main`.
- **Status:** Fully merged and pushed.
- **WhatsApp API:** Webhook/Ingestion implementation in progress (Phase 1 Audit complete).
- **Gemini Parser:** Fallback implementation in progress.

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
- **Inbound ingestion is LIVE** on branch `whatsapp-integration`: signature-verified Cloud API webhook at `/api/webhooks/whatsapp`, rule parser + Gemini low-confidence fallback (extraction only).
- **Intake Phase A (ownership-at-receipt) is implemented.** The receiving EN number's owner now owns every inbound at receipt (`crm_raw_inbox.assigned_employee_id` / `branch_id`), independent of message quality. Counselors/branch managers see and enrich their own raw rows pre-promotion; promotion no longer requires super_admin and no longer hard-blocks on missing country/city — incomplete leads are created with `crm_leads.needs_enrichment = true`. Spam stays raw until re-classified. New `ops` role (Layer-1 only). Migrations `0024`, `0025`. Details in `WHATSAPP_INGESTION_PLAN.md` §8.
- No outbound/automated WhatsApp replies. No auto client conversion. No Gemini lifecycle mutation.
- **WAB2C/BSP coexistence webhook is LIVE on `main`** at `/api/webhooks/wab2c`, coexisting with the direct Meta webhook (env keys configured in Vercel, migrations applied, production redeployed). Both funnel inbound through the shared helper `lib/crm/whatsapp-ingestion.ts` (receipt-time ownership + parser + Gemini). Inbound → raw intake (owned, needs_enrichment/ready); outbound echoes attach to an existing thread only if safe (never create leads); status/other events 200-ignored. Flexible secret (`WAB2C_WEBHOOK_SECRET` via header/bearer/`?secret=`; fail-closed in prod). Correct WAB2C source: WhatsMark Settings → Web Hooks (Messages + Message Echoes + SMB Message Echoes), NOT Ecom Webhooks. Polling and outbound sending NOT implemented. Details in `WHATSAPP_INGESTION_PLAN.md` §9.
- **Number attribution:** inbound matches `crm_whatsapp_numbers` by `phone_number_id` (the Meta id WAB2C forwards), then by normalized `display_number` fallback (auto-learns the id). Admins set/backfill `phone_number_id` per number in **Admin CRM → WhatsApp Numbers** (new `updateWhatsappNumberMetaId` action — no SQL). To add a number like Rabia's, see the onboarding runbook in `WHATSAPP_INGESTION_PLAN.md` §10. (Rabia's `+923105526201` → `phone_number_id 690310694162308`, owner Rabia — fixed and verified.)

### CRM Role / Access Scoping (Phase B) — Implemented
Helper-based scoping (no DB capability table). Roles: `super_admin`, `admin_hr` (global admin), `branch_manager`/`assistant_manager`/`manager` (branch), `ops` (cross-branch client-stage), counselor (`team_member`/`employee`, assigned-only).

- **Centralized helpers.** `lib/crm/permissions-leads.ts` now owns raw + lead scoping: `canViewRawIntake`/`canEnrichRawIntake`/`canPromoteRawIntake`, `canViewLead`, `canManageLead`, and `leadScopeForActor` (query-level `all`/`branch`/`assigned`/`none`). `lib/db/crm.ts` `canViewCrmLead` delegates to `canViewLead`.
- **Raw intake & leads.** super_admin/admin_hr → all; branch_manager+ → their branch; counselor → assigned only; ops → none (raw/unqualified leads are not ops work).
- **Lead mutations.** `canManageLead` now lets branch managers work (notes/status/follow-up/enrich) any lead in their branch, not just super_admin/assignee. Transfer **requests** remain assigned-counselor/super_admin only (matches the transfer action).
- **needs_enrichment surfacing.** Leads list shows a "needs enrichment" badge + an enrichment filter (`needs`/`complete`); lead detail shows a missing-fields banner and an editable "Enrich lead details" panel (new `enrichCrmLead` action). Country+city clear the flag. Follow-up/notes are never blocked.
- **Follow-up board.** Now role-scoped: global admin → all (with counselor picker); branch_manager → branch; counselor → own; ops → none. `listCrmLeadsForFollowupBoard` gained `scopeToBranchId`.
- **Clients (ops cross-branch).** `canViewCrmClient` + `listCrmClients` now grant `ops` all-branch client access. `canVerifyClientDoc`, `canEditClientMilestone`, `canEditClientApplication`, `canEditClientStatus` now grant the `ops` role directly (department-name check kept as fallback). Branch managers still see their branch; counselors their assigned clients.
- **Financials excluded for ops.** New `canViewClientFinancials` (= client view but excludes ops) gates `getCrmClientFinancialsPage`. Payments/refunds/withdraw remain super_admin-only.
- **No migrations.** Phase B is code-only; relies on the `ops` enum + `needs_enrichment` column from `0024`/`0025`.

### Phase 2F-2 (Client Invoicing) — Completed
- **Invoice-first financials.** Every client gets one invoice (`crm_client_invoices`, one per client) with ordered steps (`crm_client_invoice_steps`). Migration `0026` adds tables, RPCs, and backfills invoice shells + a Step 1 row for all existing clients (linking the historical advance payment where amounts match).
- **Conversion integration.** `crm_convert_lead_to_client` (redefined in `0026`, same signature as `0023`) now atomically creates the client, the invoice (number `<client_code>-01`, file number = client code), the Step 1 "Registration / Agreement Fees" row marked `paid`, and its linked `crm_client_payments` row.
- **Cash = paid steps only.** Marking a step `paid` creates/updates a matching `crm_client_payments` row (method `invoice_step_paid`) via `crm_apply_invoice_step_payment`; reverting to `due`/`waived` deletes the linked payment. Client and `/admin/financials` totals therefore keep aggregating `crm_client_payments` unchanged — due/waived/draft lines never count as received cash.
- **UI.** `/crm/clients/[id]/financials` shows invoice stat cards (subtotal / paid / waived / balance due), an editable invoice header (number, file no, status draft/issued/void, dates, bill-to, package, terms, footer), and per-step edit/add forms. Editing is super_admin-only (`canRecordClientPayment`) and closed for terminal clients — enforced in UI, server actions, and RPCs (terminal lock + void-invoice lock).
- **PDF export.** `/crm/clients/[id]/financials/invoice` is a print-ready A4 replica of the reference invoice (`00514-02 Invoice M Shahzad Farooq.pdf`): office header + logo, BILL TO, description table with File no / package / Total Package / step rows / Assessment Fees "Free", invoice-details status table, subtotal (paid), balance due, terms, footer note. Print CSS in `AppShell`/`Sidebar` hides app chrome; export via browser print-to-PDF (`PrintButton`).
- **PKR-only** enforced by table CHECK constraint and forced in RPCs/actions.

## Pending / Planned Work

- **Apply migration 0028** to Supabase (Supabase SQL editor) — without it, flipping a step's status will keep re-creating stale "Due"/"Paid" labels on the printable invoice. (0026 and 0027 are applied; 0028's one-time data fix has already been run directly.)
- **Re-wire raw inbox ↔ client logic later** — flip `CRM_INTAKE_ENABLED`, restore nav items, and restore webhook routes from git history when the intake pipeline returns.
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
- `0024_crm_raw_intake_ownership.sql` (raw owner/branch/enrichment columns; `needs_enrichment`/`ready_for_promotion` raw statuses; assigned-counselor RLS)
- `0025_crm_lead_needs_enrichment_and_ops_role.sql` (`crm_leads.needs_enrichment`; `ops` user_role)
- `0026_crm_client_invoices.sql` (client invoices + steps, invoice RPCs, convert-RPC redefinition, backfill) — **applied**
- `0027_crm_direct_client_shells.sql` (nullable lead/agreement/advance, client identity columns, `crm_create_client_shell`, invoice RPC redefinitions with audit diffs) — **applied**
- `0028_crm_invoice_step_detail_status_sync.sql` (auto-managed detail_status labels follow step status; stale-label data fix) — **PENDING APPLY** (data fix already executed 2026-07-02 via service role; the RPC redefinition still needs the SQL editor)

## Current Route Inventory

**Staff Routes:**
- `/crm/inbox` (List) & `/crm/inbox/[id]` (Detail) — GATED OFF (intake paused)
- `/crm/leads` (List) & `/crm/leads/[id]` (Detail) — GATED OFF (intake paused)
- `/crm/leads/follow-ups` (Board) — GATED OFF (intake paused)
- `/crm/transfers` (Pending requests) — GATED OFF (intake paused)
- `/crm/clients` (List)
- `/crm/clients/new` (Direct client shell creation)
- `/crm/clients/[id]` (Detail)
- `/crm/clients/[id]/documents`
- `/crm/clients/[id]/applications`
- `/crm/clients/[id]/visa`
- `/crm/clients/[id]/closure`
- `/crm/clients/[id]/financials`
- `/crm/clients/[id]/financials/invoice` (print/PDF export)
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
