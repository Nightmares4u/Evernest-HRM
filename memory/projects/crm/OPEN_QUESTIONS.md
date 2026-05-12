# Open Questions

**Status:** Stage 1 questions are resolved. See `STAGE_1_DECISIONS.md`
for locked answers. The list below is preserved as the historical
question set and as the backlog for Stage 1.5+. Items already answered
for Stage 1 are not re-listed; questions kept here are either
deferred or scoped to later stages.

## Business and Operations

1. Which offices should be live in CRM MVP: Karachi only, Karachi + Lahore, or all active/satellite teams?
2. Should Edmonton and Naples be treated as branches, remote locations, partner offices, or reporting tags?
3. Which products must be live on day one: Italy study visa, South Korea, B2B, work visas, immigration?
4. Which product is the most important for MVP reporting?
5. Should B2B processing have a separate pipeline from B2C leads?

## WhatsApp and Meta

1. How many WhatsApp numbers are currently used for campaigns?
2. Which numbers map to which campaigns, products, or branches?
3. Are numbers owned directly by EN Consultants or by individual staff?
4. Is Meta Business Manager fully controlled by EN Consultants?
5. Are current ads click-to-WhatsApp ads or mixed campaign types?
6. Can campaigns use a structured opening message to help attribution?
7. Is WhatsApp Cloud API already approved anywhere, or would setup start from zero?
8. Which 2-3 WhatsApp numbers should be connected first for Stage 1?
9. Which products map to each first connected number?
10. Do we want WhatsApp Cloud API direct or a BSP?
11. What is the budget ceiling for WhatsApp API/BSP during MVP testing?
12. Do we want an auto-reply outside office hours?
13. What exact greeting text should be used?

## Lead Assignment

1. Who should own unassigned lead review?
2. Should leads first enter a queue or be assigned immediately?
3. What exact rule should route Punjab leads to Lahore?
4. Which products should always route to Karachi or senior management?
5. Should agent workload limit assignment?
6. What makes a lead high priority?
7. Who are the initial agents and branch owners for Stage 1?
8. Should low-confidence leads go to Lahore/Karachi manager or a central review queue?
9. What fields are mandatory before assignment?
10. Should B2B leads bypass normal branch assignment?

## Stage 1 Intake

1. Should every inbound message create a raw inbox item, even if it is only "hi"?
2. When should a raw inbox item become a CRM lead?
3. How many times should the system ask for missing details before human review?
4. Should the greeting be the same for all numbers or product-specific?
5. Should budget be mandatory before assignment?
6. Should city be mandatory before assignment?
7. Should English test be collected for all products or only study visa products?
8. Should Gemini fallback be automatic for low-confidence replies or agent-triggered only?
9. What confidence threshold should send an item to manual review?
10. Should duplicate leads notify the current owner automatically?

## Lead Lifecycle

1. Should sales statuses and case/application statuses be separate?
2. What is the exact moment a lead becomes a client/case?
3. Is payment required before case creation, or can case creation happen after document collection starts?
4. What are the official definitions of qualified, interested, and hot lead?
5. What statuses should be visible to agents versus managers?

## Documents and Cases

1. Which document checklists are needed first?
2. Should checklist templates be per product, country, university, or visa type?
3. Who verifies documents?
4. Who can reject documents?
5. Should clients upload documents in MVP, or should staff upload internally first?

## Invoices and Payments

1. What invoice numbering format should EN use?
2. What currencies are required?
3. What payment methods should be tracked?
4. Are installment plans common?
5. Should invoices include taxes?
6. Who can mark payments as received?
7. What financial information should agents see?

## HRM Integration

1. What is the existing HRM schema for employees, branches, roles, and tasks?
2. Should CRM follow-ups create HRM tasks in MVP or later?
3. Which HRM roles should map to CRM permissions?
4. When should commissions connect to payroll?

## Reporting

1. What are the top 5 KPIs management wants every morning?
2. What does Syed want to compare weekly by branch?
3. Which reports must be exportable?
4. Should campaign spend be manually entered at first?
5. Is gross profit known per product, or should revenue be tracked first?

## Implementation

1. Should we build custom CRM modules or audit candidate CRM repos first?
2. If auditing repos, what candidate URLs should be reviewed?
3. Should the CRM be built in the existing HRM repo after planning?
4. What is the preferred first pilot team?
5. What date should CRM MVP target for internal testing?
6. If using Next.js API Routes for webhooks, how will we monitor for Vercel execution timeouts during slow Gemini parsing?
7. Will we need a staging environment for Meta WhatsApp API to test webhooks safely before production?
