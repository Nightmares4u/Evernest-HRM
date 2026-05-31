# CRM Board

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

## In Progress

- None.

## Next Immediate

- **Admin Financials:** `/admin/crm/financials` or `/admin/financials`. Company-wide inflow/outflow combining CRM payments/refunds and HRM payroll.
- **Full Regression Testing:** Manual end-to-end testing of Stage 2 lifecycle paths and smoke-test verifications.
- **WhatsApp API MVP:** Real WhatsApp Cloud API/webhook intake (Meta WABA setup). Webhook verification, message reception, mapping to `phone_number_id`, and raw inbox creation.
- **T10D (UX Polish):** Activity timeline polish (Atomic CRM styling) post-functional completion.
- **T11 (UX Polish):** Lead Board / Pipeline UI.

## Backlog

- **RPC Migration (High Technical Debt):** Migrate remaining Stage 2A-2D multi-table direct-write actions (e.g., `convertLeadToClient`, `recordClientPayment`) to Postgres RPCs to guarantee transaction atomicity (fixing known Gemini Audit A-1, A-2, A-8, A-9, A-10).
- **T12:** KPI / Reporting Dashboard.
- **T13:** RLS / Permission Hardening (Ensure counselors only see their assigned leads).
- Finalize MVP branch scope and product scope.
- Define low-confidence review owner.
- Confirm initial agents and branch owners.
- Map current Meta campaigns and WhatsApp numbers.
- Define invoice numbering format and payment methods.

## Deferred / Do Not Build Yet

- **Stage 3 Client Portal:** Client-side auth and document uploads.
- **Gemini Parser / Chatbot:** Fallback AI for raw intake. (Rule-based parsing remains the default).
- **Invoices:** Deferred.
- **Commissions:** Deferred.
- **HRM Task Sync:** Deferred.
- **Ad-spend Automation:** Meta spend sync deferred.

## Known Risks / Technical Debt

- **Multi-table Write Atomicity:** As flagged in the Gemini 2026-05-23 Audit, `convertLeadToClient` and other Stage 2A-2D actions perform sequential Supabase writes using a manual compensation pattern. These are vulnerable to partial failure and need to be refactored into atomic Postgres RPCs (following the Stage 2E pattern).
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
- Verification of older Stage 2A-2D manual compensation rollbacks during simulated failures.