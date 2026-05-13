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

export type CrmAssignmentStatus = "assigned" | "reassigned" | "unassigned";

export type CrmAssignmentMethod =
  | "auto_rule"
  | "manual"
  | "manager_override"
  | "review_queue";

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
  | "human_follow_up_started";

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
