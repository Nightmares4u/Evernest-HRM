import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { geminiModelName, isGeminiConfigured } from "@/lib/ai/gemini";
import { loadCrmKnowledge } from "@/lib/ai/crm-knowledge";
import { askAssistantAction } from "./actions";
import { decodeAssistantState } from "./state";

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
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">CRM Assistant</h1>
        <p className="text-sm text-gray-500">
          Internal helper for EN staff. Ask anything about CRM/HRM workflows, statuses, routes,
          and policies. It answers from the EN CRM planning docs only — no client actions, no
          mutations, no legal/visa guarantees.
        </p>
      </header>

      {!configured && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Assistant disabled: <code className="font-mono">GEMINI_API_KEY</code> is not set on the
          server. Add it to <code className="font-mono">.env</code> and restart the dev server.
        </div>
      )}

      {knowledge.missing.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Some CRM docs could not be loaded and are excluded from the assistant&apos;s context:{" "}
          {knowledge.missing.join(", ")}.
        </div>
      )}

      <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
        <form action={askAssistantAction} className="space-y-3">
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
            Your question
          </label>
          <textarea
            name="question"
            rows={4}
            required
            maxLength={2000}
            defaultValue={previousQuestion}
            placeholder="e.g. How do I convert a lead to a client?"
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              Model: <span className="font-mono">{model}</span> · Context:{" "}
              {knowledge.sections.length} CRM doc
              {knowledge.sections.length === 1 ? "" : "s"} loaded
            </p>
            <button
              type="submit"
              disabled={!configured}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              Ask assistant
            </button>
          </div>
        </form>
      </section>

      {state.kind === "error" && (
        <section className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Could not get an answer.</p>
          <p className="mt-1">{state.error}</p>
        </section>
      )}

      {state.kind === "answered" && (
        <section className="space-y-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Your question
            </p>
            <p className="mt-1 whitespace-pre-wrap">{state.question}</p>
          </div>
          <article className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Assistant ({state.model})
            </p>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-900">
              {state.answer}
            </div>
            <p className="mt-4 text-xs text-gray-500">
              Generated from EN CRM planning docs. Verify anything that affects real client data
              against the UI before acting.
            </p>
          </article>
        </section>
      )}

      <section className="rounded-lg border border-dashed border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-700">Try a sample question</h2>
        <ul className="mt-3 space-y-2 text-sm text-gray-700">
          {SAMPLE_QUESTIONS.map((q) => (
            <li key={q}>
              <form action={askAssistantAction}>
                <input type="hidden" name="question" value={q} />
                <button
                  type="submit"
                  disabled={!configured}
                  className="text-left text-indigo-600 hover:text-indigo-500 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  → {q}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
