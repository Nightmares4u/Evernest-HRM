# EN CRM AI Handoff and Reference Architecture

## 1. Purpose of This File
This document serves as the persistent handoff and continuity layer for Codex, Claude, Gemini, and any future AI agents working on the EN CRM project. It provides immediate context on what EN CRM is, architectural decisions that are locked, patterns adapted from reference CRMs, what has already been built, and the exact roadmap of what to build next.

## 2. Current Source of Truth
- **Implementation Repo:** `~/EN HRM`
- **Branch:** `crm-dev`
- **Note:** The old `evernest-crm-starter` repo is for reference only. Do not treat its status as the current implementation status.
- **Current Implementation Status:** The CRM is built natively as a module inside the EN HRM repository. Stage 1 lead intake/assignment/follow-up workflows are implemented, and Stage 2A-2E is feature-complete from conversion through alumni / withdrawn closure on `crm-dev`. Stage 3 client portal is not built.

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

## 6. Current Implemented Routes
- `/crm/inbox`: Shows the raw WhatsApp intake queue (currently visible to super-admins).
- `/crm/inbox/[id]`: Detail view of a raw message, parser results, and manual promotion trigger.
- `/crm/leads`: Main list view of qualified CRM leads.
- `/crm/leads/[id]`: Detail view of a lead, showing timeline, transfer history, and assignment controls.
- `/crm/leads/follow-ups`: Read-only due/overdue follow-up board.
- `/crm/transfers`: Counselor inbox for pending incoming transfer requests.
- `/crm/clients`: Client list.
- `/crm/clients/[id]`: Client detail shell with payments and client activity.
- `/crm/clients/[id]/documents`: Client document registry, upload, review, download, and history.
- `/crm/clients/[id]/applications`: Per-university application list and status controls.
- `/crm/clients/[id]/visa`: Country milestones, visa-stage documents, visa submission gate, and visa decision recording.
- `/crm/clients/[id]/closure`: Pre-departure, departed, alumni, withdrawal, and refunds.
- `/admin/crm`: Super-admin CRM dashboard.
- `/admin/crm/whatsapp-numbers`: Manage WhatsApp numbers, default owners, and temporary fallbacks.
- `/admin/crm/campaign-sources`: Manage campaigns and their parent WhatsApp numbers.
- `/admin/crm/assignment-rules`: Manage the fallback assignment rules engine.
- `/admin/crm/transfers`: Admin monitor for all system transfers with override capabilities.
- `/admin/crm/clients/conversion-queue`: Leads ready for client conversion.
- `/admin/crm/clients/doc-review`: Document review queue.

## 7. Current DB/Migration Map
- `0009_crm_stage_1_foundation.sql`: Sets up raw inbox, leads, activities, campaigns, and WhatsApp numbers.
- `0010_crm_assignment_rules_phase_4.sql`: Adds the assignment rules table for fallback routing.
- `0011_crm_number_ownership.sql`: Adds `assigned_employee_id` to WhatsApp numbers for primary assignment logic.
- `0012_crm_whatsapp_number_fallback.sql`: Adds temporary fallback routing columns to WhatsApp numbers.
- `0013_crm_lead_transfers.sql`: Creates `crm_lead_transfers` table and implements counselor handoff workflow.
- `0014_crm_followup_activity_types.sql`: Adds `followup_scheduled` and `followup_completed` to the activity types enum.
- `0015_crm_clients_phase_2a.sql`: Adds `crm_clients`, `crm_client_activities`, `crm_client_payments`, client status enum, and conversion foundation.
- `0017_crm_client_documents_phase_2b.sql`: Adds `crm_client_documents` and private Supabase Storage bucket `crm-client-docs`.
- `0018_crm_client_applications_phase_2c.sql`: Adds `crm_client_applications`, application status/intake enums, and one-accepted-per-client constraint.
- `0019_crm_client_country_milestones_phase_2d.sql`: Adds `crm_client_country_milestones` and milestone status enum.
- `0020_crm_client_closure_phase_2e.sql`: Adds `crm_client_visa_decisions`, `crm_client_refunds`, 11 closure columns on `crm_clients`, and 8 closure RPCs.

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
- **Lead vs. Client:** A lead is pre-sale. Once a lead converts/pays, it becomes a `crm_clients` row and enters the Stage 2 lifecycle. Do not call this an "Active Case" in current docs/code.
- **Assignment History vs. Transfer Workflow:** Transfers handle the pending *request* state. Assignment history records the actual ownership change *after* a transfer is accepted.
- **Activity Timeline:** A sequential log of user notes, system events, and follow-ups.

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
- Counselors view pending requests at `/crm/transfers`.
- Admins monitor all requests at `/admin/crm/transfers`.
- Transfer history is displayed on the lead detail page.

## 11. Current Parsing Architecture
- Uses a "dumb" rule-based/regex parser first.
- Auto-parses on raw intake creation.
- Counselors can manually re-parse if needed.
- Confidence scores determine if human review is required.
- Mandatory fields for assignment rules: Country and City.
- **Gemini AI is NOT active yet.** The system relies entirely on the rule-based parser for now.

## 12. What Is Missing Next (Ranked)
1. **Older Stage 2A-2D RPC hardening:** migrate remaining multi-table direct-write actions to Postgres RPCs.
2. **Activity timeline polish:** Cleanly styling the timeline based on the Atomic CRM reference.
3. **Lead board/pipeline UI:** Visual Kanban or grouped list based on Frappe CRM references.
4. **KPI/reporting dashboard:** Manager visibility into branch/counselor performance.
5. **RLS/permission hardening:** Ensuring standard counselors only see their assigned leads/clients.
6. **WhatsApp webhook:** Real Meta webhook integration.
7. **Gemini parser fallback:** AI assistance for complex messages.
8. **Stage 3 client portal:** Client-side auth, status view, document upload/re-upload.

## 13. What Should NOT Be Built Yet
- Real WhatsApp API implementation (wait until lead-working tools are stable).
- Gemini-first parser (rule-based parser stays default).
- Chatbots attempting to "sell" or "close" leads.
- Invoices or client portals. Stage 2 document handling is staff-side only; Stage 3 client portal is not built.
- HRM task sync.
- Payroll or commission synchronization.
- Generic round-robin or form-first routing.
- Global attendance-based auto-rerouting.
- Overbuilt automation.

## 14. Codex-Sized Implementation Backlog

### T10B: Lead Notes + Status Update + Follow-up Scheduling UI
- **Purpose:** Provide counselors explicit tools on `/crm/leads/[id]` to add notes, change status, and schedule the next contact.
- **User-facing behavior:** Lead detail page gets new action components (note input, status selector, date picker). Actions log to timeline.
- **Routes affected:** `/crm/leads/[id]`
- **Files likely affected:** Lead detail page, action UI components, server actions.
- **Migration needed:** No.
- **Test cases:** Add note, change status, schedule follow-up. Verify timeline updates and `next_followup_at` changes.
- **Dependencies:** None.
- **Risk level:** Low.

### T10D: Activity Timeline Polish
- **Purpose:** Make the activity timeline visually distinct and professional (Atomic CRM style).
- **User-facing behavior:** Timeline visually distinguishes notes, status changes, transfers, and system events with clear icons and colors.
- **Routes affected:** `/crm/leads/[id]`
- **Files likely affected:** Timeline UI component.
- **Migration needed:** No.
- **Test cases:** View a lead with multiple activity types; verify styles.
- **Dependencies:** T10B.
- **Risk level:** Low.

### T11: Lead Board / Pipeline UI
- **Purpose:** High-level visual representation of the sales funnel.
- **User-facing behavior:** Kanban-style board or grouped list at `/crm/leads/board`.
- **Routes affected:** `/crm/leads/board`
- **Files likely affected:** Board page, layout components.
- **Migration needed:** No.
- **Test cases:** Verify leads appear in correct status columns.
- **Dependencies:** T10B.
- **Risk level:** Low.

### T12: KPI / Reporting Dashboard
- **Purpose:** Manager visibility into performance.
- **User-facing behavior:** Dashboard showing lead counts, conversion rates, and campaign ROI.
- **Routes affected:** `/admin/crm` or `/crm/dashboard`
- **Files likely affected:** Dashboard page, analytics queries.
- **Migration needed:** No.
- **Test cases:** Verify metrics load accurately.
- **Dependencies:** T11.
- **Risk level:** Low.

### T13: RLS / Permission Hardening
- **Purpose:** Secure lead data so counselors only see their own assignments.
- **User-facing behavior:** Standard users visiting `/crm/leads` cannot see leads assigned to others.
- **Routes affected:** All `/crm/*` routes.
- **Files likely affected:** Supabase migrations (RLS policies), server fetch functions.
- **Migration needed:** Yes.
- **Test cases:** Login as Counselor A, ensure Counselor B's leads are hidden. Admin can see all.
- **Dependencies:** All UI tasks.
- **Risk level:** Medium (Ensure admin access is not broken).

### T14: WhatsApp Webhook Mock Endpoint
- **Purpose:** Prepare for real ingestion.
- **Risk level:** Low.

### T15: Gemini Fallback Parser
- **Purpose:** AI parsing for messages the rule engine fails on.
- **Risk level:** Medium.

### Stage 3: Client Portal Planning
- **Purpose:** Design client-side access after Stage 2 staff-side lifecycle.
- **Risk level:** High.

## 15. Immediate Next 3 Tasks
1. RPC hardening for older Stage 2A-2D multi-table actions.
2. **T10D:** Activity timeline polish.
3. Stage 3 client portal planning.

## 16. Testing Matrix Still Needed
Future implementation must include rigorous testing for:
- Raw intake auto-parse & promotion.
- Source owner assignment, fallback routing, and campaign inheritance.
- Assignment rule fallback.
- Transfer request, accept, reject, cancel, and admin override.
- Follow-up schedule and completion.
- Notes and status transitions.
- Counselor visibility vs. super-admin visibility.

## 17. Advice for Future AI Agents
- **Start Here:** ALWAYS inspect `CURRENT_STATE.md` and `CRM_AI_HANDOFF_AND_REFERENCE_ARCHITECTURE.md` before taking action.
- **Source of Truth:** Treat `crm-dev` in the `EN HRM` repo as the ultimate source of truth. The old starter repo is reference material only.
- **Scope:** Work in small, Codex-sized tasks.
- **Git Protocol:** Do NOT use `git add .` or push unless explicitly requested. Always report the files changed, migrations needed, build status, and provide a safe `git add` command.
- **Database Rules:** NEVER add schema changes without an accompanying migration file.
- **Security:** NEVER bypass permission checks. Ensure RLS is respected and applied carefully.

## 18. Final Recommendation
The CRM now covers Stage 1 lead work and Stage 2 client lifecycle through alumni / withdrawn closure. The immediate priority is hardening older Stage 2A-2D multi-table writes into RPCs, then timeline polish and Stage 3 client portal planning. Real WhatsApp API/webhook and Gemini fallback remain paused.
