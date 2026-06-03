# Conceptual Data Model

## Data Model Principle

The CRM is relational, reporting-heavy, and audit-heavy. Postgres/Supabase is the preferred default.

Avoid duplicating HRM employee and branch data where possible. CRM should reference shared users, employees, branches, and roles from the broader EN platform.

## Core Entities

### Shared Platform Entities

These should ideally come from the existing HRM/platform foundation:

- `app_users`
- `employees`
- `roles`
- `branches`
- `departments`
- `tasks`

### CRM Entities

Core CRM-owned entities:

- `crm_whatsapp_numbers`
- `crm_campaign_sources`
- `crm_raw_inbox`
- `crm_leads`
- `crm_lead_contacts`
- `crm_lead_sources`
- `crm_campaigns`
- `crm_campaign_spend`
- `crm_whatsapp_messages`
- `crm_lead_messages`
- `crm_assignments`
- `crm_lead_assignments`
- `crm_assignment_rules`
- `crm_activities`
- `crm_lead_activities`
- `crm_follow_ups`
- `crm_cases`
- `crm_case_stages`
- `crm_documents`
- `crm_document_requirements`
- `crm_invoices`
- `crm_invoice_items`
- `crm_payments`
- `crm_products`
- `crm_countries`
- `crm_universities`
- `crm_programs`
- `crm_applications`
- `crm_audit_events`
- `crm_audit_flags`

## Stage 1 Intake Model

Stage 1 separates raw WhatsApp intake from CRM leads and converted client/cases.

Important distinction:

- Raw WhatsApp intake: every inbound WhatsApp conversation or lead-like message.
- CRM lead: a structured sales opportunity with enough usable information to track and assign.
- Client/case: a converted client engagement after payment, onboarding, or management-defined conversion.

### WhatsApp Number

`crm_whatsapp_numbers` should represent every company or campaign WhatsApp number used by EN.

Conceptual fields:

- `id`
- `phone_number`
- `display_name`
- `label`
- `provider`
- `provider_phone_number_id`
- `branch_id`
- `default_product_id`
- `default_campaign_source_id`
- `default_assignment_rule_id`
- `is_api_connected`
- `is_active`
- `notes`

Stage 1 should connect only 2-3 high-value numbers first.

### Campaign Source

`crm_campaign_sources` should map Meta/campaign/product context to intake behavior.

Conceptual fields:

- `id`
- `name`
- `platform`
- `campaign_label`
- `meta_campaign_id`
- `meta_ad_set_id`
- `meta_ad_id`
- `product_id`
- `country_interest`
- `branch_id`
- `whatsapp_number_id`
- `source_type`
- `status`
- `start_date`
- `end_date`
- `notes`

In Stage 1, these mappings can be created manually. Meta spend sync is later.

### Raw Inbox

`crm_raw_inbox` stores inbound WhatsApp intake before the item is treated as a qualified CRM lead.

Conceptual fields:

- `id`
- `customer_phone`
- `customer_name`
- `whatsapp_number_id`
- `campaign_source_id`
- `source_channel`
- `first_message_text`
- `last_message_text`
- `raw_payload`
- `status`
- `parser_status`
- `parser_confidence`
- `extracted_country_interest`
- `extracted_qualification`
- `extracted_marks_cgpa`
- `extracted_study_gap`
- `extracted_city`
- `extracted_budget_range`
- `extracted_english_test`
- `missing_fields`
- `lead_id`
- `duplicate_of_lead_id`
- `assigned_branch_id`
- `assigned_employee_id`
- `created_at`
- `updated_at`
- `last_message_at`

Suggested statuses:

- `raw_new`
- `awaiting_details`
- `details_received`
- `needs_review`
- `qualified`
- `spam_duplicate`

### Lead Message

`crm_lead_messages` stores message history linked to raw inbox items and, when available, structured leads.

Conceptual fields:

- `id`
- `raw_inbox_id`
- `lead_id`
- `whatsapp_number_id`
- `external_message_id`
- `direction`
- `from_phone`
- `to_phone`
- `message_type`
- `message_text`
- `raw_payload`
- `sent_by_employee_id`
- `received_at`
- `created_at`

### Lead Assignment

`crm_lead_assignments` preserves lead ownership history.

Conceptual fields:

- `id`
- `lead_id`
- `raw_inbox_id`
- `from_employee_id`
- `to_employee_id`
- `from_branch_id`
- `to_branch_id`
- `assigned_by_employee_id`
- `assignment_method`
- `matched_rule_id`
- `reason`
- `created_at`

Assignment methods:

- `auto_rule`
- `manual`
- `manager_override`
- `review_queue`

### Assignment Rule

`crm_assignment_rules` stores rule-based routing logic.

Conceptual fields:

- `id`
- `name`
- `priority`
- `whatsapp_number_id`
- `campaign_source_id`
- `country_interest`
- `city_region`
- `lead_type`
- `min_budget`
- `branch_id`
- `employee_id`
- `queue_name`
- `is_active`
- `reason_template`
- `created_at`
- `updated_at`

Rules should be simple and auditable before any AI-based assignment.

### Lead Activity

`crm_lead_activities` stores the operational timeline for raw intake and CRM leads.

Conceptual fields:

- `id`
- `raw_inbox_id`
- `lead_id`
- `activity_type`
- `employee_id`
- `description`
- `metadata`
- `created_at`

Stage 1 activity types:

- `raw_message_received`
- `auto_greeting_sent`
- `details_received`
- `parser_succeeded`
- `parser_low_confidence`
- `sent_to_review`
- `lead_shell_created`
- `assigned`
- `reassigned`
- `human_follow_up_started`

## Lead

`crm_leads` should represent a prospective client before or during sales qualification.

Conceptual fields:

- `id`
- `full_name`
- `phone`
- `whatsapp_phone`
- `email`
- `city`
- `branch_id`
- `assigned_employee_id`
- `source_id`
- `campaign_id`
- `whatsapp_number_id`
- `product_id`
- `country_interest`
- `lead_type`
- `quality`
- `urgency`
- `budget_range`
- `academic_profile_summary`
- `status`
- `created_at`
- `updated_at`
- `converted_case_id`

Stage 1 lead-specific additions:

- `raw_inbox_id`
- `intake_status`
- `qualification`
- `marks_cgpa`
- `study_gap`
- `english_test_status`
- `source_whatsapp_number_id`
- `assignment_status`

## Lead Source

`crm_lead_sources` should normalize source attribution.

Examples:

- Meta WhatsApp ad
- Organic WhatsApp
- Referral
- Walk-in
- Partner/B2B
- Website form
- Imported CSV
- Manual entry

## Campaign

`crm_campaigns` should represent marketing campaigns.

Conceptual fields:

- `id`
- `name`
- `platform`
- `meta_campaign_id`
- `meta_ad_set_id`
- `meta_ad_id`
- `product_id`
- `country_interest`
- `branch_id`
- `whatsapp_number_id`
- `start_date`
- `end_date`
- `status`
- `notes`

Note: `crm_campaign_sources` can be the Stage 1 lightweight version. `crm_campaigns` and `crm_campaign_spend` can become richer later when Meta Marketing API or CSV campaign spend import is added.

## Legacy WhatsApp Message Model

`crm_whatsapp_messages` may be used as a provider-level raw message/event table, while `crm_lead_messages` should be the lead-facing conversation history.

Conceptual fields:

- `id`
- `whatsapp_number_id`
- `lead_id`
- `case_id`
- `external_message_id`
- `direction`
- `from_phone`
- `to_phone`
- `message_type`
- `message_text`
- `raw_payload`
- `received_at`

## Assignment

`crm_assignments` should preserve ownership history.

Conceptual fields:

- `id`
- `lead_id`
- `case_id`
- `from_employee_id`
- `to_employee_id`
- `assigned_by_employee_id`
- `branch_id`
- `reason`
- `created_at`

## Activity

`crm_activities` should preserve the timeline of important actions.

Activity types:

- `lead_created`
- `assigned`
- `status_changed`
- `note_added`
- `call_done`
- `whatsapp_message`
- `follow_up_scheduled`
- `follow_up_completed`
- `appointment_booked`
- `invoice_sent`
- `payment_recorded`
- `case_created`
- `document_uploaded`
- `document_verified`
- `application_submitted`
- `decision_received`

## Case

`crm_cases` should represent an active client engagement after conversion/payment or formal onboarding.

Conceptual fields:

- `id`
- `lead_id`
- `client_name`
- `branch_id`
- `primary_employee_id`
- `operations_employee_id`
- `product_id`
- `country_id`
- `case_type`
- `case_status`
- `opened_at`
- `closed_at`
- `visa_decision`
- `notes`

## Documents

Files should live in Supabase Storage or S3-compatible storage. Database rows should store metadata and status only.

Document fields:

- `id`
- `case_id`
- `document_requirement_id`
- `file_path`
- `file_name`
- `status`
- `uploaded_by_user_id`
- `verified_by_employee_id`
- `uploaded_at`
- `verified_at`
- `rejection_reason`

## Invoices and Payments

Invoices:

- `id`
- `case_id`
- `lead_id`
- `invoice_number`
- `status`
- `currency`
- `subtotal`
- `discount`
- `total`
- `due_date`
- `notes`

Payments:

- `id`
- `invoice_id`
- `case_id`
- `amount`
- `currency`
- `payment_method`
- `received_by_employee_id`
- `payment_date`
- `reference`
- `notes`

## Knowledge Base

Product and university entities should support filtering and reporting:

- Countries
- Products
- Universities
- Programs
- Intakes
- Eligibility rules
- Visa requirements
- Internal commercial notes

## Audit Design

Audit should be append-friendly.

Use:

- Activity timeline for user-visible operational history.
- Audit events for sensitive backend changes.
- Audit flags for active discrepancies and exceptions.

Examples:

- Duplicate phone
- Stale lead
- No follow-up
- Unassigned high-priority lead
- Payment without invoice
- Case active without required documents
- Walk-in without appointment
- Invoice sent but no follow-up
