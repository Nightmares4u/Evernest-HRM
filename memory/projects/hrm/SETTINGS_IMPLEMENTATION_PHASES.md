# Settings + Permissions — Implementation Phases

> **Status:** Directional. Phases are intentionally small and reversible.
> Each phase ships independently and HRM/CRM stay green at every step.
>
> **Created:** 2026-05-21.
> **Parent:** [SYSTEM_SETTINGS_MASTER_PLAN.md](SYSTEM_SETTINGS_MASTER_PLAN.md)
> **Recommended start:** AFTER CRM Stage 1 is in pilot.

---

## Phase 0 — Pre-work (do now, in parallel with CRM Stage 1)

Goal: capture what hardcoded behaviors actually exist so the migration
doesn't accidentally drop them.

### Deliverables
- Update [CURRENT_STATE.md](CURRENT_STATE.md) with a "Hardcoded policy
  inventory" section. Examples to include:
  - Timezone hardcoded to `Asia/Karachi`
  - Weekly off = Sunday
  - Working-days denominator = 26
  - Auto-absent cron close time
  - Super-admin identities (Sir Raza, Yashal)
  - Attendance-exempt list (Sir Raza, Yashal, Aayan)
  - Sufyan remote Mon/Tue, custom shift 13:00–19:00
  - Komal logout 19:00
  - Half-day threshold default (in shifts)
  - Grace period default (in shifts)
  - Geofence radius default
- In `lib/auth/permissions.ts`, add a `// → <permission.key>` comment next
  to each predicate so future grep can find them.
- In `lib/email/`, `app/api/cron/`, `lib/payroll/` — same tagging where
  policy lives in code.
- Add a `memory/projects/hrm/PERMISSION_KEYS.md` (one-page) listing the
  initial registry from
  [PERMISSIONS_AND_HIERARCHY_PLAN.md](PERMISSIONS_AND_HIERARCHY_PLAN.md)
  §4 so it's easy to grow during CRM Stage 1.

### Exit criteria
- Every "magic number" or hardcoded identity in attendance/payroll/email
  paths is either documented or tagged in code.
- No code changes that affect runtime behavior.

### Risk
- Low. This is documentation + comments.

---

## Phase A — Document current hardcoded roles/settings (no code change to behavior)

Goal: lock the snapshot before changing anything.

### Deliverables
- The full hardcoded policy inventory from Phase 0, plus:
  - A list of every route guard and which role(s) pass it.
  - A list of every email template and who triggers it.
  - A list of every cron route and its schedule.
- Snapshot saved as `memory/projects/hrm/HARDCODED_POLICY_SNAPSHOT_2026-05-21.md`
  (or whatever today's date is when this phase runs).

### Exit criteria
- Yashal signs off that the snapshot is complete.

### Risk
- Low. No code or DB change.

---

## Phase B — Add settings tables, keep old logic working

Goal: introduce the storage shape without making it authoritative.

### Deliverables
- Migration adds:
  - `org_settings(key text pk, value jsonb not null, updated_at, updated_by)`
  - `branch_settings(branch_id, key, value jsonb, primary key (branch_id, key), updated_at, updated_by)`
  - (Roles/permissions tables come in Phase D — not here.)
- Seed `org_settings` with the documented defaults from Phase A
  (timezone, working_days_denominator, weekly_off, auto_absent_close_time,
  geofence_radius_default, half_day_threshold_default,
  late_grace_minutes_default, etc.).
- Add `lib/settings/registry.ts` — a typed map of known keys + default
  values + validators.
- Add `lib/settings/read.ts` with:
  - `getOrgSetting<T>(key)` — reads `org_settings`, falls back to registry default.
  - `getBranchSetting<T>(branch_id, key)` — branch override → org default → registry default.
- **Do not call these from runtime yet.** They exist but are dormant.

### Exit criteria
- `npm run build`, `npx tsc --noEmit`, manual `select * from org_settings`
  all green.
- Cron, payroll, attendance behavior unchanged.

### Risk
- Low. Tables are unused by runtime.

---

## Phase C — Read attendance/payroll settings from DB

Goal: cut over the runtime to read from `org_settings` / `branch_settings`
for one domain at a time.

### Deliverables (incremental — one cutover per sub-phase)

**C.1 Attendance defaults**
- Replace hardcoded geofence radius / grace / half-day defaults with
  `getBranchSetting(branch_id, ...)` calls.
- Keep per-branch row columns (`branches.ip_whitelist`, `office_latitude`,
  etc.) — those are clearly per-branch and don't need to live in KV.
- After cutover, delete the constants from code (do not leave fallbacks).

**C.2 Auto-absent + cron close**
- Move `auto_absent_close_time` to `org_settings`.
- Cron route reads from there.

**C.3 Payroll denominator + late deduction**
- Move `working_days_denominator` to `org_settings`.
- Add a `late_deduction_rule` setting (initially `null` = no deduction,
  matching today's behavior).
- Payroll preview and export read from settings.

**C.4 Weekly off**
- Add `weekly_off_days` setting (default `[0]` for Sunday).
- Calendar and payroll logic reads from settings.

### Exit criteria for each sub-phase
- Build / tsc green.
- Manual smoke: attendance check-in flow, payroll preview, payroll export
  CSV all produce identical output to before for the same period.
- No fallback to hardcoded values left in the changed code paths.

### Risk
- Medium. Payroll is sensitive. Run sub-phases serially; verify each on
  a staged Vercel preview before merging.

---

## Phase D — Roles + permissions tables (no behavior change)

Goal: introduce RBAC storage. The resolver does not exist yet.

### Deliverables
- Migration adds:
  - `roles`
  - `permissions`
  - `role_permissions`
  - `user_roles`
  - `teams`, `team_members` (introduced now so CRM team scoping can use them)
  - `positions` (HR-facing titles; safe to add now or later)
- Seed `roles` with the current enum values
  (`super_admin`, `admin_hr`, `branch_manager`, `assistant_manager`,
  `manager`, `employee`, `team_member`).
- Seed `permissions` with the initial registry from
  [PERMISSIONS_AND_HIERARCHY_PLAN.md](PERMISSIONS_AND_HIERARCHY_PLAN.md) §4
  (HRM domains only — no CRM keys yet, unless CRM Stage 1 has revealed them).
- Seed `role_permissions` to mirror today's hardcoded predicates.
- Seed `user_roles` from `app_users.role` (one row per user) plus
  `scope_branch_id` from the user's employee row.
- **Keep `app_users.role`** as a read-only mirror — don't drop it yet.

### Exit criteria
- A query like
  `select user_id, role_key, scope_branch_id from user_roles ...`
  returns sane data for every active user.
- Behavior unchanged.

### Risk
- Medium. Seeding mismatches could leak in. Mitigation: write a
  reconciliation script that diffs `app_users.role` vs `user_roles` and
  fails the migration if they disagree.

---

## Phase E — Introduce `can()` and run it as shadow

Goal: stand up the resolver and prove it matches hardcoded predicates
before relying on it.

### Deliverables
- `lib/auth/can.ts` exporting `can(user, action, resource?)`.
- Each existing predicate (`canAssignTask`, `canOverrideAttendance`, ...)
  gets wrapped so that on each call it:
  - Computes the legacy result (today's logic).
  - Computes `can(user, key, resource)`.
  - Returns the legacy result.
  - Logs a `permission_shadow_mismatch` row when they differ.
- Add `/admin/settings/audit` view (or just a `vercel logs` filter) that
  surfaces mismatches.

### Exit criteria
- Production runs for at least 1 week with zero unexplained mismatches.
- All mismatches that did appear are either: (a) bugs in seed data,
  fixed; or (b) intentional refinements logged as decisions.

### Risk
- Medium. Shadow logs can be noisy. Cap log volume and sample if needed.

---

## Phase F — Cut over to `can()` as authoritative

Goal: make the resolver the source of truth and delete the hardcoded
predicates.

### Deliverables
- Flip each predicate to delegate to `can(...)`.
- Drop the legacy bodies in a follow-up commit once a release is stable.
- Drop `app_users.role` (or keep as a denormalized cache, updated by
  trigger from `user_roles`). Decision deferred to this phase based on
  what the codebase looks like.
- Add a small admin command (CLI or `/admin/settings/permissions/diff`)
  that can re-seed `user_roles` from a previous snapshot if a regression
  appears.

### Exit criteria
- All route guards and permission predicates flow through `can()`.
- Build / tsc green; manual smoke matrix on every role × every key
  feature.
- No `permission_shadow_mismatch` events for 1 week post-cutover.

### Risk
- High if rushed. Mitigation: ship behind a feature flag
  (`SETTINGS_RBAC_AUTHORITATIVE=true`); roll back by flipping the flag.

---

## Phase G — Admin UI for settings + roles

Goal: let Yashal (and eventually delegates) edit roles, permissions, and
settings without engineering changes.

### Deliverables
- `/admin/settings` overview page.
- `/admin/settings/organization` — global org settings (timezone, currency,
  super-admin allow-list as read-only display, etc.).
- `/admin/settings/branches` — branch CRUD + per-branch attendance overrides.
- `/admin/settings/teams` — team CRUD + membership.
- `/admin/settings/positions` — position CRUD.
- `/admin/settings/roles` — role CRUD (system roles read-only).
- `/admin/settings/permissions` — role × permission grid + scope picker.
- `/admin/settings/attendance` — global + per-branch attendance settings.
- `/admin/settings/payroll` — payroll knobs.
- `/admin/settings/crm` — CRM-specific settings (built alongside CRM
  Stage 2/3, not here).
- `/admin/settings/audit` — filtered audit log of settings changes.

Every page writes audit_logs. Destructive actions show a diff confirm.

### Exit criteria
- Yashal can change branch timings, grant a new permission, and adjust
  the working-days denominator without a dev touching the repo.

### Risk
- Medium. Footguns in the permissions grid are the main concern.
  Mitigation: a "preview as user" feature that shows what a user's
  resolved permission set looks like with the staged changes.

---

## Phase H — CRM permission integration (post Stage 1)

Goal: bring CRM into the same control plane.

### Deliverables
- Add the CRM permission keys to the registry and seed defaults onto
  existing roles based on what Stage 1 actually used.
- Replace any temporary CRM permission predicates with `can()` calls.
- Add CRM-specific settings pages under `/admin/settings/crm`
  (WhatsApp ownership, lead pools, assignment rules, transfer policy).

See [../crm/CRM_SETTINGS_INTEGRATION_NOTES.md](../crm/CRM_SETTINGS_INTEGRATION_NOTES.md).

### Exit criteria
- CRM ops (assign / transfer / view) all gated through `can()`.
- CRM settings editable in admin UI.

### Risk
- Medium. Same concerns as Phase F but scoped to CRM.

---

## Rollback strategy (every phase)

- Each phase ships behind a feature flag where possible.
- Each schema migration is additive — no destructive changes until the
  follow-up cleanup commit two releases later.
- `audit_logs` is the breadcrumb trail; settings UI uses it for "undo"
  guidance (manual restore).
- `app_users.role` survives until Phase F is stable so we can fall back.

---

## Time / sequencing

Approximate, not committed:

| Phase | Effort | When |
|---|---|---|
| 0, A | 1–2 days | Now, parallel to CRM Stage 1. |
| B | 2 days | Right after CRM Stage 1 lands in pilot. |
| C | 1 week (sub-phases serial) | After B. |
| D | 3 days | After C is stable for a week. |
| E | 1 week + 1 week shadow | After D. |
| F | 2 days flip + 1 week observe | After E is clean. |
| G | 1–2 weeks | After F. |
| H | TBD by CRM Stage 1 outcomes | After G. |

---

## Decision: build before or after CRM Stage 1?

**After.** Reasons in [SYSTEM_SETTINGS_MASTER_PLAN.md](SYSTEM_SETTINGS_MASTER_PLAN.md) §8.
Phase 0 and Phase A can run in parallel because they're documentation.
