# EN CRM — Gemini Audit (2026-05-23)
> Read-only audit. Do not action without architectural review.
> Auditor: Gemini. Branch: crm-dev. Commit: b5756868374d0c34fdb06b8ef95f6ec41acca83a.
> Historical note: this audit is partially superseded by later code and
> documentation state. Verify every finding against current `crm-dev`
> before treating it as active.

## Executive summary
- Validated that fixes for Phase 2A permission bugs (A-3, A-4) and missing `apostille` codes (B-3) were successfully implemented by Codex.
- Document review queue permissions correctly enforce that Branch Managers cannot verify documents unless they are the assigned counselor, perfectly matching Stage 2 plan §10.
- **Phase 2D findings:** Country milestones are correctly implemented, visa-stage gating is flawlessly enforced (client cannot move to `visa_submitted` if milestones are missing), and the super admin rollback is implemented securely. Permission logic `canEditClientMilestone` perfectly honors the `OPS_DEPARTMENT_NAME` plan requirement.
- **Phase 2E findings:** Phase 2E strictly followed the new architectural instruction to use Postgres RPCs for complex state mutations. As a result, **zero transaction/orphan bugs were introduced in this phase**. Closure metrics (flight dates, briefing notes), withdrawal, and refunds are successfully implemented and bound by atomic SQL functions.
- Storage signed URLs are securely scoped to 15-minute TTLs. No N+1 queries were detected in the new admin views.

## A. Correctness bugs

*(Note: Some A-series findings have compensation patches; A-1 remains
non-atomic, A-2 is compensated but not RPC-atomic, and Phase 2C
application actions should also be audited under the RPC policy. Listed
below for historical context.)*

### A-1 — Missing transaction / Orphan Client Row on Conversion
- **Severity:** high
- **File:** app/(dashboard)/crm/clients/actions.ts:153

### A-2 — Missing transaction / Orphan Payment Row
- **Severity:** high
- **File:** app/(dashboard)/crm/clients/actions.ts:192
- **Current note:** Compensation exists if activity logging fails, but
  this is still not RPC-atomic and remains a hardening target.

### A-3 — Missing transaction / Corrupted Document State on Upload
- **Severity:** high
- **File:** app/(dashboard)/crm/clients/documents/actions.ts:221

### A-4 — Missing transaction / Orphan Document State on Decision
- **Severity:** high
- **File:** app/(dashboard)/crm/clients/documents/actions.ts:326

### A-5 — Missing Payment ID in Activity Payload
- **Severity:** low
- **File:** app/(dashboard)/crm/clients/actions.ts:203

### A-6 — Missing Audit Log on Document Claim
- **Severity:** medium
- **File:** app/(dashboard)/crm/clients/documents/actions.ts:285

### A-7 — Incomplete Supersede on Multiple Active Docs
- **Severity:** medium
- **File:** app/(dashboard)/crm/clients/documents/actions.ts:205

### A-8 — Missing transaction / Corrupted Milestone State
- **Severity:** high
- **File:** app/(dashboard)/crm/clients/visa/actions.ts:145

### A-9 — Missing transaction / Orphan Client Status on Visa Flow
- **Severity:** high
- **File:** app/(dashboard)/crm/clients/visa/actions.ts:290

### A-10 — Missing transaction / Orphan Milestone Seeds
- **Severity:** medium
- **File:** lib/db/crm.ts:1877

### A-11 — Phase 2C application actions pre-date RPC policy
- **Severity:** medium
- **File:** app/(dashboard)/crm/clients/applications/actions.ts
- **Current note:** Create/status/delete application actions write
  application/client/activity state from TypeScript. They should be
  audited and migrated opportunistically under Plan §14.

## B. Plan vs reality drift

### B-1 — Conversion Gate Schema Location
- **Severity:** low
- **File:** supabase/migrations/0015_crm_clients_phase_2a.sql:50
- **What's wrong:** Plan §3 states "A crm_clients row gets created when both of these are true on the parent lead: agreement_signed_at IS NOT NULL and advance_paid_at IS NOT NULL". In reality, these columns were added directly to `crm_clients`, not `crm_leads`.
- **Impact:** The gate is currently enforced via UI form validation rather than a core state check on the lead row itself.

### B-2 — Undocumented Lead → Client UUID Strategy
- **Severity:** low
- **File:** memory/projects/crm/CURRENT_STATE.md
- **What's wrong:** Plan §12 #5 requested documenting the UUID strategy (same-UUID vs FK-link) in `CURRENT_STATE.md` once decided. The schema uses an FK-link (`lead_id uuid NOT NULL UNIQUE`), but this decision was never documented.
- **Impact:** Minor documentation gap. (Fixed previously)

## C. Architectural consistency
- No architectural drift found. The application correctly delegates permission checks and avoids cross-domain boundary violations. Phase 2E represents a significant architectural improvement by moving high-risk mutations into Postgres RPCs.

## D. Security posture

### D-1 — Storage Path Sanitization Rigor
- **Severity:** low
- **File:** app/(dashboard)/crm/clients/documents/actions.ts:39
- **What's wrong:** `sanitizeFileName` strips `/`, `:`, and `\`, but relying on regex sanitization of user input for storage paths can be brittle. *(Fixed previously via UUID usage)*.
- **Impact:** Resolved.

## E. Document consistency

### E-1 — Missing Client Code Format Decision
- **Severity:** low
- **File:** memory/projects/crm/CURRENT_STATE.md
- **What's wrong:** Plan §13 asked to pick a client code format (`EN-{year}-{seq}` vs `EN-{branch}-{seq}`). Migration 0015 implements `EN-{year}-{seq}`, but this decision is undocumented.
- **Impact:** Minor knowledge gap in the documentation trail. (Fixed previously)

## Findings summary table
| ID | Category | Severity | File | One-line summary |
|---|---|---|---|---|
| A-1 | Correctness bugs | high | .../clients/actions.ts:153 | Missing transaction causes orphan client row on partial failure. |
| A-2 | Correctness bugs | high | .../clients/actions.ts:192 | Missing transaction causes orphan payment row on partial failure. |
| A-3 | Correctness bugs | high | .../documents/actions.ts:221 | Missing transaction causes corrupted doc state on upload failure. |
| A-4 | Correctness bugs | high | .../documents/actions.ts:326 | Missing transaction causes orphan doc state on decision failure. |
| A-8 | Correctness bugs | high | .../visa/actions.ts:145 | Missing transaction on milestone status update. |
| A-9 | Correctness bugs | high | .../visa/actions.ts:290 | Missing transaction on visa status transition. |
| A-10 | Correctness bugs | medium | lib/db/crm.ts:1877 | Missing transaction on milestone seeding. |
| A-11 | Correctness bugs | medium | .../applications/actions.ts | Phase 2C application actions pre-date RPC policy. |
| B-1 | Plan vs reality | low | .../migrations/0015_...sql:50 | Conversion dates added to client table instead of lead table as planned. |
| B-2 | Plan vs reality | low | .../CURRENT_STATE.md | FK-link UUID strategy was chosen but not documented. |
| D-1 | Security posture | low | .../documents/actions.ts:39 | File name sanitization for storage paths is potentially brittle. |
| E-1 | Doc consistency | low | .../CURRENT_STATE.md | Client code format decision implemented but undocumented. |

## What looks clean (positive findings)
- **Phase 2E RPC Implementation:** The Stage 2 plan §14 explicitly called for atomic transactions for complex multi-table mutations. Phase 2E adheres to this perfectly. 8 separate Postgres RPCs (e.g., `crm_transition_to_pre_departure`, `crm_record_visa_decision`, `crm_withdraw_client`) completely eliminate the partial-failure risk seen in previous stages.
- **Phase 2E Data Constraints:** The refunds and visa decisions are properly captured in distinct tables (`crm_client_refunds`, `crm_client_visa_decisions`) with their own Row Level Security policies.
- **Phase 2E Permissions:** `canWithdrawClient` and `canRecordClientRefund` correctly enforce super-admin only restrictions as specified in Stage 2 Plan §10.
- **Phase 2D Implementation Details:** The country milestones are perfectly aligned with the specification. The registry covers all 11 required countries. The `requiredMilestoneBlockers` logic properly guards the `visa_submitted` transition, requiring all `done` or `not_applicable` status.
- **Phase 2D Permissions:** `canEditClientMilestone` enforces that only the assigned counselor, Ops, or super admin can modify a milestone, adhering perfectly to Plan §10.
- **Server Actions Auth:** All server actions correctly enforce authentication via `requireActiveUser` before executing mutations, and securely invoke `createAdminClient()`.

## Out-of-scope items you noticed
- **Transaction Wrappers:** Consider adding a generic Supabase RPC function or a lightweight transaction wrapper for complex, multi-table server actions to permanently mitigate the systemic transaction bugs identified above across all Stage 2 phases.
