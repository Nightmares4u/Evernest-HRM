import { createAdminClient } from "@/lib/supabase/server";
import type { CrmAssignmentRule, CrmLead } from "@/lib/types/crm";

export type CrmAssignmentMatch =
  | {
      matched: true;
      rule: CrmAssignmentRule;
      target_employee_id: string;
      reason: string;
    }
  | {
      matched: false;
      reason: string;
    };

export type CrmSourceOwnerMatch =
  | {
      matched: true;
      target_employee_id: string;
      whatsapp_number_id: string;
      whatsapp_number_label: string | null;
      whatsapp_display_number: string | null;
      via: "lead_whatsapp_number" | "campaign_whatsapp_number";
      reason: string;
    }
  | {
      matched: false;
      reason: string;
    };

function normalize(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(
      /^(?:country interested|interested country|country|city|product|category|product\/category)\s*[:.-]\s*/i,
      ""
    )
    .trim()
    .toLowerCase();
}

function textMatches(ruleValue: string | null, leadValue: string | null): boolean {
  if (!ruleValue) return true;
  return normalize(ruleValue) === normalize(leadValue);
}

function idMatches(ruleValue: string | null, leadValue: string | null): boolean {
  if (!ruleValue) return true;
  return ruleValue === leadValue;
}

function specificity(rule: CrmAssignmentRule): number {
  return [
    rule.match_product_category,
    rule.match_country,
    rule.match_city,
    rule.match_branch_id,
    rule.whatsapp_number_id,
    rule.campaign_source_id,
  ].filter(Boolean).length;
}

function ruleMatches(rule: CrmAssignmentRule, lead: CrmLead): boolean {
  return (
    textMatches(rule.match_product_category, lead.product_category) &&
    textMatches(rule.match_country, lead.interested_country) &&
    textMatches(rule.match_city, lead.city) &&
    idMatches(rule.match_branch_id, lead.branch_id) &&
    idMatches(rule.whatsapp_number_id, lead.source_whatsapp_number_id) &&
    idMatches(rule.campaign_source_id, lead.campaign_source_id)
  );
}

export type CrmSourceOwnerInput = {
  source_whatsapp_number_id: string | null;
  campaign_source_id: string | null;
};

export async function findSourceOwnerForLead(
  source: CrmSourceOwnerInput
): Promise<CrmSourceOwnerMatch> {
  const admin = createAdminClient();

  if (source.source_whatsapp_number_id) {
    const { data: number, error } = await admin
      .from("crm_whatsapp_numbers")
      .select("id, label, display_number, assigned_employee_id")
      .eq("id", source.source_whatsapp_number_id)
      .maybeSingle();
    if (error) {
      return {
        matched: false,
        reason: `Could not load WhatsApp number: ${error.message}`,
      };
    }
    if (number?.assigned_employee_id) {
      return {
        matched: true,
        target_employee_id: number.assigned_employee_id,
        whatsapp_number_id: number.id,
        whatsapp_number_label: number.label ?? null,
        whatsapp_display_number: number.display_number ?? null,
        via: "lead_whatsapp_number",
        reason: `Assigned from WhatsApp number owner (${number.label ?? number.display_number ?? number.id}).`,
      };
    }
  }

  if (source.campaign_source_id) {
    const { data: campaign, error } = await admin
      .from("crm_campaign_sources")
      .select(
        "whatsapp_number_id, crm_whatsapp_numbers:whatsapp_number_id ( id, label, display_number, assigned_employee_id )"
      )
      .eq("id", source.campaign_source_id)
      .maybeSingle();
    if (error) {
      return {
        matched: false,
        reason: `Could not load campaign source: ${error.message}`,
      };
    }
    type NumberRow = {
      id: string;
      label: string | null;
      display_number: string | null;
      assigned_employee_id: string | null;
    };
    const numberRaw = campaign?.crm_whatsapp_numbers as
      | NumberRow
      | NumberRow[]
      | null
      | undefined;
    const number = Array.isArray(numberRaw) ? numberRaw[0] ?? null : numberRaw ?? null;
    if (number?.assigned_employee_id) {
      return {
        matched: true,
        target_employee_id: number.assigned_employee_id,
        whatsapp_number_id: number.id,
        whatsapp_number_label: number.label,
        whatsapp_display_number: number.display_number,
        via: "campaign_whatsapp_number",
        reason: `Assigned from campaign's WhatsApp number owner (${number.label ?? number.display_number ?? number.id}).`,
      };
    }
  }

  return {
    matched: false,
    reason: "No source owner found on WhatsApp number or campaign.",
  };
}

export async function findCrmAssignmentRuleForLead(
  lead: CrmLead
): Promise<CrmAssignmentMatch> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_assignment_rules")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return { matched: false, reason: `Could not load assignment rules: ${error.message}` };
  }

  const matches = ((data ?? []) as CrmAssignmentRule[])
    .filter((rule) => Boolean(rule.target_employee_id))
    .filter((rule) => ruleMatches(rule, lead))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return specificity(b) - specificity(a);
    });

  const rule = matches[0];
  if (!rule) return { matched: false, reason: "No matching assignment rule found." };

  return {
    matched: true,
    rule,
    target_employee_id: rule.target_employee_id!,
    reason: rule.reason_template || `Matched assignment rule: ${rule.name}`,
  };
}
