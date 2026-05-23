// CRM domain types — aligned with supabase/migrations/0009_crm_stage_1_foundation.sql.
//
// Keep this file in lock-step with the CRM migration. If the schema changes,
// update both the SQL and these types in the same commit.
//
// Convention follows lib/types/hrm.ts:
//   - DB enums map to TS string literal unions.
//   - DB columns that are NOT NULL map to required fields.
//   - Nullable columns use `T | null`.
//   - Date columns are `string` (ISO date or timestamptz).

// ---------- shared json ----------

export type CrmJsonPrimitive = string | number | boolean | null;

export type CrmJsonValue =
  | CrmJsonPrimitive
  | CrmJsonValue[]
  | { [key: string]: CrmJsonValue };

export type CrmJsonObject = { [key: string]: CrmJsonValue };

// ---------- enums ----------

export type CrmRawStatus =
  | "raw_new"
  | "awaiting_details"
  | "details_received"
  | "needs_review"
  | "qualified"
  | "spam_duplicate";

export type CrmLeadStatus =
  | "new"
  | "assigned"
  | "contacted"
  | "qualified"
  | "follow_up"
  | "lost"
  | "converted";

export type CrmClientType = "student" | "work_permit" | "b2b";

export type CrmClientStatus =
  | "onboarding"
  | "doc_review"
  | "uni_selection"
  | "applying"
  | "offer_in_hand"
  | "offer_accepted"
  | "visa_prep"
  | "visa_submitted"
  | "visa_decision"
  | "pre_departure"
  | "departed"
  | "alumni"
  | "withdrawn_refunded";

export type CrmClientDocState =
  | "uploaded"
  | "under_review"
  | "approved"
  | "rejected_resubmit"
  | "expired";

export type CrmAssignmentStatus = "assigned" | "reassigned" | "unassigned";

export type CrmAssignmentMethod =
  | "auto_rule"
  | "auto_source_owner"
  | "manual"
  | "manager_override"
  | "review_queue"
  | "transfer_accept"
  | "transfer_admin_override";

export type CrmActivityType =
  | "raw_message_received"
  | "auto_greeting_sent"
  | "details_received"
  | "parser_succeeded"
  | "parser_low_confidence"
  | "sent_to_review"
  | "lead_shell_created"
  | "assigned"
  | "reassigned"
  | "unassigned"
  | "status_changed"
  | "note_added"
  | "human_follow_up_started"
  | "followup_scheduled"
  | "followup_completed"
  | "transfer_requested"
  | "transfer_accepted"
  | "transfer_rejected"
  | "transfer_cancelled"
  | "transfer_admin_override";

export type CrmTransferStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "admin_override";

export type CrmMessageDirection = "inbound" | "outbound";

export type CrmRuleAction =
  | "assign_to_agent"
  | "assign_to_branch"
  | "flag_for_manager";

export type CrmInitialProductCategory =
  | "italy"
  | "korea"
  | "b2b"
  | (string & {});

// ---------- config + source mapping ----------

export type CrmWhatsappNumber = {
  id: string;
  phone_number_id: string | null;
  display_number: string;
  label: string;
  product_category: CrmInitialProductCategory;
  default_branch_id: string | null;
  default_department_id: string | null;
  assigned_employee_id: string | null;
  fallback_employee_id: string | null;
  fallback_active: boolean;
  fallback_reason: string | null;
  fallback_starts_at: string | null;
  fallback_ends_at: string | null;
  greeting_template: string | null;
  is_api_connected: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmCampaignSource = {
  id: string;
  whatsapp_number_id: string | null;
  source_key: string;
  label: string;
  product_category: CrmInitialProductCategory;
  default_branch_id: string | null;
  default_department_id: string | null;
  metadata: CrmJsonObject;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

// ---------- raw inbox ----------

export type CrmRawInbox = {
  id: string;
  whatsapp_number_id: string | null;
  campaign_source_id: string | null;
  sender_phone: string;
  sender_name: string | null;
  first_wa_message_id: string | null;
  status: CrmRawStatus;
  parser_confidence: number | null;
  extracted_country: string | null;
  extracted_city: string | null;
  extracted_qualification: string | null;
  extracted_marks_cgpa: string | null;
  extracted_study_gap: string | null;
  extracted_budget_range: string | null;
  extracted_english_test: string | null;
  missing_fields: string[];
  duplicate_of_inbox_id: string | null;
  first_message_text: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  lead_id: string | null;
};

// ---------- leads ----------

export type CrmLead = {
  id: string;
  raw_inbox_id: string | null;
  assigned_agent_id: string | null;
  branch_id: string | null;
  status: CrmLeadStatus;
  customer_phone: string;
  customer_name: string | null;
  product_category: CrmInitialProductCategory | null;
  interested_country: string | null;
  city: string | null;
  last_qualification: string | null;
  marks_cgpa: string | null;
  study_gap: string | null;
  budget_range: string | null;
  english_test_status: string | null;
  quality_score: number | null;
  source_whatsapp_number_id: string | null;
  campaign_source_id: string | null;
  next_followup_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmClient = {
  id: string;
  lead_id: string;
  client_type: CrmClientType;
  client_code: string;
  status: CrmClientStatus;
  target_country: string | null;
  target_level: string | null;
  agreement_signed_at: string;
  advance_paid_at: string;
  advance_amount: number | null;
  total_fee: number | null;
  currency: string;
  assigned_agent_id: string | null;
  branch_id: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmClientActivity = {
  id: string;
  client_id: string;
  activity_type: string;
  actor_user_id: string | null;
  description: string | null;
  payload: unknown;
  created_at: string;
};

export type CrmClientPayment = {
  id: string;
  client_id: string;
  amount: number;
  currency: string;
  paid_at: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  recorded_by_user_id: string | null;
  created_at: string;
};

export type CrmClientDocument = {
  id: string;
  client_id: string;
  doc_code: string;
  doc_state: CrmClientDocState;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_by_user_id: string | null;
  uploaded_at: string;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  decision_note: string | null;
  superseded_by_id: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmClientDocumentVM = CrmClientDocument & {
  uploader_name: string | null;
  reviewer_name: string | null;
};

export type CrmClientVM = CrmClient & {
  lead_customer_phone: string;
  lead_customer_name: string | null;
  assigned_agent_name: string | null;
  branch_code: string | null;
  branch_name: string | null;
};

export const CRM_DOC_CODES = [
  "cnic_front",
  "cnic_back",
  "passport_data_page",
  "passport_photo",
  "en_agreement_signed",
  "matric_transcript",
  "matric_certificate",
  "olevel_statement_of_result",
  "olevel_certificates",
  "inter_transcript",
  "inter_certificate",
  "alevel_certificates",
  "english_test_result",
  "birth_certificate",
  "character_certificate",
  "bachelors_transcript",
  "bachelors_degree",
  "hec_equivalency",
  "sop",
  "lor_1",
  "lor_2",
  "lor_3",
  "cv",
  "work_experience_letter",
  "research_proposal",
  "supervisor_correspondence",
  "publications_list",
  "trade_certificate",
  "experience_letter",
  "language_certificate",
  "job_offer_letter",
  "driving_license",
  "bank_statement_6m",
  "sponsor_affidavit",
  "sponsor_cnic",
  "sponsor_bank_statement",
  "gic_proof",
  "blocked_account_proof",
  "medical_certificate",
  "hiv_test",
  "apostille_academic_docs",
  "apostille_visa_docs",
  "visa_appointment_proof",
] as const;

export type CrmDocCode = (typeof CRM_DOC_CODES)[number];

export const CRM_DOC_CODE_LABELS: Record<CrmDocCode, string> = {
  cnic_front: "CNIC front",
  cnic_back: "CNIC back",
  passport_data_page: "Passport data page",
  passport_photo: "Passport-size photo",
  en_agreement_signed: "EN agreement (signed)",
  matric_transcript: "Matric transcript",
  matric_certificate: "Matric certificate",
  olevel_statement_of_result: "O Level statement of result",
  olevel_certificates: "O Level certificates",
  inter_transcript: "Intermediate transcript",
  inter_certificate: "Intermediate certificate",
  alevel_certificates: "A Level certificates",
  english_test_result: "English test result",
  birth_certificate: "Birth certificate",
  character_certificate: "Character certificate",
  bachelors_transcript: "Bachelor's transcript",
  bachelors_degree: "Bachelor's degree",
  hec_equivalency: "HEC equivalency",
  sop: "Statement of Purpose",
  lor_1: "Letter of recommendation 1",
  lor_2: "Letter of recommendation 2",
  lor_3: "Letter of recommendation 3",
  cv: "CV",
  work_experience_letter: "Work experience letter",
  research_proposal: "Research proposal",
  supervisor_correspondence: "Supervisor correspondence",
  publications_list: "Publications list",
  trade_certificate: "Trade certificate",
  experience_letter: "Experience letter",
  language_certificate: "Language certificate",
  job_offer_letter: "Job offer letter",
  driving_license: "Driving license",
  bank_statement_6m: "Bank statement - 6 months",
  sponsor_affidavit: "Sponsor affidavit",
  sponsor_cnic: "Sponsor CNIC",
  sponsor_bank_statement: "Sponsor bank statement",
  gic_proof: "GIC proof",
  blocked_account_proof: "Blocked account proof",
  medical_certificate: "Medical certificate",
  hiv_test: "HIV test",
  apostille_academic_docs: "Apostille - academic documents",
  apostille_visa_docs: "Apostille - visa documents",
  visa_appointment_proof: "Visa appointment proof",
};

// Document categories — groups codes into sections for the UI.
// Order here determines render order on the client documents page.
export const CRM_DOC_CATEGORIES = [
  {
    code: "all_applicants",
    label: "All applicants",
    description: "Required for every client.",
  },
  {
    code: "bachelors",
    label: "Bachelor's track",
    description: "Matric + Intermediate (or O/A Levels) + English test.",
  },
  {
    code: "masters",
    label: "Master's track",
    description: "Bachelor's degree, SOP, LORs, CV.",
  },
  {
    code: "phd",
    label: "PhD track",
    description: "Research proposal, supervisor correspondence, publications.",
  },
  {
    code: "work_permit",
    label: "Work permit / Europe",
    description: "Skill certificates, experience letters, language.",
  },
  {
    code: "visa",
    label: "Visa stage",
    description: "Bank statements, sponsor docs, apostille, embassy paperwork.",
  },
] as const;

export type CrmDocCategory = (typeof CRM_DOC_CATEGORIES)[number]["code"];

export const CRM_DOC_CODE_CATEGORY: Record<CrmDocCode, CrmDocCategory> = {
  cnic_front: "all_applicants",
  cnic_back: "all_applicants",
  passport_data_page: "all_applicants",
  passport_photo: "all_applicants",
  en_agreement_signed: "all_applicants",

  matric_transcript: "bachelors",
  matric_certificate: "bachelors",
  olevel_statement_of_result: "bachelors",
  olevel_certificates: "bachelors",
  inter_transcript: "bachelors",
  inter_certificate: "bachelors",
  alevel_certificates: "bachelors",
  english_test_result: "bachelors",
  birth_certificate: "bachelors",
  character_certificate: "bachelors",

  bachelors_transcript: "masters",
  bachelors_degree: "masters",
  hec_equivalency: "masters",
  sop: "masters",
  lor_1: "masters",
  lor_2: "masters",
  lor_3: "masters",
  cv: "masters",
  work_experience_letter: "masters",

  research_proposal: "phd",
  supervisor_correspondence: "phd",
  publications_list: "phd",

  trade_certificate: "work_permit",
  experience_letter: "work_permit",
  language_certificate: "work_permit",
  job_offer_letter: "work_permit",
  driving_license: "work_permit",

  bank_statement_6m: "visa",
  sponsor_affidavit: "visa",
  sponsor_cnic: "visa",
  sponsor_bank_statement: "visa",
  gic_proof: "visa",
  blocked_account_proof: "visa",
  medical_certificate: "visa",
  hiv_test: "visa",
  apostille_academic_docs: "visa",
  apostille_visa_docs: "visa",
  visa_appointment_proof: "visa",
};

/**
 * Returns the default-expanded categories for a client's target_level.
 * "All applicants" + "Visa stage" are always relevant; the academic track
 * is the one matching the level.
 */
export function defaultExpandedDocCategories(
  targetLevel: string | null
): CrmDocCategory[] {
  const level = (targetLevel ?? "").toLowerCase();
  const base: CrmDocCategory[] = ["all_applicants"];
  if (level === "bachelors") return [...base, "bachelors", "visa"];
  if (level === "masters") return [...base, "bachelors", "masters", "visa"];
  if (level === "phd") return [...base, "bachelors", "masters", "phd", "visa"];
  if (level === "work_permit") return [...base, "work_permit", "visa"];
  return CRM_DOC_CATEGORIES.map((c) => c.code); // unknown level → expand all
}

export type CrmLeadMessage = {
  id: string;
  raw_inbox_id: string | null;
  lead_id: string | null;
  direction: CrmMessageDirection;
  wa_message_id: string | null;
  from_phone: string | null;
  to_phone: string | null;
  message_type: string;
  content: string | null;
  raw_payload: CrmJsonObject | null;
  sent_by_employee_id: string | null;
  received_at: string | null;
  created_at: string;
};

// ---------- assignment ----------

export type CrmAssignmentRule = {
  id: string;
  name: string;
  priority: number;
  whatsapp_number_id: string | null;
  campaign_source_id: string | null;
  match_branch_id: string | null;
  match_city: string | null;
  match_country: string | null;
  match_product_category: string | null;
  action: CrmRuleAction;
  target_branch_id: string | null;
  target_employee_id: string | null;
  reason_template: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CrmLeadAssignment = {
  id: string;
  lead_id: string;
  status: CrmAssignmentStatus;
  from_employee_id: string | null;
  to_employee_id: string | null;
  from_branch_id: string | null;
  to_branch_id: string | null;
  assigned_by: string | null;
  method: CrmAssignmentMethod;
  matched_rule_id: string | null;
  reason: string | null;
  created_at: string;
};

// ---------- transfers / handoff ----------

export type CrmLeadTransfer = {
  id: string;
  lead_id: string;
  from_employee_id: string | null;
  from_branch_id: string | null;
  to_employee_id: string;
  to_branch_id: string | null;
  requested_by_user_id: string | null;
  decided_by_user_id: string | null;
  reason: string;
  decision_note: string | null;
  status: CrmTransferStatus;
  requested_at: string;
  decided_at: string | null;
};

// ---------- activity ----------

export type CrmLeadActivity = {
  id: string;
  lead_id: string | null;
  raw_inbox_id: string | null;
  activity_type: CrmActivityType;
  actor_user_id: string | null;
  description: string | null;
  payload: CrmJsonObject | null;
  created_at: string;
};

export type CrmParserSettings = {
  auto_promote: number;
  needs_review: number;
};

export type CrmLeadWithSource = CrmLead & {
  source_whatsapp_number?: CrmWhatsappNumber | null;
  campaign_source?: CrmCampaignSource | null;
};

export type CrmRawInboxWithLead = CrmRawInbox & {
  lead?: CrmLead | null;
  whatsapp_number?: CrmWhatsappNumber | null;
  campaign_source?: CrmCampaignSource | null;
};
