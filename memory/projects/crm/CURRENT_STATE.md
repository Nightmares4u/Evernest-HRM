# Current State

## Status

CRM planning base complete.

Stage 1 decisions locked on 2026-05-12 — see `STAGE_1_DECISIONS.md`.
Implementation spec for Codex — see `CODEX_STAGE_1_PACKET.md`.

App code implementation has not started. CRM Stage 1 build begins
after HRM live baseline is stable; parallel work allowed only if
fully isolated under `/crm` and `/admin/crm`.

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

Stage 1 decisions are locked. The next concrete action is for Codex to
work through `CODEX_STAGE_1_PACKET.md` § 15 (Implementation Order),
starting with migration `0009_crm_init.sql`.

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
