"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/require-role";
import { getCurrentUser } from "@/lib/auth/current-user";
import { actorFromCurrentUser } from "@/lib/auth/permissions";
import {
  canEnrichRawIntake,
  canPromoteRawIntake,
  type RawIntakeSubject,
} from "@/lib/crm/permissions-leads";
import {
  findCrmAssignmentRuleForLead,
  findSourceOwnerForLead,
  resolveRawIntakeAssignment,
} from "@/lib/crm/assignment";
import {
  classifyRawIntake,
  parseRawIntakePayload,
  parserActivityPayload,
  parserActivityType,
} from "@/lib/crm/intake";
import {
  CRM_CAMPAIGN_PLATFORMS,
  normalizeProductCategory,
  type CrmCampaignPlatform,
} from "@/lib/db/crm";
import { createAdminClient } from "@/lib/supabase/server";
import type { CrmJsonObject, CrmRawStatus } from "@/lib/types/crm";

const ADMIN_CRM_PATH = "/admin/crm";
const WHATSAPP_PATH = "/admin/crm/whatsapp-numbers";
const CAMPAIGNS_PATH = "/admin/crm/campaign-sources";
const ASSIGNMENT_RULES_PATH = "/admin/crm/assignment-rules";
const INBOX_PATH = "/crm/inbox";
const LEADS_PATH = "/crm/leads";

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function ok(path: string, message: string): never {
  revalidatePath(ADMIN_CRM_PATH);
  revalidatePath(WHATSAPP_PATH);
  revalidatePath(CAMPAIGNS_PATH);
  revalidatePath(ASSIGNMENT_RULES_PATH);
  revalidatePath(INBOX_PATH);
  revalidatePath(LEADS_PATH);
  revalidatePath(path);
  redirect(`${path}?ok=${encodeURIComponent(message)}`);
}

function nullable(value: string): string | null {
  return value ? value : null;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 36);
  return slug || "source";
}

function parsePlatform(value: string): CrmCampaignPlatform {
  return CRM_CAMPAIGN_PLATFORMS.includes(value as CrmCampaignPlatform)
    ? (value as CrmCampaignPlatform)
    : "other";
}

function parseReceivedAt(value: string): string {
  if (!value) return new Date().toISOString();
  const normalized = value.length === 16 ? `${value}:00` : value;
  const dt = new Date(`${normalized}+05:00`);
  if (Number.isNaN(dt.getTime())) {
    throw new Error("Received date/time is invalid.");
  }
  return dt.toISOString();
}

function parseOptionalDateTime(value: string): string | null {
  if (!value) return null;
  return parseReceivedAt(value);
}

async function assertSuperAdmin(path: string) {
  return requireSuperAdmin(path);
}

async function requireActiveUser(path: string) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.appUser.is_active) fail(path, "Active CRM user required.");
  return me;
}

export async function createWhatsappNumber(formData: FormData) {
  await assertSuperAdmin(WHATSAPP_PATH);

  const label = readString(formData, "label");
  const displayNumber = readString(formData, "display_number");
  const phoneNumberId = readString(formData, "phone_number_id");
  const productCategory = normalizeProductCategory(readString(formData, "product_category"));
  const branchId = readString(formData, "default_branch_id");
  const assignedEmployeeId = readString(formData, "assigned_employee_id");
  const notes = readString(formData, "notes");
  const isActive = formData.get("is_active") === "on";

  if (!label) fail(WHATSAPP_PATH, "Label is required.");
  if (!displayNumber) fail(WHATSAPP_PATH, "Display phone number is required.");

  const admin = createAdminClient();
  const { error } = await admin.from("crm_whatsapp_numbers").insert({
    label,
    display_number: displayNumber,
    phone_number_id: nullable(phoneNumberId),
    product_category: productCategory,
    default_branch_id: nullable(branchId),
    default_department_id: null,
    assigned_employee_id: nullable(assignedEmployeeId),
    greeting_template: null,
    is_api_connected: false,
    is_active: isActive,
    notes: nullable(notes),
  });

  if (error) fail(WHATSAPP_PATH, `Could not add WhatsApp number: ${error.message}`);
  ok(WHATSAPP_PATH, "WhatsApp number added.");
}

export async function updateWhatsappNumberOwner(formData: FormData) {
  await assertSuperAdmin(WHATSAPP_PATH);

  const id = readString(formData, "id");
  const assignedEmployeeId = readString(formData, "assigned_employee_id");
  if (!id) fail(WHATSAPP_PATH, "Missing WhatsApp number id.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("crm_whatsapp_numbers")
    .update({ assigned_employee_id: nullable(assignedEmployeeId) })
    .eq("id", id);

  if (error) fail(WHATSAPP_PATH, `Could not update WhatsApp number owner: ${error.message}`);
  ok(
    WHATSAPP_PATH,
    assignedEmployeeId
      ? "WhatsApp number owner updated."
      : "WhatsApp number owner cleared."
  );
}

export async function updateWhatsappNumberFallback(formData: FormData) {
  await assertSuperAdmin(WHATSAPP_PATH);

  const id = readString(formData, "id");
  const fallbackEmployeeId = readString(formData, "fallback_employee_id");
  const fallbackActive = formData.get("fallback_active") === "on";
  const fallbackReason = readString(formData, "fallback_reason");
  const fallbackStartsAt = readString(formData, "fallback_starts_at");
  const fallbackEndsAt = readString(formData, "fallback_ends_at");

  if (!id) fail(WHATSAPP_PATH, "Missing WhatsApp number id.");
  if (fallbackActive && !fallbackEmployeeId) {
    fail(WHATSAPP_PATH, "Choose a fallback counselor before activating fallback.");
  }

  let startsAt: string | null = null;
  let endsAt: string | null = null;
  try {
    startsAt = parseOptionalDateTime(fallbackStartsAt);
    endsAt = parseOptionalDateTime(fallbackEndsAt);
  } catch (error) {
    fail(
      WHATSAPP_PATH,
      error instanceof Error ? error.message : "Fallback date/time is invalid."
    );
  }
  if (startsAt && endsAt && new Date(startsAt) > new Date(endsAt)) {
    fail(WHATSAPP_PATH, "Fallback start time must be before end time.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("crm_whatsapp_numbers")
    .update({
      fallback_employee_id: nullable(fallbackEmployeeId),
      fallback_active: fallbackActive,
      fallback_reason: nullable(fallbackReason),
      fallback_starts_at: startsAt,
      fallback_ends_at: endsAt,
    })
    .eq("id", id);

  if (error) fail(WHATSAPP_PATH, `Could not update fallback routing: ${error.message}`);
  ok(
    WHATSAPP_PATH,
    fallbackActive
      ? "Temporary fallback routing activated."
      : "Temporary fallback routing saved."
  );
}

export async function clearWhatsappNumberFallback(formData: FormData) {
  await assertSuperAdmin(WHATSAPP_PATH);

  const id = readString(formData, "id");
  if (!id) fail(WHATSAPP_PATH, "Missing WhatsApp number id.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("crm_whatsapp_numbers")
    .update({
      fallback_employee_id: null,
      fallback_active: false,
      fallback_reason: null,
      fallback_starts_at: null,
      fallback_ends_at: null,
    })
    .eq("id", id);

  if (error) fail(WHATSAPP_PATH, `Could not clear fallback routing: ${error.message}`);
  ok(WHATSAPP_PATH, "Temporary fallback routing cleared.");
}

export async function setWhatsappNumberActive(formData: FormData) {
  await assertSuperAdmin(WHATSAPP_PATH);

  const id = readString(formData, "id");
  const isActive = formData.get("is_active") === "on";
  if (!id) fail(WHATSAPP_PATH, "Missing WhatsApp number id.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("crm_whatsapp_numbers")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) fail(WHATSAPP_PATH, `Could not update WhatsApp number: ${error.message}`);
  ok(WHATSAPP_PATH, isActive ? "WhatsApp number activated." : "WhatsApp number deactivated.");
}

export async function createCampaignSource(formData: FormData) {
  await assertSuperAdmin(CAMPAIGNS_PATH);

  const label = readString(formData, "label");
  const platform = parsePlatform(readString(formData, "platform"));
  const whatsappNumberId = readString(formData, "whatsapp_number_id");
  const productCategory = normalizeProductCategory(readString(formData, "product_category"));
  const branchId = readString(formData, "default_branch_id");
  const notes = readString(formData, "notes");
  const isActive = formData.get("is_active") === "on";

  if (!label) fail(CAMPAIGNS_PATH, "Campaign name is required.");

  const metadata: CrmJsonObject = {
    platform,
    notes: notes || null,
    configured_in: "phase_2_admin_ui",
  };
  const sourceKey = `${platform}_${slugify(label)}_${Date.now().toString(36)}`;

  const admin = createAdminClient();
  const { error } = await admin.from("crm_campaign_sources").insert({
    whatsapp_number_id: nullable(whatsappNumberId),
    source_key: sourceKey,
    label,
    product_category: productCategory,
    default_branch_id: nullable(branchId),
    default_department_id: null,
    metadata,
    is_active: isActive,
  });

  if (error) fail(CAMPAIGNS_PATH, `Could not add campaign source: ${error.message}`);
  ok(CAMPAIGNS_PATH, "Campaign source added.");
}

export async function setCampaignSourceActive(formData: FormData) {
  await assertSuperAdmin(CAMPAIGNS_PATH);

  const id = readString(formData, "id");
  const isActive = formData.get("is_active") === "on";
  if (!id) fail(CAMPAIGNS_PATH, "Missing campaign source id.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("crm_campaign_sources")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) fail(CAMPAIGNS_PATH, `Could not update campaign source: ${error.message}`);
  ok(CAMPAIGNS_PATH, isActive ? "Campaign source activated." : "Campaign source deactivated.");
}

export async function createAssignmentRule(formData: FormData) {
  await assertSuperAdmin(ASSIGNMENT_RULES_PATH);

  const name = readString(formData, "name");
  const priorityRaw = readString(formData, "priority");
  const priority = Number.parseInt(priorityRaw || "100", 10);
  const matchProductCategory = readString(formData, "match_product_category");
  const matchCountry = readString(formData, "match_country");
  const matchCity = readString(formData, "match_city");
  const matchBranchId = readString(formData, "match_branch_id");
  const whatsappNumberId = readString(formData, "whatsapp_number_id");
  const campaignSourceId = readString(formData, "campaign_source_id");
  const targetEmployeeId = readString(formData, "target_employee_id");
  const notes = readString(formData, "notes");
  const isActive = formData.get("is_active") === "on";

  if (!name) fail(ASSIGNMENT_RULES_PATH, "Rule name is required.");
  if (!Number.isFinite(priority)) fail(ASSIGNMENT_RULES_PATH, "Priority must be a number.");
  if (!targetEmployeeId) {
    fail(ASSIGNMENT_RULES_PATH, "Choose the employee who should receive matching leads.");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("crm_assignment_rules").insert({
    name,
    priority,
    whatsapp_number_id: nullable(whatsappNumberId),
    campaign_source_id: nullable(campaignSourceId),
    match_branch_id: nullable(matchBranchId),
    match_city: nullable(matchCity),
    match_country: nullable(matchCountry),
    match_product_category: nullable(matchProductCategory),
    action: "assign_to_agent",
    target_branch_id: null,
    target_employee_id: targetEmployeeId,
    reason_template: nullable(notes),
    is_active: isActive,
  });

  if (error) fail(ASSIGNMENT_RULES_PATH, `Could not create assignment rule: ${error.message}`);
  ok(ASSIGNMENT_RULES_PATH, "Assignment rule created.");
}

export async function setAssignmentRuleActive(formData: FormData) {
  await assertSuperAdmin(ASSIGNMENT_RULES_PATH);

  const id = readString(formData, "id");
  const isActive = formData.get("is_active") === "on";
  if (!id) fail(ASSIGNMENT_RULES_PATH, "Missing assignment rule id.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("crm_assignment_rules")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) fail(ASSIGNMENT_RULES_PATH, `Could not update assignment rule: ${error.message}`);
  ok(ASSIGNMENT_RULES_PATH, isActive ? "Assignment rule activated." : "Assignment rule deactivated.");
}

export async function createManualRawIntake(formData: FormData) {
  const me = await assertSuperAdmin(INBOX_PATH);

  const senderName = readString(formData, "sender_name");
  const senderPhone = readString(formData, "sender_phone");
  const messageText = readString(formData, "message_text");
  const whatsappNumberId = readString(formData, "whatsapp_number_id");
  const campaignSourceId = readString(formData, "campaign_source_id");
  const receivedAtRaw = readString(formData, "received_at");

  if (!senderPhone) fail(INBOX_PATH, "Lead/customer phone is required.");
  if (!messageText) fail(INBOX_PATH, "Message text is required.");

  let receivedAt: string;
  try {
    receivedAt = parseReceivedAt(receivedAtRaw);
  } catch (error) {
    fail(INBOX_PATH, error instanceof Error ? error.message : "Received date/time is invalid.");
  }

  const parsedPayload = parseRawIntakePayload(messageText);

  // Ownership is decided at receipt from the receiving EN number, never the
  // customer's phone. A partial inquiry is still owned.
  const assignment = await resolveRawIntakeAssignment({
    source_whatsapp_number_id: nullable(whatsappNumberId),
    campaign_source_id: nullable(campaignSourceId),
  });

  const admin = createAdminClient();
  const { data: rawRow, error: rawError } = await admin
    .from("crm_raw_inbox")
    .insert({
      whatsapp_number_id: nullable(whatsappNumberId),
      campaign_source_id: nullable(campaignSourceId),
      sender_phone: senderPhone,
      sender_name: nullable(senderName),
      ...parsedPayload.rawUpdate,
      assigned_employee_id: assignment.assigned_employee_id,
      branch_id: assignment.branch_id,
      assignment_method: assignment.assignment_method,
      assignment_reason: assignment.assignment_reason,
      first_message_text: messageText,
      last_message_text: messageText,
      last_message_at: receivedAt,
    })
    .select("id")
    .single();

  if (rawError || !rawRow) {
    fail(INBOX_PATH, `Could not create raw intake: ${rawError?.message ?? "unknown error"}`);
  }

  const [{ error: messageError }, { error: activityError }] = await Promise.all([
    admin.from("crm_lead_messages").insert({
      raw_inbox_id: rawRow.id,
      lead_id: null,
      direction: "inbound",
      wa_message_id: null,
      from_phone: senderPhone,
      to_phone: null,
      message_type: "text",
      content: messageText,
      raw_payload: {
        source: campaignSourceId ? "whatsapp_manual" : "manual_mock",
        created_by: me.authUserId,
      },
      sent_by_employee_id: null,
      received_at: receivedAt,
    }),
    admin.from("crm_lead_activities").insert({
      lead_id: null,
      raw_inbox_id: rawRow.id,
      activity_type: parserActivityType(parsedPayload.parsed.confidence),
      actor_user_id: me.authUserId,
      description: `Rule parser confidence ${parsedPayload.parsed.confidence.toFixed(2)}`,
      payload: parserActivityPayload(parsedPayload.parsed),
    }),
  ]);

  if (messageError) {
    fail(INBOX_PATH, `Raw intake created, but message history failed: ${messageError.message}`);
  }
  if (activityError) {
    fail(INBOX_PATH, `Raw intake created, but parser activity failed: ${activityError.message}`);
  }

  ok(INBOX_PATH, "Manual raw intake created and parsed.");
}

export async function parseRawInboxDetails(formData: FormData) {
  const me = await assertSuperAdmin(INBOX_PATH);
  const id = readString(formData, "id");
  if (!id) fail(INBOX_PATH, "Missing raw inbox id.");

  const detailPath = `/crm/inbox/${id}`;
  const admin = createAdminClient();
  const { data: raw, error: rawError } = await admin
    .from("crm_raw_inbox")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (rawError || !raw) {
    fail(INBOX_PATH, `Raw inbox row not found: ${rawError?.message ?? "missing row"}`);
  }

  const text = raw.last_message_text ?? raw.first_message_text ?? "";
  const parsedPayload = parseRawIntakePayload(text);
  const parsed = parsedPayload.parsed;

  const { error: updateError } = await admin
    .from("crm_raw_inbox")
    .update(parsedPayload.rawUpdate)
    .eq("id", id);

  if (updateError) {
    fail(detailPath, `Could not store parsed details: ${updateError.message}`);
  }

  const { error: activityError } = await admin.from("crm_lead_activities").insert({
    lead_id: raw.lead_id ?? null,
    raw_inbox_id: id,
    activity_type: parserActivityType(parsed.confidence),
    actor_user_id: me.authUserId,
    description: `Rule parser confidence ${parsed.confidence.toFixed(2)}`,
    payload: parserActivityPayload(parsed),
  });

  if (activityError) {
    fail(detailPath, `Parsed details saved, but activity failed: ${activityError.message}`);
  }

  ok(detailPath, "Raw details re-parsed.");
}

const ENRICHMENT_FIELDS = [
  "extracted_country",
  "extracted_city",
  "extracted_qualification",
  "extracted_marks_cgpa",
  "extracted_study_gap",
  "extracted_budget_range",
  "extracted_english_test",
  "extracted_product_category",
  "enrichment_notes",
] as const;

// The seven core qualification fields, keyed to match the rule parser's
// missing_fields vocabulary.
const ENRICHMENT_CORE: Array<[string, (typeof ENRICHMENT_FIELDS)[number]]> = [
  ["country_interest", "extracted_country"],
  ["qualification", "extracted_qualification"],
  ["marks_or_cgpa", "extracted_marks_cgpa"],
  ["study_gap", "extracted_study_gap"],
  ["city", "extracted_city"],
  ["budget_range", "extracted_budget_range"],
  ["english_test", "extracted_english_test"],
];

export async function enrichRawIntake(formData: FormData) {
  const me = await requireActiveUser(INBOX_PATH);
  const id = readString(formData, "id");
  if (!id) fail(INBOX_PATH, "Missing raw inbox id.");

  const detailPath = `/crm/inbox/${id}`;
  const admin = createAdminClient();
  const { data: raw, error: rawError } = await admin
    .from("crm_raw_inbox")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (rawError || !raw) {
    fail(INBOX_PATH, `Raw inbox row not found: ${rawError?.message ?? "missing row"}`);
  }

  const subject: RawIntakeSubject = {
    assigned_employee_id: raw.assigned_employee_id,
    branch_id: raw.branch_id,
    status: raw.status,
    lead_id: raw.lead_id,
  };
  if (!canEnrichRawIntake(actorFromCurrentUser(me), subject)) {
    fail(detailPath, "You can only enrich intake assigned to you or your branch.");
  }

  const values: Record<string, string | null> = {};
  for (const field of ENRICHMENT_FIELDS) {
    values[field] = nullable(readString(formData, field));
  }

  const missingFields = ENRICHMENT_CORE.filter(
    ([, col]) => !values[col]
  ).map(([key]) => key);

  // A human verified these fields, so country + city presence makes the row
  // ready to promote regardless of the original parser confidence.
  const status: CrmRawStatus =
    values.extracted_country && values.extracted_city
      ? "ready_for_promotion"
      : "needs_enrichment";

  const { error: updateError } = await admin
    .from("crm_raw_inbox")
    .update({ ...values, missing_fields: missingFields, status })
    .eq("id", id);

  if (updateError) {
    fail(detailPath, `Could not save enrichment: ${updateError.message}`);
  }

  const { error: activityError } = await admin.from("crm_lead_activities").insert({
    lead_id: raw.lead_id ?? null,
    raw_inbox_id: id,
    activity_type: "details_received",
    actor_user_id: me.authUserId,
    description: "Intake fields enriched manually.",
    payload: { source: "manual_enrichment", status, missing_fields: missingFields },
  });

  if (activityError) {
    fail(detailPath, `Enrichment saved, but activity failed: ${activityError.message}`);
  }

  ok(detailPath, "Intake fields saved.");
}

export async function promoteRawInboxToLead(formData: FormData) {
  const me = await requireActiveUser(INBOX_PATH);
  const id = readString(formData, "id");
  if (!id) fail(INBOX_PATH, "Missing raw inbox id.");

  const detailPath = `/crm/inbox/${id}`;
  const admin = createAdminClient();
  const { data: raw, error: rawError } = await admin
    .from("crm_raw_inbox")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (rawError || !raw) {
    fail(INBOX_PATH, `Raw inbox row not found: ${rawError?.message ?? "missing row"}`);
  }
  if (raw.lead_id) {
    redirect(`/crm/leads/${raw.lead_id}?ok=${encodeURIComponent("Raw intake is already promoted.")}`);
  }
  if (raw.status === "spam_duplicate") {
    fail(detailPath, "Spam/irrelevant intake cannot be promoted. Re-classify it via enrichment first.");
  }

  const subject: RawIntakeSubject = {
    assigned_employee_id: raw.assigned_employee_id,
    branch_id: raw.branch_id,
    status: raw.status,
    lead_id: raw.lead_id,
  };
  if (!canPromoteRawIntake(actorFromCurrentUser(me), subject)) {
    fail(detailPath, "You can only promote intake assigned to you or your branch.");
  }

  // Missing minimum fields no longer blocks ownership or lead creation — the
  // lead is created with a needs_enrichment flag instead.
  const needsEnrichment = !(raw.extracted_country && raw.extracted_city);

  const [{ data: number }, { data: campaign }] = await Promise.all([
    raw.whatsapp_number_id
      ? admin
          .from("crm_whatsapp_numbers")
          .select("product_category, default_branch_id")
          .eq("id", raw.whatsapp_number_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    raw.campaign_source_id
      ? admin
          .from("crm_campaign_sources")
          .select("product_category, default_branch_id, whatsapp_number_id")
          .eq("id", raw.campaign_source_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const branchId = campaign?.default_branch_id ?? number?.default_branch_id ?? null;
  const productCategory = campaign?.product_category ?? number?.product_category ?? null;
  const sourceWhatsappNumberId = raw.whatsapp_number_id ?? campaign?.whatsapp_number_id ?? null;

  const ownerMatch = await findSourceOwnerForLead({
    source_whatsapp_number_id: raw.whatsapp_number_id,
    campaign_source_id: raw.campaign_source_id,
  });

  let resolvedBranchId = branchId;
  if (ownerMatch.matched) {
    const { data: ownerEmployee } = await admin
      .from("employees")
      .select("id, branch_id")
      .eq("id", ownerMatch.target_employee_id)
      .maybeSingle();
    resolvedBranchId = branchId ?? ownerEmployee?.branch_id ?? null;
  }

  const { data: lead, error: leadError } = await admin
    .from("crm_leads")
    .insert({
      raw_inbox_id: id,
      assigned_agent_id: ownerMatch.matched ? ownerMatch.target_employee_id : null,
      branch_id: resolvedBranchId,
      status: ownerMatch.matched ? "assigned" : "new",
      customer_phone: raw.sender_phone,
      customer_name: raw.sender_name ?? null,
      product_category: productCategory,
      interested_country: raw.extracted_country,
      city: raw.extracted_city,
      last_qualification: raw.extracted_qualification,
      marks_cgpa: raw.extracted_marks_cgpa,
      study_gap: raw.extracted_study_gap,
      budget_range: raw.extracted_budget_range,
      english_test_status: raw.extracted_english_test,
      quality_score: raw.parser_confidence,
      needs_enrichment: needsEnrichment,
      source_whatsapp_number_id: sourceWhatsappNumberId,
      campaign_source_id: raw.campaign_source_id,
      next_followup_at: null,
    })
    .select("id")
    .single();

  if (leadError || !lead) {
    fail(detailPath, `Could not promote lead: ${leadError?.message ?? "unknown error"}`);
  }

  const [{ error: rawUpdateError }, { error: messageUpdateError }, { error: activityError }] =
    await Promise.all([
      admin.from("crm_raw_inbox").update({ lead_id: lead.id, status: "qualified" }).eq("id", id),
      admin.from("crm_lead_messages").update({ lead_id: lead.id }).eq("raw_inbox_id", id),
      admin.from("crm_lead_activities").insert({
        lead_id: lead.id,
        raw_inbox_id: id,
        activity_type: "lead_shell_created",
        actor_user_id: me.authUserId,
        description: "Lead promoted from raw inbox.",
        payload: {
          source: "manual_promotion",
          raw_inbox_id: id,
        },
      }),
    ]);

  if (rawUpdateError) fail(detailPath, `Lead created, but raw link failed: ${rawUpdateError.message}`);
  if (messageUpdateError) fail(detailPath, `Lead created, but message link failed: ${messageUpdateError.message}`);
  if (activityError) fail(detailPath, `Lead created, but activity failed: ${activityError.message}`);

  if (ownerMatch.matched) {
    const [{ error: assignmentError }, { error: assignActivityError }] = await Promise.all([
      admin.from("crm_lead_assignments").insert({
        lead_id: lead.id,
        status: "assigned",
        from_employee_id: null,
        to_employee_id: ownerMatch.target_employee_id,
        from_branch_id: null,
        to_branch_id: resolvedBranchId,
        assigned_by: me.authUserId,
        method: "auto_source_owner",
        matched_rule_id: null,
        reason: ownerMatch.reason,
      }),
      admin.from("crm_lead_activities").insert({
        lead_id: lead.id,
        raw_inbox_id: id,
        activity_type: "assigned",
        actor_user_id: me.authUserId,
        description: ownerMatch.reason,
        payload: {
          method: "auto_source_owner",
          via: ownerMatch.via,
          source_owner_type: ownerMatch.source_owner_type,
          target_employee_id: ownerMatch.target_employee_id,
          target_branch_id: resolvedBranchId,
          whatsapp_number_id: ownerMatch.whatsapp_number_id,
          whatsapp_number_label: ownerMatch.whatsapp_number_label,
          default_employee_id: ownerMatch.default_employee_id,
          default_employee_name: ownerMatch.default_employee_name,
          fallback_employee_id: ownerMatch.fallback_employee_id,
          fallback_employee_name: ownerMatch.fallback_employee_name,
          fallback_reason: ownerMatch.fallback_reason,
          fallback_starts_at: ownerMatch.fallback_starts_at,
          fallback_ends_at: ownerMatch.fallback_ends_at,
        },
      }),
    ]);
    if (assignmentError) {
      fail(detailPath, `Lead created, but owner assignment failed: ${assignmentError.message}`);
    }
    if (assignActivityError) {
      fail(detailPath, `Lead created, but assignment activity failed: ${assignActivityError.message}`);
    }
  }

  revalidatePath(INBOX_PATH);
  revalidatePath(LEADS_PATH);
  const ownerMsg = ownerMatch.matched
    ? "Raw intake promoted and assigned from WhatsApp number owner."
    : "Raw intake promoted to lead (no source owner found).";
  const promotionMsg = needsEnrichment
    ? `${ownerMsg} Lead needs enrichment (missing country/city).`
    : ownerMsg;
  redirect(`/crm/leads/${lead.id}?ok=${encodeURIComponent(promotionMsg)}`);
}

export async function assignCrmLead(formData: FormData) {
  const me = await assertSuperAdmin(LEADS_PATH);
  const leadId = readString(formData, "lead_id");
  const employeeId = readString(formData, "employee_id");
  const reason = readString(formData, "reason");
  if (!leadId) fail(LEADS_PATH, "Missing lead id.");
  if (!employeeId) fail(`/crm/leads/${leadId}`, "Choose an employee to assign.");

  const detailPath = `/crm/leads/${leadId}`;
  const admin = createAdminClient();
  const [{ data: lead, error: leadError }, { data: employee, error: employeeError }] =
    await Promise.all([
      admin.from("crm_leads").select("*").eq("id", leadId).maybeSingle(),
      admin.from("employees").select("id, branch_id").eq("id", employeeId).maybeSingle(),
    ]);

  if (leadError || !lead) fail(LEADS_PATH, `Lead not found: ${leadError?.message ?? "missing row"}`);
  if (employeeError || !employee) {
    fail(detailPath, `Employee not found: ${employeeError?.message ?? "missing row"}`);
  }

  const nextBranchId = lead.branch_id ?? employee.branch_id ?? null;
  const nextStatus = lead.status === "new" ? "assigned" : lead.status;
  const assignmentStatus = lead.assigned_agent_id ? "reassigned" : "assigned";

  const [{ error: updateError }, { error: assignmentError }, { error: activityError }] =
    await Promise.all([
      admin
        .from("crm_leads")
        .update({
          assigned_agent_id: employeeId,
          branch_id: nextBranchId,
          status: nextStatus,
        })
        .eq("id", leadId),
      admin.from("crm_lead_assignments").insert({
        lead_id: leadId,
        status: assignmentStatus,
        from_employee_id: lead.assigned_agent_id,
        to_employee_id: employeeId,
        from_branch_id: lead.branch_id,
        to_branch_id: nextBranchId,
        assigned_by: me.authUserId,
        method: "manual",
        matched_rule_id: null,
        reason: reason || "Manual CRM assignment",
      }),
      admin.from("crm_lead_activities").insert({
        lead_id: leadId,
        raw_inbox_id: lead.raw_inbox_id,
        activity_type: assignmentStatus,
        actor_user_id: me.authUserId,
        description: reason || "Lead assigned manually.",
        payload: {
          from_employee_id: lead.assigned_agent_id,
          to_employee_id: employeeId,
          from_branch_id: lead.branch_id,
          to_branch_id: nextBranchId,
          method: "manual",
        },
      }),
    ]);

  if (updateError) fail(detailPath, `Could not assign lead: ${updateError.message}`);
  if (assignmentError) fail(detailPath, `Lead assigned, but assignment history failed: ${assignmentError.message}`);
  if (activityError) fail(detailPath, `Lead assigned, but activity failed: ${activityError.message}`);

  ok(detailPath, "Lead assigned.");
}

export async function autoAssignCrmLead(formData: FormData) {
  const me = await assertSuperAdmin(LEADS_PATH);
  const leadId = readString(formData, "lead_id");
  if (!leadId) fail(LEADS_PATH, "Missing lead id.");

  const detailPath = `/crm/leads/${leadId}`;
  const admin = createAdminClient();
  const { data: lead, error: leadError } = await admin
    .from("crm_leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError || !lead) {
    fail(LEADS_PATH, `Lead not found: ${leadError?.message ?? "missing row"}`);
  }

  if (lead.assigned_agent_id) {
    ok(detailPath, "Lead is already assigned.");
  }

  // 1. Source owner (WhatsApp number → campaign's parent WhatsApp number)
  const ownerMatch = await findSourceOwnerForLead({
    source_whatsapp_number_id: lead.source_whatsapp_number_id,
    campaign_source_id: lead.campaign_source_id,
  });

  if (ownerMatch.matched) {
    const { data: ownerEmployee, error: ownerEmployeeError } = await admin
      .from("employees")
      .select("id, branch_id")
      .eq("id", ownerMatch.target_employee_id)
      .maybeSingle();
    if (ownerEmployeeError || !ownerEmployee) {
      fail(
        detailPath,
        `Source owner not found: ${ownerEmployeeError?.message ?? "missing employee"}`
      );
    }
    const nextBranchId = lead.branch_id ?? ownerEmployee.branch_id ?? null;
    const assignmentStatus = lead.assigned_agent_id ? "reassigned" : "assigned";

    const [{ error: updateError }, { error: assignmentError }, { error: activityError }] =
      await Promise.all([
        admin
          .from("crm_leads")
          .update({
            assigned_agent_id: ownerMatch.target_employee_id,
            branch_id: nextBranchId,
            status: "assigned",
          })
          .eq("id", leadId),
        admin.from("crm_lead_assignments").insert({
          lead_id: leadId,
          status: assignmentStatus,
          from_employee_id: lead.assigned_agent_id,
          to_employee_id: ownerMatch.target_employee_id,
          from_branch_id: lead.branch_id,
          to_branch_id: nextBranchId,
          assigned_by: me.authUserId,
          method: "auto_source_owner",
          matched_rule_id: null,
          reason: ownerMatch.reason,
        }),
        admin.from("crm_lead_activities").insert({
          lead_id: leadId,
          raw_inbox_id: lead.raw_inbox_id,
          activity_type: assignmentStatus,
          actor_user_id: me.authUserId,
          description: ownerMatch.reason,
          payload: {
            method: "auto_source_owner",
            via: ownerMatch.via,
            source_owner_type: ownerMatch.source_owner_type,
            target_employee_id: ownerMatch.target_employee_id,
            target_branch_id: nextBranchId,
            whatsapp_number_id: ownerMatch.whatsapp_number_id,
            whatsapp_number_label: ownerMatch.whatsapp_number_label,
            default_employee_id: ownerMatch.default_employee_id,
            default_employee_name: ownerMatch.default_employee_name,
            fallback_employee_id: ownerMatch.fallback_employee_id,
            fallback_employee_name: ownerMatch.fallback_employee_name,
            fallback_reason: ownerMatch.fallback_reason,
            fallback_starts_at: ownerMatch.fallback_starts_at,
            fallback_ends_at: ownerMatch.fallback_ends_at,
          },
        }),
      ]);

    if (updateError) fail(detailPath, `Could not assign from source owner: ${updateError.message}`);
    if (assignmentError) {
      fail(detailPath, `Lead assigned, but assignment history failed: ${assignmentError.message}`);
    }
    if (activityError) {
      fail(detailPath, `Lead assigned, but activity failed: ${activityError.message}`);
    }

    ok(detailPath, "Lead assigned from WhatsApp number owner.");
  }

  // 2. Rule engine fallback (unchanged)
  const match = await findCrmAssignmentRuleForLead(lead);
  if (!match.matched) {
    const { error: activityError } = await admin.from("crm_lead_activities").insert({
      lead_id: leadId,
      raw_inbox_id: lead.raw_inbox_id,
      activity_type: "sent_to_review",
      actor_user_id: me.authUserId,
      description: `No source owner or matching rule. ${match.reason}`,
      payload: {
        method: "auto_rule",
        result: "no_match",
        source_owner_reason: ownerMatch.reason,
      },
    });
    if (activityError) {
      fail(detailPath, `No source owner or matching rule, and activity failed: ${activityError.message}`);
    }
    ok(detailPath, `No source owner or matching rule found. ${match.reason}`);
  }

  const nextEmployeeId = match.target_employee_id;
  const { data: targetEmployee, error: targetEmployeeError } = await admin
    .from("employees")
    .select("id, branch_id")
    .eq("id", nextEmployeeId)
    .maybeSingle();
  if (targetEmployeeError || !targetEmployee) {
    fail(detailPath, `Rule target employee not found: ${targetEmployeeError?.message ?? "missing employee"}`);
  }
  const nextBranchId = lead.branch_id ?? targetEmployee.branch_id ?? null;
  const nextStatus = "assigned";
  const assignmentStatus = lead.assigned_agent_id ? "reassigned" : "assigned";

  const [{ error: updateError }, { error: assignmentError }, { error: activityError }] =
    await Promise.all([
      admin
        .from("crm_leads")
        .update({
          assigned_agent_id: nextEmployeeId,
          branch_id: nextBranchId,
          status: nextStatus,
        })
        .eq("id", leadId),
      admin.from("crm_lead_assignments").insert({
        lead_id: leadId,
        status: assignmentStatus,
        from_employee_id: lead.assigned_agent_id,
        to_employee_id: nextEmployeeId,
        from_branch_id: lead.branch_id,
        to_branch_id: nextBranchId,
        assigned_by: me.authUserId,
        method: "auto_rule",
        matched_rule_id: match.rule.id,
        reason: match.reason,
      }),
      admin.from("crm_lead_activities").insert({
        lead_id: leadId,
        raw_inbox_id: lead.raw_inbox_id,
        activity_type: assignmentStatus,
        actor_user_id: me.authUserId,
        description: `Auto-assigned by fallback rule: ${match.rule.name}`,
        payload: {
          method: "auto_rule",
          matched_rule_id: match.rule.id,
          matched_rule_name: match.rule.name,
          target_employee_id: nextEmployeeId,
          target_branch_id: nextBranchId,
        },
      }),
    ]);

  if (updateError) fail(detailPath, `Could not auto-assign lead: ${updateError.message}`);
  if (assignmentError) {
    fail(detailPath, `Lead auto-assigned, but assignment history failed: ${assignmentError.message}`);
  }
  if (activityError) {
    fail(detailPath, `Lead auto-assigned, but activity failed: ${activityError.message}`);
  }

  ok(detailPath, `Lead assigned by fallback rule: ${match.rule.name}`);
}
