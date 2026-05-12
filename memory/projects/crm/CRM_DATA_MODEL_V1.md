# CRM Data Model (V1)

This document outlines the proposed Supabase (PostgreSQL) schema for Stage 1 of the EN CRM. It is designed to integrate natively with the existing HRM tables.

## 1. HRM Linkage (Existing Tables)
*   `employees` (id, user_id, branch_id, role, status)
*   `branches` (id, name, city)

## 2. Infrastructure & Meta Layer
Tables mapping the outside world to internal routing.

### `crm_whatsapp_numbers`
*   `id` (uuid, pk)
*   `phone_number_id` (string, Meta API ID)
*   `display_number` (string)
*   `campaign_name` (string) - e.g., "Italy Study Visa Ads"
*   `default_branch_id` (fk -> branches.id)
*   `default_product_category` (string) - e.g., "Italy", "B2B"

## 3. The "Raw" Layer (Intake & Parsing)
Handles messages before they are qualified leads.

### `crm_raw_inbox`
*   `id` (uuid, pk)
*   `wa_number_id` (fk -> crm_whatsapp_numbers.id)
*   `sender_phone` (string)
*   `sender_name` (string, from WA profile)
*   `status` (enum: `pending_reply`, `parsing`, `needs_manual_review`, `converted_to_lead`, `ignored`)
*   `confidence_score` (int, 0-100, populated by parser/Gemini)
*   `extracted_data` (jsonb) - Temporary holding for parsed fields before lead creation.
*   `created_at` (timestamp)

### `crm_raw_messages`
*   `id` (uuid, pk)
*   `inbox_id` (fk -> crm_raw_inbox.id)
*   `direction` (enum: `inbound`, `outbound`)
*   `content` (text)
*   `wa_message_id` (string, for deduplication/status updates)
*   `created_at` (timestamp)

## 4. The CRM Core (Qualified Leads)
Adapted from the Study-Abroad CRM schema.

### `crm_leads`
*   `id` (uuid, pk)
*   `raw_inbox_id` (fk -> crm_raw_inbox.id, unique) - Links back to the original chat.
*   `assigned_agent_id` (fk -> employees.id, nullable)
*   `branch_id` (fk -> branches.id)
*   `status` (enum: `new`, `contacted`, `document_collection`, `converted`, `lost`)
*   **Domain Fields (Study Abroad):**
    *   `interested_country` (string)
    *   `last_qualification` (string)
    *   `marks_cgpa` (string)
    *   `study_gap_years` (int)
    *   `city` (string)
    *   `budget_range` (string)
    *   `english_test_status` (string)
*   `created_at` (timestamp)
*   `updated_at` (timestamp)

## 5. Workflow & Rules Layer

### `crm_assignment_rules`
*   `id` (uuid, pk)
*   `priority` (int) - Order of rule execution.
*   `criteria` (jsonb) - e.g., `{"city": "Lahore", "country": "Italy"}`
*   `action_type` (enum: `assign_to_agent`, `assign_to_branch`, `flag_for_manager`)
*   `action_target_id` (uuid) - Maps to employee_id or branch_id.

### `crm_activity_log` (Inspired by Atomic CRM View)
*This will likely be a PostgreSQL View rather than a base table, aggregating data for the timeline.*
*   `id` (string, virtual)
*   `lead_id` (fk -> crm_leads.id)
*   `type` (enum: `note`, `status_change`, `assignment`, `wa_message`)
*   `agent_id` (fk -> employees.id)
*   `payload` (jsonb) - Holds note text, or before/after status.
*   `created_at` (timestamp)

## 6. Lead to Case (Future Expansion)
When a lead is `converted`, a record is inserted into `hrm_clients` and `hrm_tasks` are generated. The `crm_leads` record becomes read-only history.
