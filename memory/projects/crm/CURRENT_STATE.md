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
campaign/source, then assign directly to a required employee/counselor.
Branch is only optional matching metadata in Stage 1, not the primary
assignment target. Assignment does not auto-run after promotion yet.

Stage 1 Phase 5 has been implemented on `crm-dev`: WhatsApp number
ownership is now the primary assignment model. Each WhatsApp number can
have an `assigned_employee_id`. On promotion, the raw intake's source
WhatsApp number (or its campaign's parent WhatsApp number) is resolved
and the lead is auto-assigned to that counselor using
`method = auto_source_owner`. The existing rule engine remains
unchanged and runs only as a fallback when no source owner matches. The
"Auto-assign by rules" button on the lead detail page is now
"Auto-assign lead" and runs the waterfall:

  1. lead already assigned → no-op
  2. WhatsApp number owner (lead → number, else campaign → number)
  3. assignment rule engine (priority + specificity, unchanged)
  4. otherwise: sent_to_review

Campaigns inherit ownership through their parent WhatsApp number. There
is no `assigned_employee_id` on `crm_campaign_sources`. The parser
remains for qualification and reporting only — it is not part of the
assignment path.

Stage 1 Phase 5 now also supports temporary per-number fallback
counselor routing. Each `crm_whatsapp_numbers` row can define an active
`fallback_employee_id` with optional reason/start/end window. When the
fallback is active and within its time window, new leads from that
receiving number route to the fallback counselor; otherwise they route
to the default `assigned_employee_id`. Campaigns still inherit through
their parent WhatsApp number. Existing assigned leads are not
automatically reassigned.

Stage 1 Phase 4.5 cleanup has also landed: manual/mock raw intake now
auto-runs the rule-based parser on creation while promotion remains
explicit, the sidebar groups CRM links separately from HRM/admin links
with raw inbox hidden from non-super-admin users, and fallback-window
evaluation now has one shared helper.

Stage 1 Phase 5 transfer/handoff foundation migration has been added:
pending counselor-to-counselor handoff requests live in
`crm_lead_transfers`, not `crm_lead_assignments`. Actual ownership
changes still belong in `crm_lead_assignments` only after a transfer is
accepted or admin-overridden. Transfer UI and server actions are not
built yet.

## Current Goal

Review and manually test Stage 1 Phase 5 / 4.5 cleanup (number-owner
assignment, per-number temporary fallback routing, auto-parse on raw
intake, grouped CRM navigation, and transfer migration readiness)
before building any real WhatsApp API, Gemini, HRM task sync, or
downstream CRM modules.


## Working Philosophy

- WhatsApp-first, not form-first.
- CRM is the control layer.
- HRM remains the employee/task/payroll foundation.
- Postgres/Supabase preferred.
- Avoid chatbot logic.
- Avoid overengineering.
- Plan before implementation.

## Next Best Step

Manually test the Phase 5 number-ownership CRM assignment flow:

- `/admin/crm`
- `/admin/crm/whatsapp-numbers`
- `/admin/crm/campaign-sources`
- `/admin/crm/assignment-rules`
- `/crm/inbox`
- `/crm/inbox/[id]`
- `/crm/leads`
- `/crm/leads/[id]`
- `supabase/migrations/0013_crm_lead_transfers.sql`

Then continue to the next Stage 1 phase only after approval. Do not
build the WhatsApp API/webhook, Gemini integration, HRM task sync, or
downstream client/case/invoice/document system until current Stage 1
manual review is complete.

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
