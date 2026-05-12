# MVP Scope

## MVP Goal

Build a CRM that lets EN Consultants run a real WhatsApp-first lead and case workflow with clear ownership, follow-up discipline, basic revenue tracking, and management visibility.

## Stage 1 MVP Goal

Stage 1 is narrower than the full CRM MVP.

Stage 1 should take EN from:

Raw WhatsApp message -> structured intake -> parsed lead details -> assigned branch/agent -> human follow-up.

Stage 1 should protect the distinction between:

- Raw WhatsApp intake
- CRM lead
- Converted client/case

## Include In MVP

### Stage 1 Intake

- Manual WhatsApp number/campaign mapping
- 2-3 high-value API-connected WhatsApp numbers first
- Raw inbox
- Raw intake statuses
- Greeting template
- Structured details request
- Structured reply parser
- Parser confidence scoring
- Manual review queue
- Rule-based assignment
- Manual reassignment
- Assignment history
- Agent lead board
- Testing with one number first

### Lead Management

- Manual lead entry
- CSV import if needed
- Lead list
- Lead detail profile
- Duplicate phone detection
- Campaign/source fields
- WhatsApp number tracking
- Branch and product categorization
- Lead quality and urgency labels

### Assignment

- Assign lead to branch/agent
- Manual reassignment
- Assignment history
- Basic rule-based defaults later in MVP if simple

### Follow-Up and Activity

- Notes
- Activity timeline
- Follow-up scheduling
- Today follow-ups
- Overdue follow-ups
- Status transitions

### Client/Case Profile

- Convert lead to case/client
- Case status
- Product/country
- Assigned sales owner
- Operations owner
- Application progress fields

### Documents

- Internal document checklist
- Internal upload metadata
- Supabase Storage or S3-compatible storage
- Document statuses
- Rejection reason

### Invoices and Payments

- Basic invoice creation
- Invoice items
- Invoice status
- Payment recording
- Printable/exportable PDF later in MVP if feasible

### Reporting

- Branch lead counts
- Agent lead counts
- Follow-up overdue counts
- Qualified/conversion counts
- Basic invoice/payment totals
- Campaign source summary

### HRM Integration Concept

- Reuse users/employees/branches conceptually.
- CRM agents are employees.
- CRM follow-ups can later become HRM tasks.

## Exclude From MVP

- Connecting every existing WhatsApp number at once
- Full WhatsApp Cloud API production rollout across all numbers
- Meta Marketing API spend sync
- AI lead qualification
- AI chatbot
- Full AI chatbot
- Uncontrolled automated WhatsApp replies
- Full client portal
- Advanced commission engine
- Advanced university knowledge automation
- Complex permission matrix beyond core roles
- Drag-and-drop kanban
- Mobile app

## Exclude From Stage 1

- Full Meta spend sync
- Client portal
- Invoice system
- University database
- Commission/payroll integration
- Advanced reporting
- Case operations workflow
- Document checklist workflow
- AI counseling
- Using Gemini on every message
- Routing chats to employee personal numbers by default

## MVP Route Direction

Since the CRM will be a native module inside the existing EN HRM repository, we will reuse the existing dashboard, sidebar, authentication, and role systems.

The route strategy for the CRM module:

**User Routes (for Agents & Staff):**
- `/crm/leads`
- `/crm/leads/[id]`
- `/crm/cases`
- `/crm/cases/[id]`
- `/crm/campaigns`
- `/crm/invoices`
- `/crm/documents`
- `/crm/reports`

**Admin Routes (for Branch Managers & Super Admins):**
- `/admin/crm/settings`
- `/admin/crm/whatsapp-config`
- `/admin/crm/assignment-rules`

## MVP Definition Of Done

MVP is done when:

- Staff can enter/import WhatsApp-first leads.
- Leads can be categorized, assigned, followed up, and converted.
- Managers can see branch and agent performance.
- Cases can track documents and application progress.
- Invoices can be created and payments recorded.
- Campaign source is preserved enough for basic reporting.
- HRM integration points are documented and not blocked by duplicate models.
