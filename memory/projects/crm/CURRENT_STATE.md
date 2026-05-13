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

Phase 1 implementation has started and remains isolated to CRM schema,
CRM TypeScript domain types, and CRM planning state notes. No CRM UI,
WhatsApp API, parser, auto-assignment, Gemini integration, or HRM task
sync has been built.

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

Review and apply the Phase 1 migration when ready:

- `supabase/migrations/0009_crm_stage_1_foundation.sql`

Then continue to the next Stage 1 phase only after approval. Do not
build UI, WhatsApp API, parser, or auto-assignment until Phase 1 is
reviewed.

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
