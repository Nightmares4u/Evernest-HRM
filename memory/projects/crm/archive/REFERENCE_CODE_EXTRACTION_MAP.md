# Reference Code Extraction Map

## 1. Purpose

This map identifies concrete code and pattern candidates from the local CRM reference repos that can be copied with attribution, manually adapted, or used only as implementation inspiration for EN CRM.

The current EN CRM source of truth remains the EN HRM repo on `crm-dev`. EN CRM is WhatsApp-first: raw intake is separate from leads, receiving EN WhatsApp number ownership drives primary assignment, campaigns inherit ownership through their parent WhatsApp number, parser output supports extraction/tracking, assignment rules are fallback only, and transfer/handoff workflows are already built.

This document is intentionally conservative about licensing. Public repo visibility is not enough to copy code.

## 2. License Verification Summary

- Repo name: `atomic-crm`
- Path: `$HOME/Desktop/evernest-crm-starter/crm-repo-audit/atomic-crm`
- License file found? Yes, `LICENSE.md`
- License type: MIT. `README.md` also states MIT. Root `package.json` has no license field.
- Direct code copying allowed? Yes, with MIT attribution and dependency review.
- Notes / caveats: Much of the UI depends on React Admin, `ra-core`, local admin components, and its own data provider conventions. Most candidates should be manually adapted instead of pasted wholesale.

- Repo name: `crm` / Frappe CRM
- Path: `$HOME/Desktop/evernest-crm-starter/crm-repo-audit/crm`
- License file found? Yes, `LICENSE`
- License type: GNU AGPL v3 in `LICENSE`; root `package.json` says `GPL-3.0`.
- Direct code copying allowed? No for EN HRM purposes.
- Notes / caveats: Use as UX/product inspiration only. Do not copy Vue components, stores, API code, or assets into EN HRM.

- Repo name: `laravel-crm` / Krayin
- Path: `$HOME/Desktop/evernest-crm-starter/crm-repo-audit/laravel-crm`
- License file found? Yes, `LICENSE`
- License type: MIT. `composer.json` also says MIT. Root `package.json` has no license field.
- Direct code copying allowed? Yes, with MIT attribution, but usually not useful because the source is Laravel/PHP/Blade/Vue.
- Notes / caveats: Best value is pipeline, activity, dashboard, and saved-filter structure. Rewrite into EN HRM TypeScript/Next.js patterns.

- Repo name: `Study-Abroad-and-Education-Consultant-CRM`
- Path: `$HOME/Desktop/evernest-crm-starter/crm-repo-audit/Study-Abroad-and-Education-Consultant-CRM`
- License file found? No repo-level license file found.
- License type: Not verified at repo level. Backend `composer.json` says MIT because it is based on `laravel/laravel`; README has a license table-of-contents entry but no actual license section was found.
- Direct code copying allowed? No, not safely verified.
- Notes / caveats: Treat as domain/workflow inspiration only. Public availability and the Laravel skeleton license do not grant permission to copy this project code.

## 3. High-Value Copy/Adapt Candidates

### Candidate ID
C-01 Activity timeline iterator

### Source repo
`atomic-crm`

### Source file path
`src/components/atomic-crm/activity/ActivityLog.tsx`, `ActivityLogIterator.tsx`, `ActivityLogNote.tsx`, activity-specific renderer files

### License classification
MIT

### What it does
Provides a structured activity feed with loading skeletons, retry state, event-specific renderers, separators, and desktop/mobile pagination behavior.

### Copy strategy
Adapt manually

### Why it is useful for EN CRM
EN CRM already records timeline events for parsing, assignment, source-owner fallback, and transfers. The renderer-dispatch pattern maps well to `crm_lead_activities.activity_type`.

### Target EN HRM file/path
`app/(dashboard)/crm/leads/[id]/page.tsx`, plus a future `components/crm/activity-timeline.tsx`

### Required changes to fit EN HRM
Replace React Admin list context with Supabase server-component data. Map renderers to EN activity types such as `transfer_requested`, `transfer_accepted`, `followup_scheduled`, and `followup_completed`.

### Risks/dependencies
Direct copy would pull in `ra-core` and Atomic CRM context providers. Manual rewrite avoids dependency churn.

### Recommended Codex task
Create an EN-native lead activity timeline component with typed renderers and compact empty/loading states.

### Candidate ID
C-02 Lead notes composer and inputs

### Source repo
`atomic-crm`

### Source file path
`src/components/atomic-crm/notes/NoteCreate.tsx`, `NoteInputs.tsx`, `NoteInputsMobile.tsx`, `NotesIterator.tsx`, `Note.tsx`

### License classification
MIT

### What it does
Implements a note composer with expandable input behavior, validation, optional status/date fields, attachments, save/cancel states, and a notes list.

### Copy strategy
Adapt manually

### Why it is useful for EN CRM
Lead notes are the next natural layer after transfer and follow-up activity. The interaction shape is useful: quick note first, more fields only when needed.

### Target EN HRM file/path
Future `app/(dashboard)/crm/leads/[id]/notes-actions.ts`, `components/crm/lead-notes.tsx`

### Required changes to fit EN HRM
Remove React Admin mutation hooks and attachment assumptions. Save to EN CRM activity rows or a future notes table, depending on the next schema decision.

### Risks/dependencies
Atomic CRM notes are tied to its resource abstraction and attachment model. Do not import those dependencies.

### Recommended Codex task
Build a simple lead notes server action and inline lead-detail notes panel using the Atomic UX pattern only.

### Candidate ID
C-03 Status chip and status selector pattern

### Source repo
`atomic-crm`

### Source file path
`src/components/atomic-crm/misc/Status.tsx`, `src/components/atomic-crm/notes/StatusSelector.tsx`

### License classification
MIT

### What it does
Shows compact visual status indicators and a status-selection control that can be embedded in note/status-change flows.

### Copy strategy
Adapt manually

### Why it is useful for EN CRM
EN CRM lead statuses need clearer transitions, especially `new`, `assigned`, `follow_up`, converted/lost-style outcomes, and transfer states.

### Target EN HRM file/path
Future `components/crm/status-chip.tsx`, `components/crm/lead-status-form.tsx`

### Required changes to fit EN HRM
Use EN status enums and existing app styling. Keep chips text-first enough for accessibility; avoid color-only status.

### Risks/dependencies
Atomic status values and theme tokens do not match EN HRM.

### Recommended Codex task
Create a reusable CRM status chip and a lead status transition form that writes `status_changed` activity.

### Candidate ID
C-04 Lead board / Kanban column and card pattern

### Source repo
`atomic-crm`

### Source file path
`src/components/atomic-crm/deals/DealColumn.tsx`, `DealCard.tsx`

### License classification
MIT

### What it does
Implements draggable pipeline columns with compact cards, record context, stage totals, and per-card metadata.

### Copy strategy
Adapt manually

### Why it is useful for EN CRM
Useful for a future lead pipeline view or due/overdue follow-up board, but EN CRM should board leads by CRM status/follow-up state rather than Atomic deal stages.

### Target EN HRM file/path
Future `app/(dashboard)/crm/leads/board/page.tsx` or `components/crm/lead-board.tsx`

### Required changes to fit EN HRM
Use EN lead fields: lead/customer phone, country, city, assigned counselor, source WhatsApp number, follow-up due state. Avoid deal value/sales assumptions.

### Risks/dependencies
Depends on drag-and-drop and React Admin context. Dragging status changes should not be added until server-side status transitions are explicit.

### Recommended Codex task
Build a read-only follow-up board first; add drag transitions only after status transition actions exist.

### Candidate ID
C-05 Dashboard activity and KPI layout

### Source repo
`atomic-crm`

### Source file path
`src/components/atomic-crm/dashboard/Dashboard.tsx`, `DashboardActivityLog.tsx`, `DashboardTasks.tsx`, `DealChart.tsx`

### License classification
MIT

### What it does
Combines KPI/dashboard cards, recent activity, task-like panels, charts, and empty onboarding states.

### Copy strategy
Adapt manually

### Why it is useful for EN CRM
EN CRM needs admin/counselor dashboards for new leads, assigned leads, pending transfers, follow-ups due today, overdue follow-ups, and unassigned/review-needed items.

### Target EN HRM file/path
Future `app/(dashboard)/crm/page.tsx` or CRM dashboard components

### Required changes to fit EN HRM
Replace deal/sales metrics with WhatsApp-intake and counselor workflow metrics.

### Risks/dependencies
Atomic dashboard is product-general CRM; direct content would dilute EN's study-abroad workflow.

### Recommended Codex task
Create CRM dashboard KPI cards backed by EN Supabase queries.

### Candidate ID
C-06 Filter and table control patterns

### Source repo
`atomic-crm`

### Source file path
`src/components/atomic-crm/misc/ResponsiveFilters.tsx`, `ActiveFilterButton.tsx`, `components/admin/filter-form.tsx`, `components/admin/data-table.tsx`, `src/components/atomic-crm/simple-list/*`

### License classification
MIT

### What it does
Provides responsive filter controls, active-filter buttons, data-table patterns, and simple-list empty/loading states.

### Copy strategy
Adapt manually

### Why it is useful for EN CRM
Lead list, raw inbox, transfer monitor, and future follow-up pages all need consistent filters without clutter.

### Target EN HRM file/path
Existing `/crm/leads`, `/crm/inbox`, `/crm/transfers`, `/admin/crm/transfers`; future `components/crm/filter-bar.tsx`

### Required changes to fit EN HRM
Use URL search params and server components consistent with current EN pages. Keep filters focused on status, assigned counselor, source number, campaign, country, city, branch, and follow-up due state.

### Risks/dependencies
Atomic filtering is tied to React Admin query semantics.

### Recommended Codex task
Extract a small EN CRM filter-bar component shared by lead list and transfer/admin views.

### Candidate ID
C-07 Supabase RLS policy organization

### Source repo
`atomic-crm`

### Source file path
`supabase/schemas/02_functions.sql`, `supabase/schemas/05_policies.sql`, `supabase/migrations/20260314120000_activity_log_view.sql`

### License classification
MIT

### What it does
Groups helper functions and table RLS policies into readable schema files. Includes simple authenticated policies and admin-gated configuration writes.

### Copy strategy
Adapt manually

### Why it is useful for EN CRM
EN CRM will need stronger RLS for branch/counselor scoping as raw intake, lead assignment, transfers, and follow-ups grow.

### Target EN HRM file/path
Future Supabase migrations under `supabase/migrations/`

### Required changes to fit EN HRM
Use EN helpers such as `public.is_super_admin()` and the existing employees-to-auth-user pattern. EN must not adopt broad `using (true)` policies for sensitive CRM records.

### Risks/dependencies
Atomic policies are permissive for a starter CRM. Copying them would weaken EN CRM security.

### Recommended Codex task
Draft EN-specific RLS hardening migration for CRM leads, transfers, assignments, and inbox tables after app-level permissions stabilize.

### Candidate ID
C-08 Frappe CRM lead detail and activity UX

### Source repo
`crm` / Frappe CRM

### Source file path
`frontend/src/pages/Lead.vue`, `frontend/src/pages/MobileLead.vue`, `frontend/src/components/Activities/ActivityHeader.vue`, `frontend/src/components/Activities/NoteArea.vue`

### License classification
AGPL v3 / GPL-3.0

### What it does
Shows mature lead-detail and activity-entry UX, including mobile-aware layouts and note/activity composition.

### Copy strategy
Inspiration only

### Why it is useful for EN CRM
Good reference for page density, mobile behavior, and lead detail information architecture.

### Target EN HRM file/path
`app/(dashboard)/crm/leads/[id]/page.tsx`, future CRM detail components

### Required changes to fit EN HRM
Manually design equivalent patterns in React/Next.js using EN fields and EN permissions. Do not copy Vue code or wording wholesale.

### Risks/dependencies
Copyleft license is incompatible with casual code copying into EN HRM.

### Recommended Codex task
Use screenshots/manual inspection only to redesign EN lead detail sections: profile, source, assignment, transfer, activity, notes, follow-up.

### Candidate ID
C-09 Frappe CRM Kanban/list/filter UX

### Source repo
`crm` / Frappe CRM

### Source file path
`frontend/src/components/Kanban/KanbanView.vue`, `frontend/src/components/ListViews/LeadsListView.vue`, `frontend/src/components/Filter.vue`, `frontend/src/components/QuickFilterField.vue`

### License classification
AGPL v3 / GPL-3.0

### What it does
Provides polished Kanban columns, list views, quick filters, and column configuration concepts.

### Copy strategy
Inspiration only

### Why it is useful for EN CRM
Useful for future lead board, follow-up board, and filter ergonomics.

### Target EN HRM file/path
Future CRM board/list components

### Required changes to fit EN HRM
Rebuild from scratch in TSX with EN lead statuses and follow-up due buckets.

### Risks/dependencies
Do not copy any Vue implementation due license.

### Recommended Codex task
Create an EN lead board specification based on statuses and follow-up due dates, then implement natively.

### Candidate ID
C-10 Krayin pipeline and stage structure

### Source repo
`laravel-crm`

### Source file path
`packages/Webkul/Lead/src/Models/Lead.php`, `Stage.php`, `Pipeline.php`, `Repositories/LeadRepository.php`, `StageRepository.php`

### License classification
MIT

### What it does
Models leads, stages, pipelines, and repository-level lead operations in a conventional CRM.

### Copy strategy
Inspiration only

### Why it is useful for EN CRM
Useful for naming and lifecycle ideas, but EN CRM should not import a generic pipeline model until WhatsApp intake, assignments, transfers, and follow-ups are complete.

### Target EN HRM file/path
Future docs or migrations if EN adds explicit pipeline stages

### Required changes to fit EN HRM
Translate concepts to EN statuses and study-abroad workflow. Keep source-owner assignment separate from pipeline state.

### Risks/dependencies
PHP/Laravel architecture does not map directly to Next.js/Supabase.

### Recommended Codex task
Write a small EN CRM status-transition spec before adding pipeline tables.

### Candidate ID
C-11 Krayin activity logging structure

### Source repo
`laravel-crm`

### Source file path
`packages/Webkul/Activity/src/Models/Activity.php`, `Repositories/ActivityRepository.php`, `Traits/LogsActivity.php`

### License classification
MIT

### What it does
Centralizes activity creation around business events.

### Copy strategy
Adapt manually

### Why it is useful for EN CRM
EN CRM server actions already create activity rows in several places. A small helper could reduce duplicated payload/activity insertion logic.

### Target EN HRM file/path
Future `lib/crm/activity.ts`

### Required changes to fit EN HRM
Implement a TypeScript helper around Supabase inserts and EN `CrmActivityType`.

### Risks/dependencies
Avoid hiding important action-specific payloads behind a vague generic logger.

### Recommended Codex task
Extract an EN-native `createCrmActivity` helper after notes/follow-up actions are added.

### Candidate ID
C-12 Krayin dashboard and datagrid patterns

### Source repo
`laravel-crm`

### Source file path
`packages/Webkul/Admin/src/Resources/views/dashboard/index.blade.php`, `packages/Webkul/Admin/src/Helpers/Dashboard.php`, `packages/Webkul/DataGrid/*`

### License classification
MIT

### What it does
Shows a mature admin dashboard and datagrid/saved-filter architecture.

### Copy strategy
Inspiration only

### Why it is useful for EN CRM
The high-level structure can inform CRM admin monitoring, especially transfer monitor, follow-up queues, and counselor productivity cards.

### Target EN HRM file/path
Future CRM dashboard/admin reports

### Required changes to fit EN HRM
Manually rebuild in server components. Avoid generic enterprise datagrid complexity until EN CRM list needs are clearer.

### Risks/dependencies
Overbuilding filters/reports too early would slow current Stage 1 workflow.

### Recommended Codex task
Add a small admin CRM dashboard with five KPI cards before any large reporting framework.

### Candidate ID
C-13 Study-abroad lead/application domain fields

### Source repo
`Study-Abroad-and-Education-Consultant-CRM`

### Source file path
`backend/database/migrations/2024_09_22_143922_create_leads_table.php`, `2024_09_21_081248_create_students_table.php`, `2024_10_02_142502_create_applications_table.php`, `2024_09_22_141021_create_visa_applications_table.php`, `backend/app/Models/Lead.php`, `Application.php`, `VisaApplication.php`

### License classification
No repo-level license verified

### What it does
Defines study-abroad concepts such as interested country/course, lead statuses, assigned agent, students, applications, visa applications, and application/visa status language.

### Copy strategy
Inspiration only

### Why it is useful for EN CRM
Useful domain vocabulary for the future transition from lead to client/case/application, while preserving EN's current raw intake and WhatsApp assignment model.

### Target EN HRM file/path
Future CRM planning docs and later case/application migrations

### Required changes to fit EN HRM
Do not copy code. Manually define EN-specific fields and statuses when Phase 2 client/case work starts.

### Risks/dependencies
No verified project license. Also, the repo is form-first and differs from EN's WhatsApp-first architecture.

### Recommended Codex task
Create a domain-language proposal for EN lead-to-client/case/application states, using this repo only as inspiration.

### Candidate ID
C-14 Study-abroad dashboard language

### Source repo
`Study-Abroad-and-Education-Consultant-CRM`

### Source file path
`frontend/src/components/Dashboard.vue`, project `README.md`

### License classification
No repo-level license verified

### What it does
Shows study-abroad dashboard concepts and user roles such as admin, consultant, and visa specialist.

### Copy strategy
Inspiration only

### Why it is useful for EN CRM
Can inform future KPI labels and counselor/client/application workflow language.

### Target EN HRM file/path
Future CRM dashboard docs/components

### Required changes to fit EN HRM
Rewrite all language for EN roles, WhatsApp ownership, counselors, branches, and applications.

### Risks/dependencies
No verified project license; Vue UI is not reusable directly.

### Recommended Codex task
Draft EN CRM dashboard microcopy and KPI labels before implementing the dashboard.

## 4. Candidate Categories

### Activity timeline

- Best source: Atomic CRM activity files.
- Usable strategy: Adapt manually.
- EN fit: Strong. EN already has parser, assignment, fallback, transfer, and follow-up activity types.
- Avoid: Frappe activity code because of AGPL/GPL license; use only for visual inspiration.

### Notes/follow-ups

- Best source: Atomic CRM note composer and note inputs.
- Usable strategy: Adapt manually.
- EN fit: Strong for lead notes, status changes, and follow-up scheduling.
- Important EN constraint: `crm_leads.next_followup_at` already exists and follow-up activity enum values are added, but UI/actions are not implemented yet.

### Lead board/pipeline

- Best sources: Atomic deal board for implementation structure; Frappe Kanban for UX inspiration; Krayin pipeline for lifecycle concepts.
- Usable strategy: Manual EN implementation.
- EN fit: Medium now, stronger after follow-up scheduling exists.
- Important EN constraint: Do not let generic pipeline logic replace WhatsApp-number ownership assignment.

### Dashboard/KPI cards

- Best sources: Atomic dashboard layout and Krayin dashboard concepts.
- Usable strategy: Manual EN implementation.
- EN fit: Strong for Stage 1 admin/counselor visibility.
- Candidate metrics: raw new, ready to promote, assigned today, pending transfers, follow-ups due today, overdue follow-ups, unassigned/needs-review leads.

### Filters/tables/search

- Best source: Atomic responsive filters/simple lists; Frappe quick-filter UX as inspiration only.
- Usable strategy: Manual EN implementation around URL search params.
- EN fit: Strong. Current CRM pages will benefit from shared filter controls.
- Avoid: Copying generic datagrid frameworks before EN workflows need them.

### Study-abroad domain workflow

- Best source: Study-abroad repo for domain vocabulary only.
- Usable strategy: Inspiration only.
- EN fit: Useful later for client/case/application stages, courses, visa/application statuses, and counselor workflow labels.
- Important license caveat: No repo-level license file was found, so do not copy code.

### RLS/security patterns

- Best source: Atomic schema organization, not policy substance.
- Usable strategy: Adapt manually.
- EN fit: Useful for organizing future RLS hardening migrations.
- Important EN constraint: Atomic policies are broad starter policies. EN needs super-admin, branch-scoped, assigned-counselor, and transfer participant scoping.

### Microcopy/empty states

- Best sources: Atomic empty states and Frappe empty/list UX inspiration.
- Usable strategy: Manual EN copywriting and components.
- EN fit: Strong for CRM pages that can be empty early: leads, inbox, transfers, assignment rules, follow-ups.
- Important EN tone: Explain operational state clearly without marketing-style filler.

## 5. Best Immediate Candidates for EN CRM

1. Lead notes UI
   - Source: Atomic `notes/*`
   - Strategy: Adapt manually
   - Next task: Add an EN-native lead notes panel and server action that writes `note_added` activity.

2. Status transition UI
   - Source: Atomic `Status.tsx` and `StatusSelector.tsx`
   - Strategy: Adapt manually
   - Next task: Add a lead status transition form that records `status_changed` activity.

3. Follow-up scheduling UI
   - Source: Atomic `NoteInputs.tsx` date/status composition
   - Strategy: Adapt manually
   - Next task: Add scheduling action that updates `crm_leads.next_followup_at` and writes `followup_scheduled`.

4. Due/overdue follow-up board
   - Source: Atomic board/card pattern, Frappe Kanban as inspiration only
   - Strategy: Manual EN implementation
   - Next task: Build a read-only board grouped by overdue, due today, upcoming, and no follow-up.

5. Activity timeline polish
   - Source: Atomic activity iterator and event-specific renderers
   - Strategy: Adapt manually
   - Next task: Replace the basic lead detail timeline with a reusable, typed timeline component.

## 6. Do Not Copy

- Frappe CRM Vue files under `frontend/src/**`: AGPL/GPL-licensed. Use only as UX inspiration.
- Frappe stores/API utilities: incompatible license and architecture.
- Study-Abroad-and-Education-Consultant-CRM source code: no verified repo-level license. Use only domain vocabulary and workflow inspiration.
- Any form-first intake flows from reference repos: conflicts with EN's WhatsApp-first raw intake model.
- Generic round-robin or global absence routing: conflicts with EN's receiving WhatsApp number ownership and per-number fallback model.
- Invoice/payment/client portal modules: outside current CRM stage.
- Full auth systems and user models: EN HRM already has app users, employees, roles, and permissions.
- Broad starter RLS policies such as authenticated users reading/updating everything: too permissive for EN CRM.
- Compiled/minified assets from Laravel/Krayin public build directories: unnecessary and not maintainable.

## 7. Suggested Implementation Order

1. Extract an EN-native CRM activity timeline component.
   - Inputs: lead activity rows and transfer/follow-up/status activity payloads.
   - Output: reusable component for lead detail and future admin views.

2. Add lead notes server action and UI.
   - Use `note_added` activity first.
   - Defer attachments unless explicitly needed.

3. Add lead status transition action and compact selector.
   - Write `status_changed` activity.
   - Keep allowed transitions simple and explicit.

4. Add follow-up scheduling and completion actions.
   - Update `crm_leads.next_followup_at`.
   - Write `followup_scheduled` and `followup_completed` activity rows.

5. Add follow-up queue page or board.
   - Group by overdue, due today, upcoming, and unscheduled.
   - Do not add drag-to-change until status/follow-up actions are stable.

6. Add shared CRM filter controls.
   - Start with leads and follow-ups.
   - Use URL search params and server-side queries.

7. Draft RLS hardening migration.
   - Use EN role/employee/branch helper patterns.
   - Keep app permission checks as the first enforcement layer until policies are validated.

8. Prepare future study-abroad case/application language.
   - Use the study-abroad repo as inspiration only.
   - Do not build client/case/application tables in this extraction pass.

## 8. Final Recommendation

The safest immediate reuse path is to manually adapt Atomic CRM's MIT activity, notes, status, filters, and dashboard patterns into EN-native React/Next.js components. Krayin can inform pipeline/dashboard structure, but its PHP/Laravel implementation should not be copied into the app. Frappe CRM is useful for UX inspection only because of AGPL/GPL licensing. The study-abroad repo is useful for domain language only because no repo-level license file was found.

For the next EN CRM build stage, start with lead notes, status transitions, follow-up scheduling, a due/overdue follow-up board, and timeline polish. These build directly on existing EN schema and activity enums without changing the WhatsApp-number ownership architecture.
