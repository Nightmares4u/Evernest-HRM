"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/require-role";
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
