import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { geminiModelName, isGeminiConfigured } from "@/lib/ai/gemini";
import { loadCrmKnowledge } from "@/lib/ai/crm-knowledge";
import { askAssistantAction } from "./actions";
import { decodeAssistantState } from "./state";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Bot } from "lucide-react";

type Search = { state?: string };

const SAMPLE_QUESTIONS = [
  "How do I convert a lead to a client?",
  "Why can't I submit visa for my client?",
  "Where do I upload client documents?",
  "What does withdrawn_refunded mean?",
  "How do I record a client payment after conversion?",
  "Where is Admin Financials and what does it show?",
  "How do lead transfers work between counselors?",
];

export default async function CrmAssistantPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.appUser.is_active) {
    redirect("/dashboard?error=Active%20user%20required");
  }

  const sp = await searchParams;
  const state = decodeAssistantState(sp.state);
  const knowledge = await loadCrmKnowledge();
  const configured = isGeminiConfigured();
  const model = geminiModelName();

  const previousQuestion =
    state.kind === "answered" || state.kind === "error" ? state.question : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Assistant"
        description="Internal helper for EN staff. Answers from CRM planning docs only — no mutations, no guarantees."
        action={<StatusBadge label={model} tone="blue" />}
      />

      {!configured && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
          Assistant disabled: <code className="font-mono">GEMINI_API_KEY</code> is not set on the
          server. Add it to <code className="font-mono">.env</code> and restart the dev server.
        </div>
      )}

      {knowledge.missing.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
          Some CRM docs could not be loaded and are excluded from the assistant&apos;s context:{" "}
          {knowledge.missing.join(", ")}.
        </div>
      )}

      <SectionCard>
        <form action={askAssistantAction} className="space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Your question
          </label>
          <textarea
            name="question"
            rows={4}
            required
            maxLength={2000}
            defaultValue={previousQuestion}
            placeholder="e.g. How do I convert a lead to a client?"
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 shadow-sm"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              Context: {knowledge.sections.length} CRM doc
              {knowledge.sections.length === 1 ? "" : "s"} loaded
            </p>
            <button
              type="submit"
              disabled={!configured}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-300 transition-colors"
            >
              Ask assistant
            </button>
          </div>
        </form>
      </SectionCard>

      {state.kind === "error" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
          <p className="font-semibold">Could not get an answer.</p>
          <p className="mt-1">{state.error}</p>
        </div>
      )}

      {state.kind === "answered" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 text-sm text-gray-700 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Your question
            </p>
            <p className="mt-2 whitespace-pre-wrap text-gray-900">{state.question}</p>
          </div>
          <SectionCard>
            <div className="flex items-center gap-2 mb-4">
              <Bot className="h-5 w-5 text-blue-600" />
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Assistant ({state.model})
              </p>
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-900">
              {state.answer}
            </div>
            <div className="mt-6 border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-500">
                Generated from EN CRM planning docs. Verify anything that affects real client data
                against the UI before acting.
              </p>
            </div>
          </SectionCard>
        </div>
      )}

      <SectionCard title="Try a sample question">
        <ul className="mt-2 space-y-2 text-sm text-gray-700">
          {SAMPLE_QUESTIONS.map((q) => (
            <li key={q}>
              <form action={askAssistantAction}>
                <input type="hidden" name="question" value={q} />
                <button
                  type="submit"
                  disabled={!configured}
                  className="text-left text-blue-600 hover:text-blue-500 font-medium transition-colors disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  → {q}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
