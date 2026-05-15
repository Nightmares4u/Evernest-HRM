# CRM Board

## Backlog

- Finalize MVP branch scope
- Finalize MVP product scope
- Choose first 2-3 WhatsApp numbers for Stage 1
- Map first WhatsApp numbers to products/campaigns/branches
- Decide WhatsApp Cloud API direct versus BSP
- Confirm Stage 1 greeting text
- Define mandatory fields before assignment
- Define low-confidence review owner
- Confirm initial agents and branch owners
- Map current WhatsApp numbers
- Map current Meta campaigns
- Define lead quality labels
- Define high-priority lead criteria
- Define sales lead statuses
- Define case/application statuses
- Define document checklist templates
- Define invoice numbering format
- Define payment methods
- Define role permissions
- Decide same HRM repo versus separate CRM repo
- Audit candidate CRM repos if provided

## Planning

- CRM master context
- Project charter
- WhatsApp and Meta pipeline
- Stage 1 WhatsApp intake
- Product requirements
- Conceptual data model
- MVP scope
- CRM/HRM integration
- Reporting KPIs
- Automation plan
- Repo audit criteria
- Open questions
- Implementation plan

## Ready For Decision

- WhatsApp-first approach
- Postgres/Supabase data foundation
- HRM as employee/task/payroll source
- No chatbot in MVP
- No full WhatsApp API before pipeline clarity
- Manual/CSV campaign data before Meta API if needed
- Hybrid multiple-number strategy
- Rule-based parsing before Gemini fallback
- Raw inbox before qualified CRM lead

## Ready For Build

- Real WhatsApp Cloud API/webhook intake
- Gemini fallback only after rule-based parser review
- Round-robin assignment after rule review
- HRM task sync for follow-up work

## In Progress

- Stage 1 manual testing and review on `crm-dev`

## Done

- CRM planning directory created
- Initial planning files drafted
- Stage 1 WhatsApp intake plan drafted
- Stage 1 data model additions drafted
- Stage 1 MVP boundaries drafted
- Stage 1 Phase 1 schema/types foundation
- Stage 1 Phase 2 admin config and raw inbox UI
- Stage 1 Phase 3 raw detail, rule-based parser, lead promotion, lead views, and manual assignment
- Stage 1 Phase 4 employee-direct assignment rules UI and explicit rule-based auto-assignment
- Stage 1 Phase 5 WhatsApp number ownership as primary assignment; rules demoted to fallback
- Stage 1 Phase 5 temporary per-number fallback counselor routing for leave/break coverage
- Stage 1 Phase 4.5 raw intake auto-parse, grouped CRM sidebar navigation, and fallback helper cleanup
- Stage 1 Phase 5 lead transfer/handoff schema foundation
- CRM follow-up activity enum values for scheduled/completed timeline events

## Assignment model (Stage 1)

- WhatsApp number ownership is the primary source of truth for CRM
  assignment. Each `crm_whatsapp_numbers` row may have an
  `assigned_employee_id`.
- Campaigns inherit ownership through their parent WhatsApp number;
  there is no `assigned_employee_id` on `crm_campaign_sources`.
- Promotion auto-assigns from the source owner. The lead detail
  "Auto-assign lead" button runs the same waterfall on demand.
- A WhatsApp number can temporarily route new leads to a per-number
  fallback counselor using `fallback_employee_id`, `fallback_active`,
  optional reason, and optional start/end timestamps. This does not
  change the default owner and does not reassign existing leads.
- The rule engine remains as fallback for advanced/edge cases (shared
  numbers, transferred campaigns, B2B routing). It is not the default
  path.
- The structured parser is for qualification and reporting only — never
  for primary assignment.
- Manual/mock raw intake auto-runs the rule-based parser on creation,
  but lead promotion remains an explicit human action.
- CRM sidebar links are grouped separately from HRM/admin navigation;
  raw inbox remains visible to super admins only for now.
- Pending transfer/handoff requests live in `crm_lead_transfers`.
  Actual assignment changes remain in `crm_lead_assignments` only after
  acceptance or admin override. Transfer UI/actions are still pending.
- Follow-up activity types now include `followup_scheduled` and
  `followup_completed`; follow-up scheduling/completion UI and actions
  are still pending. `crm_leads.next_followup_at` already exists for the
  next task.

## Risks

- WhatsApp attribution may be weak without number/campaign discipline.
- Existing WhatsApp numbers may be staff-owned or inconsistently used.
- A generic CRM repo may fight EN's WhatsApp-first workflow.
- Combining sales statuses and case statuses may create reporting confusion.
- Full automation too early may recreate prior low-quality lead clogging.
- Duplicate HRM employee/branch tables would create long-term data drift.
- Using Gemini on every message may create avoidable cost.
- Treating every "hi/details?" as a qualified lead will pollute CRM metrics.
