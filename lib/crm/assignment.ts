import { createAdminClient } from "@/lib/supabase/server";
import { isWhatsappNumberFallbackActiveNow } from "@/lib/crm/fallback";
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
      source_owner_type: "default" | "fallback";
      default_employee_id: string | null;
      default_employee_name: string | null;
      fallback_employee_id: string | null;
      fallback_employee_name: string | null;
      fallback_reason: string | null;
      fallback_starts_at: string | null;
      fallback_ends_at: string | null;
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

type WhatsappNumberOwnerRow = {
  id: string;
  label: string | null;
  display_number: string | null;
  assigned_employee_id: string | null;
  fallback_employee_id: string | null;
  fallback_active: boolean | null;
  fallback_reason: string | null;
  fallback_starts_at: string | null;
  fallback_ends_at: string | null;
};

const WHATSAPP_OWNER_SELECT = `
  id,
  label,
  display_number,
  assigned_employee_id,
  fallback_employee_id,
  fallback_active,
  fallback_reason,
  fallback_starts_at,
  fallback_ends_at
`;

async function loadEmployeeNames(
  admin: ReturnType<typeof createAdminClient>,
  employeeIds: Array<string | null>
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(employeeIds.filter(Boolean) as string[]));
  if (ids.length === 0) return new Map();

  const { data } = await admin
    .from("employees")
    .select("id, full_name")
    .in("id", ids);

  return new Map(
    ((data ?? []) as Array<{ id: string; full_name: string | null }>).map((employee) => [
      employee.id,
      employee.full_name ?? employee.id,
    ])
  );
}

async function resolveWhatsappNumberOwner(
  admin: ReturnType<typeof createAdminClient>,
  number: WhatsappNumberOwnerRow,
  via: "lead_whatsapp_number" | "campaign_whatsapp_number"
): Promise<CrmSourceOwnerMatch> {
  const employeeNames = await loadEmployeeNames(admin, [
    number.assigned_employee_id,
    number.fallback_employee_id,
  ]);
  const numberLabel = number.label ?? number.display_number ?? number.id;
  const defaultEmployeeName = number.assigned_employee_id
    ? employeeNames.get(number.assigned_employee_id) ?? number.assigned_employee_id
    : null;
  const fallbackEmployeeName = number.fallback_employee_id
    ? employeeNames.get(number.fallback_employee_id) ?? number.fallback_employee_id
    : null;

  if (isWhatsappNumberFallbackActiveNow(number) && number.fallback_employee_id) {
    return {
      matched: true,
      target_employee_id: number.fallback_employee_id,
      whatsapp_number_id: number.id,
      whatsapp_number_label: number.label,
      whatsapp_display_number: number.display_number,
      via,
      source_owner_type: "fallback",
      default_employee_id: number.assigned_employee_id,
      default_employee_name: defaultEmployeeName,
      fallback_employee_id: number.fallback_employee_id,
      fallback_employee_name: fallbackEmployeeName,
      fallback_reason: number.fallback_reason,
      fallback_starts_at: number.fallback_starts_at,
      fallback_ends_at: number.fallback_ends_at,
      reason: `Auto-assigned from WhatsApp number fallback: ${
        fallbackEmployeeName ?? number.fallback_employee_id
      }, default owner: ${defaultEmployeeName ?? "Unassigned"}, number: ${numberLabel}.`,
    };
  }

  if (number.assigned_employee_id) {
    return {
      matched: true,
      target_employee_id: number.assigned_employee_id,
      whatsapp_number_id: number.id,
      whatsapp_number_label: number.label,
      whatsapp_display_number: number.display_number,
      via,
      source_owner_type: "default",
      default_employee_id: number.assigned_employee_id,
      default_employee_name: defaultEmployeeName,
      fallback_employee_id: number.fallback_employee_id,
      fallback_employee_name: fallbackEmployeeName,
      fallback_reason: number.fallback_reason,
      fallback_starts_at: number.fallback_starts_at,
      fallback_ends_at: number.fallback_ends_at,
      reason: `Assigned from WhatsApp number owner (${numberLabel}).`,
    };
  }

  return {
    matched: false,
    reason: `No source owner found on WhatsApp number (${numberLabel}).`,
  };
}

export async function findSourceOwnerForLead(
  source: CrmSourceOwnerInput
): Promise<CrmSourceOwnerMatch> {
  const admin = createAdminClient();

  if (source.source_whatsapp_number_id) {
    const { data: number, error } = await admin
      .from("crm_whatsapp_numbers")
      .select(WHATSAPP_OWNER_SELECT)
      .eq("id", source.source_whatsapp_number_id)
      .maybeSingle();
    if (error) {
      return {
        matched: false,
        reason: `Could not load WhatsApp number: ${error.message}`,
      };
    }
    if (number) {
      const owner = await resolveWhatsappNumberOwner(
        admin,
        number as WhatsappNumberOwnerRow,
        "lead_whatsapp_number"
      );
      if (owner.matched) return owner;
    }
  }

  if (source.campaign_source_id) {
    const { data: campaign, error } = await admin
      .from("crm_campaign_sources")
      .select(
        `whatsapp_number_id, crm_whatsapp_numbers:whatsapp_number_id ( ${WHATSAPP_OWNER_SELECT} )`
      )
      .eq("id", source.campaign_source_id)
      .maybeSingle();
    if (error) {
      return {
        matched: false,
        reason: `Could not load campaign source: ${error.message}`,
      };
    }
    const numberRaw = campaign?.crm_whatsapp_numbers as
      | WhatsappNumberOwnerRow
      | WhatsappNumberOwnerRow[]
      | null
      | undefined;
    const number = Array.isArray(numberRaw) ? numberRaw[0] ?? null : numberRaw ?? null;
    if (number) {
      const owner = await resolveWhatsappNumberOwner(
        admin,
        number,
        "campaign_whatsapp_number"
      );
      if (owner.matched) return owner;
    }
  }

  return {
    matched: false,
    reason: "No source owner found on WhatsApp number or campaign.",
  };
}

export type RawIntakeAssignment = {
  assigned_employee_id: string | null;
  branch_id: string | null;
  assignment_method: string | null;
  assignment_reason: string | null;
};

// Resolve the owner of a raw intake at RECEIPT time using the same
// source-owner waterfall used at promotion. Ownership is independent of
// message quality: a bad/partial inquiry is still owned by the number's
// counselor. Returns a null employee (admin/unassigned queue) when no owner
// is configured.
export async function resolveRawIntakeAssignment(input: {
  source_whatsapp_number_id: string | null;
  campaign_source_id: string | null;
  fallback_branch_id?: string | null;
}): Promise<RawIntakeAssignment> {
  const owner = await findSourceOwnerForLead({
    source_whatsapp_number_id: input.source_whatsapp_number_id,
    campaign_source_id: input.campaign_source_id,
  });

  if (!owner.matched) {
    return {
      assigned_employee_id: null,
      branch_id: input.fallback_branch_id ?? null,
      assignment_method: null,
      assignment_reason: owner.reason,
    };
  }

  const admin = createAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("branch_id")
    .eq("id", owner.target_employee_id)
    .maybeSingle();

  return {
    assigned_employee_id: owner.target_employee_id,
    branch_id: employee?.branch_id ?? input.fallback_branch_id ?? null,
    assignment_method:
      owner.source_owner_type === "fallback"
        ? "auto_source_owner_fallback"
        : "auto_source_owner",
    assignment_reason: owner.reason,
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
