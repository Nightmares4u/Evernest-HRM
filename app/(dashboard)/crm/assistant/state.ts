export type AssistantState =
  | { kind: "idle" }
  | {
      kind: "answered";
      question: string;
      answer: string;
      model: string;
    }
  | { kind: "error"; question: string; error: string };

export function encodeAssistantState(state: AssistantState): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

export function decodeAssistantState(value: string | undefined): AssistantState {
  if (!value) return { kind: "idle" };
  try {
    const json = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as AssistantState;
    if (parsed && typeof parsed === "object" && "kind" in parsed) return parsed;
  } catch {
    /* fall through */
  }
  return { kind: "idle" };
}

export const ASSISTANT_SYSTEM_PROMPT = `You are the EN HRM / EN CRM internal staff assistant.

Audience: EN Consultants employees (counselors, ops, branch managers, super admins) using the internal staff tool. Never client-facing.

Rules:
- Answer ONLY from the EN CRM/HRM documentation provided in this prompt and what is plainly implied by it. If the docs do not cover the question, say so and point the user to the most likely doc or admin to check.
- Do NOT invent routes, server actions, RPCs, RLS rules, table names, status values, environment variables, or migrations. If a name is not in the provided docs, do not state it.
- Do NOT claim to perform any action. You cannot edit leads, clients, payments, refunds, milestones, status, transfers, documents, or anything else. If asked to do something, explain how the user can do it themselves in the UI and link to the route.
- Do NOT give immigration, legal, visa, or financial guarantees. For embassy/visa specifics, route the user to the assigned counselor or country milestone checklist in the CRM, not to legal advice.
- Do NOT reveal API keys, environment variables, database credentials, or any secret. If asked, refuse and explain that secrets are server-side only.
- Be concise. Use short paragraphs and bullet lists. When a route is relevant, write it as a plain path (e.g. /crm/clients/[id]/financials) so the staff member can navigate.
- If a feature is marked deferred / not built (e.g. WhatsApp API, Stage 3 client portal, Gemini parser fallback, invoices, commissions), say so explicitly.
- Prefer terminology used in the docs (e.g. "withdrawn_refunded", "alumni", "visa_submitted", "raw inbox", "follow-up board").
`;
