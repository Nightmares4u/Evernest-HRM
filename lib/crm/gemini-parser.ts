import { geminiAsk, isGeminiConfigured } from "@/lib/ai/gemini";
import type { CrmRawStatus } from "@/lib/types/crm";

export type GeminiParserOutput = {
  is_relevant: boolean;
  confidence: number;
  country_interest: string | null;
  city: string | null;
  qualification: string | null;
  marks_or_cgpa: string | null;
  study_gap: string | null;
  budget_range: string | null;
  english_test: string | null;
  program_interest: string | null;
  intent_summary: string;
  missing_fields: string[];
  recommended_internal_note: string;
};

export type GeminiParserResult =
  | { ran: true; output: GeminiParserOutput; update: GeminiFallbackUpdate }
  | { ran: false; reason: string };

type GeminiFallbackUpdate = {
  status: CrmRawStatus;
  parser_confidence: number;
  extracted_country: string | null;
  extracted_city: string | null;
  extracted_qualification: string | null;
  extracted_marks_cgpa: string | null;
  extracted_study_gap: string | null;
  extracted_budget_range: string | null;
  extracted_english_test: string | null;
  missing_fields: string[];
};

const SYSTEM_PROMPT = `You are a lead-intake parser for EN Consultants, a Pakistan-based study-abroad consultancy.

You will receive a raw WhatsApp message from a prospective student or client. Extract structured lead details from the message.

You MUST respond with ONLY a valid JSON object matching this exact schema — no markdown, no explanation, no wrapping:

{
  "is_relevant": boolean,
  "confidence": number between 0.0 and 1.0,
  "country_interest": string or null,
  "city": string or null (Pakistani city of the sender),
  "qualification": string or null,
  "marks_or_cgpa": string or null,
  "study_gap": string or null,
  "budget_range": string or null,
  "english_test": string or null,
  "program_interest": string or null,
  "intent_summary": string (one sentence describing the sender's intent),
  "missing_fields": string[] (list of field names that could not be extracted),
  "recommended_internal_note": string (brief internal note for the counselor)
}

Rules:
- If the message is clearly spam, irrelevant, or not about study/visa/immigration, set is_relevant to false and confidence to 0.0.
- If the message is vague but possibly relevant, set is_relevant to true but confidence low (0.3-0.5).
- If the message contains clear study-abroad details, extract as many fields as possible and set confidence accordingly.
- All financial values must be interpreted as PKR unless explicitly stated otherwise.
- Do not invent data. If a field is not mentioned, set it to null and add it to missing_fields.
- Never suggest or draft any reply to the sender. Your job is extraction only.`;

function buildUserPrompt(messageText: string): string {
  return `Extract lead details from this WhatsApp message:\n\n${messageText}`;
}

function parseGeminiJson(text: string): GeminiParserOutput | null {
  // Gemini 2.5 Flash often wraps JSON in ```json fences despite instructions
  // not to. Extract the first balanced {...} block to survive code fences,
  // leading/trailing prose, or trailing truncation of the closing fence.
  let cleaned = text.trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  cleaned = cleaned.slice(start, end + 1);
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    if (typeof parsed.is_relevant !== "boolean") return null;
    if (typeof parsed.confidence !== "number") return null;
    if (typeof parsed.intent_summary !== "string") return null;
    if (!Array.isArray(parsed.missing_fields)) return null;

    return {
      is_relevant: parsed.is_relevant,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      country_interest: (parsed.country_interest as string) ?? null,
      city: (parsed.city as string) ?? null,
      qualification: (parsed.qualification as string) ?? null,
      marks_or_cgpa: (parsed.marks_or_cgpa as string) ?? null,
      study_gap: (parsed.study_gap as string) ?? null,
      budget_range: (parsed.budget_range as string) ?? null,
      english_test: (parsed.english_test as string) ?? null,
      program_interest: (parsed.program_interest as string) ?? null,
      intent_summary: parsed.intent_summary,
      missing_fields: parsed.missing_fields as string[],
      recommended_internal_note:
        (parsed.recommended_internal_note as string) ?? "",
    };
  } catch {
    return null;
  }
}

function toRawStatus(output: GeminiParserOutput): CrmRawStatus {
  // Quality only — ownership is assigned at receipt regardless of this.
  if (!output.is_relevant) return "spam_duplicate";
  const ready =
    output.confidence >= 0.8 && output.country_interest && output.city;
  return ready ? "ready_for_promotion" : "needs_enrichment";
}

function toUpdate(output: GeminiParserOutput): GeminiFallbackUpdate {
  return {
    status: toRawStatus(output),
    parser_confidence: Number(output.confidence.toFixed(2)),
    extracted_country: output.country_interest,
    extracted_city: output.city,
    extracted_qualification: output.qualification,
    extracted_marks_cgpa: output.marks_or_cgpa,
    extracted_study_gap: output.study_gap,
    extracted_budget_range: output.budget_range,
    extracted_english_test: output.english_test,
    missing_fields: output.missing_fields,
  };
}

export async function runGeminiParserFallback(
  messageText: string,
  rawInboxId: string
): Promise<GeminiParserResult> {
  if (!isGeminiConfigured()) {
    return { ran: false, reason: "GEMINI_API_KEY not configured" };
  }

  const result = await geminiAsk({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(messageText),
    maxOutputTokens: 1024,
    temperature: 0.1,
  });

  if (!result.ok) {
    console.error(
      `[gemini-parser] Failed for raw_inbox ${rawInboxId}:`,
      result.error
    );
    return { ran: false, reason: result.error };
  }

  const output = parseGeminiJson(result.text);
  if (!output) {
    console.error(
      `[gemini-parser] Invalid JSON for raw_inbox ${rawInboxId}:`,
      result.text.slice(0, 200)
    );
    return { ran: false, reason: "Gemini returned invalid JSON" };
  }

  return { ran: true, output, update: toUpdate(output) };
}
