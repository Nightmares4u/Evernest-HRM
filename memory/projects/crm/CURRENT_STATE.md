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

Stage 1 T10B has been implemented on `crm-dev`: the lead detail page now
has a counselor lead workbench for internal notes, lead status updates,
follow-up scheduling, and follow-up completion. These actions write to
`crm_lead_activities` using `note_added`, `status_changed`,
`followup_scheduled`, and `followup_completed`, and follow-up scheduling
uses the existing `crm_leads.next_followup_at` column.

Stage 1 T10C has been implemented on `crm-dev`: `/crm/leads/follow-ups`
now provides a read-only due/overdue follow-up board grouped by
`crm_leads.next_followup_at`, with server-side PKT bucket math, URL
filters, counselor scoping, and no drag/drop or mutation actions.

## Phase 2A Landed (2026-05-22)

Conversion + client shell is implemented. New tables:
`crm_clients`, `crm_client_activities`, `crm_client_payments`. Routes:
`/crm/clients`, `/crm/clients/[id]`,
`/admin/crm/clients/conversion-queue`. Migration:
`0015_crm_clients_phase_2a.sql` (manual apply).

## Phase 2B Landed (2026-05-23)

Document registry + upload + review is implemented. Tables:
`crm_client_documents`. Storage bucket: `crm-client-docs` (private,
signed URLs only). Routes: `/crm/clients/[id]/documents`,
`/admin/crm/clients/doc-review`. Migration:
`0017_crm_client_documents_phase_2b.sql` (manual apply).

## Phase 2C Landed (2026-05-23)

Per-university applications are implemented. Table:
`crm_client_applications`. Status transitions auto-bump `client.status`
(`applying`, `offer_in_hand`, `offer_accepted`) per Plan §4. Route:
`/crm/clients/[id]/applications`. Migration:
`0018_crm_client_applications_phase_2c.sql` (manual apply).

## Phase 2D Landed (2026-05-23)

Country milestones + visa-stage gate are implemented. Table:
`crm_client_country_milestones` (unique on `client_id` +
`milestone_code`). Registry: `CRM_COUNTRY_MILESTONES` in
`lib/types/crm.ts` for 11 countries. Route:
`/crm/clients/[id]/visa`. Gate: client cannot move to
`visa_submitted` while any required milestone is unfinished. Transitions
added: `offer_accepted` -> `visa_prep`, `visa_prep` ->
`visa_submitted`, plus super_admin rollbacks. Migration:
`0019_crm_client_country_milestones_phase_2d.sql` (manual apply).

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

Execute the next implementation tasks from the AI Handoff Backlog:
1. **T10C:** Due/overdue follow-up board
2. **T10D:** Activity timeline polish
3. **T11:** Lead board / pipeline UI

Then continue to the next Stage 1 phase only after approval. Do not
build the WhatsApp API/webhook, Gemini integration, HRM task sync, or
downstream client/case/invoice/document system until current Stage 1
counselor workflows are complete.

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
 phase only after approval. Do not
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

---

## Stage 2 — Phase 2A landed (2026-05-22)

Conversion event + client shell + admin conversion queue shipped.

- Tables added: `crm_clients`, `crm_client_activities`, `crm_client_payments` (migration `0015_crm_clients_phase_2a.sql`).
- Routes added: `/crm/clients`, `/crm/clients/[id]`, `/admin/crm/clients/conversion-queue`.
- Conversion panel added to `/crm/leads/[id]` (visible to assigned counselor + super_admin).

### Schema decisions resolved during 2A

- **Lead → Client UUID strategy: FK-link.** `crm_clients.id` is its own uuid; `crm_clients.lead_id` is a NOT NULL UNIQUE FK to `crm_leads.id`. (Plan §13 open Q resolved.)
- **Client code format: `EN-{YYYY}-{4-digit zero-padded sequence}`** generated via a global Postgres sequence `crm_client_code_seq`. The year prefix is the creation year in Asia/Karachi. Example: `EN-2026-0001`. (Plan §13 open Q resolved.)
- **Conversion gate location:** `agreement_signed_at` and `advance_paid_at` live on the **client** row, not the lead. The conversion form is the only way to populate them; this implicitly enforces the gate. (Resolves contradiction between Plan §3 and Plan §8.1.)

## Stage 2 — Phase 2B landed (2026-05-23)

Document registry + upload + review shipped.

- Table added: `crm_client_documents` (migration `0017_crm_client_documents_phase_2b.sql`).
- Storage bucket: `crm-client-docs` (private, signed URLs, 15-min TTL).
- Routes added: `/crm/clients/[id]/documents`, `/admin/crm/clients/doc-review`.
- Doc state machine: `uploaded → under_review → approved | rejected_resubmit | expired`.
- Re-upload supported via `superseded_by_id`; old file kept in Storage for audit.
- Doc registry codes locked in `lib/types/crm.ts` (`CRM_DOC_CODES`), including `apostille_academic_docs` and `apostille_visa_docs` for country-specific visa stage docs.

### Permission model for clients + documents

- View clients: super_admin + assigned counselor + **branch_manager / assistant_manager / manager / admin_hr in same branch** (`canViewCrmClient`).
- Verify documents (upload / claim / approve / reject): super_admin + assigned counselor + **Operations department** (`canVerifyClientDoc`). Branch managers may view but cannot verify unless also the assigned counselor.
- The "Operations" department name is hardcoded in `lib/crm/permissions-clients.ts` (`OPS_DEPARTMENT_NAME`). Move to settings table when RBAC migration lands.

## Stage 2 — Phase 2C landed (2026-05-23)

Per-university applications shipped.

- Table added: `crm_client_applications` (migration `0018_crm_client_applications_phase_2c.sql`).
- Enums: `crm_client_application_status` (draft → submitted → under_review → offer | rejected | waitlisted → accepted | declined | withdrawn), `crm_client_application_intake_term` (fall | spring | summer).
- Partial unique index: at most one application per client may be in `accepted` status.
- Routes added: `/crm/clients/[id]/applications`.
- Server actions: createApplication, updateApplicationFields, transitionApplicationStatus, deleteApplication.
- Auto-bump rules per Plan §4: an app moving to `submitted` bumps client `onboarding|doc_review|uni_selection` → `applying`; any app in `offer` while client is `applying` bumps to `offer_in_hand`; moving an app to `accepted` bumps client to `offer_accepted` (one accepted per client enforced).
- Permission predicate added: `canEditClientApplication`.

## Stage 2 — Phase 2D landed (2026-05-23)

Country milestone overlay + visa-stage gate shipped.

- Table added: `crm_client_country_milestones` (migration `0019_crm_client_country_milestones_phase_2d.sql`).
- Enum: `crm_client_milestone_status` (not_started | in_progress | done | not_applicable).
- Registry: `CRM_COUNTRY_MILESTONES` in `lib/types/crm.ts` covering 11 countries (italy, south_korea, russia, germany, hungary, us, canada, france, cyprus, turkey, azerbaijan).
- Route added: `/crm/clients/[id]/visa`.
- Lazy idempotent seeding via `ensureClientMilestonesSeeded` on first visit.
- Gate: client cannot transition to `visa_submitted` while any required milestone is unfinished.
- Status transitions: offer_accepted → visa_prep (forward), visa_prep → visa_submitted (forward, gated), plus super_admin rollbacks both directions.
- Permission predicates added: `canEditClientMilestone`, `canEditClientStatus`.

### Transaction policy locked (2026-05-23)

Gemini audits of Phases 2A–2D surfaced repeat "orphan row on partial failure" bugs from chaining multiple Supabase writes in a single server action. Locked rule in `CLIENT_LIFECYCLE_STAGE_2_PLAN.md` §14:

> Any server action that mutates more than one table — or mutates one table and then writes to a `crm_*_activities` table — MUST be implemented as a Postgres function (RPC) and invoked via `admin.rpc(...)`.

- Existing 2A actions (A-1, A-2) still leak; backlog in `CRM_BOARD.md` flagged URGENT.
- Existing 2D actions (A-8, A-9, A-10) have compensation patches; backlog flagged as technical debt.
- Phase 2E and beyond will be RPC-first from the start.
