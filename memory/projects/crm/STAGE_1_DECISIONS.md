# CRM Stage 1 — Locked Decisions

Locked 2026-05-12 by Syed Yashal Raza. Implementation may proceed against
these decisions. Any change requires an explicit revision of this file.

## Document Precedence

If anything in the older CRM planning docs (`archive/CRM_HRM_INTEGRATION.md`,
CRM_DATA_MODEL_V1.md, DATA_MODEL.md, CRM_ARCHITECTURE_DECISION.md,
MVP_SCOPE.md, CRM_STAGE_1_MVP_SCOPE.md, `archive/WHATSAPP_STAGE_1_INTAKE.md`,
OPEN_QUESTIONS.md, IMPLEMENTATION_PLAN.md, CURRENT_STATE.md) contradicts
this file, **this file wins**. The Codex implementation packet
(`CODEX_STAGE_1_PACKET.md`) is the authoritative build spec derived from
this file.

## Scope Reminder

Stage 1 pipeline:

`WhatsApp inbound → raw inbox → parser → lead shell → assignment → human follow-up`

Stage 1 excludes: real WhatsApp send, Gemini / any LLM, client portal,
invoices, cases, documents, commissions, payroll integration, Meta spend
sync, AI chatbot.

## Locked Answers

### 1. WhatsApp send path
Stage 1 is **read-only / mock send**.

- Webhook in, raw inbox, parser, assignment — all real.
- No Cloud API send, no BSP.
- `auto_greeting_sent` activity is logged when the system *would* send,
  but no outbound HTTP call is made.
- Managers/employees reply manually outside CRM.
- Real WhatsApp send is Stage 1.5.

### 2. First WhatsApp number categories
Italy, Korea, B2B.

- Actual numbers and Meta `phone_number_id` will be provided later.
- `crm_whatsapp_numbers.phone_number_id` is **nullable** in Stage 1.
- Admin UI must let Yashal create/edit number rows without a real
  Meta ID. A row can be marked `is_api_connected = false` and still
  drive assignment rules.

### 3. Initial assignment ownership
- Unassigned / review queue owner = Yashal (`super_admin`).
- Eligible agents per product/branch are **configurable via
  `crm_assignment_rules`**.
- Do **not** hardcode any agent IDs in code or seed data.

### 4. Branch scope
Active CRM branches: **Karachi**, **Lahore**.

- Islamabad is not live; no row needed.
- Edmonton, Naples = tag / remote presence only, not branches.
- CRM migrations must not seed new branches; they consume the
  existing HRM `branches` table.

### 5. Gemini fallback
**Not in Stage 1.**

- Parser + manual review queue only.
- No AI provider env vars.
- No `lib/ai/` directory.
- Gemini fallback is Stage 1.5.

### 6. RLS strategy
**App-level branch scoping for Stage 1.** Matches current HRM pattern
(`lib/auth/permissions.ts`).

Baseline DB-side RLS on every CRM table:

- `ENABLE ROW LEVEL SECURITY`
- `super_admin_all` policy via the existing `is_super_admin()` helper
- Self-select policies where applicable (e.g. agent sees own leads)

Branch-scoped manager visibility is enforced in application code, not
in Postgres policies. DB-level branch RLS is deferred.

### 7. CRM → HRM task creation
**Not in Stage 1.**

- CRM follow-ups live entirely inside CRM (`crm_lead_activities`,
  future `crm_follow_ups`).
- Do not insert rows into `tasks` from any CRM code path.
- HRM task sync with `origin = 'crm'` is deferred.

### 8. Greeting text
Use the 7-question greeting from
`archive/WHATSAPP_STAGE_1_INTAKE.md` § *Greeting and Structured Info
Request* as the default template.

- Single template for Stage 1 (no per-number variants).
- Future per-product variants will live on `crm_whatsapp_numbers`.

### 9. Promotion criteria (raw_inbox → crm_leads)
**Mandatory** before promotion:

- Country interest
- City

All other extracted fields (qualification, CGPA, study gap, budget,
English test) improve quality / confidence but are not required.

### 10. Confidence thresholds
- `confidence >= 0.80` → auto-promote (status `qualified`, create
  `crm_leads` row, run assignment).
- `0.50 <= confidence < 0.80` → status `needs_review`, hold in raw
  inbox for human triage.
- `confidence < 0.50` → status `awaiting_details`, record missing
  fields, do not promote.

Threshold values live in the existing `settings` table under key
`crm_parser` (jsonb) so they can be tuned without code changes.

### 11. Timeline
Stage 1 starts after HRM live baseline is stable.

Parallel work is allowed only if:

- It is fully isolated under `/crm` and `/admin/crm`.
- It touches no existing HRM tables, routes, or RLS policies.
- It does not modify `user_role` enum or `lib/types/hrm.ts`.

## Schema Naming Corrections (apply throughout)

The older planning docs use a few names that do not match the actual
HRM repo. Authoritative names for CRM Stage 1:

- HRM tables are unprefixed: `app_users`, `employees`, `branches`,
  `departments`, `tasks`. No `hrm_` prefix exists in this repo.
- There is no `hrm_clients` table. Converted clients become rows in a
  future `crm_cases` table (out of Stage 1).
- CRM agent identity = HRM `employees.id`. When CRM needs to look up
  the auth user (e.g. for `assigned_to` semantics like HRM tasks use),
  it joins through `employees.user_id` to `app_users.id`.
- `user_role` enum in this repo:
  `super_admin | admin_hr | branch_manager | assistant_manager | manager | employee | team_member`.
  Stage 1 must not introduce new roles. Map CRM concepts onto these.

## Out of Stage 1 / Deferred

- Real WhatsApp send (Stage 1.5)
- Gemini fallback (Stage 1.5)
- Per-number greeting variants
- Branch-level DB RLS
- HRM task sync (`origin='crm'`)
- Meta spend / campaign API sync
- Case creation, documents, invoices, payments, commissions
- Client portal
- Mobile app
- Drag-and-drop kanban
