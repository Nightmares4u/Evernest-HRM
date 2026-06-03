# CRM Stage 1 MVP Scope

> **Locked 2026-05-12.** See `STAGE_1_DECISIONS.md` for the
> authoritative answer list and `CODEX_STAGE_1_PACKET.md` for the
> build spec. Key corrections to this document:
> - **Gemini fallback is OUT of Stage 1.** Parser + manual review
>   queue only. Moves to Stage 1.5.
> - **WhatsApp send is OUT of Stage 1.** Webhook intake is real;
>   outbound send is mock/log-only. Real send moves to Stage 1.5.
> - **CRM Chat UI (agent reply from CRM) is OUT of Stage 1.** Stage
>   1 is read-only on the outbound side; agents reply manually via
>   WhatsApp outside CRM.
> - Mandatory fields before raw → lead promotion: country + city.
> - Confidence thresholds: ≥ 0.80 auto-promote, 0.50–0.79
>   needs_review, < 0.50 awaiting_details.

To ensure rapid delivery and prevent scope creep, Stage 1 focuses strictly on the **WhatsApp Intake -> Qualification -> Assignment -> Human Follow-up** pipeline. 

## ✅ IN SCOPE (Stage 1)

### 1. WhatsApp Gateway & Intake
*   Integration with Meta WhatsApp Cloud API (Webhooks).
*   Support for 2-3 specific WhatsApp numbers (mapped to specific campaigns/products).
*   **Raw Inbox:** A UI to view incoming chats that are not yet leads.
*   **Auto-Responder:** Send a structured greeting and questionnaire (7 key questions: Country, Qualification, CGPA, Gap, City, Budget, English) upon first contact.

### 2. Parsing & Qualification Engine
*   **Rule-Based Parser:** Cheap regex/logic to extract numbered answers from the user's reply.
*   **Gemini Fallback:** If the user replies with unstructured text (e.g., a long paragraph) or parser confidence is low, trigger Gemini 1.5 Flash to extract the 7 data points.
*   **Manual Review Queue:** If both parser and Gemini fail or return low confidence, flag the inbox thread for human intervention.

### 3. Lead Creation & Assignment
*   Automatic conversion from `Raw Inbox` to `Lead Shell` when data is confidently extracted.
*   **Rule-Based Assignment Engine:** Route leads based on WhatsApp Number used (e.g., Italy campaign -> Italy team), City (e.g., Lahore -> Lahore branch), or Product.
*   Manual reassignment capabilities for Branch Managers.

### 4. Agent Workspace
*   **Kanban Board:** Visual columns for `New`, `Contacted`, `Document Collection`, `Converted`, `Lost`.
*   **Lead Detail View:** Show extracted data points side-by-side with the chat.
*   **CRM Chat UI:** Agents can reply to the WhatsApp thread directly from within the CRM (using the company number).
*   **Activity Timeline:** Log status changes, assignments, and internal notes.

### 5. HRM Integration
*   Use existing `employees` table for agent authentication and assignment.
*   Use existing `branches` table for data segregation (RLS policies: Agents see own leads, Managers see branch leads).

---

## ❌ OUT OF SCOPE (Do NOT build in Stage 1)

*   **Full AI Chatbot:** The AI will ONLY parse the initial qualification reply. It will NOT hold a conversational back-and-forth with the client.
*   **Meta Ads Integration:** Syncing ad spend or campaign data directly from Facebook Manager.
*   **Client Portals:** External logins for students to check their status.
*   **Document Management & Invoicing:** Managing passports, SOPs, or generating fee invoices (this comes in Stage 2 / Case Management).
*   **Telephony (Twilio/Exotel):** Voice calling integrations.
*   **Email Campaigns:** Mass emailing or email parsing.
*   **Advanced Analytics:** Complex conversion rate charts or agent performance graphs (keep it to basic list counts for now).
