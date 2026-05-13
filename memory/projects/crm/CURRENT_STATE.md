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

Stage 1 Phase 3 has been implemented on `crm-dev`: raw inbox detail,
structured rule-based parsing for the 7-question reply, raw intake
promotion to CRM leads, CRM lead list/detail pages, activity timeline
display, and super-admin manual lead assignment. This remains manual and
rule-based only; no real WhatsApp API, webhook, Gemini integration,
auto-assignment engine, invoice/document/client portal, or HRM task sync
has been added.

Stage 1 Phase 4 has been implemented on `crm-dev`: super-admin
assignment rule management, deterministic assignment rule matching, and
an explicit "Auto-assign by rules" action on lead detail. Rules can
match product/category, country, city, branch, WhatsApp number, and
campaign/source, then target an employee or branch fallback. Assignment
does not auto-run after promotion yet.

## Current Goal

Review and manually test Stage 1 Phase 4 before building any real
WhatsApp API, Gemini, HRM task sync, or downstream CRM modules.


## Working Philosophy

- WhatsApp-first, not form-first.
- CRM is the control layer.
- HRM remains the employee/task/payroll foundation.
- Postgres/Supabase preferred.
- Avoid chatbot logic.
- Avoid overengineering.
- Plan before implementation.

## Next Best Step

Manually test the Phase 4 CRM assignment flow:

- `/admin/crm`
- `/admin/crm/whatsapp-numbers`
- `/admin/crm/campaign-sources`
- `/admin/crm/assignment-rules`
- `/crm/inbox`
- `/crm/inbox/[id]`
- `/crm/leads`
- `/crm/leads/[id]`

Then continue to the next Stage 1 phase only after approval. Do not
build the WhatsApp API/webhook, Gemini integration, HRM task sync, or
downstream client/case/invoice/document system until Phase 4 is reviewed.

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
