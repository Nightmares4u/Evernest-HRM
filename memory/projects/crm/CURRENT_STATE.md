# Current State

> **Last updated:** 2026-05-31 (Post Stage 2F-1 Financials)
> **Branch:** `crm-dev`

## Status Summary

The CRM is feature-complete through Stage 2F-1 (Client Financials & Refund Policy). The core workflow from raw WhatsApp intake, rule-based parsing, assignment, lead qualification, client conversion, application tracking, visa gating, closure, and basic client financials are fully implemented on `crm-dev`.

### Latest Known Feature / Hardening Commits
- `7df4746 fix(crm): production-hardening sweep across Stage 1/2 — A-1, terminal locks, activity union`
- `235b12c docs: sync CRM Stage 2 implementation state`
- `7e27dbb feat: add CRM client closure and refund flow`
- `c6e5928 feat: Phase 2C applications + Phase 2D country milestones + transaction policy`
- `2fa2e43 feat: Phase 2B client documents + Gemini audit fix-ups (migration 0017)`

## Feature State by Stage

### Stage 1 (Lead Management) - Completed
- **Raw Inbox vs. Leads:** Raw incoming messages are separate from qualified leads.
- **Explicit Promotion:** Lead promotion from the raw inbox is a deliberate manual action.
- **Parser:** A rule-based structured parser extracts data on intake creation. (Gemini AI parser is deferred).
- **Assignment Routing:** The receiving source WhatsApp number drives primary ownership. Fallback counselor routing is supported per number. Assignment rules engine acts strictly as a fallback mechanism for complex cases.
- **Transfers:** Counselor-to-counselor transfers/handoffs are a first-class workflow with an explicit request/accept/reject flow.
- **Workbenches:** Lead detail includes a counselor workbench for notes, status changes, and follow-up scheduling. A read-only follow-up board tracks due tasks.

### Stage 2A-2E (Client Lifecycle) - Completed
- **Phase 2A (Conversion):** A lead only converts to a client when `agreement_signed_at` and `advance_paid_at` are provided. A unique client code is generated.
- **Phase 2B (Documents):** Private document registry utilizing Supabase Storage and 15-minute signed URLs. Re-uploads use a `superseded_by_id` pointer for audit trails.
- **Phase 2C (Applications):** Per-university application rows. A client can have at most one accepted application.
- **Phase 2D (Visa Milestones):** Country-driven milestone checklists. A client cannot enter `visa_submitted` unless required milestones are `done` or `not_applicable`.
- **Phase 2E (Closure):** Closure states include `pre_departure`, `departed`, `alumni` (successful completion), and `withdrawn_refunded` (failure/withdrawal). Terminal clients (`alumni`, `withdrawn_refunded`) are locked from normal workflow mutations. Phase 2E actions are fully RPC-first for atomic writes.

### Phase 2F-1 (Client Financials) - Completed
- **Financials Tab:** `/crm/clients/[id]/financials` tracks client-level payments and refunds.
- **Terminal State Lock:** Payments are allowed only on non-terminal clients. Refunds are NOT allowed on `alumni` clients (hardened in both UI and Postgres RPC `crm_record_client_refund`).
- **Refund Policy:** Refunds are restricted to the `withdrawn_refunded` closure path and are strictly a `super_admin` action.

## Pending / Planned Work

- **Admin Financials:** (Next Immediate) Separate, company-wide view combining CRM inflow (payments/refunds) with HRM outflow (payroll).
- **Full Regression Testing:** Manual smoke testing across Stage 2 lifecycle paths.
- **WhatsApp API MVP:** Webhook verification, receiving incoming Meta messages, mapping `phone_number_id` to `crm_whatsapp_numbers`, and raw inbox creation + auto-parse. (No auto-promote/chatbot yet).
- **UX Polish:** Refining the activity timeline visuals (Atomic CRM style) and lead boards after functional finalization.
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

**Admin Routes:**
- `/admin/crm`
- `/admin/crm/whatsapp-numbers`
- `/admin/crm/campaign-sources`
- `/admin/crm/assignment-rules`
- `/admin/crm/transfers`
- `/admin/crm/clients/conversion-queue`
- `/admin/crm/clients/doc-review`

## Known Backlog & Technical Debt
- **RPC Migration:** Older Stage 2A-2D multi-table actions (e.g., `convertLeadToClient`, document verification, milestone updates) use sequential TypeScript database writes with manual fallback deletions. They should opportunistically be migrated to Postgres RPCs (following the Stage 2E/2F pattern) to ensure atomic transaction safety.