# CRM Architecture Decision Record

> **Stage 1 note (2026-05-12):** Stage 1 decisions are locked in
> `STAGE_1_DECISIONS.md`. Where this file conflicts with that one,
> the locked decisions win. Key corrections applied below:
> - HRM tables are unprefixed (`employees`, `branches`,
>   `app_users`) — there is no `hrm_employees` or `hrm_clients`
>   table in the repo.
> - `user_role` values in this repo are `super_admin | admin_hr |
>   branch_manager | assistant_manager | manager | employee |
>   team_member`. Stage 1 does not add new roles.
> - Vercel function timeout is 300s by default with Fluid Compute;
>   the older 10–15s claim below is outdated.
> - Gemini fallback is **not** in Stage 1 (deferred to Stage 1.5).
> - Stage 1 WhatsApp send path is read-only / mock send.

## 1. Context and Goal
EN Consultants requires a CRM to manage study visa, immigration, and B2B leads. Previous generic CRMs failed because they assumed a Western, form-first, email-centric funnel. The reality of the Pakistani market is **WhatsApp-first**. The CRM must act as a control tower for WhatsApp communications, handling raw intake, automated structured qualification, and intelligent routing before a human agent takes over.

## 2. Core Decision: Integrated Module (Not a Standalone Fork)
**Decision:** The CRM will be built as a native module inside the existing EN HRM repository. 
**Why:**
- Avoids duplicated databases for `employees`, `branches`, and `roles`.
- Ensures seamless transition from Lead -> Active Client -> Task Management (already handled by HRM).
- Simplifies DevOps (single Vercel deployment, single Supabase instance).

## 3. Reference Architecture
We are adopting a "Best of Breed" reference model without directly copying incompatible tech stacks.

*   **Atomic CRM (Primary Tech/UI Reference):** We will emulate its architecture. Next.js App Router + Supabase + Shadcn UI. We will heavily reference its `activity_log` Postgres View for the timeline and its RLS (Row Level Security) patterns.
*   **Study-Abroad-and-Education-Consultant-CRM (Domain Schema Reference):** We will adopt its specific data fields (CGPA, Study Gap, Country Interest, Visa Milestones) into our Supabase schema.
*   **Krayin & Frappe CRM (Logic Reference):** We will reference their assignment engines and pipeline transition logic, translating their PHP/Python concepts into Supabase Edge Functions and Next.js Server Actions.

## 4. Architectural Paradigms

### A. The "WhatsApp Front Desk"
- **Raw Inbox First:** A WhatsApp message does NOT immediately create a Lead. It enters a `Raw Inbox`.
- **Structured Qualification:** An automated greeting prompts the user for 7 specific data points.
- **Dumb Parser + AI Fallback:** Edge functions will use cheap Regex/Rule-based parsing to extract structured data. Gemini 1.5 Flash is invoked ONLY as a fallback for low-confidence or messy replies.

### B. The "Control Tower" (Routing)
- Multiple WhatsApp numbers (e.g., Italy Campaign, B2B Campaign) map to specific internal routing rules.
- Assignment Rules check the incoming number, parsed city, and parsed product interest to assign the Lead to a specific Branch and Agent.

### C. HRM Integration
- **Agents are Employees:** `crm_leads.assigned_to` links directly to `hrm_employees.id`.
- **Branch Scoping:** Leads are scoped to branches. A Lahore branch manager only sees Lahore leads (enforced via Supabase RLS based on HRM branch data).
- **Lead to Case Conversion:** When a lead converts (pays/signs), the "Lead Shell" is closed, and an "Active Case" (Client + Tasks) is generated in the HRM domain.

## 5. Technology Stack
*   **Frontend:** Next.js (App Router), React, Tailwind CSS, Shadcn UI.
*   **Backend / API:** Next.js Server Actions.
*   **Database & Auth:** Supabase (PostgreSQL, Supabase Auth).
*   **Webhooks & Processing Strategy:**
    We must decide between Next.js API Routes and Supabase Edge Functions for handling Meta WhatsApp webhooks.
    
    **Option A: Next.js API Routes (Server Actions / Route Handlers)**
    *   *Pros:* Simplest MVP path. Code lives directly alongside the frontend and uses the same environment variables and utilities. Easy to deploy via Vercel.
    *   *Cons:* Vercel Serverless Functions have execution timeouts (e.g., 10s-15s on free/hobby tiers, 60s pro), which might interrupt slow LLM fallback (Gemini) calls. Cold starts can cause Meta to retry webhooks if the response exceeds timeout limits.
    
    **Option B: Supabase Edge Functions**
    *   *Pros:* No cold starts. Better suited for high-volume webhook ingestion. Typically faster since they run on V8 isolates globally distributed.
    *   *Cons:* Adds deployment complexity (separate CLI deployments). Harder to share complex TypeScript types or utilities from the Next.js app without monorepo setups.

    **Recommendation for MVP:** Use **Next.js API Route Handlers** for the simplest path to testing. If Meta webhook retries become an issue due to slow Gemini API fallback or Vercel cold starts, we will migrate the webhook ingestion to Supabase Edge Functions.
*   **LLM Fallback:** Google Gemini API.
