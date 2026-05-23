# Product Requirements

## 1. Lead Capture

The CRM must support WhatsApp-first lead capture.

Required capabilities:

- Capture leads manually.
- Import leads from CSV if needed.
- Scaffold WhatsApp inbox ingestion before full WhatsApp API implementation.
- Store WhatsApp number used by the campaign.
- Store source campaign mapping where known.
- Store first message, timestamp, phone number, and name where available.
- Support unknown or incomplete attribution and allow later correction.

Future capabilities:

- Meta WhatsApp Cloud API webhook ingestion.
- BSP-based WhatsApp Business API support if needed.
- Meta Marketing API campaign spend sync.
- Automated duplicate detection and merge suggestions.

## 2. Lead Categorization

Each lead should be categorized by:

- Product or country interest
- City or branch
- Campaign source
- WhatsApp number
- Quality
- Urgency
- Budget
- Academic profile
- Study, work, immigration, or B2B intent
- B2C or B2B

## 3. Lead Statuses

Initial status model:

- `new`
- `unassigned`
- `assigned`
- `contacted`
- `interested`
- `qualified`
- `not_qualified`
- `follow_up`
- `appointment_booked`
- `documents_pending`
- `invoice_sent`
- `payment_pending`
- `paid_active_case`
- `application_in_progress`
- `submitted`
- `decision_received`
- `visa_approved`
- `visa_refused`
- `lost_dead`
- `duplicate_spam`

The final implementation may split these into separate lifecycle concepts:

- Lead stage
- Sales status
- Case status
- Visa decision status

This should be decided during data model finalization.

## 4. Lead Assignment

The CRM must support both rule-based and manual assignment.

Assignment factors:

- Branch
- Campaign
- WhatsApp number
- Product
- Workload
- Agent availability
- Branch ownership
- Lead source
- Priority

Examples:

- Punjab-focused leads should route to Lahore where appropriate.
- Karachi handles senior management, B2B, closings, and core operations.
- High-priority or B2B leads may route to senior staff.

The system must preserve assignment history.

## 5. Agent Dashboard

Each agent should see:

- Assigned leads
- Today follow-ups
- Overdue follow-ups
- Hot leads
- Documents pending
- Invoices pending
- Conversions
- Personal KPIs

## 6. Client and Case Dashboard

Each client or lead profile should show:

- Name
- Phone and WhatsApp
- Email
- City
- Source
- Assigned agent
- Branch
- Product or country
- Stage and status
- Notes
- Follow-up history
- Activity timeline
- Document checklist
- Invoice and payment history
- Application progress
- University applications
- Visa status

## 7. Client Portal

The portal should eventually allow clients to:

- Upload documents.
- View required checklist.
- See current progress.
- View invoices.
- Receive payment instructions.

MVP should start with internal upload only unless the user explicitly expands scope.

## 8. Document Management

Each case should support document checklists based on:

- Country
- University or product
- Visa type
- Client profile

Document statuses:

- `required`
- `uploaded`
- `verified`
- `rejected`
- `missing`
- `needs_replacement`

Files should be stored in Supabase Storage or S3-compatible storage, not inside the database.

## 9. Invoice and Payment System

Invoices should be generated from the client/case dashboard.

Invoice fields:

- Client
- Case
- Product
- Service fee
- Application fee if any
- Installment plan
- Due dates
- Paid/unpaid status
- Discounts
- Notes

Payments should be recorded and linked to:

- Invoice
- Client or case
- Branch
- Agent
- Payment date
- Payment method
- Future commission rules

## 10. Product and University Knowledge Base

The CRM should eventually maintain country-wise and product-wise data.

Knowledge base filters:

- Country
- City
- University
- Program
- Eligibility
- Intake
- Fees
- Scholarship
- IELTS/MOI
- Gap accepted
- Application deadline
- Visa requirements
- Internal commission or profit info

Internal notes must be separated from client-facing information.

## 11. Analytics

The CRM should support:

- Applications by country
- Applications by university
- Approvals by country
- Approvals by university
- Conversion ratio
- Visa approval/refusal ratio
- Revenue by country/product
- Branch performance
- Agent performance
- Campaign ROI

