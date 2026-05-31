# EN CRM AI Handoff and Reference Architecture

## 1. Purpose of This File
This document serves as the persistent handoff and continuity layer for Codex, Claude, Gemini, and any future AI agents working on the EN CRM project. It provides immediate context on what EN CRM is, architectural decisions that are locked, patterns adapted from reference CRMs, what has already been built, and the exact roadmap of what to build next.

## 2. Current Source of Truth
- **Implementation Repo:** `~/EN HRM` (EN CRM is a module inside this monorepo)
- **Branch:** `crm-dev`
- **Warning:** The old `evernest-crm-starter` repo is for reference only. Do not treat its code or status as the current implementation truth.
- **Current Implementation Status:** Stage 1 lead intake/assignment/follow-up workflows are completed. Stage 2A-2E (Client Lifecycle) is feature-complete from conversion through closure on `crm-dev`. Stage 2F-1 (Client Financials) has also landed, incorporating terminal state locking and a dedicated client financials UI. Stage 3 (Client Portal) remains deferred.

## 3. Business Context
EN Consultants operates primarily in the Pakistani market, which relies heavily on a **WhatsApp-first** communication model. Leads prefer texting or calling directly rather than filling out web forms. As a result, generic CRMs that assume a form-first funnel fail here. The EN CRM acts as a control tower for incoming WhatsApp messages, utilizing a counselor-led workflow where the receiving WhatsApp number (and associated campaign) dictates lead ownership.

## 4. Reference CRM Material Reviewed

### Atomic CRM
- **Useful for:** Technical stack (Next.js, Supabase, Shadcn UI), activity timeline polish, and Row Level Security (RLS) patterns.
- **Patterns to copy/adapt:** Visual timeline structure for logging notes, system events, and status changes; tight RLS implementation.
- **What not to copy:** Its underlying generic assignment logic.

### Frappe CRM / Krayin CRM
- **Useful for:** Product/workflow understanding, visual pipeline UI, and status-transition flows.
- **Patterns to copy/adapt:** Kanban-style lead boards and explicit visual transitions for lead statuses.
- **What not to copy:** Their monolithic architectures and generic assignment engines.

### Study-Abroad-and-Education-Consultant-CRM
- **Useful for:** Domain-specific data modeling.
- **Patterns to copy/adapt:** Schema fields relevant to education consultancy (e.g., CGPA, study gap, country interest, English test scores, budget).
- **What not to copy:** Tech stack or overall application architecture.

### Laravel CRM
- **Useful for:** Basic relational modeling ideas.
- **Limitations:** PHP stack and architecture are irrelevant. Do not copy code.

## 5. Reference Ideas Already Integrated
- Native CRM module inside EN HRM (sharing employee data).
- Raw inbox concept (uncategorized messages before lead promotion).
- Raw vs. Lead separation.
- Parser-assisted structured qualification.
- Lead activity tracking model.
- Source ownership assignment (driven by WhatsApp receiving number).
- Temporary fallback routing per WhatsApp number.
- Assignment rule engine (used strictly as a fallback).
- Counselor transfer/handoff workflow (request, accept, reject, cancel, admin override).
- Admin transfer monitor.
- CRM sidebar grouping (separating CRM navigation from HRM).
- Follow-up activity enum groundwork (`followup_scheduled`, `followup_completed`).
- Domain-specific study-abroad fields (country, city, qualification, marks/CGPA, study gap, budget, English test).
- Stage 2 client lifecycle: conversion to `crm_clients`, document registry/review, per-university applications, country milestones, visa decision capture, closure, withdrawal, and refunds.
- RPC-first closure mutations in Phase 2E for atomic multi-table writes.
- Client Financials (Phase 2F-1) with hardened refund policies (terminal state blocking).

## 6. Current Implemented Routes
**Staff CRM:**
- `/crm/inbox` & `/crm/inbox/[id]`: Raw WhatsApp intake queue and detail view.
- `/crm/leads` & `/crm/leads/[id]`: List and detail views of qualified leads, timeline, transfer history, and assignment controls.
- `/crm/leads/follow-ups`: Read-only due/overdue follow-up board.
- `/crm/transfers`: Counselor inbox for pending incoming transfer requests.

**Client Lifecycle:**
- `/crm/clients` & `/crm/clients/[id]`: Client list and detail shell.
- `/crm/clients/[id]/documents`: Client document registry, upload, review, and history.
- `/crm/clients/[id]/applications`: Per-university application list and status controls.
- `/crm/clients/[id]/visa`: Country milestones, visa-stage documents, and visa decision recording.
- `/crm/clients/[id]/closure`: Pre-departure, departed, alumni, withdrawal, and refunds.
- `/crm/clients/[id]/financials`: Client-level financials mapping total received, refunded, and payment/refund forms.

**Admin CRM:**
- `/admin/crm`: Super-admin CRM dashboard.
- `/admin/crm/whatsapp-numbers`: Manage WhatsApp numbers, default owners, and fallbacks.
- `/admin/crm/campaign-sources`: Manage campaigns and their parent WhatsApp numbers.
- `/admin/crm/assignment-rules`: Manage the fallback assignment rules engine.
- `/admin/crm/transfers`: Admin monitor for all system transfers with overrides.
- `/admin/crm/clients/conversion-queue`: Leads ready for client conversion.
- `/admin/crm/clients/doc-review`: Document review queue.

## 7. Current DB/Migration Map
- `0009_crm_stage_1_foundation.sql`: Sets up raw inbox, leads, activities, campaigns, and WhatsApp numbers.
- `0010_crm_assignment_rules_phase_4.sql`: Adds assignment rules table for fallback routing.
- `0011_crm_number_ownership.sql`: Adds `assigned_employee_id` to WhatsApp numbers.
- `0012_crm_whatsapp_number_fallback.sql`: Adds temporary fallback routing columns to WhatsApp numbers.
- `0013_crm_lead_transfers.sql`: Creates `crm_lead_transfers` table and implements counselor handoff workflow.
- `0014_crm_followup_activity_types.sql`: Adds `followup_scheduled` and `followup_completed` to the activity types enum.
- `0015_crm_clients_phase_2a.sql`: Adds `crm_clients`, `crm_client_activities`, `crm_client_payments`, client status enum, and conversion foundation.
- `0017_crm_client_documents_phase_2b.sql`: Adds `crm_client_documents` and private Supabase Storage bucket.
- `0018_crm_client_applications_phase_2c.sql`: Adds `crm_client_applications`, application status/intake enums, and one-accepted-per-client constraint.
- `0019_crm_client_country_milestones_phase_2d.sql`: Adds `crm_client_country_milestones` and milestone status enum.
- `0020_crm_client_closure_phase_2e.sql`: Adds `crm_client_visa_decisions`, `crm_client_refunds`, closure columns on `crm_clients`, and 8 closure RPCs.
- `0021_crm_refund_policy_hardening.sql`: Modifies `crm_record_client_refund` RPC to strictly enforce refund gating (only for withdrawn/refunded clients, blocks alumni).

## 8. Current Core Data Model
- `crm_raw_inbox`: Holds raw incoming WhatsApp payloads before they are qualified.
- `crm_leads`: Qualified leads actively being worked by counselors.
- `crm_lead_activities`: Timeline events (notes, status changes, follow-ups).
- `crm_lead_assignments`: Historical record of ownership changes.
- `crm_assignment_rules`: Fallback logic to assign leads based on specific criteria.
- `crm_whatsapp_numbers`: The physical numbers receiving messages, mapping to counselors.
- `crm_campaign_sources`: Marketing campaigns that route through specific WhatsApp numbers.
- `crm_lead_transfers`: Pending state for counselor-to-counselor handoffs.
- `crm_clients`: Converted clients served through onboarding, applications, visa, closure, alumni, or withdrawal.
- `crm_client_activities`: Client lifecycle audit trail.
- `crm_client_payments`: Client payment records.
- `crm_client_documents`: Client document registry rows backed by private Supabase Storage.
- `crm_client_applications`: Per-university application rows.
- `crm_client_country_milestones`: Country-specific visa preparation checklist rows.
- `crm_client_visa_decisions`: Visa decision history.
- `crm_client_refunds`: Refund history.

**Key Distinctions:**
- **Raw Intake vs. Lead:** Intake is the unstructured, raw message. A Lead is a qualified entity assigned to a person.
- **Lead vs. Client:** A lead is pre-sale. Once a lead converts/pays, it becomes a `crm_clients` row and enters the Stage 2 lifecycle.
- **Assignment History vs. Transfer Workflow:** Transfers handle the pending *request* state. Assignment history records the actual ownership change *after* a transfer is accepted.

## 9. Current Assignment Architecture
The CRM uses a strict assignment waterfall. **The customer's phone number, requested country, or parser output does NOT dictate primary assignment.**
1. **Already assigned:** No-op.
2. **WhatsApp number fallback active:** Assigns to the temporary fallback counselor.
3. **WhatsApp number default owner:** Assigns to the primary counselor mapped to the receiving number.
4. **Campaign parent WhatsApp number:** Inherits ownership (or fallback) from the campaign's parent number.
5. **Assignment rules fallback:** Uses the rules engine for advanced edge cases.
6. **No match:** Lead is marked as `sent_to_review` / unassigned.

## 10. Current Transfer/Handoff Architecture
- `crm_lead_transfers` exists separately from `crm_lead_assignments` to hold pending requests without immediately changing ownership.
- Supported flows: Request, Accept, Reject, Cancel, and Admin Override.

## 11. Current Parsing Architecture
- Uses a "dumb" rule-based/regex parser first. Auto-parses on raw intake creation.
- Counselors can manually re-parse if needed.
- Confidence scores determine if human review is required.
- **Gemini AI is NOT active yet.** The system relies entirely on the rule-based parser for now.

## 12. What Must Not Be Changed
- Do not modify Phase 2E/2F-1 RPC-first architecture logic for closures and refunds without explicit permission.
- The WhatsApp-first assignment routing model (where numbers/campaigns dictate ownership) must remain untouched.
- Do not introduce complex multi-table writes using sequential Supabase JS calls. Follow the established Postgres RPC pattern.

## 13. How to Add New Features Safely
- **Schema Changes:** Require a new manual migration in `supabase/migrations/` prefixed with the next incremental integer. Ensure changes are idempotent where applicable.
- **Multi-Table Mutations:** Avoid chaining `.insert()` calls in server actions. Create a Postgres function (RPC) and invoke via `admin.rpc(...)` to guarantee transaction atomicity. If impossible to use RPC, wrap with strict compensation patterns, though RPC is strongly preferred.
- **Permissions:** Keep standard users restricted via RLS policies and server-side authentication checks in the Actions. The current logic uses `isClientTerminal`, `canVerifyClientDoc`, `canEditClientStatus`, etc. in `lib/crm/permissions-clients.ts`.

## 14. How to Report Changes
- **No autonomous commits:** Do NOT use `git add .`, `git commit`, or `git push` unless requested.
- When finishing a task, report:
    1. The markdown docs updated.
    2. The exact routes/components modified.
    3. The SQL migrations added.
    4. Provide a safe `git add` command for the user to execute.

## 15. Immediate Next Path (Roadmap)
1. **Admin Financials:** Develop `/admin/crm/financials` or `/admin/financials` to present a company-wide view combining CRM inflows with HRM payroll outflows.
2. **Regression Testing:** Perform broad manual smoke testing across Stage 2.
3. **WhatsApp API MVP:** Meta Webhook setup to handle incoming messages (map `phone_number_id`, create raw inbox, auto-parse).
4. **RPC Hardening Backlog:** Migrate existing Stage 2A-2D actions (`convertLeadToClient`, `recordClientPayment`) to the Postgres RPC pattern.
5. **UX Polish:** Activity timeline styling (T10D) and Pipeline/Board view (T11).
6. **Deferred:** Stage 3 Client Portal, Gemini Chatbot.