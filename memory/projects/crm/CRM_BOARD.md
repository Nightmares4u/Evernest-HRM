# CRM Board

## Current Integration Audit State

- Branch under audit: `review/main-plus-ui`.
- Base: `origin/main`.
- Merged source: `ui-revamp-experiment`.
- CRM source branch included: `crm-dev`.
- All integration changes are staged; no commit, push, or merge into `main` has been performed.
- Staged diff size at prep time: 143 files.
- `0023_crm_convert_lead_to_client_rpc.sql` has already been applied manually in Supabase before app deployment.
- Preserved from `origin/main`: payroll preview/export attendance exemption fix (`attendanceExempt`), `presentDays` payroll preview visibility, payroll export exemption logic, and `0016_task_workflow.sql`.

## Done

- CRM planning directory created and Initial planning files drafted.
- Stage 1 Phase 1 schema/types foundation.
- Stage 1 Phase 2 admin config and raw inbox UI.
- Stage 1 Phase 3 raw detail, rule-based parser, lead promotion, lead views, and manual assignment.
- Stage 1 Phase 4 employee-direct assignment rules UI and explicit rule-based auto-assignment.
- Stage 1 Phase 5 WhatsApp number ownership as primary assignment; rules demoted to fallback.
- Stage 1 Phase 5 temporary per-number fallback counselor routing for leave/break coverage.
- Stage 1 Phase 4.5 raw intake auto-parse, grouped CRM sidebar navigation, and fallback helper cleanup.
- Stage 1 Phase 5 lead transfer/handoff schema foundation.
- CRM follow-up activity enum values for scheduled/completed timeline events.
- **T10B:** Lead notes + status update + follow-up scheduling UI/actions.
- **T10C:** Due/overdue follow-up board.
- Stage 2A: Conversion + client shell.
- Stage 2B: Document registry + upload + review.
- Stage 2C: Per-university applications.
- Stage 2D: Country milestones + visa gate.
- Stage 2E: Closure, visa decisions, pre-departure, departed, alumni, withdrawals/refunds (RPC-hardened).
- Stage 2F-1: Client financials / refund policy hardening.
- RPC hardening for Phase 2A/2D multi-table mutations: migration `0022`, commit `81c287f`; closes audit items A-2, A-8, A-9, and A-10.
- **Admin Financials MVP:** read-only `/admin/financials` (super_admin only). PKR-only company-wide dashboard combining CRM payments/refunds and HRM payroll-preview outflow. No new tables. Recent payment/refund tables link out to client financials/closure. Non-PKR rows excluded from totals with an amber warning. No invoices, no commissions, no ad-spend.
- **Internal CRM Assistant MVP:** `/crm/assistant`. Gemini-backed staff Q&A over the CRM planning docs only. Server-side `GEMINI_API_KEY` (and optional `GEMINI_MODEL`, default `gemini-2.5-flash`). No mutations, no chat history table, no embeddings/vector DB, no client-facing chatbot, no parser fallback.
- **Migration 0023:** `public.crm_convert_lead_to_client` creates the client, advance payment, and client-created activity atomically; `convertLeadToClient` now calls this RPC. `0023` also enforces PKR on new/future CRM financial writes using `NOT VALID` constraints.
- **PKR-only hardening:** Currency selectors/inputs are removed or hidden from conversion, payment, refund, and application financial forms. Server actions force PKR and do not trust submitted currency.
- **Assistant production hardening:** CRM assistant markdown docs are included in Next/Vercel output tracing; missing docs fail clearly; missing `GEMINI_API_KEY` does not break build.
- **UI/UX revamp integration:** Broad dashboard/admin/CRM polish, app shell/sidebar/logo/icon work, shared UI primitives, lifecycle tabs, and task maintenance danger-zone styling are staged from `ui-revamp-experiment`.

## In Progress

- Final staged-diff audit and manual browser regression before integration commit.
- Manual regression of Phase A intake fix + Phase B role/scoping on branch `whatsapp-integration`.

## Phase A / B (branch `whatsapp-integration`) — Done

- **Phase A — Intake assignment + enrichment.** Ownership at receipt, `needs_enrichment` raw/lead states, counselor visibility/enrichment of assigned raw intake, relaxed promotion (no super_admin gate, no hard country/city block), `ops` role added. Migrations `0024`, `0025`. See `WHATSAPP_INGESTION_PLAN.md` §8.
- **Phase B — Role/scoping helpers (code-only).** Centralized lead/raw scoping in `lib/crm/permissions-leads.ts` (`canViewLead`, `canManageLead`, `leadScopeForActor`); branch managers now manage branch leads; follow-up board role-scoped (branch managers see branch); `needs_enrichment` badge/filter on leads list + editable enrichment panel on lead detail; `ops` granted cross-branch client/doc/application/milestone/status access via role (department-name kept as fallback); `canViewClientFinancials` excludes ops from financials. Partially closes **T13**. See `CURRENT_STATE.md` → "CRM Role / Access Scoping (Phase B)".
- **Phase A/B merged to `main`** via PR #7 (`b7496e3`). They were finalized after PR #6 but never merged; now on main.

## WAB2C webhook ingestion (LIVE on `main`) — Done

- New route `app/api/webhooks/wab2c/route.ts` coexisting with the direct Meta webhook. Flexible secret verification (`WAB2C_WEBHOOK_SECRET` via header/bearer/`?secret=`; fail-closed in prod).
- Shared ingestion helper `lib/crm/whatsapp-ingestion.ts` (`ingestInboundWhatsappMessage` + `attachOutboundWhatsappEcho`); the direct Meta route was refactored to call it too (single source of truth, behaviour unchanged).
- Normalizer `lib/wab2c/normalize.ts` (transformed → `whatsapp.original_payload` → direct Meta; direction-aware customer phone).
- Inbound → owned raw intake (Phase A) + parser/Gemini; outbound echoes attach-if-safe (never new leads); status/other 200-ignored. Inbound dedupe via `first_wa_message_id` (raw Meta id, cross-transport safe); outbound dedupe via `crm_lead_messages.wa_message_id`.
- No polling, no outbound send. Test artifacts: `scripts/wab2c-normalize-check.ts` (4/4 pass), `scripts/wab2c-webhook-sim.mjs`. See `WHATSAPP_INGESTION_PLAN.md` §9.

## Next Immediate

- **Claude Final Audit:** Review the full staged diff before commit. Pay special attention to destructive operations, permissions, server actions, RLS-sensitive paths, and large UI route changes.
- **Manual Browser Regression:** Smoke test Stage 1, Stage 2, Financials, Admin Financials, Task Maintenance, Assistant, Payroll Preview/Export, and responsive UI.
- **Lead Conversion Test:** Confirm `crm_convert_lead_to_client` works in Supabase after `0023` and that conversion creates exactly one client, one advance payment, and one client-created activity.
- **Task Maintenance Safety Review:** Confirm deletion targets only task data and never employees, users, attendance, payroll, leave, CRM clients/leads/payments/documents, or recurring task templates.
- **Assistant Env Tests:** Verify `/crm/assistant` with and without `GEMINI_API_KEY`; verify docs-grounded behavior and no action execution.
- **Payroll Smoke Test:** Verify selected-month payroll preview/export, present column, attendance-exempt chip, and zero attendance deductions for exempt employees.

## Backlog

- **T12:** KPI / Reporting Dashboard.
- **T13:** RLS / Permission Hardening (Ensure counselors only see their assigned leads). Partially addressed by Phase B app-level helpers; DB-level branch RLS still deferred.
- **Branch-manager transfer/reassign:** Branch managers can view/work branch leads but cannot yet reassign or initiate transfers for branch leads they are not the assignee of (transfer request + `assignCrmLead` remain assigned-counselor/super_admin). Add a branch-scoped reassign/transfer path when needed; intentionally not built in Phase B to avoid rewriting the transfer system.
- **HRM Finalization / System-Wide Access Control** (future — do NOT build yet): admin UI to create employee login/auth details and system email/login; create role definitions and assign permissions to roles; employee create/edit pages expose role + permission dropdowns/toggles; role defaults auto-select permissions with per-employee overrides still possible; permissions eventually span HRM + CRM + finance + admin tools; full frontend-managed hiring/firing/replacement flow. This is the migration target from the current minimal helper-based roles to a configurable RBAC/capability layer.
- Finalize MVP branch scope and product scope.
- Define low-confidence review owner.
- Confirm initial agents and branch owners.
- Map current Meta campaigns and WhatsApp numbers.
- Define invoice numbering format and payment methods.

## Deferred / Do Not Build Yet

- **WhatsApp API / Coexistence:** Paused for this merge. No webhook/API/coexistence work is included.
- **Stage 3 Client Portal:** Client-side auth and document uploads.
- **Gemini Parser / Chatbot:** Fallback AI for raw intake. (Rule-based parsing remains the default).
- **Invoices:** Deferred.
- **Commissions:** Deferred.
- **Multi-currency:** Deferred. CRM financials remain PKR-only.
- **HRM Task Sync:** Deferred.
- **Ad-spend Automation:** Meta spend sync deferred.

## Known Risks / Technical Debt

- **Large staged diff:** 143 staged files from CRM, HRM UI, docs, migrations, config, and package updates require final human/Claude review before commit.
- **Multi-table Write Atomicity:** Phase 2A/2D RPC hardening landed in commit `81c287f` with migration `0022`, closing A-2, A-8, A-9, and A-10. Migration `0023` closes the lead-to-client conversion RPC gap.
- **0023 deployment ordering:** App deployment must wait until after `0023` exists in Supabase. It has already been manually applied.
- **NOT VALID constraints:** `0023` does not validate historical non-PKR rows, but new inserts and future updates must be PKR.
- **UI revamp risk:** Broad UI changes still need browser/manual testing for hydration, responsiveness, route access, form `name` attributes, and server action behavior.
- **Destructive maintenance risk:** `/admin/tasks/maintenance` must be reviewed carefully because it deletes DB rows.
- WhatsApp attribution may be weak without strict number/campaign discipline.
- Existing WhatsApp numbers may be staff-owned or inconsistently used.
- Combining sales statuses and case statuses may create reporting confusion.

## Manual Tests Still Needed

- Complete regression testing for raw intake auto-parse & promotion.
- Source owner assignment, fallback routing, and campaign inheritance.
- Assignment rule fallback logic.
- Transfer request, accept, reject, cancel, and admin override.
- Follow-up schedule and completion.
- Notes and status transitions.
- Counselor visibility vs. super-admin visibility checks.
- Regression test the migration `0022` RPC paths for payment recording and Phase 2D milestone/status mutations.
- Regression test the migration `0023` lead-to-client conversion RPC path.
- Admin Financials `/admin/financials`: super-admin-only gating; monthly totals match `/crm/clients/[id]/financials` ledgers in aggregate; payroll outflow matches `/admin/payroll` estimated-payable total; non-PKR rows surface the amber warning and are excluded from totals.
- CRM Assistant `/crm/assistant`: page renders without `GEMINI_API_KEY` and surfaces an amber disabled banner; with the key set, sample questions return doc-grounded answers; the assistant refuses to invent routes, refuses to perform actions, and refuses to reveal secrets; missing doc files surface in the page banner; non-authenticated user is redirected to `/login`.
- PKR-only forms: conversion, payment, refund, and application financial forms show fixed "PKR only"; server actions force PKR.
- Permission review: super_admin-only refunds, super_admin-only task maintenance, signed document URL access checks, and terminal-client mutation locks.
- Payroll: selected month preview, present/leave visibility where available, attendance-exempt chip, exempt zero deductions, export matches preview, scheduled working day denominator excludes Sundays and paid holidays.
