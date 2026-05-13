"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/require-role";
import { parseSevenQuestionReply } from "@/lib/crm/parser";
import {
  CRM_CAMPAIGN_PLATFORMS,
  normalizeProductCategory,
  type CrmCampaignPlatform,
} from "@/lib/db/crm";
import { createAdminClient } from "@/lib/supabase/server";
import type { CrmJsonObject } from "@/lib/types/crm";

const ADMIN_CRM_PATH = "/admin/crm";
const WHATSAPP_PATH = "/admin/crm/whatsapp-numbers";
const CAMPAIGNS_PATH = "/admin/crm/campaign-sources";
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

async function assertSuperAdmin(path: string) {
  return requireSuperAdmin(path);
}

export async function createWhatsappNumber(formData: FormData) {
  await assertSuperAdmin(WHATSAPP_PATH);

  const label = readString(formData, "label");
  const displayNumber = readString(formData, "display_number");
  const phoneNumberId = readString(formData, "phone_number_id");
  const productCategory = normalizeProductCategory(readString(formData, "product_category"));
  const branchId = readString(formData, "default_branch_id");
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
    greeting_template: null,
    is_api_connected: false,
    is_active: isActive,
    notes: nullable(notes),
  });

  if (error) fail(WHATSAPP_PATH, `Could not add WhatsApp number: ${error.message}`);
  ok(WHATSAPP_PATH, "WhatsApp number added.");
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

export async function createManualRawIntake(formData: FormData) {
  const me = await assertSuperAdmin(INBOX_PATH);

  const senderPhone = readString(formData, "sender_phone");
  const messageText = readString(formData, "message_text");
  const whatsappNumberId = readString(formData, "whatsapp_number_id");
  const campaignSourceId = readString(formData, "campaign_source_id");
  const receivedAtRaw = readString(formData, "received_at");

  if (!senderPhone) fail(INBOX_PATH, "Phone number is required.");
  if (!messageText) fail(INBOX_PATH, "Message text is required.");

  let receivedAt: string;
  try {
    receivedAt = parseReceivedAt(receivedAtRaw);
  } catch (error) {
    fail(INBOX_PATH, error instanceof Error ? error.message : "Received date/time is invalid.");
  }

  const admin = createAdminClient();
  const { data: rawRow, error: rawError } = await admin
    .from("crm_raw_inbox")
    .insert({
      whatsapp_number_id: nullable(whatsappNumberId),
      campaign_source_id: nullable(campaignSourceId),
      sender_phone: senderPhone,
      sender_name: null,
      status: "raw_new",
      first_message_text: messageText,
      last_message_text: messageText,
      last_message_at: receivedAt,
    })
    .select("id")
    .single();

  if (rawError || !rawRow) {
    fail(INBOX_PATH, `Could not create raw intake: ${rawError?.message ?? "unknown error"}`);
  }

  const { error: messageError } = await admin.from("crm_lead_messages").insert({
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
  });

  if (messageError) {
    fail(INBOX_PATH, `Raw intake created, but message history failed: ${messageError.message}`);
  }

  ok(INBOX_PATH, "Manual raw intake created.");
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
  const parsed = parseSevenQuestionReply(text);

  const { error: updateError } = await admin
    .from("crm_raw_inbox")
    .update({
      status: parsed.status,
      parser_confidence: parsed.confidence,
      extracted_country: parsed.country_interest,
      extracted_city: parsed.city,
      extracted_qualification: parsed.qualification,
      extracted_marks_cgpa: parsed.marks_or_cgpa,
      extracted_study_gap: parsed.study_gap,
      extracted_budget_range: parsed.budget_range,
      extracted_english_test: parsed.english_test,
      missing_fields: parsed.missing_fields,
    })
    .eq("id", id);

  if (updateError) {
    fail(detailPath, `Could not store parsed details: ${updateError.message}`);
  }

  const { error: activityError } = await admin.from("crm_lead_activities").insert({
    lead_id: raw.lead_id ?? null,
    raw_inbox_id: id,
    activity_type:
      parsed.confidence >= 0.8 ? "parser_succeeded" : "parser_low_confidence",
    actor_user_id: me.authUserId,
    description: `Rule parser confidence ${parsed.confidence.toFixed(2)}`,
    payload: {
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
    },
  });

  if (activityError) {
    fail(detailPath, `Parsed details saved, but activity failed: ${activityError.message}`);
  }

  ok(detailPath, "Raw details parsed.");
}

export async function promoteRawInboxToLead(formData: FormData) {
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
  if (raw.lead_id) {
    redirect(`/crm/leads/${raw.lead_id}?ok=${encodeURIComponent("Raw intake is already promoted.")}`);
  }
  if (!raw.extracted_country || !raw.extracted_city) {
    fail(detailPath, "Country and city are required before promotion. Run Parse Details or review manually.");
  }

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
          .select("product_category, default_branch_id")
          .eq("id", raw.campaign_source_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const branchId = campaign?.default_branch_id ?? number?.default_branch_id ?? null;
  const productCategory =
    campaign?.product_category ?? number?.product_category ?? raw.extracted_country;

  const { data: lead, error: leadError } = await admin
    .from("crm_leads")
    .insert({
      raw_inbox_id: id,
      assigned_agent_id: null,
      branch_id: branchId,
      status: "new",
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
      source_whatsapp_number_id: raw.whatsapp_number_id,
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

  revalidatePath(INBOX_PATH);
  revalidatePath(LEADS_PATH);
  redirect(`/crm/leads/${lead.id}?ok=${encodeURIComponent("Raw intake promoted to lead.")}`);
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
