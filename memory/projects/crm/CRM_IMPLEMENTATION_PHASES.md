# CRM Implementation Phases

This document outlines the step-by-step execution plan for building the integrated EN CRM.

## Phase 1: Foundation & Data Model (Week 1)
**Goal:** Prepare the database and project structure.
1.  **Architecture Setup:** Create `/crm` routing groups in the Next.js app (`/app/(crm)/...`).
2.  **Supabase Migrations:** Write and execute migrations for:
    *   `crm_whatsapp_numbers`
    *   `crm_raw_inbox` & `crm_raw_messages`
    *   `crm_leads`
    *   `crm_assignment_rules`
3.  **RLS Policies:** Implement Row Level Security tying CRM tables to HRM `employees` and `branches`.
4.  **UI Scaffolding:** Set up Shadcn-based layouts for the CRM Dashboard and Kanban board (referencing Atomic CRM styles).

## Phase 2: The WhatsApp Gateway (Week 2)
**Goal:** Ingest messages and run the automated qualification flow.
1.  **Meta API Setup:** Configure a Meta App and generate tokens.
2.  **Edge Functions:** Deploy a Supabase Edge Function to handle incoming WhatsApp Webhooks securely and rapidly.
3.  **Ingestion Logic:** Map incoming messages to `crm_raw_inbox` and `crm_raw_messages`.
4.  **Auto-Responder:** Implement logic to send the 7-question qualification template to new numbers.
5.  **Parser Engine:** 
    *   Build the Rule-based/Regex extraction utility.
    *   Integrate Gemini 1.5 Flash API as the fallback mechanism for messy data.
    *   Update `crm_raw_inbox.extracted_data` with results.

## Phase 3: Routing & The CRM Core (Week 3)
**Goal:** Turn raw data into assigned leads.
1.  **Lead Generation:** Script the promotion of a `crm_raw_inbox` record to a `crm_leads` record upon successful parsing.
2.  **Assignment Engine:** Build the logic (Server Action) that evaluates `crm_assignment_rules` against the extracted data and assigns the `hrm_employee_id`.
3.  **Raw Inbox UI:** Build the admin view for the "Manual Review Queue" (unparsed or low-confidence messages).
4.  **Agent Kanban Board:** Implement the drag-and-drop board for agents to view their assigned `crm_leads`.

## Phase 4: Agent Workflow & Communication (Week 4)
**Goal:** Allow agents to work the leads.
1.  **Lead Detail View:** Create the split-screen UI (Left: Extracted Data & Lead Status | Right: WhatsApp Chat Interface).
2.  **Outbound Messaging:** Create the Server Action to send messages back to the client via WhatsApp API from the CRM UI.
3.  **Activity Timeline:** Implement the PostgreSQL View for `activity_log` (notes, status changes, assignments) and build the React component to display it chronologically.

## Phase 5: Testing, Refinement & Go-Live (Week 5)
**Goal:** Polish and transition.
1.  **Lead-to-Case Conversion:** Implement the button that marks a lead as `Converted` and triggers the creation of an active client profile in the HRM system.
2.  **UAT (User Acceptance Testing):** Test with 1 test WhatsApp number and a small internal team.
3.  **Refinement:** Adjust parser accuracy and Gemini prompts based on real-world Pakistani message patterns (Urdu/Roman Urdu/English mix).
4.  **Rollout:** Connect the first high-value production WhatsApp number (e.g., Italy Campaign).
