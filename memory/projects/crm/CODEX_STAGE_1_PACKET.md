# CRM Stage 1 — Codex Implementation Packet

Authoritative build spec for CRM Stage 1 inside the EN HRM repo.

Read `STAGE_1_DECISIONS.md` before starting. Any conflict between this
packet and older planning docs resolves in favour of this packet and
`STAGE_1_DECISIONS.md`.

## 0. Ground Rules

- Do **not** touch existing HRM tables, types, routes, RLS, or
  `user_role` enum.
- Do **not** add `lib/ai/` or any LLM client (Gemini deferred).
- Do **not** call WhatsApp send APIs (Stage 1 is read-only).
- Do **not** write rows to `tasks` from CRM code paths.
- Do **not** seed new branches.
- Do **not** hardcode agent IDs.
- Follow the same patterns as existing HRM modules (`employees`,
  `tasks`, `leave`, `admin/tasks`). Mimic file layout, server-action
  style, audit logging, email helpers, and migration numbering.
- App-level branch scoping in `lib/auth/permissions.ts` is the model
  for CRM visibility checks.
- No commits or pushes unless explicitly requested. Plan, then build
  in the order below.

## 1. Repo Context (file pointers)

- `app/(dashboard)/layout.tsx` — sidebar nav. Extend `NAV` and
  `adminNavItems` arrays to surface CRM routes.
- `app/(dashboard)/admin/tasks/` — closest existing pattern for
  CRM admin pages (list + actions + audit log).
- `app/(dashboard)/tasks/actions.ts` — reference server-action style
  (server-only, audit logs via admin client, redirect-on-error,
  email side-effects wrapped with `sendEmailSafely`).
- `lib/auth/current-user.ts` — `getCurrentUser()` shape.
- `lib/auth/permissions.ts` — `actorFromCurrentUser`, role helpers,
  `roleRank`, `canSee*` / `canManage*` style. Extend with CRM
  equivalents (`canSeeLead`, `canAssignLead`).
- `lib/auth/require-role.ts` — role-gate helpers for server actions.
- `lib/supabase/server.ts` — `createClient()` (RLS-bound) and
  `createAdminClient()` (service-role; use for cross-row writes and
  audit logs).
- `lib/types/hrm.ts` — convention for DB-mirroring types.
- `lib/email/send.ts`, `lib/email/templates.ts`,
  `lib/email/recipients.ts` — Resend wrapper + templates +
  `getUserNotificationTarget` helper.
- `lib/cron/auth.ts` — `CRON_SECRET` gate for `/api/cron/*` routes.
- `middleware.ts` — public-paths list. Add `/api/webhooks` next to
  `/api/cron`.
- `vercel.json` — Vercel crons. Add CRM crons here when introduced
  (not required for Stage 1 MVP).
- Existing migrations end at `0008_employee_personal_payroll_details.sql`.
  CRM begins at `0009_crm_init.sql`.

## 2. Module Layout (to create)

```
app/
  (dashboard)/
    crm/
      page.tsx                  # CRM home — counts + quick links
      inbox/
        page.tsx                # Raw inbox list
        [id]/page.tsx           # Raw inbox detail (chat + extracted data + actions)
        actions.ts              # re-parse, mark spam/duplicate, manual promote, manual assign
      leads/
        page.tsx                # Agent / manager lead board
        [id]/page.tsx           # Lead detail + activity timeline + status
        actions.ts              # status changes, notes, reassignment
    admin/
      crm/
        page.tsx                # CRM admin home
        whatsapp-numbers/
          page.tsx
          actions.ts            # CRUD crm_whatsapp_numbers
        assignment-rules/
          page.tsx
          actions.ts            # CRUD crm_assignment_rules
        settings/
          page.tsx
          actions.ts            # tune crm_parser thresholds in `settings`
  api/
    webhooks/
      whatsapp/
        route.ts                # GET verify, POST inbound
lib/
  crm/
    intake.ts                   # ingestWebhookPayload, deduplicate, transition raw status
    parser.ts                   # parseNumberedReply -> { fields, confidence, missing }
    assignment.ts               # evaluateRules, applyAssignment
    promotion.ts                # promoteRawToLead (confidence + mandatory-field gate)
    greeting.ts                 # buildGreeting(template) — pure, returns string
    permissions.ts              # canSeeLead, canManageLead, canAssignLead, scopeLeadsQuery
    audit.ts                    # logCrmAudit(...) thin wrapper around audit_logs
  types/
    crm.ts                      # mirror migration enums + row shapes
```

## 3. Database Migration: `0009_crm_init.sql`

One migration, idempotent on enums via `DO $$ ... EXCEPTION`, RLS enabled
on every table, super-admin policy via existing `is_super_admin()`.

### 3.1 Enums

```
crm_raw_status:
  raw_new | awaiting_details | details_received | needs_review
  | qualified | spam_duplicate | ignored

crm_lead_status:
  new | contacted | document_collection | converted | lost

crm_assignment_method:
  auto_rule | manual | manager_override | review_queue

crm_activity_type:
  raw_message_received | auto_greeting_sent | details_received
  | parser_succeeded | parser_low_confidence | sent_to_review
  | lead_shell_created | assigned | reassigned | status_changed
  | note_added | human_follow_up_started

crm_message_direction:
  inbound | outbound

crm_rule_action:
  assign_to_agent | assign_to_branch | flag_for_manager
```

### 3.2 Tables

`crm_whatsapp_numbers`
- `id uuid pk default gen_random_uuid()`
- `phone_number_id text` (nullable in Stage 1)
- `display_number text not null` (E.164-ish)
- `label text not null`              -- e.g. "Italy Lahore", "Korea", "B2B"
- `product_category text not null`   -- "italy" | "korea" | "b2b" (free text in Stage 1)
- `default_branch_id uuid references branches(id)`
- `greeting_template text`            -- optional override; null = global default
- `is_api_connected boolean not null default false`
- `is_active boolean not null default true`
- `notes text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

`crm_raw_inbox`
- `id uuid pk`
- `whatsapp_number_id uuid references crm_whatsapp_numbers(id)`
- `sender_phone text not null`
- `sender_name text`
- `status crm_raw_status not null default 'raw_new'`
- `parser_confidence numeric(3,2)`
- `extracted_country text`
- `extracted_city text`
- `extracted_qualification text`
- `extracted_marks_cgpa text`
- `extracted_study_gap text`
- `extracted_budget_range text`
- `extracted_english_test text`
- `missing_fields text[] not null default '{}'`
- `lead_id uuid references crm_leads(id)`   -- circular FK; create after crm_leads
- `duplicate_of_inbox_id uuid references crm_raw_inbox(id)`
- `first_message_text text`
- `last_message_text text`
- `last_message_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:
`(sender_phone, whatsapp_number_id)`, `(status, created_at desc)`,
`(whatsapp_number_id, created_at desc)`.

`crm_raw_messages`
- `id uuid pk`
- `inbox_id uuid not null references crm_raw_inbox(id) on delete cascade`
- `direction crm_message_direction not null`
- `wa_message_id text unique`                -- Meta message id (nullable for outbound mock)
- `from_phone text`
- `to_phone text`
- `message_type text not null default 'text'`
- `content text`
- `raw_payload jsonb`
- `sent_by_employee_id uuid references employees(id)`   -- null for inbound or system
- `received_at timestamptz`
- `created_at timestamptz not null default now()`

Index: `(inbox_id, created_at)`.

`crm_leads`
- `id uuid pk`
- `raw_inbox_id uuid references crm_raw_inbox(id)`     -- not unique (manual entry path)
- `assigned_agent_id uuid references employees(id)`
- `branch_id uuid references branches(id)`
- `status crm_lead_status not null default 'new'`
- `customer_phone text not null`
- `customer_name text`
- `interested_country text`
- `city text`
- `last_qualification text`
- `marks_cgpa text`
- `study_gap text`
- `budget_range text`
- `english_test_status text`
- `quality_score numeric(3,2)`                          -- = parser_confidence at promotion
- `source_whatsapp_number_id uuid references crm_whatsapp_numbers(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:
`(assigned_agent_id, status)`, `(branch_id, status)`,
`(customer_phone)`, `(created_at desc)`.

`crm_assignment_rules`
- `id uuid pk`
- `name text not null`
- `priority int not null default 100`         -- lower runs first
- `whatsapp_number_id uuid references crm_whatsapp_numbers(id)`
- `match_city text`
- `match_country text`
- `match_product_category text`
- `action crm_rule_action not null`
- `target_branch_id uuid references branches(id)`
- `target_employee_id uuid references employees(id)`
- `reason_template text`
- `is_active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Index: `(is_active, priority)`.

`crm_lead_assignments`
- `id uuid pk`
- `lead_id uuid not null references crm_leads(id) on delete cascade`
- `from_employee_id uuid references employees(id)`
- `to_employee_id uuid references employees(id)`
- `from_branch_id uuid references branches(id)`
- `to_branch_id uuid references branches(id)`
- `assigned_by uuid references app_users(id)`
- `method crm_assignment_method not null`
- `matched_rule_id uuid references crm_assignment_rules(id)`
- `reason text`
- `created_at timestamptz not null default now()`

Index: `(lead_id, created_at desc)`.

`crm_lead_activities`
- `id uuid pk`
- `lead_id uuid references crm_leads(id) on delete cascade`
- `raw_inbox_id uuid references crm_raw_inbox(id) on delete cascade`
- `activity_type crm_activity_type not null`
- `actor_user_id uuid references app_users(id)`         -- null for system
- `description text`
- `payload jsonb`
- `created_at timestamptz not null default now()`

Index: `(lead_id, created_at desc)`, `(raw_inbox_id, created_at desc)`.

### 3.3 RLS

For every CRM table:

```
ALTER TABLE crm_xxx ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_xxx_super_admin_all ON crm_xxx
  FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());
```

Plus a self-select for agents on `crm_leads` and `crm_lead_activities`:

```
-- agent sees own leads
CREATE POLICY crm_leads_agent_select ON crm_leads
  FOR SELECT TO authenticated
  USING (assigned_agent_id IN (SELECT id FROM employees WHERE user_id = auth.uid()));

-- activity rows tied to a lead the agent owns
CREATE POLICY crm_lead_activities_agent_select ON crm_lead_activities
  FOR SELECT TO authenticated
  USING (lead_id IN (
    SELECT id FROM crm_leads
    WHERE assigned_agent_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  ));
```

All other reads/writes by managers happen via `createAdminClient()`
after passing the `lib/crm/permissions.ts` checks (matches HRM pattern).

### 3.4 Settings seed

```
INSERT INTO settings (key, value) VALUES
  ('crm_parser', '{"auto_promote": 0.80, "needs_review": 0.50}'::jsonb)
  ON CONFLICT (key) DO NOTHING;
```

### 3.5 Audit

Reuse the existing `audit_logs` table. Use `target_type` values:
`crm_raw_inbox`, `crm_lead`, `crm_whatsapp_number`,
`crm_assignment_rule`. Action verbs:
`promote`, `assign`, `reassign`, `status_change`, `mark_spam`,
`create`, `update`, `delete`.

## 4. Types (`lib/types/crm.ts`)

Mirror the migration one-to-one. Follow `lib/types/hrm.ts` conventions
(enum unions, `string | null` for nullable cols, ISO timestamp strings,
`jsonb` typed as `Record<string, unknown>` or specific shape).

## 5. Permissions (`lib/crm/permissions.ts`)

Extend the existing `actorFromCurrentUser` model. Implement:

- `canSeeLead(actor, lead)` — super_admin/admin_hr: all; branch_manager
  / assistant_manager / manager: own branch; agent (employee /
  team_member): only if `lead.assigned_agent_id === actor.employee_id`.
- `canAssignLead(actor, lead)` — manager-or-above within branch, or
  global admin. Agents cannot reassign.
- `canManageWhatsAppNumbers(actor)` — super_admin only in Stage 1.
- `canManageAssignmentRules(actor)` — super_admin only in Stage 1.
- `scopeRawInboxQuery(actor, query)` — applies branch / agent filter
  to a Supabase query builder.
- `scopeLeadsQuery(actor, query)` — same idea for `crm_leads`.

Mirror the role-rank guard pattern from `permissions.ts`. Do not add
roles to the enum.

## 6. Webhook: `app/api/webhooks/whatsapp/route.ts`

- `middleware.ts` — add `/api/webhooks` to `PUBLIC_PATHS` (no Supabase
  session required for Meta callbacks).
- `GET`: Meta verification handshake. Read
  `META_WHATSAPP_VERIFY_TOKEN` from env; echo `hub.challenge` if
  `hub.verify_token` matches; else 403.
- `POST`:
  1. Optional HMAC signature check on `x-hub-signature-256` using
     `META_WHATSAPP_APP_SECRET` (skip if env missing — log a warning).
  2. Always respond `200 OK` quickly. Wrap processing in a
     `Promise.resolve().then(...)` style after the response if
     processing risks blocking; for Stage 1 volumes a synchronous
     write is acceptable.
  3. For each message in the payload:
     - Resolve `crm_whatsapp_numbers` by Meta `phone_number_id` (or
       `display_number` fallback) — if not found, store under a
       synthetic "unmapped" placeholder row and continue.
     - Upsert `crm_raw_inbox` row keyed on
       `(sender_phone, whatsapp_number_id)` — append to existing
       thread if open, else create.
     - Insert `crm_raw_messages` row (idempotent on `wa_message_id`).
     - Log `crm_lead_activities` row `raw_message_received`.
     - Invoke `lib/crm/intake.processInboxRow(inboxId)`.
- Env vars to introduce (document in README; do not commit values):
  `META_WHATSAPP_VERIFY_TOKEN`, `META_WHATSAPP_APP_SECRET`.

## 7. Parser (`lib/crm/parser.ts`)

Pure, deterministic, no I/O, no AI. Inputs: raw reply text. Output:

```
{
  fields: {
    country?: string;
    qualification?: string;
    marksCgpa?: string;
    studyGap?: string;
    city?: string;
    budgetRange?: string;
    englishTest?: string;
  };
  confidence: number;   // 0..1
  missing: string[];    // canonical field keys not extracted
}
```

Heuristics:

- Detect numbered answers (`/^\s*(\d)[\.\)\:]?\s+(.+)$/m`).
- Country: keyword match against a small allowlist
  (italy, korea, uk, canada, australia, germany, usa, ireland, etc.).
- City: keyword match against PK cities (Karachi, Lahore, Islamabad,
  Rawalpindi, Faisalabad, Multan, Peshawar, Hyderabad, Quetta, ...).
- CGPA: regex `(\d(?:\.\d{1,2})?)\s*(?:\/\s*4)?\s*(?:cgpa)?` and
  percentage match.
- Study gap: regex `(\d+)\s*(year|yr|month)`.
- Budget: regex `(\d+(?:\.\d+)?)\s*(lac|lakh|million|crore|pkr|rs)`.
- English test: keywords (`ielts`, `pte`, `toefl`, `no english`,
  `no ielts`).

Confidence calculation:

- 7 canonical fields. Confidence = `extracted / 7` with bonuses for
  numbered-answer structure and a penalty for very short messages
  (< 15 chars). Clamp to `[0, 1]`.

Unit test surface: `lib/crm/parser.test.ts` with the sample reply in
WHATSAPP_STAGE_1_INTAKE.md § 4 plus a handful of malformed inputs.

## 8. Intake processor (`lib/crm/intake.ts`)

- `processInboxRow(inboxId)`:
  1. Load latest inbound message + existing extracted fields.
  2. Run parser.
  3. Merge extracted fields into `crm_raw_inbox` columns.
  4. Read thresholds from `settings.crm_parser`.
  5. Branch on confidence + mandatory fields:
     - `confidence >= auto_promote` **and** `country && city` →
       call `promotion.promoteRawToLead(inboxId)`.
     - `confidence >= needs_review` → status `needs_review`, activity
       `parser_low_confidence` (with confidence in payload),
       email reviewer (Yashal).
     - else → status `awaiting_details`, activity `parser_low_confidence`
       (no email yet — avoid noise).
  6. If sender is duplicate (existing open `crm_leads` for same phone),
     set `duplicate_of_inbox_id` and notify current owner via email.
  7. Always emit `details_received` activity when at least one new
     field was extracted.
- `recordGreetingSent(inboxId)`: writes `auto_greeting_sent` activity.
  Stage 1 — no outbound HTTP. Called once on first `raw_new` row per
  thread.

## 9. Promotion (`lib/crm/promotion.ts`)

- `promoteRawToLead(inboxId)`:
  1. Load raw inbox row.
  2. Enforce mandatory: `country && city`. If missing, throw — caller
     should not have reached promotion.
  3. Insert `crm_leads` row (status `new`, `quality_score =
     parser_confidence`, copy domain fields).
  4. Update raw inbox: `status = 'qualified'`, `lead_id = leadId`.
  5. Activity `lead_shell_created`.
  6. Call `assignment.assignLead(leadId)`.
- `manualPromote(inboxId, overrides)` — admin / manager force-promote
  from the inbox UI. Same path, but allow caller to supply missing
  fields.

## 10. Assignment (`lib/crm/assignment.ts`)

- `evaluateRules(context)` — load `crm_assignment_rules` ordered by
  `priority asc, created_at asc`, filter by `is_active`, find first
  match against `{ whatsapp_number_id, country, city, product_category }`.
- `assignLead(leadId, options?)`:
  1. Load lead.
  2. If `options.targetEmployeeId` (manual / manager override): use it.
  3. Else run `evaluateRules`. If no match → leave
     `assigned_agent_id = null`, set `branch_id = null` (review queue),
     method `review_queue`, email Yashal.
  4. Else apply rule: set branch + agent based on rule action.
  5. Insert `crm_lead_assignments` row.
  6. Activity `assigned` (or `reassigned`).
  7. Email the assignee (Resend) using a new
     `leadAssignedEmail(...)` template — mirror `taskAssignedEmail`.
- `reassign(leadId, toEmployeeId, reason)` — admin / manager path.
  Audit-logged.

## 11. UI Surfaces (Stage 1)

Functional and minimal. No drag-and-drop. Tailwind + existing component
patterns. No new component library.

### `/crm` (home)
Cards: raw inbox counts by status, my open leads, overdue follow-ups
(stub for Stage 1 — just lead `updated_at` older than N days).

### `/crm/inbox`
Filterable table by status / WhatsApp number / date. Row click → detail.

### `/crm/inbox/[id]`
- Left: message thread (chronological `crm_raw_messages`).
- Right: extracted fields, confidence, missing list.
- Actions (gated by `canManageInbox` = manager-or-above):
  re-parse, mark spam/duplicate, edit fields, manual promote,
  manual assign.

### `/crm/leads`
Two views toggled by user role:
- Agent: my leads grouped by status.
- Manager / admin: branch leads, with assignee column.
Columns: name, phone, country, city, status, assignee, age.

### `/crm/leads/[id]`
Header: name, phone, status dropdown, assignee.
Tabs: Details (extracted fields), Activity (timeline from
`crm_lead_activities` + `crm_lead_assignments`), Source (linked
raw inbox + WhatsApp number).
Actions: change status (with note), add internal note, reassign
(if manager).

### `/admin/crm/whatsapp-numbers`
List + create/edit form. Required: `display_number`, `label`,
`product_category`. Optional: `phone_number_id`, `default_branch_id`,
`greeting_template`, `is_api_connected`. Audit every change.

### `/admin/crm/assignment-rules`
List ordered by priority. Create/edit form with match fields
(WhatsApp number, country, city, product_category) and action
(branch + agent). Test-rule UI is out of Stage 1.

### `/admin/crm/settings`
Single form to edit `settings.crm_parser` thresholds. Validates
`0 <= needs_review < auto_promote <= 1`. Audit-logged.

## 12. Sidebar Nav (`app/(dashboard)/layout.tsx`)

Extend the existing `NAV` array (visible to everyone authenticated
who has the right role; gate visibility in the layout):

- `{ href: "/crm", label: "CRM" }`
- `{ href: "/crm/inbox", label: "CRM Inbox" }` — managers + admins
- `{ href: "/crm/leads", label: "Leads" }`

Extend `adminNavItems` for super_admin:

- `{ href: "/admin/crm/whatsapp-numbers", label: "CRM: WhatsApp Numbers" }`
- `{ href: "/admin/crm/assignment-rules", label: "CRM: Assignment Rules" }`
- `{ href: "/admin/crm/settings", label: "CRM: Settings" }`

Do not remove or reorder existing HRM nav.

## 13. Email Templates (`lib/email/templates.ts` additions)

- `leadAssignedEmail({ assigneeName, leadName, leadPhone, country, city, leadUrl })`
- `leadReviewQueueEmail({ reviewerName, count, reviewUrl })`
- `duplicateLeadEmail({ ownerName, leadName, leadPhone, leadUrl })`

Wire via `sendEmail` / `sendEmailSafely` from server actions, never
from React components. Skip silently if `RESEND_API_KEY` is missing.

## 14. Environment Variables (new)

Document in README; do not commit values:

- `META_WHATSAPP_VERIFY_TOKEN` — required for webhook GET handshake.
- `META_WHATSAPP_APP_SECRET` — optional in Stage 1 (skip signature
  check with a warning if missing).
- `CRM_INBOX_REVIEWER_EMAIL` — optional override; defaults to all
  active `super_admin` users via `getUserNotificationTarget`.

## 15. Implementation Order (build sequence)

1. Migration `0009_crm_init.sql` — enums, tables, indexes, RLS,
   settings seed. Apply via `supabase migration up` locally.
2. `lib/types/crm.ts` — mirror schema.
3. `lib/crm/permissions.ts` — see/manage/assign helpers + query
   scoping. Unit test the role matrix.
4. `lib/crm/parser.ts` + tests.
5. `lib/crm/audit.ts`, `lib/crm/greeting.ts`.
6. `lib/crm/promotion.ts`, `lib/crm/assignment.ts`,
   `lib/crm/intake.ts`.
7. Admin: `app/(dashboard)/admin/crm/whatsapp-numbers/` (CRUD +
   audit). End-to-end smoke test by seeding 3 rows: Italy, Korea, B2B.
8. Admin: `app/(dashboard)/admin/crm/assignment-rules/` (CRUD +
   audit). Smoke test with 2–3 rules.
9. Admin: `app/(dashboard)/admin/crm/settings/`.
10. Webhook: `app/api/webhooks/whatsapp/route.ts`. Add
    `/api/webhooks` to `middleware.ts` public paths. Test with a
    posted fixture payload (no real Meta yet).
11. CRM Inbox UI: `/crm/inbox` list + `[id]` detail + actions.
12. CRM Leads UI: `/crm/leads` list + `[id]` detail + actions.
13. `/crm` home dashboard.
14. Nav wiring in `app/(dashboard)/layout.tsx`.
15. Email templates + assignment notification path.
16. End-to-end manual test: POST a fixture webhook payload → row
    appears in `/crm/inbox` → parser runs → if confidence high and
    country+city present, lead is created and assigned → assignee
    sees it in `/crm/leads`.

## 16. Acceptance Criteria

- [ ] Posting a valid Meta-style webhook payload creates exactly one
      `crm_raw_inbox` row and one `crm_raw_messages` row; reposting
      the same `wa_message_id` is a no-op (idempotent).
- [ ] Parser returns the correct fields and confidence for the
      sample reply in `WHATSAPP_STAGE_1_INTAKE.md` § 4.
- [ ] Reply with confidence ≥ 0.80, country + city present →
      `crm_leads` row created with status `new` and assignment runs.
- [ ] Reply with confidence 0.50–0.79 → raw inbox status
      `needs_review`, reviewer email queued (or logged), no lead row.
- [ ] Reply with confidence < 0.50 → raw inbox status
      `awaiting_details`, no email, no lead row.
- [ ] If `country` or `city` missing, no auto-promote regardless of
      confidence.
- [ ] Assignment rule with `match_city = Lahore` routes a
      Lahore-Italy lead to a Lahore agent; unmatched lead lands in
      the review queue with `method = review_queue`.
- [ ] Agent (role `employee` / `team_member`) sees only own leads in
      `/crm/leads`; branch manager sees branch leads; super_admin
      sees all.
- [ ] Manager reassigns a lead → `crm_lead_assignments` row written,
      activity `reassigned` logged, new assignee receives email,
      audit log row written.
- [ ] No HRM tables, types, RLS, or routes were modified.
- [ ] No CRM code path inserts into `tasks`.
- [ ] No outbound WhatsApp HTTP calls are made.
- [ ] No new role appears in `user_role` enum.

## 17. Out of Stage 1 (do not build)

- Real WhatsApp send (Cloud API / BSP)
- Gemini or any AI fallback
- Client portal, invoices, payments, documents, cases
- HRM task sync (`origin='crm'`)
- Meta spend / campaign import
- Per-number greeting variants UI (data column exists but no UI)
- Drag-and-drop kanban
- Bulk CSV lead import
- Commission rules, payroll integration
- Branch-level DB RLS

## 18. Open Items (deferred, not blocking)

- Actual Meta `phone_number_id` values for Italy, Korea, B2B.
- Real WhatsApp send adapter choice (Cloud API direct vs BSP).
- Per-product greeting variants.
- Follow-up reminder cron (`crm_follow_ups` table + cron in
  `app/api/cron/crm-followup-reminders/`).
- HRM task sync once Stage 1 is validated.
