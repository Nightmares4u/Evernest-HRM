import type {
  CrmActivityType,
  CrmJsonObject,
  CrmParserSettings,
  CrmRawStatus,
} from "@/lib/types/crm";
import { parseSevenQuestionReply, type ParsedLeadDetails } from "@/lib/crm/parser";

export const DEFAULT_CRM_PARSER_SETTINGS: CrmParserSettings = {
  auto_promote: 0.8,
  needs_review: 0.5,
};

export type ParsedRawInboxUpdate = {
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

export type ParsedRawIntakePayload = {
  parsed: ParsedLeadDetails;
  rawUpdate: ParsedRawInboxUpdate;
};

// Quality classification for a raw intake row. Ownership is decided
// separately at receipt — this ONLY decides whether a row is ready to
// qualify, needs enrichment, or is spam. It never decides who owns the row.
export function classifyRawIntake(
  input: {
    parser_confidence: number | null;
    extracted_country: string | null;
    extracted_city: string | null;
    is_relevant?: boolean;
  },
  settings: CrmParserSettings = DEFAULT_CRM_PARSER_SETTINGS
): CrmRawStatus {
  if (input.is_relevant === false) return "spam_duplicate";
  const ready =
    input.parser_confidence != null &&
    input.parser_confidence >= settings.auto_promote &&
    input.extracted_country &&
    input.extracted_city;
  return ready ? "ready_for_promotion" : "needs_enrichment";
}

export function parseRawIntakePayload(
  messageText: string | null | undefined,
  settings: CrmParserSettings = DEFAULT_CRM_PARSER_SETTINGS
): ParsedRawIntakePayload {
  const parsed = parseSevenQuestionReply(messageText);
  const status = classifyRawIntake(
    {
      parser_confidence: parsed.confidence,
      extracted_country: parsed.country_interest,
      extracted_city: parsed.city,
    },
    settings
  );
  return {
    parsed,
    rawUpdate: {
      status,
      parser_confidence: parsed.confidence,
      extracted_country: parsed.country_interest,
      extracted_city: parsed.city,
      extracted_qualification: parsed.qualification,
      extracted_marks_cgpa: parsed.marks_or_cgpa,
      extracted_study_gap: parsed.study_gap,
      extracted_budget_range: parsed.budget_range,
      extracted_english_test: parsed.english_test,
      missing_fields: parsed.missing_fields,
    },
  };
}

export function parserActivityType(
  confidence: number,
  settings: CrmParserSettings = DEFAULT_CRM_PARSER_SETTINGS
): CrmActivityType {
  return confidence >= settings.auto_promote
    ? "parser_succeeded"
    : "parser_low_confidence";
}

export function parserActivityPayload(parsed: ParsedLeadDetails): CrmJsonObject {
  return {
    parser: "structured_7_question_reply",
    parsed_fields: {
      country_interest: parsed.country_interest,
      qualification: parsed.qualification,
      marks_or_cgpa: parsed.marks_or_cgpa,
      study_gap: parsed.study_gap,
      city: parsed.city,
      budget_range: parsed.budget_range,
      english_test: parsed.english_test,
    },
    missing_fields: parsed.missing_fields,
  };
}

export function isRawIntakeReadyToPromote(
  input: {
    parser_confidence: number | null;
    extracted_country: string | null;
    extracted_city: string | null;
  },
  settings: CrmParserSettings = DEFAULT_CRM_PARSER_SETTINGS
): boolean {
  return Boolean(
    input.parser_confidence != null &&
      input.parser_confidence >= settings.auto_promote &&
      input.extracted_country &&
      input.extracted_city
  );
}
