# EN CRM Feature Smoke-Test and Lifecycle Audit

## 1. Executive Summary

The CRM module on `crm-dev` has successfully reached feature completeness through Stage 2E (Closure/Refunds). The recent RPC hardening commit `7df47465` successfully transitioned Phase 2E to atomic operations, eliminating partial-failure risks for complex state mutations during closure.

However, the audit revealed a few gaps in UI reachability and terminal state locking constraints:
1. **Missing UI:** `recordClientPayment` exists as a robust backend action but is completely missing a UI surface post-conversion. Payments can currently only be recorded during the initial lead → client conversion.
2. **Terminal State Violation (Refunds):** Standalone refunds can incorrectly be recorded against `alumni` (successful) clients. Both the UI and the backend RPC `crm_record_client_refund` fail to guard against the `alumni` terminal state.
3. **Data Integrity:** Older Stage 2A-2D actions (`convertLeadToClient`, document verification, milestone updates) still use TypeScript sequential database writes with manual compensations. These remain a technical debt risk.

---

## 2. Route Inventory
**Stage 1 Routes:**
- `/crm/inbox` & `/crm/inbox/[id]`
- `/crm/leads` & `/crm/leads/[id]`
- `/crm/leads/follow-ups`
- `/crm/transfers`
- `/admin/crm/*` (whatsapp-numbers, campaign-sources, assignment-rules, transfers)

**Stage 2 Routes:**
- `/crm/clients` & `/crm/clients/[id]`
- `/crm/clients/[id]/documents`
- `/crm/clients/[id]/applications`
- `/crm/clients/[id]/visa`
- `/crm/clients/[id]/closure`
- `/admin/crm/clients/conversion-queue`
- `/admin/crm/clients/doc-review`

---

## 3. Server Action Inventory
- **Leads:** `convertLeadToClient` (UI present on lead conversion panel)
- **Clients/Payments:** `recordClientPayment` (backend present, UI missing)
- **Documents:** `uploadClientDocument`, `approveDocument`, etc. (UI present)
- **Applications:** `createApplication`, status transitions (UI present)
- **Visa/Milestones:** Milestone updates, `recordVisaDecisionAction` (UI present)
- **Closure:** `moveToPreDepartureAction`, `markDepartedAction`, `markAlumniAction`, `withdrawClientAction`, `recordClientRefundAction` (UI present)

---

## 4. Smoke-Test Matrix (Expected vs Actual)

| Feature / Action | Expected Result | Actual Result / Code State | Pass/Fail |
|---|---|---|---|
| Lead → Client Conversion | Requires agreement & advance. | Validates advance/dates; creates client & initial payment. | Pass |
| Post-Conversion Payment | UI available to record payments. | **No UI exists** to call `recordClientPayment`. | Fail |
| Document Upload/Review | Assigned counselor / Ops can verify. | Scoped correctly via `canVerifyClientDoc`. | Pass |
| Application Status | Transitions update application. | Handled in applications actions. | Pass |
| Visa Gating | Visa submitted requires milestones. | Handled correctly via milestone blockers. | Pass |
| Pre-Departure / Departed | Records dates and notes. | Handled via RPC; UI panels toggle correctly. | Pass |
| Mark Alumni | Marks terminal success state. | Handled via RPC `crm_transition_to_alumni`. | Pass |
| Withdraw Client | Blocks if already terminal. | UI uses `canWithdrawFromStatus` (blocks alumni/withdrawn). | Pass |
| Record Refund | Allowed only on active/withdrawn. | **Allowed on Alumni**. Missing terminal status check. | Fail |

---

## 5. Confirmed Bugs

1. **Missing Payment UI:** `recordClientPayment` server action exists in `app/(dashboard)/crm/clients/actions.ts` but has no corresponding form on `/crm/clients/[id]` or any other client detail tab.
2. **Refund Allowed on Alumni:** The `/crm/clients/[id]/closure/page.tsx` renders the `<RefundsPanel>` based solely on `data.canRecordRefund` (which is true for super admins), ignoring whether the client is an `alumni`. Furthermore, the backend RPC `crm_record_client_refund` in `0020_crm_client_closure_phase_2e.sql` does not check or block against the `alumni` status.

---

## 6. Suspected Issues Requiring Manual Browser Verification
- Verify that older Stage 2A-2D actions with manual compensation (e.g., document upload failures) gracefully handle UI state resets.
- Verify that `agreement_signed_at` and `advance_paid_at` UI form interactions during conversion accurately prevent submission if fields are omitted.

---

## 7. Payment/Refund Policy Recommendation

*   **Payments:** Payments should be allowed on all client statuses *except* terminal states (`alumni`, `withdrawn_refunded`). 
*   **Refunds:** Refunds represent a reversal or failure path. They should be allowed on active clients (which implies an impending withdrawal) and `withdrawn_refunded` clients. **Refunds must be strictly blocked for `alumni` clients.**

---

## 8. Missing UI Surfaces
- `<RecordPaymentForm />` (or similar) on the client detail view to interact with `recordClientPayment`.

---

## 9. Permission Risks
- `canRecordRefund` relies on `super_admin` role but does not factor in the client's current status lifecycle. This leads to the UI exposing refund capabilities for successfully closed (alumni) clients.

---

## 10. Data Integrity Risks
- **Stage 2A-2D Multi-Table Writes:** As noted in the Gemini Audit backlog, actions like `convertLeadToClient` still execute sequential Supabase insertions (`crm_clients` -> `crm_client_payments` -> `crm_client_activities`) with manual `delete()` compensations. This is vulnerable to partial-failure race conditions and should be migrated to Postgres RPCs following the Stage 2E pattern.

---

## 11. Exact Minimal Fixes Recommended

1. **Refund Terminal State Fix (UI):** 
   In `app/(dashboard)/crm/clients/[id]/closure/page.tsx`:
   ```tsx
   const canRecordRefundForStatus = client.status !== "alumni";
   // Pass down to RefundsPanel
   <RefundsPanel ... canRecordRefund={data.canRecordRefund && canRecordRefundForStatus} />
   ```

2. **Refund Terminal State Fix (Backend RPC):**
   In `supabase/migrations/0020_crm_client_closure_phase_2e.sql` (or a new migration):
   ```sql
   -- Inside crm_record_client_refund:
   SELECT id, status INTO v_client_id, v_client_status FROM public.crm_clients WHERE id = p_client_id FOR UPDATE;
   IF v_client_status = 'alumni' THEN
     RAISE EXCEPTION 'Cannot record refund for an alumni client';
   END IF;
   ```

3. **Missing Payment UI:**
   Create a new panel in `app/(dashboard)/crm/clients/[id]/page.tsx` (or a dedicated billing tab) to render a form that triggers `recordClientPayment`.

---

## 12. What Not To Touch
- Do not modify any Phase 2E RPC logic other than adding the `alumni` guard to the refund action. The existing closure transitions are atomic and correct.
- Do not rewrite the Stage 2A-2D compensations (like `convertLeadToClient`) during the scope of UI/Bug fixes. This requires a dedicated, planned architectural refactor.

---

## 13. Suggested Fix Order
1. Fix the `alumni` terminal state leak in both the UI (`closure/page.tsx`) and the Database RPC (`crm_record_client_refund`) to prevent erroneous financial records.
2. Implement the missing Payment UI panel for `recordClientPayment`.
3. (Backlog) Migrate Stage 2A-2D actions to Postgres RPCs.