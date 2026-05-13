import type { CrmRawStatus } from "@/lib/types/crm";

export type ParsedLeadDetails = {
  country_interest: string | null;
  qualification: string | null;
  marks_or_cgpa: string | null;
  study_gap: string | null;
  city: string | null;
  budget_range: string | null;
  english_test: string | null;
  confidence: number;
  missing_fields: string[];
  status: CrmRawStatus;
};

const FIELD_KEYS = [
  "country_interest",
  "qualification",
  "marks_or_cgpa",
  "study_gap",
  "city",
  "budget_range",
  "english_test",
] as const;

type FieldKey = (typeof FIELD_KEYS)[number];

const FIELD_BY_NUMBER: Record<string, FieldKey> = {
  "1": "country_interest",
  "2": "qualification",
  "3": "marks_or_cgpa",
  "4": "study_gap",
  "5": "city",
  "6": "budget_range",
  "7": "english_test",
};

const LABEL_PATTERNS: Array<[FieldKey, RegExp]> = [
  ["country_interest", /(?:country interested|interested country|country|destination)\s*[:.-]\s*(.+)$/i],
  ["qualification", /(?:qualification|last qualification|education)\s*[:.-]\s*(.+)$/i],
  ["marks_or_cgpa", /(?:marks|cgpa|gpa|percentage)\s*[:.-]\s*(.+)$/i],
  ["study_gap", /(?:study gap|gap)\s*[:.-]\s*(.+)$/i],
  ["city", /(?:city|location)\s*[:.-]\s*(.+)$/i],
  ["budget_range", /(?:budget range|budget|range)\s*[:.-]\s*(.+)$/i],
  ["english_test", /(?:english test|english|ielts|pte|test)\s*[:.-]\s*(.+)$/i],
];

const FIELD_LABEL_PREFIXES: Record<FieldKey, RegExp> = {
  country_interest: /^(?:country interested|interested country|country|destination)\s*[:.-]\s*/i,
  qualification: /^(?:last qualification|qualification|education)\s*[:.-]\s*/i,
  marks_or_cgpa: /^(?:marks\/cgpa|marks|cgpa|gpa|percentage)\s*[:.-]\s*/i,
  study_gap: /^(?:study gap|gap)\s*[:.-]\s*/i,
  city: /^(?:city|location)\s*[:.-]\s*/i,
  budget_range: /^(?:budget range|budget|range)\s*[:.-]\s*/i,
  english_test: /^(?:english test|english|ielts|pte|test)\s*[:.-]\s*/i,
};

function cleanValue(value: string, field?: FieldKey): string | null {
  const withoutFieldLabel = field
    ? value.replace(FIELD_LABEL_PREFIXES[field], "")
    : value;
  const cleaned = withoutFieldLabel
    .replace(/^[-:.)\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function normalizeEnglishTest(value: string | null): string | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (/\b(no|not|none|without)\b/.test(lower)) return value;
  if (/\b(yes|ielts|pte|toefl|duolingo)\b/.test(lower)) return value;
  return value;
}

function statusForConfidence(confidence: number): CrmRawStatus {
  if (confidence >= 0.8) return "details_received";
  if (confidence >= 0.5) return "needs_review";
  return "awaiting_details";
}

export function parseSevenQuestionReply(text: string | null | undefined): ParsedLeadDetails {
  const values: Record<FieldKey, string | null> = {
    country_interest: null,
    qualification: null,
    marks_or_cgpa: null,
    study_gap: null,
    city: null,
    budget_range: null,
    english_test: null,
  };

  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const numbered = line.match(/^([1-7])(?:[\s.)-]+)(.+)$/);
    if (numbered) {
      const field = FIELD_BY_NUMBER[numbered[1]];
      values[field] = cleanValue(numbered[2], field);
      continue;
    }

    for (const [field, pattern] of LABEL_PATTERNS) {
      const labeled = line.match(pattern);
      if (labeled) {
        values[field] = cleanValue(labeled[1], field);
        break;
      }
    }
  }

  values.english_test = normalizeEnglishTest(values.english_test);

  const missing_fields = FIELD_KEYS.filter((field) => !values[field]);
  const present = FIELD_KEYS.length - missing_fields.length;
  const confidence = Number((present / FIELD_KEYS.length).toFixed(2));

  return {
    ...values,
    confidence,
    missing_fields,
    status: statusForConfidence(confidence),
  };
}
