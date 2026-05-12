# Implementation Plan

## Rule

Do not implement app code until planning is approved and key open questions are answered.

**Stage 1 status (2026-05-12):** Phase 0 and Phase 1 are complete.
Stage 1 decisions are locked in `STAGE_1_DECISIONS.md`. The build spec
lives in `CODEX_STAGE_1_PACKET.md` and supersedes the phase-by-phase
ordering below for Stage 1 work.

## Phase 0: Planning Base

Status: Complete

Deliverables:

- CRM master context
- Project charter
- WhatsApp and Meta pipeline
- Product requirements
- Conceptual data model
- MVP scope
- CRM/HRM integration plan
- Reporting KPIs
- Automation plan
- Repo audit criteria
- Open questions
- Current state
- CRM board

## Phase 1: Decisions Before Build

Status: Complete for Stage 1. Locked answers in `STAGE_1_DECISIONS.md`.

Historical list (for context only):

- Same HRM app/repo or separate CRM repo — same repo (EN HRM)
- Supabase project strategy — shared with HRM
- Shared auth/user/branch model — yes, reuse HRM tables
- MVP office scope — Karachi + Lahore only
- MVP products — Italy, Korea, B2B
- Lead status model — see `CODEX_STAGE_1_PACKET.md` § 3.1
- Case conversion rule — deferred (out of Stage 1)
- Document checklist depth — deferred (out of Stage 1)
- Invoice/payment MVP depth — deferred (out of Stage 1)
- Manual campaign spend versus API sync — manual, deferred
- Whether to audit candidate repos before custom build —
  custom build inside EN HRM, no fork

## Phase 2: Data Model Finalization

Convert conceptual model into implementation-ready schema:

- WhatsApp numbers
- Campaign sources
- Raw inbox
- Leads
- Lead sources
- Lead messages
- Lead assignments
- Assignment rules
- Lead activities
- Campaigns
- Follow-ups
- Cases
- Documents
- Invoices
- Payments
- Products/countries
- Audit flags

Confirm:

- Foreign keys to HRM/platform tables
- RLS/permission strategy
- Required indexes
- Audit history
- Storage bucket structure

## Phase 3: Stage 1 Intake Build

Build only after Stage 1 planning is approved.

Suggested order:

1. Schema/migrations for Stage 1 intake tables
2. WhatsApp number mapping
3. Campaign/source mapping
4. Webhook endpoint for inbound WhatsApp events
5. Raw inbox persistence
6. Lead message persistence
7. Structured auto-reply template
8. Structured reply parser
9. Parser confidence scoring
10. Manual review queue
11. Assignment rules
12. Assignment history
13. Agent lead board
14. Testing with one number first
15. Expand to 2-3 high-value numbers after pilot validation

Stage 1 implementation must not include:

- Full AI chatbot
- Full Meta spend sync
- Client portal
- Invoice system
- University database
- Commission/payroll integration
- Advanced reporting

## Phase 4: Broader MVP Backend/Foundation

Build only after schema approval.

Suggested order:

1. CRM schema/migrations
2. Leads
3. Campaigns and WhatsApp number mapping
4. Assignment history
5. Activities and notes
6. Follow-ups
7. Case conversion
8. Documents/checklists
9. Invoices/payments
10. KPI queries

## Phase 5: MVP UI

Suggested order:

1. Raw inbox UI
2. Agent lead board
3. CRM navigation shell
4. Lead list
5. Lead detail
6. Assignment controls
7. Follow-up views
8. Case profile
9. Document checklist
10. Invoice/payment panels
11. Reports dashboard

## Phase 6: Pilot

Pilot with one or two teams first.

Recommended pilot options:

- Karachi core team
- Lahore for Punjab-focused assignment testing
- One product line such as Italy study visa

Pilot goals:

- Validate lead statuses.
- Validate assignment workflow.
- Validate follow-up discipline.
- Validate source/campaign tracking.
- Validate manager reports.

## Phase 7: Integrations

After MVP is stable:

- WhatsApp Cloud API or BSP integration
- Meta Marketing API
- HRM task sync
- Email summaries
- Client portal
- Commission outputs

## Phase 8: Intelligence

After enough structured CRM data exists:

- Internal AI summaries
- Conversation summarization
- Lead quality suggestions
- Management debriefs
- Product recommendation assistance

Do not add live AI counseling or uncontrolled chatbot automation.
