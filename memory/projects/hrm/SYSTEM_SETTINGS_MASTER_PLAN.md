# System Settings / Org Control Center — Master Plan

> **Status:** Directional plan. Not locked. Captures the shape of the system
> we are growing toward so that CRM Stage 1 and HRM evolutions don't paint us
> into a corner.
>
> **Created:** 2026-05-21.
> **Owner of decisions:** Yashal.
> **Mode:** Vibe-build. Refactor later; don't pre-commit.

---

## 1. Why this document exists

EN HRM currently makes most "who can do what" decisions in code:

- `lib/auth/permissions.ts` hardcodes role ranks and per-action predicates
  (`canAssignTask`, `canOverrideAttendance`, `canEditSensitiveEmployeeFields`,
  etc.).
- Attendance behavior (grace, half-day threshold, shift, IP whitelist, geo
  radius) lives mostly on `branches` and `shifts` rows but is partly assumed
  in code (Asia/Karachi, 26 working days, weekly off = Sunday, etc.).
- Payroll formulas (working-day denominator, deduction rules) are constants
  inside payroll preview / export code.

CRM is being built on `crm-dev` and will need many of the same primitives:
employees, branches, roles, permissions, scope. We do **not** want CRM to
fork its own org/permission system.

We need a single configurable **control plane** that both HRM and CRM read
from. This document plans that plane.

---

## 2. What this plan covers

- Org structure (branch / dept / position / team / membership / reporting)
- Role + permission + scope model (RBAC with branch/team/self scoping)
- Settings registry (attendance, payroll, CRM operational config)
- Admin UI route map
- Migration phases (separate file:
  [SETTINGS_IMPLEMENTATION_PHASES.md](SETTINGS_IMPLEMENTATION_PHASES.md))
- Permission + hierarchy mechanics (separate file:
  [PERMISSIONS_AND_HIERARCHY_PLAN.md](PERMISSIONS_AND_HIERARCHY_PLAN.md))
- CRM touchpoints (separate file:
  [../crm/CRM_SETTINGS_INTEGRATION_NOTES.md](../crm/CRM_SETTINGS_INTEGRATION_NOTES.md))

## 3. What this plan does NOT do

- It does not propose ripping out `permissions.ts` predicates. They keep
  working until the registry is mature.
- It does not propose a generic policy engine (OPA, Cedar, ABAC). RBAC +
  scope + a small set of derived rules will cover EN for years.
- It does not freeze the schema. Names and column shapes will drift as we
  vibe-build CRM and discover real needs.

---

## 4. Org model — target shape

The goal is to express EN's real-world structure without overbuilding.

### 4.1 Core entities (most already exist)

| Entity | Status | Notes |
|---|---|---|
| `branches` | exists | Karachi, Lahore, Remote. Owns IP whitelist + geo. |
| `departments` | exists | Operations, Marketing, B2B Sales, IT/Tech, etc. |
| `shifts` | exists | Named shift presets (start/end, grace, half-day). |
| `employees` | exists | Has `branch_id`, `department_id`, `shift_id`, `manager_id`. |
| `app_users` | exists | Holds `role` enum — what we want to replace with role assignments. |
| `audit_logs` | exists | Already the canonical change log; settings UI should write here too. |

### 4.2 New entities to introduce (later, not now)

| Entity | Purpose |
|---|---|
| `positions` | Job titles (e.g., "Senior Consultant", "Branch Manager", "Lead Marketing"). Decouples job title from the access-control role. |
| `teams` | Working groups inside a branch/dept (e.g., "Karachi B2B IELTS", "Lahore Marketing"). |
| `team_members` | `team_id` × `employee_id` × `is_lead` × `is_active`. |
| `roles` | Named role definitions ("super_admin", "branch_manager", "crm_agent_lead", custom). |
| `role_permissions` | `role_id` × `permission_key` × `scope`. |
| `user_roles` | `user_id` × `role_id` × `scope_branch_id?` × `scope_team_id?`. Replaces the single `app_users.role` column long-term. |
| `org_settings` | Key-value store for global tunables (working-days/month, currency, payroll close day, etc.). |
| `branch_settings` | Per-branch overrides for attendance/payroll knobs. |

### 4.3 Position vs role — keep these separate

- **Position** = HR-facing job title. Shown on employee profiles. Used in
  payroll, salary banding, CRM agent display. No security meaning.
- **Role** = security/access concept. Used by `can(user, action, resource)`.

A "Branch Manager" position usually carries the "branch_manager" role, but
the link is not 1:1: a senior agent can be granted the "lead_view" role
without changing their position, and Aayan can stay "Marketing Manager"
position while holding "team_member" role during onboarding.

### 4.4 Reporting manager

Already partially modeled via `employees.manager_id`. Keep this. The
permission engine reads it for "can my manager override my attendance?"
style derived rules — see hierarchy doc.

---

## 5. Settings categories

The full registry plan lives in
[SETTINGS_IMPLEMENTATION_PHASES.md](SETTINGS_IMPLEMENTATION_PHASES.md).
This is the bird's-eye list:

### 5.1 Attendance settings (per-branch + global default)
- branch timings (start/end), grace period, half-day threshold
- weekly off days (Sun by default; some branches may need Sat-Sun later)
- IP whitelist (already on `branches`)
- geo enforcement on/off, geo radius, branch coordinates (already on `branches`)
- remote work policy: who can be remote, default remote days
- auto-absent cron close time (currently a constant in cron route)
- individual shift overrides (already on `employees` via `custom_shift_*`)

### 5.2 Payroll settings (global + per-branch optional)
- working-days denominator (currently 26 — global default, overrideable)
- holiday handling rule (paid/unpaid, branch-scoped vs global)
- late deduction rule (none today — needs a policy decision)
- half-day deduction rule
- leave allowance accrual (already partially in `leave_balances`)
- payroll close day / export window
- currency, rounding, deduction caps
- commission integration hook (deferred; CRM-driven later)

### 5.3 CRM settings (per-branch or global)
- WhatsApp number ownership (which branch / which agents own a Meta number)
- campaign → source mapping
- lead assignment pool composition (eligible agents, capacity)
- agent product specialization (e.g., IELTS vs immigration)
- branch routing rules
- lead transfer approval policy
- visibility rules (own / team / branch / all)
- CRM-specific role/permission grants

### 5.4 Org settings (global only)
- company display name, logo, timezone (Asia/Karachi default)
- domain config (e.g., `hrm.evernestconsultants.com`)
- email "from" + reply-to defaults
- super-admin allow-list (Sir Raza, Yashal — guardrail even when DB changes)
- maintenance mode toggle

---

## 6. UI plan — admin routes

All under `/admin/settings/*`. Existing `/admin` stays as the operational
dashboard; settings is a separate cluster.

```
/admin/settings                       overview + status + jump menu
/admin/settings/organization          company name, tz, super-admin guards
/admin/settings/branches              CRUD branches + IP/geo + timings
/admin/settings/teams                 CRUD teams + members
/admin/settings/positions             CRUD positions (HR-facing titles)
/admin/settings/roles                 CRUD roles
/admin/settings/permissions           role × permission grid; scope picker
/admin/settings/attendance            global attendance defaults + per-branch overrides
/admin/settings/payroll               working-days, deduction rules, formulas
/admin/settings/crm                   WhatsApp ownership, lead pools, routing
/admin/settings/audit                 read-only audit log filtered to settings changes
```

UX principles:
- Every write goes through `audit_logs` with `target_type='setting'` or
  `'role'` / `'permission'` etc.
- Dangerous changes (role permission grants, super-admin guard edits) show
  a confirm with the diff.
- Default values are visible alongside current values so admins know what
  "factory" looks like.
- Settings forms render even when the DB doesn't yet have a row — fall back
  to seeded defaults.

---

## 7. Architectural principles

1. **Additive first.** Every new table coexists with the hardcoded behavior
   it replaces until cutover.
2. **One source of truth.** When a setting moves from code → DB, the code
   path that *used* to compute it gets deleted, not left as a fallback that
   silently drifts.
3. **Scope-aware lookups.** Settings read API: `getSetting(key, { branch_id })`
   returns the most-specific value: branch override → global default → seeded
   default.
4. **Permissions through one function.** Eventually all checks go through
   `can(user, action, resource)`. Until then, hardcoded predicates stay but
   are tagged with the permission key they will become.
5. **Don't break running HRM.** The system is live. Every phase ships
   independently and is reversible.
6. **CRM reuses, does not fork.** CRM Stage 1 must not introduce a parallel
   roles/branches/agents universe. See CRM integration notes.

---

## 8. Decision — build before or after CRM Stage 1?

**Recommendation: AFTER CRM Stage 1.**

Reasoning:

- CRM Stage 1 is the first real test of "do current roles/branches/scopes
  cover non-HR use cases?". Building the settings system before that test
  means guessing at the permission keys CRM will actually need.
- HRM today functions with hardcoded permissions. It is not on fire.
- The migration is non-trivial (7 phases). Doing it under CRM-launch
  pressure is risky.
- CRM Stage 1 can ship using the existing role enum + branch scoping
  without inventing new primitives.

**What to do now (in parallel with CRM Stage 1):**

- Lock this master plan (this doc) and the two siblings.
- Tag every hardcoded permission predicate in `permissions.ts` with the
  permission key it will become (e.g., `// → attendance.override`).
- Maintain an "Open permission keys" list as CRM Stage 1 reveals real needs.
- When CRM Stage 1 is in pilot, run Phase A→C of the implementation plan.

**What NOT to do now:**

- No `roles` / `permissions` / `user_roles` tables yet.
- No removal of `app_users.role` enum.
- No `can()` resolver in the codebase yet.
- No admin UI for settings yet.

---

## 9. Risks and open questions

### Risks
- **Implicit-knowledge loss.** Many current behaviors (Asia/Karachi clamp,
  Sunday weekly off, 26-day denominator, super-admin = Sir Raza + Yashal,
  Aayan attendance-exempt) live partly in code, partly in commit messages,
  partly in seed data. Document them in `CURRENT_STATE.md` before migrating.
- **Permission gaps during migration.** Going from hardcoded predicates to
  DB grants risks regressions. Plan: dual-read for one release (DB grant
  wins; hardcoded predicate runs as shadow check; mismatches logged).
- **Scope explosion.** Once you add roles + scopes, every new feature
  invents new keys. Mitigate with a published registry and PR review on
  registry adds.
- **CRM contention.** If CRM Stage 1 starts inventing its own role checks
  in `lib/crm/permissions.ts`, the unification gets harder later. Lock
  CRM to existing predicates + branch scope only.

### Open questions (to revisit)
- Do we need custom roles per branch, or are 6–8 global roles enough?
- Are CRM "team leads" a separate role or just a `team_members.is_lead`
  flag the permission engine reads?
- Does Sir Raza ever lose super-admin? (Probably not.) If never, encode
  it as an immutable allow-list — not a DB row that can be deleted.
- Where do per-employee policy overrides live? On `employees`
  (`attendance_exempt`, `remote_allowed`, etc.) — keep, or move to a
  `employee_policies` row store?

---

## 10. Pointers

- [PERMISSIONS_AND_HIERARCHY_PLAN.md](PERMISSIONS_AND_HIERARCHY_PLAN.md) —
  RBAC + scope + permission registry + hierarchy resolution rules.
- [SETTINGS_IMPLEMENTATION_PHASES.md](SETTINGS_IMPLEMENTATION_PHASES.md) —
  Phase A through G with deliverables and exit criteria.
- [../crm/CRM_SETTINGS_INTEGRATION_NOTES.md](../crm/CRM_SETTINGS_INTEGRATION_NOTES.md) —
  How CRM Stage 1 and beyond plug into this control plane.
- [CURRENT_STATE.md](CURRENT_STATE.md) — what HRM actually does today.
- [../crm/CRM_HRM_INTEGRATION.md](../crm/CRM_HRM_INTEGRATION.md) —
  existing CRM↔HRM integration principles (already locked 2026-05-12).
