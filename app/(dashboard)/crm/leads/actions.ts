"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { actorFromCurrentUser } from "@/lib/auth/permissions";
import { canManageLead } from "@/lib/crm/permissions-leads";
import { createAdminClient } from "@/lib/supabase/server";
import type { CrmLead, CrmLeadStatus } from "@/lib/types/crm";

type ActionResult = {
  ok: boolean;
  message: string;
  leadId?: string;
};

const CRM_LEAD_STATUSES: CrmLeadStatus[] = [
  "new",
  "assigned",
  "contacted",
  "qualified",
  "follow_up",
  "lost",
  "converted",
];

function ok(message: string, leadId: string): ActionResult {
  return { ok: true, message, leadId };
}

function error(message: string, leadId?: string): ActionResult {
  return { ok: false, message, leadId };
}

function isValidLeadStatus(status: string): status is CrmLeadStatus {
  return CRM_LEAD_STATUSES.includes(status as CrmLeadStatus);
}

// super_admin/admin_hr → all; branch_manager+ → branch; counselor → assigned.
function canWorkLead(me: CurrentUser, lead: CrmLead): boolean {
  return canManageLead(actorFromCurrentUser(me), lead);
}

function requireActiveUser(me: CurrentUser | null): ActionResult | null {
  if (!me) return error("Sign in required.");
  if (!me.appUser.is_active) return error("Active user required.");
  return null;
}

function revalidateCrmLeadPaths(leadId: string) {
  revalidatePath("/crm/leads");
  revalidatePath(`/crm/leads/${leadId}`);
}

async function loadLead(leadId: string): Promise<{ lead: CrmLead | null; message?: string }> {
  const admin = createAdminClient();
  const { data, error: leadError } = await admin
    .from("crm_leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError) return { lead: null, message: `Could not load lead: ${leadError.message}` };
  return { lead: (data as CrmLead | null) ?? null };
}

function parsePakistanDateTime(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const zoned = new Date(trimmed);
  if (Number.isFinite(zoned.getTime()) && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
    return zoned;
  }

  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) return Number.isFinite(zoned.getTime()) ? zoned : null;

  const [, year, month, day, hour, minute, second = "0"] = match;
  const utcTime = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - 5,
    Number(minute),
    Number(second)
  );
  const date = new Date(utcTime);
  return Number.isFinite(date.getTime()) ? date : null;
}

export async function addCrmLeadNote(leadId: string, note: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  const authError = requireActiveUser(me);
  if (authError || !me) return authError ?? error("Sign in required.", leadId);

  const cleanLeadId = leadId.trim();
  const cleanNote = note.trim();
  if (!cleanLeadId) return error("Lead id is required.");
  if (!cleanNote) return error("Note is required.", cleanLeadId);

  const { lead, message } = await loadLead(cleanLeadId);
  if (message) return error(message, cleanLeadId);
  if (!lead) return error("Lead not found.", cleanLeadId);
  if (!canWorkLead(me, lead)) {
    return error("Only the assigned counselor or super admin can add notes.", lead.id);
  }

  const admin = createAdminClient();
  const { error: activityError } = await admin.from("crm_lead_activities").insert({
    lead_id: lead.id,
    raw_inbox_id: lead.raw_inbox_id,
    activity_type: "note_added",
    actor_user_id: me.authUserId,
    description: cleanNote,
    payload: {
      note: cleanNote,
    },
  });

  if (activityError) return error(`Could not add note: ${activityError.message}`, lead.id);

  revalidateCrmLeadPaths(lead.id);
  return ok("Note added.", lead.id);
}

export async function updateCrmLeadStatus(
  leadId: string,
  status: string,
  note = ""
): Promise<ActionResult> {
  const me = await getCurrentUser();
  const authError = requireActiveUser(me);
  if (authError || !me) return authError ?? error("Sign in required.", leadId);

  const cleanLeadId = leadId.trim();
  const cleanStatus = status.trim();
  const cleanNote = note.trim();
  if (!cleanLeadId) return error("Lead id is required.");
  if (!isValidLeadStatus(cleanStatus)) return error("Invalid lead status.", cleanLeadId);

  const { lead, message } = await loadLead(cleanLeadId);
  if (message) return error(message, cleanLeadId);
  if (!lead) return error("Lead not found.", cleanLeadId);
  if (!canWorkLead(me, lead)) {
    return error("Only the assigned counselor or super admin can update status.", lead.id);
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin.from("crm_leads").update({ status: cleanStatus }).eq("id", lead.id);

  if (updateError) return error(`Could not update status: ${updateError.message}`, lead.id);

  const { error: activityError } = await admin.from("crm_lead_activities").insert({
    lead_id: lead.id,
    raw_inbox_id: lead.raw_inbox_id,
    activity_type: "status_changed",
    actor_user_id: me.authUserId,
    description: cleanNote || `Status changed from ${lead.status} to ${cleanStatus}.`,
    payload: {
      from_status: lead.status,
      to_status: cleanStatus,
      note: cleanNote || null,
    },
  });

  if (activityError) {
    return error(`Status updated, but activity failed: ${activityError.message}`, lead.id);
  }

  revalidateCrmLeadPaths(lead.id);
  return ok("Lead status updated.", lead.id);
}

export async function scheduleCrmLeadFollowup(
  leadId: string,
  nextFollowupAt: string,
  note = ""
): Promise<ActionResult> {
  const me = await getCurrentUser();
  const authError = requireActiveUser(me);
  if (authError || !me) return authError ?? error("Sign in required.", leadId);

  const cleanLeadId = leadId.trim();
  const cleanNote = note.trim();
  const parsedDate = parsePakistanDateTime(nextFollowupAt);
  if (!cleanLeadId) return error("Lead id is required.");
  if (!parsedDate) return error("Valid follow-up date and time is required.", cleanLeadId);

  const { lead, message } = await loadLead(cleanLeadId);
  if (message) return error(message, cleanLeadId);
  if (!lead) return error("Lead not found.", cleanLeadId);
  if (!canWorkLead(me, lead)) {
    return error("Only the assigned counselor or super admin can schedule follow-ups.", lead.id);
  }

  const nextStatus: CrmLeadStatus =
    lead.status === "converted" || lead.status === "lost" ? lead.status : "follow_up";
  const nextFollowupIso = parsedDate.toISOString();

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("crm_leads")
    .update({
      next_followup_at: nextFollowupIso,
      status: nextStatus,
    })
    .eq("id", lead.id);

  if (updateError) return error(`Could not schedule follow-up: ${updateError.message}`, lead.id);

  const { error: activityError } = await admin.from("crm_lead_activities").insert({
    lead_id: lead.id,
    raw_inbox_id: lead.raw_inbox_id,
    activity_type: "followup_scheduled",
    actor_user_id: me.authUserId,
    description: cleanNote || `Follow-up scheduled for ${nextFollowupIso}.`,
    payload: {
      next_followup_at: nextFollowupIso,
      note: cleanNote || null,
      from_status: lead.status,
      to_status: nextStatus,
    },
  });

  if (activityError) {
    return error(`Follow-up scheduled, but activity failed: ${activityError.message}`, lead.id);
  }

  revalidateCrmLeadPaths(lead.id);
  return ok("Follow-up scheduled.", lead.id);
}

export async function enrichCrmLead(formData: FormData): Promise<ActionResult> {
  const me = await getCurrentUser();
  const authError = requireActiveUser(me);
  if (authError || !me) return authError ?? error("Sign in required.");

  const leadId = String(formData.get("lead_id") ?? "").trim();
  if (!leadId) return error("Lead id is required.");

  const { lead, message } = await loadLead(leadId);
  if (message) return error(message, leadId);
  if (!lead) return error("Lead not found.", leadId);
  if (!canWorkLead(me, lead)) {
    return error(
      "Only the assigned counselor, branch manager, or super admin can edit lead details.",
      lead.id
    );
  }

  const clean = (key: string): string | null => {
    const value = String(formData.get(key) ?? "").trim();
    return value ? value : null;
  };

  const interested_country = clean("interested_country");
  const city = clean("city");
  // Country + city are the minimum qualifying fields; once both are present the
  // lead is no longer flagged for enrichment.
  const needsEnrichment = !(interested_country && city);

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("crm_leads")
    .update({
      interested_country,
      city,
      last_qualification: clean("last_qualification"),
      marks_cgpa: clean("marks_cgpa"),
      study_gap: clean("study_gap"),
      budget_range: clean("budget_range"),
      english_test_status: clean("english_test_status"),
      needs_enrichment: needsEnrichment,
    })
    .eq("id", lead.id);

  if (updateError) return error(`Could not save lead details: ${updateError.message}`, lead.id);

  const { error: activityError } = await admin.from("crm_lead_activities").insert({
    lead_id: lead.id,
    raw_inbox_id: lead.raw_inbox_id,
    activity_type: "details_received",
    actor_user_id: me.authUserId,
    description: needsEnrichment
      ? "Lead details edited (still needs enrichment: missing country/city)."
      : "Lead details enriched.",
    payload: { source: "lead_enrichment", needs_enrichment: needsEnrichment },
  });

  if (activityError) {
    return error(`Lead details saved, but activity failed: ${activityError.message}`, lead.id);
  }

  revalidateCrmLeadPaths(lead.id);
  return ok(needsEnrichment ? "Lead details saved." : "Lead enriched and ready.", lead.id);
}

export async function completeCrmLeadFollowup(
  leadId: string,
  note = ""
): Promise<ActionResult> {
  const me = await getCurrentUser();
  const authError = requireActiveUser(me);
  if (authError || !me) return authError ?? error("Sign in required.", leadId);

  const cleanLeadId = leadId.trim();
  const cleanNote = note.trim();
  if (!cleanLeadId) return error("Lead id is required.");

  const { lead, message } = await loadLead(cleanLeadId);
  if (message) return error(message, cleanLeadId);
  if (!lead) return error("Lead not found.", cleanLeadId);
  if (!canWorkLead(me, lead)) {
    return error("Only the assigned counselor or super admin can complete follow-ups.", lead.id);
  }
  if (!lead.next_followup_at) return error("No follow-up is currently scheduled.", lead.id);

  const completedAt = new Date().toISOString();
  const admin = createAdminClient();
  const { error: updateError } = await admin.from("crm_leads").update({ next_followup_at: null }).eq("id", lead.id);

  if (updateError) return error(`Could not complete follow-up: ${updateError.message}`, lead.id);

  const { error: activityError } = await admin.from("crm_lead_activities").insert({
    lead_id: lead.id,
    raw_inbox_id: lead.raw_inbox_id,
    activity_type: "followup_completed",
    actor_user_id: me.authUserId,
    description: cleanNote || "Follow-up completed.",
    payload: {
      completed_at: completedAt,
      previous_next_followup_at: lead.next_followup_at,
      note: cleanNote || null,
    },
  });

  if (activityError) {
    return error(`Follow-up completed, but activity failed: ${activityError.message}`, lead.id);
  }

  revalidateCrmLeadPaths(lead.id);
  return ok("Follow-up marked complete.", lead.id);
}
