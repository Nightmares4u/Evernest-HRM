# Permissions + Hierarchy Plan

> **Status:** Directional plan. Not locked.
> **Created:** 2026-05-21.
> **Parent:** [SYSTEM_SETTINGS_MASTER_PLAN.md](SYSTEM_SETTINGS_MASTER_PLAN.md)
> **Mode:** Vibe-build — the registry below is a starting point, expect drift.

---

## 1. Current state (2026-05-21)

Source of truth: `lib/auth/permissions.ts`.

- `app_users.role` is a single enum column per user:
  `super_admin | admin_hr | branch_manager | assistant_manager | manager | employee | team_member`.
- `ROLE_RANK` numeric ladder drives most "can superior do X to subordinate?"
  questions.
- Branch scoping is enforced ad-hoc inside each predicate
  (`actor.branch_id === target.branch_id`).
- Predicates already in code:
  `canSeeEmployee`, `canManageEmployee`, `canEditEmployee`,
  `canEditSensitiveEmployeeFields`, `canViewPersonalPayrollDetails`,
  `canEditPersonalPayrollDetails`, `canOverrideAttendance`,
  `canAssignTask`, `canApproveLeave`, `requireBranchManagerOrAbove`.
- Routes use `requireTaskAdmin`, `requireRole`, etc. (`lib/auth/require-role.ts`).
- No CRM permission predicates yet — must stay that way until Stage 1 lands.

This works for HRM today. The migration target is to keep this working
while moving the **policy** out of code and into the DB.

---

## 2. Target model — RBAC with scope

### 2.1 Tables (introduced in later phases, see implementation phases doc)

```text
roles
  id           uuid
  key          text unique           -- 'super_admin', 'branch_manager', ...
  display_name text
  description  text
  is_system    boolean               -- true for built-ins that cannot be deleted
  created_at   timestamptz

permissions
  key          text primary key      -- 'attendance.override'
  description  text
  domain       text                  -- 'attendance' | 'tasks' | 'crm' | 'payroll' | 'employees' | 'settings'
  created_at   timestamptz

role_permissions
  role_id      uuid → roles
  permission   text → permissions.key
  scope        text                  -- 'global' | 'branch' | 'team' | 'self'
  primary key  (role_id, permission, scope)

user_roles
  user_id          uuid → app_users
  role_id          uuid → roles
  scope_branch_id  uuid? → branches    -- null = global / role's own default
  scope_team_id    uuid? → teams       -- null = role's own default
  assigned_at      timestamptz
  assigned_by      uuid → app_users
  primary key      (user_id, role_id, scope_branch_id, scope_team_id)
```

The `scope` on `role_permissions` says *how wide the grant is when checked*.
The `scope_*` on `user_roles` says *where the user's grant lives*.

Examples:
- `branch_manager` role × `attendance.override` × scope='branch' →
  branch managers can override attendance for users in branches where
  they hold the role.
- `super_admin` role × `attendance.override` × scope='global' →
  super-admins can override anyone, anywhere.
- `team_member` role × `tasks.request` × scope='global' → anyone can
  request a task from anyone (subject to derived rules).
- `team_member` role × `crm.leads.view` × scope='self' → an agent can
  only see their own leads unless granted wider.

### 2.2 Why scope at both levels

- `role_permissions.scope` answers "what is the maximum reach of this grant?"
- `user_roles.scope_*` answers "where did the admin actually assign it?"
- The resolver intersects them: a grant of `(branch_manager,
  attendance.override, scope=branch)` assigned to Komal with
  `scope_branch_id=Karachi` means "Komal can override attendance for Karachi."

We do not need OPA/Cedar/ABAC. RBAC + scope + a small set of
derived rules covers EN.

---

## 3. Permission key naming

`domain.action[.qualifier]`, lowercase, dot-separated, singular for action.

Reserved domains (Stage 1 set):

- `attendance`
- `leave`
- `tasks`
- `employees`
- `payroll`
- `settings`
- `crm` (sub-namespaces: `crm.leads`, `crm.campaigns`, `crm.whatsapp`, …)
- `org`

Qualifiers we already need:

- `.self` — applies to my own record only (e.g., `attendance.override.self`)
- `.branch` — limited to my branch scope
- `.team` — limited to my team scope
- (no qualifier) — full per the `scope` column on `role_permissions`

We avoid `.all` qualifiers — that's what `scope='global'` is for.

---

## 4. Initial permission registry

This is the starting set. Each is tagged with the predicate in today's
code that it replaces (when applicable). Expect this list to grow during
CRM Stage 1.

### 4.1 Attendance
| Key | Replaces | Notes |
|---|---|---|
| `attendance.check_in` | (implicit) | All active employees. |
| `attendance.check_out` | (implicit) | All active employees. |
| `attendance.view_self` | (implicit) | All active employees. |
| `attendance.view_branch` | branch reads | Managers + admins. |
| `attendance.view_all` | super-admin reads | Global admins. |
| `attendance.override` | `canOverrideAttendance` | Per-branch scope by default. |
| `attendance.approve_review` | super-admin queue | Promote `pending_review` → present/late/etc. |

### 4.2 Leave
| Key | Replaces | Notes |
|---|---|---|
| `leave.request` | implicit | All employees. |
| `leave.approve` | `canApproveLeave` (= `canOverrideAttendance`) | Per-branch. |
| `leave.view_branch` | branch reads | Managers. |
| `leave.view_all` | super-admin | Global. |

### 4.3 Tasks
| Key | Replaces | Notes |
|---|---|---|
| `tasks.create_self` | new (workflow expansion) | All active. |
| `tasks.request` | new (workflow expansion) | All active. |
| `tasks.assign` | `canAssignTask` | Managers + admins. |
| `tasks.approve` | `requireTaskAdmin` approval flow | Per-branch. |
| `tasks.complete_others` | `markTaskDone` admin path | Managers + admins, per-branch. |
| `tasks.view_branch` | branch reads | Managers. |
| `tasks.view_all` | super-admin | Global. |

### 4.4 Employees
| Key | Replaces | Notes |
|---|---|---|
| `employees.view_branch` | `canSeeEmployee` (branch path) | Managers. |
| `employees.view_all` | global admin path | Global admins. |
| `employees.edit` | `canEditEmployee` | Managers, scoped. |
| `employees.edit_sensitive` | `canEditSensitiveEmployeeFields` | super_admin / admin_hr. |
| `employees.view_payroll_self` | implicit | Self only. |
| `employees.view_payroll_others` | `canViewPersonalPayrollDetails` (others) | super_admin only. |
| `employees.create` | `requireBranchManagerOrAbove` | Likely super_admin only initially. |
| `employees.terminate` | super-admin only | Sensitive. |

### 4.5 Payroll
| Key | Replaces | Notes |
|---|---|---|
| `payroll.view_branch` | branch payroll preview | Managers (read-only). |
| `payroll.view_all` | super-admin preview | Global. |
| `payroll.export` | super-admin only | CSV export center. |
| `payroll.run_finalize` | future | Not yet built. |

### 4.6 Settings (control plane self-permissions)
| Key | Notes |
|---|---|
| `settings.view` | Anyone with admin access. |
| `settings.org.manage` | Global super-admin only. |
| `settings.branches.manage` | Global super-admin. |
| `settings.roles.manage` | Global super-admin. |
| `settings.permissions.manage` | Global super-admin. |
| `settings.attendance.manage` | super-admin; branch-scoped overrides editable by branch_manager. |
| `settings.payroll.manage` | super-admin only. |
| `settings.crm.manage` | super-admin + CRM admin (TBD). |

### 4.7 CRM (deferred — populated during CRM Stage 1)
Sketch only. Don't bake into DB yet.

- `crm.leads.view_self`
- `crm.leads.view_team`
- `crm.leads.view_branch`
- `crm.leads.view_all`
- `crm.leads.create`
- `crm.leads.assign`
- `crm.leads.transfer`
- `crm.leads.bulk_import`
- `crm.campaigns.manage`
- `crm.whatsapp.manage`
- `crm.settings.manage`

Refine these once Stage 1 hits real assignment + transfer workflows.

---

## 5. The `can()` resolver — semantics

End-state API:

```ts
can(user: CurrentUser, action: string, resource?: ResourceRef): boolean
```

`ResourceRef` carries the minimum context the resolver needs:

```ts
type ResourceRef =
  | { kind: 'employee'; user_id: string; branch_id: string | null; role: UserRole }
  | { kind: 'task'; assigned_to: string; branch_id: string | null }
  | { kind: 'attendance_record'; employee_user_id: string; branch_id: string | null }
  | { kind: 'lead'; owner_user_id: string | null; branch_id: string | null; team_id: string | null }
  | { kind: 'global' };
```

Resolution order:
1. **Super-admin allow-list** (immutable code-level guard for Sir Raza + Yashal):
   short-circuit `true` for `super_admin` allow-listed identities. This is the
   safety net so a botched permission migration cannot lock the company out.
2. **Active check** on `user`.
3. For each of the user's `user_roles` rows:
   - For each `role_permissions` row matching `action`:
     - Compute effective scope = narrowest of grant scope and resource:
       - `global` → always passes scope.
       - `branch` → user's `scope_branch_id` (or role default) must equal
         `resource.branch_id`.
       - `team` → user must be in resource's team via `team_members`.
       - `self` → `user.id === resource.user_id` (or analogous).
     - If passes, return `true`.
4. **Derived hierarchy rules** (see §6) — checked only if no direct grant
   matched but the action has a hierarchy fall-through (e.g., a reporting
   manager always implicitly holds `leave.approve.self` over their direct
   reports).
5. Otherwise `false`.

Derived rules are intentionally small and explicit. We do not want a
generic ABAC policy engine.

---

## 6. Hierarchy decisions — derived rules

These answer "who can do what to whom" beyond raw RBAC. Each rule is a
documented fall-through in the resolver, not an emergent property.

### 6.1 Who can manage whom
- A user with `employees.edit` scope=branch can manage employees in their
  branch whose `role_rank < actor.role_rank`.
- Reporting manager (`employees.manager_id`) does NOT automatically grant
  `employees.edit` — only attendance/leave/task approval (below).
- Super-admins manage everyone except other super-admins.

### 6.2 Who can override whose attendance
- `attendance.override` grant + scope match (per §5).
- Additional derived rule: a user's direct reporting manager
  (`employees.manager_id` = actor) implicitly holds
  `attendance.override` over that one report — even if the actor's role
  doesn't carry the permission globally. This covers cases where a team
  lead manages 2 people without being a branch_manager.
- Actor cannot override their own attendance (matches today's behavior).

### 6.3 Who can assign tasks to whom
- Authoritative assignment (`tasks.assign`): RBAC + branch scope (today's
  `canAssignTask` logic). Cannot target a higher role.
- Subordinate → superior: NOT an assignment. Must use `tasks.request`
  (workflow_type='request') which gates on acceptance. See HRM task
  workflow expansion plan.
- Self task: `tasks.create_self`, no permission against another user.

### 6.4 Who can approve leave
- Same scope rules as `attendance.override`.
- Reporting manager has implicit approval over direct reports (same
  derived rule as §6.2).

### 6.5 Who can view payroll
- Self: always (`employees.view_payroll_self`).
- Others: requires `employees.view_payroll_others` — super_admin only by
  default.
- Branch payroll preview (rolled-up numbers, no per-person sensitive
  details) requires `payroll.view_branch`.

### 6.6 Who can assign / transfer CRM leads
- Decisions deferred to CRM Stage 1 pilot. Sketch:
  - Assignment within a team: `crm.leads.assign` scope=team.
  - Cross-team transfer: requires `crm.leads.transfer` scope=branch.
  - Cross-branch transfer: requires `crm.leads.transfer` scope=global.
  - All transfers write audit_logs.

### 6.7 Who can see which dashboards
- `/dashboard` (personal): all active users.
- `/admin` (operational overview): anyone with any `*.view_branch` perm
  in their branch sees a branch-scoped version; super_admin sees all.
- `/admin/settings`: requires `settings.view`. Most pages additionally
  gate on their domain-specific `settings.*.manage` permission.

---

## 7. Special cases / guardrails

1. **Super-admin allow-list (immutable).** Maintain a code-level set of
   super-admin user IDs (Sir Raza, Yashal). The resolver short-circuits
   `true` for them on every action. Reason: a botched migration of
   `user_roles` cannot lock the company out. This is a safety belt, not
   a permission model — keep it short.

2. **Inactive users.** `user.is_active=false` → resolver returns `false`
   for every action including read. UI shows a soft-locked state.

3. **Attendance-exempt employees.** `employees.attendance_exempt=true`
   continues to live on the employee row. The resolver does NOT treat
   it as a permission — attendance enforcement code treats it as a
   policy override at write time.

4. **Self-action permissions.** Many "do X to yourself" cases (request
   leave, edit own profile, create self task) are scope='self' grants
   on `team_member` / `employee`. Keep the keys distinct from the
   "do X to others" key — easier to reason about than overloading.

5. **Audit on every grant change.** `roles`, `role_permissions`,
   `user_roles` writes all go to `audit_logs` with old/new values.

6. **Dual-read window during cutover.** While replacing a hardcoded
   predicate, run both the new DB grant check and the old predicate.
   Log mismatches. Promote DB as authoritative only when the mismatch
   rate is zero for a week.

---

## 8. What stays in code (not in DB)

Resist the urge to move everything to the DB.

- The super-admin allow-list (above).
- The set of valid permission *keys* — a registry shipped in code so
  PRs that add keys are reviewable. The DB only stores which roles get
  which keys, not the universe of keys themselves.
- Domain-specific policy logic (e.g., "auto-absent after 6 PM if no
  check-in") — that's business logic, not RBAC.
- Hierarchy fall-through rules (§6) — encoded in the resolver, not
  config rows.

---

## 9. CRM coupling

- CRM does **not** ship its own permission resolver. When CRM Stage 1
  needs an access check, it uses the same `lib/auth/permissions.ts`
  predicates that HRM uses today. Once `can()` exists, CRM switches to
  `can(user, 'crm.*', resource)`.
- CRM Stage 1 should not invent new role names — it uses existing ones
  and proposes new keys (not new roles) when something doesn't fit.
- See [../crm/CRM_SETTINGS_INTEGRATION_NOTES.md](../crm/CRM_SETTINGS_INTEGRATION_NOTES.md).

---

## 10. Open questions

- Does the resolver need a cache? Likely yes (per-request memoization);
  probably not a Redis-level cache for Stage 1 scale.
- Do we expose a "what can I do?" introspection API for the frontend
  so it can hide buttons the user can't click? Probably — but defer
  until the registry is real.
- Do we want time-bound role assignments (e.g., "acting branch manager
  while X is on leave")? Nice to have. Defer.
- Per-employee permission overrides (grant Komal one extra perm) — do
  we need them, or do we always go through a role? Default: roles only,
  add overrides only if a real case appears.

---

## 11. Pointers

- [SYSTEM_SETTINGS_MASTER_PLAN.md](SYSTEM_SETTINGS_MASTER_PLAN.md) — the
  bigger picture.
- [SETTINGS_IMPLEMENTATION_PHASES.md](SETTINGS_IMPLEMENTATION_PHASES.md) —
  the rollout order for everything in this doc.
- `lib/auth/permissions.ts` — current source of truth.
- `lib/auth/require-role.ts` — route guards.
