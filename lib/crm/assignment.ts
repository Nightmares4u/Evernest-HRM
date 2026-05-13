import { createAdminClient } from "@/lib/supabase/server";
import type { CrmAssignmentRule, CrmLead } from "@/lib/types/crm";

export type CrmAssignmentMatch =
  | {
      matched: true;
      rule: CrmAssignmentRule;
      target_employee_id: string | null;
      target_branch_id: string | null;
      reason: string;
    }
  | {
      matched: false;
      reason: string;
    };

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
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
    target_employee_id: rule.target_employee_id,
    target_branch_id: rule.target_branch_id,
    reason: rule.reason_template || `Matched assignment rule: ${rule.name}`,
  };
}
