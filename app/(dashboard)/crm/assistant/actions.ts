"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  formatKnowledgeForPrompt,
  loadCrmKnowledge,
} from "@/lib/ai/crm-knowledge";
import { geminiAsk, geminiModelName, isGeminiConfigured } from "@/lib/ai/gemini";
import { ASSISTANT_SYSTEM_PROMPT, encodeAssistantState } from "./state";

const QUESTION_CHAR_LIMIT = 2000;

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function redirectWithState(
  payload: Parameters<typeof encodeAssistantState>[0]
): never {
  redirect(`/crm/assistant?state=${encodeAssistantState(payload)}`);
}

export async function askAssistantAction(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.appUser.is_active) {
    redirect("/dashboard?error=Active%20user%20required");
  }

  const question = readString(formData, "question");
  if (!question) {
    redirectWithState({ kind: "error", question: "", error: "Please enter a question." });
  }
  if (question.length > QUESTION_CHAR_LIMIT) {
    redirectWithState({
      kind: "error",
      question,
      error: `Question is too long (${QUESTION_CHAR_LIMIT} character limit).`,
    });
  }

  if (!isGeminiConfigured()) {
    redirectWithState({
      kind: "error",
      question,
      error: "Assistant is not configured: GEMINI_API_KEY is missing on the server.",
    });
  }

  const knowledge = await loadCrmKnowledge();
  const docsBlock = formatKnowledgeForPrompt(knowledge);

  const userPrompt = `EN staff member asks:\n${question}\n\nReference documentation (authoritative — base your answer on this):\n${docsBlock}\n\nIf the question is not addressed by the docs above, say so and suggest where to look (a specific doc filename, an admin route, or a person to ask).`;

  const result = await geminiAsk({
    systemPrompt: ASSISTANT_SYSTEM_PROMPT,
    userPrompt,
    maxOutputTokens: 1024,
    temperature: 0.2,
  });

  if (!result.ok) {
    redirectWithState({ kind: "error", question, error: result.error });
  }

  redirectWithState({
    kind: "answered",
    question,
    answer: result.text,
    model: result.model ?? geminiModelName(),
  });
}
