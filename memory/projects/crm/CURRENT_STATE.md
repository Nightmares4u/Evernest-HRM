# Current State

## Status

CRM planning base has started.

No app code should be implemented yet.

Stage 1 lead intake planning has been added.

## Current Goal

Create and review the CRM planning documents before building:

- Business context
- Product charter
- Requirements
- WhatsApp-first pipeline
- Stage 1 WhatsApp intake
- Data model
- MVP scope
- HRM integration
- Reporting and KPIs
- Automation plan
- Repo audit criteria
- Open questions
- Implementation plan
- CRM board

## Key Decisions Not Yet Made

- Same HRM app/repo versus separate CRM repo
- CRM database schema integration with HRM
- Which 2-3 WhatsApp numbers to connect first
- Which products map to the first connected WhatsApp numbers
- Whether to use WhatsApp Cloud API direct or a BSP
- Stage 1 greeting text
- Mandatory fields before assignment
- Low-confidence review owner
- Initial branch owners and agents
- Final MVP products
- Final MVP branch scope
- WhatsApp API timing
- Meta campaign import/sync timing
- Lead-to-case conversion rule
- Document checklist MVP depth
- Invoice/payment MVP depth
- Candidate repo audit before custom build

## Working Philosophy

- WhatsApp-first, not form-first.
- CRM is the control layer.
- HRM remains the employee/task/payroll foundation.
- Postgres/Supabase preferred.
- Avoid chatbot logic.
- Avoid overengineering.
- Plan before implementation.

## Next Best Step

Review Stage 1 intake plan with Syed and answer the highest-impact open questions:

1. Which 2-3 WhatsApp numbers should be connected first?
2. Which products/campaigns/branches map to those numbers?
3. Who owns the first assignment queues?
4. What exact greeting should be sent?
5. Which fields are mandatory before assignment?
6. Should low-confidence items go to a central queue or branch manager?
7. Should WhatsApp Cloud API direct or BSP be used?

## Current Stage 1 Boundary

Stage 1 ends at:

Raw WhatsApp message -> structured intake -> parsed lead details -> assigned branch/agent -> human follow-up.

Stage 1 excludes:

- Full AI chatbot
- Full Meta spend sync
- Client portal
- Invoice system
- University database
- Commission/payroll integration
- Advanced reporting
