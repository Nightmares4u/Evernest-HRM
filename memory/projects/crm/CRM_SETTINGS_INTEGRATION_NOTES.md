# CRM ↔ Settings / Control Center — Integration Notes

> **Status:** Directional. Not locked.
> **Created:** 2026-05-21.
> **Parent docs:**
> - [../hrm/SYSTEM_SETTINGS_MASTER_PLAN.md](../hrm/SYSTEM_SETTINGS_MASTER_PLAN.md)
> - [../hrm/PERMISSIONS_AND_HIERARCHY_PLAN.md](../hrm/PERMISSIONS_AND_HIERARCHY_PLAN.md)
> - [../hrm/SETTINGS_IMPLEMENTATION_PHASES.md](../hrm/SETTINGS_IMPLEMENTATION_PHASES.md)
> - [CRM_HRM_INTEGRATION.md](CRM_HRM_INTEGRATION.md) (locked 2026-05-12)
> - [STAGE_1_DECISIONS.md](STAGE_1_DECISIONS.md)

---

## 1. Headline rule for CRM Stage 1

**CRM does not fork the org / role / permission system.**

Stage 1 reuses:
- `branches`, `departments`, `employees`, `app_users`
- `lib/auth/permissions.ts` predicates (unchanged from HRM)
- the existing `user_role` enum
  (`super_admin | admin_hr | branch_manager | assistant_manager | manager | employee | team_member`)

Stage 1 does NOT introduce:
- a new role enum or new "agent" role
- a CRM-specific permissions library
- a parallel branches/teams universe
- a CRM `lib/crm/permissions.ts` with its own predicates

If Stage 1 hits a permission check the existing predicates don't cover,
the answer is **add a feature flag or a temporary route guard**, log the
need in this file's §6 (Open permission needs), and revisit during
Phase D/E of the settings rollout.

---

## 2. What CRM Stage 1 may add (allowed)

These don't conflict with the unification plan:

- **`crm_agent_profiles`** — CRM-specific overlay on an employee:
  product specialization, lead capacity, active CRM flag, branch
  routing eligibility, commission profile (later). References
  `employees.id`. Not a role table.
- **CRM-domain tables** — leads, lead_activities, campaigns, etc.
  per the Stage 1 packet.
- **Stage 1 scope check helpers** that internally call HRM predicates
  but expose CRM-named functions (e.g.,
  `canViewLead(actor, lead)` that internally checks branch +
  `actor.role`). These are wrappers, not a new policy engine.

---

## 3. What CRM Stage 1 should defer (not allowed in Stage 1)

- A `crm_roles` or `crm_role_permissions` table.
- A `lib/crm/permissions.ts` with its own role rank or scope logic.
- New role names (`agent`, `b2b_staff`, `marketing`, `finance`, `client`)
  — already excluded by [CRM_HRM_INTEGRATION.md](CRM_HRM_INTEGRATION.md).
- CRM-specific settings tables. CRM Stage 1 may hardcode operational
  config (Meta WhatsApp number ownership, assignment pool defaults) in
  code or seed rows; these migrate to `org_settings` /
  `crm_settings` in Phase H.
- CRM HRM-task creation (`origin='crm'` task rows) — deferred per
  Stage 1 decision.

---

## 4. Settings keys CRM will eventually need (Phase H sketch)

Captured here so we don't lose them. Do NOT seed these now.

### 4.1 Org / global
- `crm.default_assignment_strategy` — round_robin / capacity / manual
- `crm.lead_visibility_default` — self / team / branch
- `crm.transfer_requires_approval` — boolean
- `crm.duplicate_detection_window_days` — integer
- `crm.activity_retention_months` — integer

### 4.2 Branch-scoped
- `crm.assignment_pool` (per branch) — list of employee IDs eligible
  for auto-assignment
- `crm.whatsapp_owner_branch` (or in a dedicated table — see §5)
- `crm.product_specialization_required` — boolean

### 4.3 Team-scoped
- `crm.team_lead_can_reassign` — boolean
- `crm.team_capacity_cap` — integer

### 4.4 Per-agent overrides (likely on `crm_agent_profiles`, not in KV)
- `daily_lead_capacity`, `active`, `eligible_products`, `priority`

---

## 5. CRM-only entities likely needed eventually

These are CRM domain, but ride on the unified control plane.

- **`crm_whatsapp_numbers`** — Meta number registry, with `branch_id`
  ownership and active flag. Settings UI under `/admin/settings/crm`.
- **`crm_assignment_rules`** — declarative rules
  (campaign / source / product → pool / agent strategy). Phase H.
- **`crm_transfer_approvals`** — workflow rows for transfers that
  cross teams/branches. Reuses the `tasks`-style approval pattern.

These are settings/operational tables, not role tables. They store
*configuration*, not *who can do what*.

---

## 6. CRM permission keys — running list

Populated as Stage 1 hits real needs. Do not seed into `permissions`
until Phase D.

| Key | Stage discovered | Notes |
|---|---|---|
| `crm.leads.view_self` | (TBD) | Agent sees own leads. |
| `crm.leads.view_team` | (TBD) | Team lead sees team. |
| `crm.leads.view_branch` | (TBD) | Branch manager sees branch. |
| `crm.leads.view_all` | (TBD) | Global admin. |
| `crm.leads.create` | (TBD) | Most users; intake may be system-only initially. |
| `crm.leads.assign` | (TBD) | Team lead / branch manager. |
| `crm.leads.transfer` | (TBD) | Branch manager / admin; cross-branch requires global. |
| `crm.leads.bulk_import` | (TBD) | Admin only initially. |
| `crm.campaigns.manage` | (TBD) | Marketing lead / admin. |
| `crm.whatsapp.manage` | (TBD) | Admin only. |
| `crm.settings.manage` | (TBD) | Super-admin. |

Update this table as Stage 1 features land. If a feature can't be
expressed in existing predicates, add the key here and use a
temporary hardcoded guard until Phase D.

---

## 7. Hierarchy edges specific to CRM

These are the derived rules CRM will need from the resolver (see
[PERMISSIONS_AND_HIERARCHY_PLAN.md](../hrm/PERMISSIONS_AND_HIERARCHY_PLAN.md) §6.6):

- A user with `crm.leads.assign` scope=team can assign leads to
  members of that team.
- A user with `crm.leads.transfer` scope=branch can move a lead
  between teams within their branch.
- Cross-branch transfer requires `crm.leads.transfer` scope=global.
- An agent who owns a lead can edit it (`crm.leads.edit.self`).
- A team lead can edit any lead in their team
  (`crm.leads.edit.team`).
- Reassignment of a lead writes audit_logs with previous owner,
  new owner, and reason.

These can be implemented inside CRM Stage 1 as hardcoded checks,
provided each check is tagged with the future permission key.

---

## 8. Audit + observability

- All CRM lead transfers, bulk imports, and assignment changes must
  go through `audit_logs`. The settings UI in Phase G surfaces these.
- CRM settings changes (Phase H) go through `audit_logs` with
  `target_type` prefix `crm_setting`.

---

## 9. Migration coupling

| Settings Phase | What CRM should do |
|---|---|
| Phase 0 / A | Inventory CRM hardcoded checks (mirror HRM exercise). |
| Phase B | No CRM impact. |
| Phase C | No CRM impact (HRM-only domains). |
| Phase D | Add CRM permission keys discovered in Stage 1 to registry. Seed onto existing roles (read-only matrix at first). |
| Phase E | CRM predicates run in shadow mode. Compare with hardcoded CRM guards. |
| Phase F | CRM cuts over to `can()`. |
| Phase G | `/admin/settings/crm` page added to admin UI. |
| Phase H | CRM-specific settings tables and editing UI go live. |

---

## 10. Open questions for CRM Stage 1 pilot

- Do CRM teams need to be a first-class entity from day one, or can
  Stage 1 treat "team" as `department` for simplicity? Decision: use
  department for Stage 1; promote to dedicated `teams` table in
  Phase D when introduced for HRM.
- Are CRM "agent leads" their own role, or just `team_members.is_lead=true`
  read by the resolver? Default: the flag. Add a role only if needed.
- Does a transfer need approval by the receiving team lead, or only by
  the source-branch manager? Stage 1: pick one and document it in
  `STAGE_1_DECISIONS.md`; revisit in Phase H.
- Lead visibility default: should new agents see their team's leads by
  default or only their own? Default: own only; promote to team in
  settings later.

---

## 11. Action items right now

For the duration of CRM Stage 1:

1. Do not add CRM permission predicates outside the HRM-shared
   `lib/auth/permissions.ts`.
2. Every time Stage 1 needs an access check the HRM predicates don't
   express, append a row to §6 above with the proposed key.
3. Every CRM operational config that lives as a constant in code gets
   a `// → crm.settings.<key>` comment so Phase H finds it.
4. CRM agent identity stays as `employees.id`; never invent a parallel
   identity.

That's it. Build CRM Stage 1; the settings unification follows.
