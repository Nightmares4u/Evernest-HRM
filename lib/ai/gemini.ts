// Thin server-side Gemini REST client. No SDK dependency — we keep
// package.json clean and call generateContent directly.
//
// Env:
//   GEMINI_API_KEY  (required to make calls)
//   GEMINI_MODEL    (optional; defaults to gemini-2.5-flash)
//
// This module must never be imported from a client component.

const DEFAULT_MODEL = "gemini-2.5-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export type GeminiAskInput = {
  systemPrompt: string;
  userPrompt: string;
  // Hard-cap output tokens so a runaway answer can't blow up the page.
  maxOutputTokens?: number;
  temperature?: number;
};

export type GeminiAskResult =
  | { ok: true; text: string; model: string }
  | { ok: false; error: string };

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function geminiModelName(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

export async function geminiAsk(input: GeminiAskInput): Promise<GeminiAskResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "GEMINI_API_KEY is not configured." };
  }
  const model = geminiModelName();

  const body = {
    systemInstruction: {
      role: "system",
      parts: [{ text: input.systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: input.userPrompt }],
      },
    ],
    generationConfig: {
      temperature: input.temperature ?? 0.2,
      maxOutputTokens: input.maxOutputTokens ?? 1024,
    },
  };

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    return { ok: false, error: `Gemini request failed: ${(err as Error).message}` };
  }

  let parsed: GeminiResponse;
  try {
    parsed = (await res.json()) as GeminiResponse;
  } catch {
    return { ok: false, error: `Gemini response was not JSON (HTTP ${res.status}).` };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: parsed.error?.message ?? `Gemini HTTP ${res.status}`,
    };
  }
  if (parsed.promptFeedback?.blockReason) {
    return { ok: false, error: `Blocked by Gemini: ${parsed.promptFeedback.blockReason}` };
  }

  const text = parsed.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    return { ok: false, error: "Gemini returned no text." };
  }

  return { ok: true, text, model };
}
