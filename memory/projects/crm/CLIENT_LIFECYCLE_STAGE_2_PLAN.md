# EN CRM Stage 2 — Client Lifecycle Plan

> **Status:** Directional. Not locked. Vibe-build target.
> **Created:** 2026-05-22.
> **Parent docs:**
> - [CRM_MASTER_CONTEXT.md](CRM_MASTER_CONTEXT.md)
> - [CRM_AI_HANDOFF_AND_REFERENCE_ARCHITECTURE.md](CRM_AI_HANDOFF_AND_REFERENCE_ARCHITECTURE.md)
> - [STAGE_1_DECISIONS.md](STAGE_1_DECISIONS.md)
> - [REFERENCE_CODE_EXTRACTION_MAP.md](REFERENCE_CODE_EXTRACTION_MAP.md)
> - [../hrm/SYSTEM_SETTINGS_MASTER_PLAN.md](../hrm/SYSTEM_SETTINGS_MASTER_PLAN.md)
> **Mode:** Vibe-build — locked decisions below, schema sketches will drift.

---

## 1. What Stage 2 is

Stage 1 (live on `crm-dev`) ends at `crm_leads.status='converted'`. Stage 2
turns a converted lead into a **client** the company actively serves until
they're either departed-and-settled or withdrawn-and-refunded.

This document plans:

- The conversion event (lead → client).
- The client lifecycle state machine.
- Per-university applications as first-class rows.
- The document registry and verification flow.
- Country-specific milestone checklists.
- Schema sketch for new tables.
- What ships in Stage 2 vs what defers to Stage 3 (client portal).

This document is **not** an implementation plan or migration. Names and
column shapes will drift during build.

---

## 2. Decisions locked (2026-05-22)

| # | Decision | Choice |
|---|---|---|
| Q1 | Client portal in MVP? | **No.** Employees upload on behalf via CRM. Clients send via WhatsApp. Portal = Stage 3. |
| Q2 | Per-uni applications as first-class table? | **Yes.** `crm_client_applications`, one row per uni, independent state. |
| Q3 | B2B and Work Permit — same flow as student? | **No.** Fork via `client_type` enum (`student \| work_permit \| b2b`) with different state machines. |
| Q4 | Document verification — who? | **Assigned counselor** (primary) **+ Ops department** (any active employee in Ops) **+ super_admin**. |

These four decisions are not up for re-debate during build. Anything else
in this doc may drift.

---

## 3. The conversion event

Currently, a lead's last good state is `status='converted'`. That marker
isn't enough — it's a CRM checkbox. To create a client we need a real
financial/legal event:

```
LEAD (Stage 1, existing):
  new → contacted → qualified → follow_up → converted | lost

CONVERSION GATE (new):
  agreement_pending → agreement_signed → advance_paid → CLIENT CREATED
```

A `crm_clients` row gets created when **both** of these are true on the
parent lead:

- `agreement_signed_at IS NOT NULL`
- `advance_paid_at IS NOT NULL`

Until both gates clear, the lead can sit in `agreement_pending` /
`agreement_signed` indefinitely without becoming a client. This is the
natural choke-point for finance/ops to enforce policy.

The `crm_clients` row uses the same UUID as the parent `crm_leads` row
(or carries `lead_id` as a unique FK — pick during implementation;
same-UUID is cleaner for joins but loses the lead↔client boundary in
audit logs).

---

## 4. Client lifecycle — main state machine

```
onboarding              collecting client docs (academic + identity)
doc_review              staff verifying uploaded docs
uni_selection           shortlisting target universities
applying                applications in flight; per-uni sub-states
offer_in_hand           ≥1 offer received (across any application)
offer_accepted          committed to one university
visa_prep               collecting visa-specific docs
visa_submitted          file submitted to embassy
visa_decision           granted | refused | additional_info_requested
pre_departure           flight + accommodation + briefing
departed                physical departure
alumni                  arrived + settled — closure (success)
withdrawn_refunded      closure (failure) — refund policy enforced
```

Rules:

- The main state is a single `status` enum on `crm_clients`. It can move
  forward; it can also move backward when needed (e.g., visa refused →
  back to `visa_prep`, or `offer_in_hand` → `applying` if the student
  wants more options).
- Backward moves require a reason note and are logged in the activity
  timeline.
- `withdrawn_refunded` and `alumni` are terminal. Moving out of them
  requires super_admin override.
- `applying` is NOT entered until at least one application row exists
  with `status='submitted'`.
- `offer_in_hand` is automatic when any application row transitions to
  `status='offer'`. Staff can dismiss back to `applying` if the offer
  was retracted.

---

## 5. Per-application sub-state machine

One row in `crm_client_applications` per university the client targets.
Independent state per row.

```
draft        prepared in our system, not submitted to the uni
submitted    application sent to the uni
under_review acknowledged by the uni; pending decision
offer        offer received
rejected     uni rejected
waitlisted   uni waitlisted
accepted     client accepted this specific offer (only one row at a time)
declined     client declined this specific offer
withdrawn    client withdrew from this application
```

Constraint: at most one row per client may be in `accepted`. Moving a
row to `accepted` should auto-bump the client's main `status` to
`offer_accepted` (and any sibling `offer` rows can stay or be moved to
`declined` — staff decision, not forced).

Each row tracks:

- `university_id` (FK to a `crm_universities` table; can start as a
  free-text `university_name` and promote later)
- `program_name` (text — degrees vary too much for a fixed list)
- `intake_year`, `intake_term` (Fall/Spring/Summer)
- `submitted_at`, `decision_at`
- `notes`
- offer-specific: `offer_letter_path` (Supabase Storage), `offer_amount_currency`,
  `tuition_total`, `scholarship_amount`

---

## 6. Document registry

Documents are the backbone of Stage 2. Two-axis design:

- **Doc category** (what *kind* of document it is).
- **Doc state** (lifecycle: `uploaded → under_review → approved | rejected_resubmit`).

### 6.1 Categories — All applicants (always required)

| Code | Label | Notes |
|---|---|---|
| `cnic_front` | CNIC front | |
| `cnic_back` | CNIC back | |
| `passport_data_page` | Passport data page | If expired, flag + plan renewal |
| `passport_photo` | Passport-size photo | Country-specific size + background |
| `en_agreement_signed` | EN agreement (signed) | Digital signature; PDF upload |

### 6.2 Categories — Bachelor's track

| Code | Required | Notes |
|---|---|---|
| `matric_transcript` | yes | or `olevel_statement_of_result` |
| `matric_certificate` | yes | or `olevel_certificates` |
| `inter_transcript` | yes | or `alevel_certificates` |
| `inter_certificate` | yes | |
| `english_test_result` | conditional | IELTS/TOEFL/Duolingo/PTE — country-dependent |
| `birth_certificate` | country-conditional | |
| `character_certificate` | country-conditional | |

### 6.3 Categories — Master's track (everything in §6.2 plus)

| Code | Required | Notes |
|---|---|---|
| `bachelors_transcript` | yes | |
| `bachelors_degree` | yes | |
| `hec_equivalency` | country-conditional | Required for Germany, US for some unis |
| `sop` | yes | Statement of Purpose |
| `lor_1`, `lor_2`, `lor_3` | yes (2 min) | Letters of recommendation |
| `cv` | yes | |
| `work_experience_letter` | optional | One row per employer is acceptable |

### 6.4 Categories — PhD track (everything in §6.3 plus)

| Code | Required | Notes |
|---|---|---|
| `research_proposal` | yes | |
| `supervisor_correspondence` | optional but expected | |
| `publications_list` | optional | |

### 6.5 Categories — Work Permit / Europe track (NOT student)

| Code | Required | Notes |
|---|---|---|
| `trade_certificate` | yes | |
| `experience_letter` | yes | One per employer |
| `language_certificate` | country-conditional | German A2/B1, etc. |
| `job_offer_letter` | conditional | Only if pre-arranged |
| `driving_license` | optional | Trade-route specific |

### 6.6 Categories — Visa-stage (added when client enters `visa_prep`)

| Code | Required | Notes |
|---|---|---|
| `bank_statement_6m` | yes | Last 6 months, sometimes 3 |
| `sponsor_affidavit` | conditional | If financial sponsor is a third party |
| `sponsor_cnic` | conditional | |
| `sponsor_bank_statement` | conditional | |
| `gic_proof` | Canada-only | |
| `blocked_account_proof` | Germany-only | Sperrkonto, ~€11k |
| `medical_certificate` | country-conditional | Russia + some others |
| `hiv_test` | Russia | |
| `apostille_<doc>` | country-conditional | Italy, Russia, etc. |
| `visa_appointment_proof` | yes | Booking confirmation |

### 6.7 Doc state machine (per row)

```
uploaded            uploaded by employee on behalf of client
under_review        opened by a reviewer
approved            verified — final state until version bump
rejected_resubmit   reviewer rejected with reason; client must re-upload
expired             auto-flagged when relevant (passport, English test)
```

- `uploaded → under_review`: when a verifier opens it (claim).
- `under_review → approved | rejected_resubmit`: verifier decides with note.
- Re-upload creates a new doc row, supersedes the old one; old row stays
  with `superseded_by` pointer for audit. Don't delete files — Supabase
  Storage retention is a compliance asset.

### 6.8 Doc verification permissions (Q4 decision)

A user can **review** (transition `uploaded → under_review`) and **decide**
(`approved | rejected_resubmit`) on a doc IFF any of:

1. `me.appUser.role === 'super_admin'`
2. `me.employee?.id === client.assigned_agent_id` (assigned counselor)
3. `me.employee` belongs to the "Operations" department (or whatever the
   department's `code` / `name` ends up being — see open Q in §13)

This is the first real permission check that needs the **department**
dimension, which the System Settings master plan flagged as a Phase D
trigger. For Stage 2 build, hardcode a department lookup; revisit when
the settings plane lands.

---

## 7. Country milestone checklists

Per-country milestones are an overlay, not part of the main state
machine. They sit in `crm_client_country_milestones` (one row per
client × milestone). Each row has:

- `milestone_code` (e.g., `italy_dov`, `germany_aps`, `us_sevis_paid`)
- `status` (`not_started | in_progress | done | not_applicable`)
- `due_at` (optional, for time-sensitive items)
- `completed_at`, `completed_by`
- `notes`

When a client's target country is set, the system seeds the right
milestones automatically. Reviewers tick them off; the client cannot
move past `visa_prep` until all required (non-`not_applicable`)
milestones are `done`.

### 7.1 Baseline country milestone seed

| Country | Required milestones (baseline; refine during build) |
|---|---|
| Italy | DOV (Dichiarazione di Valore) + CIMEA; embassy slot booking; sometimes Italian A2/B1 |
| South Korea | TOPIK or English-medium proof; NIIED scholarship paperwork if applicable |
| Russia | Invitation letter from uni; apostille of all academic docs; medical certificate; HIV test |
| Germany | **APS certificate (mandatory for PK)**; blocked account (Sperrkonto, ~€11k); Studienkolleg track if needed |
| Hungary | Stipendium Hungaricum scholarship; criminal record certificate |
| US | SEVIS fee paid; I-20 received; F1 interview booked |
| Canada | SDS-path proof; GIC ~CAD 20k; biometrics booked |
| France | Campus France procedure registered; sometimes French A2/B1 |
| Cyprus | Lighter set — English-taught proof, financial proof |
| Turkey | YTB scholarship variants; equivalence document |
| Azerbaijan | Lighter set — newer market; refine when more data |
| **B2B** | **N/A — not a student/client flow.** Stays in CRM Stage 1 lead handling. |
| **Work Permit / Europe** | Separate state machine (see §4 client_type fork) |

These baselines should be treated as seed data, not constants. Ops/super_admin
can edit per-country milestone definitions over time as embassy processes
shift.

---

## 8. Schema sketch

Directional. Names will drift.

### 8.1 New tables

```text
crm_clients
  id                          uuid PK (= crm_leads.id, or unique FK)
  lead_id                     uuid FK → crm_leads.id (unique)
  client_type                 text CHECK ('student','work_permit','b2b')
  client_code                 text unique     -- human-readable, e.g., EN-2026-0142
  status                      text            -- main state machine §4
  target_country              text            -- one of the country list
  target_level                text            -- bachelors|masters|phd|work_permit|other
  agreement_signed_at         timestamptz
  advance_paid_at             timestamptz
  advance_amount              numeric(12,2)
  total_fee                   numeric(12,2)
  currency                    text default 'PKR'
  assigned_agent_id           uuid FK → employees.id (counselor)
  branch_id                   uuid FK → branches.id
  created_at, updated_at      timestamptz

crm_client_documents
  id                          uuid PK
  client_id                   uuid FK
  doc_code                    text            -- §6 doc registry codes
  doc_state                   text            -- §6.7 uploaded|under_review|approved|rejected_resubmit|expired
  storage_path                text            -- Supabase Storage object key
  file_name, file_size, mime  text/int/text
  uploaded_by_user_id         uuid            -- always an EN employee in Stage 2
  uploaded_at                 timestamptz
  reviewed_by_user_id         uuid
  reviewed_at                 timestamptz
  decision_note               text
  superseded_by_id            uuid FK → self  -- when client re-uploads
  expires_at                  timestamptz     -- passport, English test
  created_at                  timestamptz

crm_client_applications
  id                          uuid PK
  client_id                   uuid FK
  university_name             text            -- promote to FK later
  program_name                text
  intake_year, intake_term    int/text
  status                      text            -- §5 sub-state machine
  submitted_at, decision_at   timestamptz
  offer_letter_path           text
  tuition_total, scholarship_amount, currency
  notes                       text
  created_at, updated_at      timestamptz

crm_client_country_milestones
  id                          uuid PK
  client_id                   uuid FK
  milestone_code              text            -- §7 codes
  status                      text            -- not_started|in_progress|done|not_applicable
  due_at                      timestamptz
  completed_at                timestamptz
  completed_by_user_id        uuid
  notes                       text
  created_at, updated_at      timestamptz
  UNIQUE (client_id, milestone_code)

crm_client_activities
  id                          uuid PK
  client_id                   uuid FK
  activity_type               text            -- doc_uploaded, doc_approved, status_changed, application_submitted, ...
  actor_user_id               uuid
  description                 text
  payload                     jsonb
  created_at                  timestamptz

crm_client_payments
  id                          uuid PK
  client_id                   uuid FK
  amount                      numeric(12,2)
  currency                    text
  paid_at                     timestamptz
  method                      text            -- bank|cash|card|other
  reference                   text
  notes                       text
  recorded_by_user_id         uuid
  created_at                  timestamptz
```

### 8.2 Supporting (later)

- `crm_universities` — once free-text university names stabilize.
- `crm_country_milestone_definitions` — when ops wants to edit the
  seed list without code changes (lines up with Settings Phase G).
- `crm_client_refunds` — refund records, tied to `withdrawn_refunded`.

### 8.3 Storage

- Supabase Storage bucket `crm-client-docs` (private; signed URLs only).
- Object key pattern: `clients/{client_id}/{doc_code}/{uploaded_at}_{filename}`.
- Never expose raw URLs. Issue short-lived signed URLs (≤15 min) on demand.
- Retention: indefinite for now — visa/audit trail asset.

---

## 9. UI surfaces — what gets added

Server-rendered, same style as existing CRM pages. No client portal yet.

```
/crm/clients                       list + filter by status/country/counselor
/crm/clients/[id]                  client detail (the new workbench)
/crm/clients/[id]/documents        doc registry tab
/crm/clients/[id]/applications     per-uni applications tab
/crm/clients/[id]/visa             visa-stage docs + milestone checklist
/crm/clients/[id]/payments         payments tab
/crm/clients/[id]/timeline         activity feed
/admin/crm/clients                 admin overview
/admin/crm/clients/conversion-queue  agreement_pending / agreement_signed list (operations queue)
```

Conversion path UX:

1. On `/crm/leads/[id]` (existing): add a "Convert to client" panel that
   appears only when `status='converted'`. Two fields: agreement upload +
   advance payment record. Submitting creates the `crm_clients` row.
2. After conversion, the lead detail page shows a "View client" link;
   the new client detail page is the main workbench.

Existing CRM pages (`/crm/leads`, `/crm/inbox`, `/crm/transfers`) are
unchanged.

---

## 10. Permission model summary

| Action | Who |
|---|---|
| Create client (convert lead) | Assigned counselor of lead OR super_admin |
| View client | Same scoping as lead today |
| Edit client core fields | Assigned counselor OR super_admin |
| Upload document on behalf | Assigned counselor OR Ops dept OR super_admin |
| Verify/reject document | Assigned counselor OR Ops dept OR super_admin |
| Create application row | Assigned counselor OR super_admin |
| Decide application status | Assigned counselor OR super_admin |
| Mark country milestone done | Assigned counselor OR Ops dept OR super_admin |
| Record payment | Super_admin only (or finance role later) |
| Transition to `withdrawn_refunded` | Super_admin only |
| Transition out of terminal states | Super_admin only |
| Transfer client (re-assign counselor) | Same rules as lead transfer today |

All "Ops dept" checks read `employees → departments` by department name
in Stage 2. Move to RBAC permission keys (`clients.docs.verify` etc.)
when the System Settings plan reaches Phase D.

---

## 11. Phasing (within Stage 2)

Don't ship everything at once. Suggested order:

### Phase 2A — Conversion + Client shell (1 week)
- Migration: `crm_clients`, `crm_client_activities`, `crm_client_payments`.
- Conversion panel on lead detail page.
- Client detail page (read-only header + status chip).
- Activity timeline.
- Super_admin records `advance_paid_at` and `agreement_signed_at`.

**Exit criteria:** A converted lead can become a client; client status shows
`onboarding`; activity timeline logs the conversion event.

### Phase 2B — Document registry (1–1.5 weeks)
- Migration: `crm_client_documents`.
- Doc upload UI (employee uploads on behalf).
- Doc review UI (Ops/counselor/admin approve or reject with reason).
- Re-upload flow with `superseded_by`.
- Supabase Storage bucket + signed URL helper.

**Exit criteria:** All docs in §6.1–§6.3 can be uploaded, reviewed,
approved/rejected, and re-uploaded.

### Phase 2C — Per-uni applications (1 week)
- Migration: `crm_client_applications`.
- Applications tab on client detail.
- Sub-state machine + transitions.
- Auto-bump client status to `offer_in_hand` when any app row hits `offer`.

**Exit criteria:** A client can have 5 applications in flight, each with
independent status; client main status reflects the rollup.

### Phase 2D — Visa stage + country milestones (1 week)
- Migration: `crm_client_country_milestones`.
- Visa-stage doc categories (§6.6).
- Country milestone seeding when target_country is set.
- Milestone checklist UI on `/crm/clients/[id]/visa`.

**Exit criteria:** A Germany-bound client cannot be moved to `visa_submitted`
until APS milestone is `done`.

### Phase 2E — Closure (0.5 week)
- `pre_departure`, `departed`, `alumni`, `withdrawn_refunded` transitions.
- Refund tracking (super_admin only).
- KPI capture stub for `alumni`.

**Exit criteria:** A full lifecycle from conversion to alumni can be
walked end-to-end.

### Phase 2F (deferred — Stage 3) — Client portal
- Separate auth flow (client_id + password).
- Client-side upload UI.
- Client view of own status, docs, applications.
- Client-driven re-upload after `rejected_resubmit`.

---

## 12. Risks

1. **Scope creep.** Stage 2 wants to grow into payroll/commission/case
   management. Resist. Closure and refund are in; commissions, CASM,
   alumni newsletters are out.
2. **Document storage cost.** Many large PDFs across 14 staff × hundreds
   of clients. Monitor Supabase Storage usage; consider archive policy
   for `alumni` clients after 2 years.
3. **Country milestone drift.** Embassy processes change. Don't bake
   country logic into code paths — drive everything from the
   `crm_client_country_milestones` rows + seed data so ops can adjust.
4. **Department permission hardcoding.** Q4 grants Ops dept doc-verify
   rights. Until Settings Phase D lands, this is a hardcoded department
   name check. Tag the call sites with `// → clients.docs.verify` so
   the eventual RBAC migration can find them.
5. **Lead → client UUID strategy.** Decide between same-UUID and
   FK-link during Phase 2A implementation. Same-UUID is simpler for
   reporting; FK-link is more explicit. Document the choice in
   `CURRENT_STATE.md` once made.
6. **Withdrawn before conversion.** A lead can withdraw before
   `advance_paid_at`. That stays in CRM Stage 1 as `status='lost'`.
   Don't create a client row for withdrawn leads.

---

## 13. Open questions (revisit during build)

- **Same-UUID vs FK-link** for `crm_clients` vs `crm_leads`. Decide in Phase 2A.
- **Client code format.** `EN-{year}-{seq}`, or `EN-{branch}-{seq}`? Pick before Phase 2A migration.
- **Department code/name for "Operations"** — confirm the exact value in `departments.name` so the permission check is correct.
- **Multiple counselors per client?** Today, one. Some cases need a primary (counselor) + a docs reviewer in tandem. Defer unless real cases appear.
- **Refund policy enforcement** — is it codified, or is it a free-text decision by super_admin? Phase 2E should at minimum capture the amount; policy logic can be added later.
- **English test re-tests.** If a client takes IELTS twice, do we keep both? Yes — `superseded_by` handles it. Confirm UX shows only the latest.
- **B2B and Work Permit state machines.** Sketched but not detailed. Both should get their own short planning docs once Stage 2 student flow is in pilot.
- **Webhooks/notifications when status changes.** Email to client? Stage 3 (portal) — out of scope here.

---

## 14. Transaction policy — when to use RPC vs direct Supabase

> **Locked 2026-05-23 after Gemini audits of Phases 2A–2D revealed
> repeat "orphan row on partial failure" bugs (A-1, A-2, A-8, A-9, A-10).**

### The rule

**Any server action that mutates more than one table — or mutates one table
and then writes to a `crm_*_activities` table — MUST be implemented as a
Postgres function (RPC) and invoked via `admin.rpc("function_name", { ... })`.**

Single-table mutations (e.g., updating one field on `crm_clients`,
inserting one row into `crm_client_documents`) are fine via the standard
`admin.from(...).update(...)` / `.insert(...)` pattern. No RPC needed.

### Why

The Supabase JS client has no `BEGIN ... COMMIT`. Each call is its own
HTTP request and its own implicit transaction. Chaining writes in TypeScript
means partial failure leaves the DB broken: the first write committed,
the second failed, the action throws, the user sees an error, the first
write is still there.

Postgres functions run inside an implicit transaction. If any statement
inside the function raises, the entire function rolls back atomically.
One HTTP call, one transaction, no compensation code to forget.

### The compensation pattern (deprecated for new code)

Phases 2A–2D shipped without this rule. To avoid an emergency rewrite,
the affected actions use "compensation": capture the original row, do
the writes, on failure manually revert. See:

- `app/(dashboard)/crm/clients/visa/actions.ts` —
  `setMilestoneStatus`, `updateClientStatusWithActivity`
- `lib/db/crm.ts` — `ensureClientMilestonesSeeded`
- `app/(dashboard)/crm/clients/actions.ts` —
  `convertLeadToClient`, `recordClientPayment` (no compensation yet — still A-1, A-2)

**Compensation is a stopgap, not a fix.** The compensation itself can
fail (the same network drop that killed the original write can kill the
compensation), and concurrent writes can race the snapshot. Treat
compensation patches as carrying technical debt; backfill them into
RPCs when you next touch them.

### The RPC template

```sql
-- supabase/migrations/00NN_<name>.sql
CREATE OR REPLACE FUNCTION crm_<verb_object>(
  p_client_id     uuid,
  p_actor_user_id uuid,
  p_to_status     text,
  p_note          text
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_from_status text;
BEGIN
  SELECT status INTO v_from_status
    FROM crm_clients
    WHERE id = p_client_id
    FOR UPDATE;  -- row lock to serialize concurrent transitions

  IF v_from_status IS NULL THEN
    RAISE EXCEPTION 'Client % not found', p_client_id USING ERRCODE = 'P0002';
  END IF;

  -- 1. Mutation
  UPDATE crm_clients
    SET status = p_to_status, updated_at = now()
    WHERE id = p_client_id;

  -- 2. Activity log
  INSERT INTO crm_client_activities
    (client_id, activity_type, actor_user_id, description, payload)
  VALUES (
    p_client_id,
    'client_status_changed',
    p_actor_user_id,
    format('Client status changed from %s to %s.', v_from_status, p_to_status),
    jsonb_build_object('from', v_from_status, 'to', p_to_status, 'note', p_note)
  );

  RETURN p_client_id;
END;
$$;
```

```ts
// In the TypeScript server action:
const { error } = await admin.rpc("crm_<verb_object>", {
  p_client_id: client.id,
  p_actor_user_id: me.authUserId,
  p_to_status: "visa_submitted",
  p_note: note,
});
if (error) {
  redirectClient(client.id, "error", error.message);
}
```

### Conventions

- **Function naming**: `crm_<verb>_<object>` — e.g. `crm_record_visa_decision`,
  `crm_transition_client_closure`, `crm_record_client_refund`.
- **Parameter prefix**: `p_` for all input parameters. Avoids accidental
  column-name collision inside the function body.
- **Permission checks** stay in the TypeScript caller. RPCs focus on data
  integrity, not policy.
- **Errors**: `RAISE EXCEPTION` with a helpful message. The Supabase
  client surfaces it on `{ error }`.
- **Row locks**: use `SELECT ... FOR UPDATE` on the parent row before
  writing if the action could race with other transitions. Particularly
  important for status changes and auto-bump logic.
- **Return value**: return what the caller needs (usually the affected
  row id, or `void`). Don't over-design.

### Backlog (existing compensation patches → RPC migrations)

Tracked in `CRM_BOARD.md`:

- Phase 2A: `convertLeadToClient`, `recordClientPayment` (A-1, A-2 — no
  compensation yet, urgent-ish)
- Phase 2D: `setMilestoneStatus`, `updateClientStatusWithActivity`,
  `ensureClientMilestonesSeeded` (A-8, A-9, A-10 — compensation in place)

Five RPCs total. Each is ~30 lines of SQL + a 3-line action refactor.
Convert opportunistically when an action is touched for any other reason.

### Phase 2E onwards

Every multi-table action in Phase 2E and beyond is built RPC-first.
Phase 2E's Codex prompt mandates this explicitly.

---

## 15. Pointers

- [STAGE_1_DECISIONS.md](STAGE_1_DECISIONS.md) — what's already locked.
- [REFERENCE_CODE_EXTRACTION_MAP.md](REFERENCE_CODE_EXTRACTION_MAP.md) —
  C-13 (study-abroad lead/application domain fields) is the closest
  reference for Stage 2 vocabulary. Inspiration only — no license to
  copy.
- [CURRENT_STATE.md](CURRENT_STATE.md) — should be updated after each
  Phase 2A/B/C/D/E lands.
- [../hrm/SYSTEM_SETTINGS_MASTER_PLAN.md](../hrm/SYSTEM_SETTINGS_MASTER_PLAN.md) —
  Stage 2's department-permission check is the first real trigger for
  the RBAC migration (Phase D in the settings phases doc).
