# Current State

## Status

CRM planning base complete.

Stage 1 Phase 1 schema/types prepared in the repo. The Supabase
migration has been authored but still needs review and application to
the target Supabase project.

Gemini audit approved Stage 1 Phase 1 with one minor fix: CRM leads now
include `next_followup_at` for scheduled human follow-up tracking.

Stage 1 decisions locked on 2026-05-12 — see `STAGE_1_DECISIONS.md`.
Implementation spec for Codex — see `CODEX_STAGE_1_PACKET.md`.

Phase 1 implementation is complete: CRM schema foundation, CRM
TypeScript domain types, and CRM planning state notes are in place.

Stage 1 Phase 2 admin config/raw inbox UI has been implemented in the
existing HRM app. It adds super-admin CRM admin screens, WhatsApp number
mapping, campaign/source mapping, a raw inbox view, and manual/mock raw
intake creation for testing. Real WhatsApp API/webhook integration,
parser, auto-assignment, Gemini integration, and downstream client/case
systems remain pending.

## Current Goal

Create and review the CRM planning documents before building:

- Business context
- Product charter
- Requirements
- WhatsApp-first pipeline
- Stage 1 WhatsApp intake
- Data model
- MVP scope
- HRM integration
- Reporting and KPIs
- Automation plan
- Repo audit criteria
- Open questions
- Implementation plan
- CRM board


## Working Philosophy

- WhatsApp-first, not form-first.
- CRM is the control layer.
- HRM remains the employee/task/payroll foundation.
- Postgres/Supabase preferred.
- Avoid chatbot logic.
- Avoid overengineering.
- Plan before implementation.

## Next Best Step

Manually test the Phase 2 CRM admin/config and raw inbox screens:

- `/admin/crm`
- `/admin/crm/whatsapp-numbers`
- `/admin/crm/campaign-sources`
- `/crm/inbox`

Then continue to the next Stage 1 phase only after approval. Do not
build the WhatsApp API/webhook, parser, auto-assignment, or Gemini
integration until Phase 2 is reviewed.

## Current Stage 1 Boundary

Stage 1 ends at:

Raw WhatsApp message -> structured intake -> parsed lead details -> assigned branch/agent -> human follow-up.

Stage 1 excludes:

- Full AI chatbot
- Full Meta spend sync
- Client portal
- Invoice system
- University database
- Commission/payroll integration
- Advanced reporting
