import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import {
  actorFromCurrentUser,
  isBranchManagerOrAboveRole,
  isGlobalAdminRole,
  isTeamMemberRole,
} from "@/lib/auth/permissions";
import type { Branch, Employee, UserRole } from "@/lib/types/hrm";
import type {
  CrmActivityType,
  CrmAssignmentMethod,
  CrmAssignmentRule,
  CrmCampaignSource,
  CrmClient,
  CrmClientActivity,
  CrmClientApplication,
  CrmClientApplicationVM,
  CrmClientCountryMilestone,
  CrmClientCountryMilestoneVM,
  CrmClientDocument,
  CrmClientDocumentVM,
  CrmClientPayment,
  CrmClientStatus,
  CrmClientVM,
  CrmInitialProductCategory,
  CrmJsonObject,
  CrmJsonValue,
  CrmLead,
  CrmLeadStatus,
  CrmLeadActivity,
  CrmLeadTransfer,
  CrmParserSettings,
  CrmRawInbox,
  CrmRawStatus,
  CrmSupportedTargetCountry,
  CrmTransferStatus,
  CrmWhatsappNumber,
} from "@/lib/types/crm";
import {
  CRM_COUNTRY_MILESTONES,
  CRM_DOC_CODE_CATEGORY,
  normalizeTargetCountry,
} from "@/lib/types/crm";
import { DEFAULT_CRM_PARSER_SETTINGS } from "@/lib/crm/intake";
import { isWhatsappNumberFallbackActiveNow } from "@/lib/crm/fallback";
import {
  canEditClientMilestone,
  canEditClientStatus,
  canVerifyClientDoc,
  canViewCrmClient,
} from "@/lib/crm/permissions-clients";

export const CRM_PRODUCT_CATEGORIES = ["Italy", "Korea", "B2B", "General"] as const;

export const CRM_CAMPAIGN_PLATFORMS = [
  "facebook",
  "instagram",
  "whatsapp_manual",
  "referral",
  "walk_in",
  "other",
] as const;

export const CRM_RAW_STATUSES: CrmRawStatus[] = [
  "raw_new",
  "awaiting_details",
  "details_received",
  "needs_review",
  "qualified",
  "spam_duplicate",
];

export type CrmCampaignPlatform = (typeof CRM_CAMPAIGN_PLATFORMS)[number];

export type BranchRef = Pick<Branch, "id" | "name" | "code">;

export type CrmEmployeeRef = Pick<Employee, "id" | "full_name" | "branch_id"> & {
  user_id: string;
  role: UserRole;
  email: string | null;
  branch_name: string | null;
  branch_code: string | null;
};

export type CrmWhatsappNumberVM = CrmWhatsappNumber & {
  branch_name: string | null;
  branch_code: string | null;
  assigned_employee_name: string | null;
  assigned_employee_branch_code: string | null;
  fallback_employee_name: string | null;
  fallback_employee_branch_code: string | null;
  fallback_is_currently_active: boolean;
};

export type CrmCampaignSourceVM = CrmCampaignSource & {
  platform: string;
  notes: string | null;
  whatsapp_number_label: string | null;
  whatsapp_display_number: string | null;
  branch_name: string | null;
  branch_code: string | null;
};

export type CrmAssignmentRuleVM = CrmAssignmentRule & {
  whatsapp_number_label: string | null;
  whatsapp_display_number: string | null;
  campaign_label: string | null;
  campaign_platform: string | null;
  match_branch_name: string | null;
  match_branch_code: string | null;
  target_employee_name: string | null;
  target_employee_branch_code: string | null;
  specificity: number;
};

export type CrmRawInboxFilters = {
  status?: string;
  product?: string;
  branch_id?: string;
  date_from?: string;
};

export type CrmRawInboxVM = CrmRawInbox & {
  received_at: string | null;
  message_preview: string | null;
  whatsapp_number_label: string | null;
  whatsapp_display_number: string | null;
  product_category: string | null;
  branch_id: string | null;
  branch_name: string | null;
  branch_code: string | null;
  campaign_label: string | null;
  campaign_platform: string | null;
  needs_review: boolean;
};

export type CrmActivityVM = CrmLeadActivity & {
  activity_label: string;
  actor_name: string | null;
};

export type CrmLeadVM = CrmLead & {
  assigned_agent_name: string | null;
  assigned_agent_role: UserRole | null;
  branch_name: string | null;
  branch_code: string | null;
  source_whatsapp_label: string | null;
  source_whatsapp_display_number: string | null;
  campaign_label: string | null;
  campaign_platform: string | null;
  latest_activity_at: string | null;
  latest_activity_label: string | null;
};

export type CrmFollowupBoardLeadVM = {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  status: CrmLeadStatus;
  next_followup_at: string | null;
  interested_country: string | null;
  assigned_agent_id: string | null;
  assigned_agent_name: string | null;
  source_whatsapp_label: string | null;
  branch_code: string | null;
};

export type CrmRawInboxDetailVM = CrmRawInboxVM & {
  lead: CrmLeadVM | null;
  activities: CrmActivityVM[];
  messages: Array<{
    id: string;
    content: string | null;
    direction: string;
    received_at: string | null;
    created_at: string;
  }>;
};

export type CrmLeadDetailVM = CrmLeadVM & {
  raw_inbox: CrmRawInboxVM | null;
  activities: CrmActivityVM[];
  assignments: Array<{
    id: string;
    status: string;
    method: CrmAssignmentMethod | null;
    to_employee_id: string | null;
    to_employee_name: string | null;
    from_employee_name: string | null;
    reason: string | null;
    created_at: string;
  }>;
};

export type CrmTransferFilters = {
  status?: CrmTransferStatus | "all";
};

export type CrmLeadTransferVM = CrmLeadTransfer & {
  lead_customer_phone: string | null;
  lead_customer_name: string | null;
  lead_status: string | null;
  lead_interested_country: string | null;
  lead_city: string | null;
  from_employee_name: string | null;
  from_employee_branch_code: string | null;
  from_branch_name: string | null;
  from_branch_code: string | null;
  to_employee_name: string | null;
  to_employee_branch_code: string | null;
  to_branch_name: string | null;
  to_branch_code: string | null;
  requested_by_name: string | null;
  decided_by_name: string | null;
};

export type CrmLeadTransferDetailVM = CrmLeadTransferVM & {
  lead: CrmLeadVM | null;
};

function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function byId<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

function metaString(metadata: CrmJsonObject | null | undefined, key: string): string | null {
  const value: CrmJsonValue | undefined = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function activityLabel(activityType: CrmActivityType): string {
  switch (activityType) {
    case "note_added":
      return "Note added";
    case "status_changed":
      return "Status changed";
    case "followup_scheduled":
      return "Follow-up scheduled";
    case "followup_completed":
      return "Follow-up completed";
    case "transfer_requested":
      return "Transfer requested";
    case "transfer_accepted":
      return "Transfer accepted";
    case "transfer_rejected":
      return "Transfer rejected";
    case "transfer_cancelled":
      return "Transfer cancelled";
    case "transfer_admin_override":
      return "Transfer admin override";
    default:
      break;
  }

  return activityType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function requireActiveCrmUser(me: CurrentUser | null): CurrentUser {
  if (!me || !me.appUser.is_active) {
    throw new Error("CRM access requires an active signed-in user.");
  }
  return me;
}

function canViewCrmLead(me: CurrentUser, lead: Pick<CrmLead, "assigned_agent_id" | "branch_id">): boolean {
  const actor = actorFromCurrentUser(me);
  if (isGlobalAdminRole(actor.role)) return true;
  if (isBranchManagerOrAboveRole(actor.role)) {
    return Boolean(actor.branch_id && actor.branch_id === lead.branch_id);
  }
  if (isTeamMemberRole(actor.role)) {
    return Boolean(actor.employee_id && actor.employee_id === lead.assigned_agent_id);
  }
  return false;
}

function canViewRawInboxRow(me: CurrentUser, row: CrmRawInboxVM): boolean {
  const actor = actorFromCurrentUser(me);
  if (isGlobalAdminRole(actor.role)) return true;
  if (row.lead_id) {
    return Boolean(row.branch_id && actor.branch_id && row.branch_id === actor.branch_id);
  }
  return false;
}

function canViewCrmTransfer(me: CurrentUser, transfer: CrmLeadTransfer): boolean {
  const actor = actorFromCurrentUser(me);
  if (actor.role === "super_admin") return true;
  return Boolean(
    actor.employee_id &&
      (transfer.from_employee_id === actor.employee_id ||
        transfer.to_employee_id === actor.employee_id ||
        transfer.requested_by_user_id === actor.id)
  );
}

export async function listCrmBranches(): Promise<BranchRef[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("branches")
    .select("id, name, code")
    .order("name");
  if (error) throw new Error(`listCrmBranches: ${error.message}`);
  return (data ?? []) as BranchRef[];
}

function threshold(value: unknown, fallback: number): number {
  return typeof value === "number" && value >= 0 && value <= 1 ? value : fallback;
}

export async function getCrmParserSettings(): Promise<CrmParserSettings> {
  if (!isSupabaseConfigured()) return DEFAULT_CRM_PARSER_SETTINGS;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("settings")
    .select("value")
    .eq("key", "crm_parser")
    .maybeSingle();

  if (error) throw new Error(`getCrmParserSettings: ${error.message}`);

  const value = (data as { value?: Record<string, unknown> } | null)?.value;
  return {
    auto_promote: threshold(
      value?.auto_promote,
      DEFAULT_CRM_PARSER_SETTINGS.auto_promote
    ),
    needs_review: threshold(
      value?.needs_review,
      DEFAULT_CRM_PARSER_SETTINGS.needs_review
    ),
  };
}

export async function listCrmAssignableEmployees(): Promise<CrmEmployeeRef[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("employees")
    .select("id, user_id, full_name, branch_id, app_users:user_id ( email, role ), branches ( name, code )")
    .eq("employment_status", "active")
    .order("full_name");
  if (error) throw new Error(`listCrmAssignableEmployees: ${error.message}`);

  type Row = Pick<Employee, "id" | "user_id" | "full_name" | "branch_id"> & {
    app_users:
      | { email: string | null; role: UserRole }
      | { email: string | null; role: UserRole }[]
      | null;
    branches:
      | { name: string | null; code: string | null }
      | { name: string | null; code: string | null }[]
      | null;
  };

  return ((data ?? []) as Row[]).map((row) => {
    const user = pickOne(row.app_users);
    const branch = pickOne(row.branches);
    return {
      id: row.id,
      user_id: row.user_id,
      full_name: row.full_name,
      branch_id: row.branch_id,
      role: user?.role ?? "employee",
      email: user?.email ?? null,
      branch_name: branch?.name ?? null,
      branch_code: branch?.code ?? null,
    };
  });
}

export async function listCrmWhatsappNumbers(): Promise<CrmWhatsappNumberVM[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = createAdminClient();
  const [{ data: numbers, error: numbersError }, branches, employees] =
    await Promise.all([
      admin
        .from("crm_whatsapp_numbers")
        .select("*")
        .order("is_active", { ascending: false })
        .order("label"),
      listCrmBranches(),
      listCrmAssignableEmployees(),
    ]);
  if (numbersError) throw new Error(`listCrmWhatsappNumbers: ${numbersError.message}`);

  const branchesById = byId(branches);
  const employeesById = byId(employees);
  return ((numbers ?? []) as CrmWhatsappNumber[]).map((number) => {
    const branch = number.default_branch_id
      ? branchesById.get(number.default_branch_id) ?? null
      : null;
    const employee = number.assigned_employee_id
      ? employeesById.get(number.assigned_employee_id) ?? null
      : null;
    const fallbackEmployee = number.fallback_employee_id
      ? employeesById.get(number.fallback_employee_id) ?? null
      : null;
    return {
      ...number,
      branch_name: branch?.name ?? null,
      branch_code: branch?.code ?? null,
      assigned_employee_name: employee?.full_name ?? null,
      assigned_employee_branch_code: employee?.branch_code ?? null,
      fallback_employee_name: fallbackEmployee?.full_name ?? null,
      fallback_employee_branch_code: fallbackEmployee?.branch_code ?? null,
      fallback_is_currently_active: isWhatsappNumberFallbackActiveNow(number),
    };
  });
}

export async function listCrmCampaignSources(): Promise<CrmCampaignSourceVM[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = createAdminClient();
  const [{ data: sources, error: sourcesError }, whatsappNumbers, branches] =
    await Promise.all([
      admin
        .from("crm_campaign_sources")
        .select("*")
        .order("is_active", { ascending: false })
        .order("label"),
      listCrmWhatsappNumbers(),
      listCrmBranches(),
    ]);
  if (sourcesError) throw new Error(`listCrmCampaignSources: ${sourcesError.message}`);

  const numbersById = byId(whatsappNumbers);
  const branchesById = byId(branches);

  return ((sources ?? []) as CrmCampaignSource[]).map((source) => {
    const number = source.whatsapp_number_id
      ? numbersById.get(source.whatsapp_number_id) ?? null
      : null;
    const branch = source.default_branch_id
      ? branchesById.get(source.default_branch_id) ?? null
      : null;
    return {
      ...source,
      platform: metaString(source.metadata, "platform") ?? "other",
      notes: metaString(source.metadata, "notes"),
      whatsapp_number_label: number?.label ?? null,
      whatsapp_display_number: number?.display_number ?? null,
      branch_name: branch?.name ?? null,
      branch_code: branch?.code ?? null,
    };
  });
}

function assignmentRuleSpecificity(rule: Pick<
  CrmAssignmentRule,
  | "match_product_category"
  | "match_country"
  | "match_city"
  | "match_branch_id"
  | "whatsapp_number_id"
  | "campaign_source_id"
>): number {
  return [
    rule.match_product_category,
    rule.match_country,
    rule.match_city,
    rule.match_branch_id,
    rule.whatsapp_number_id,
    rule.campaign_source_id,
  ].filter(Boolean).length;
}

export async function listCrmAssignmentRules(): Promise<CrmAssignmentRuleVM[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = createAdminClient();
  const [{ data: rules, error }, whatsappNumbers, campaignSources, branches, employees] =
    await Promise.all([
      admin
        .from("crm_assignment_rules")
        .select("*")
        .order("is_active", { ascending: false })
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true }),
      listCrmWhatsappNumbers(),
      listCrmCampaignSources(),
      listCrmBranches(),
      listCrmAssignableEmployees(),
    ]);
  if (error) throw new Error(`listCrmAssignmentRules: ${error.message}`);

  const numbersById = byId(whatsappNumbers);
  const campaignsById = byId(campaignSources);
  const branchesById = byId(branches);
  const employeesById = byId(employees);

  return ((rules ?? []) as CrmAssignmentRule[]).map((rule) => {
    const number = rule.whatsapp_number_id
      ? numbersById.get(rule.whatsapp_number_id) ?? null
      : null;
    const campaign = rule.campaign_source_id
      ? campaignsById.get(rule.campaign_source_id) ?? null
      : null;
    const matchBranch = rule.match_branch_id
      ? branchesById.get(rule.match_branch_id) ?? null
      : null;
    const targetEmployee = rule.target_employee_id
      ? employeesById.get(rule.target_employee_id) ?? null
      : null;

    return {
      ...rule,
      whatsapp_number_label: number?.label ?? null,
      whatsapp_display_number: number?.display_number ?? null,
      campaign_label: campaign?.label ?? null,
      campaign_platform: campaign?.platform ?? null,
      match_branch_name: matchBranch?.name ?? null,
      match_branch_code: matchBranch?.code ?? null,
      target_employee_name: targetEmployee?.full_name ?? null,
      target_employee_branch_code: targetEmployee?.branch_code ?? null,
      specificity: assignmentRuleSpecificity(rule),
    };
  });
}

export async function listCrmRawInbox(
  filters: CrmRawInboxFilters = {}
): Promise<CrmRawInboxVM[]> {
  if (!isSupabaseConfigured()) return [];

  const me = requireActiveCrmUser(await getCurrentUser());
  const admin = createAdminClient();
  let query = admin
    .from("crm_raw_inbox")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.status && CRM_RAW_STATUSES.includes(filters.status as CrmRawStatus)) {
    query = query.eq("status", filters.status);
  }
  if (filters.date_from && /^\d{4}-\d{2}-\d{2}$/.test(filters.date_from)) {
    query = query.gte("created_at", `${filters.date_from}T00:00:00.000Z`);
  }

  const [{ data: inboxRows, error }, whatsappNumbers, campaignSources, branches] =
    await Promise.all([
      query,
      listCrmWhatsappNumbers(),
      listCrmCampaignSources(),
      listCrmBranches(),
    ]);
  if (error) throw new Error(`listCrmRawInbox: ${error.message}`);

  const numbersById = byId(whatsappNumbers);
  const campaignsById = byId(campaignSources);
  const branchesById = byId(branches);

  const rows = ((inboxRows ?? []) as CrmRawInbox[]).map((row) => {
    const number = row.whatsapp_number_id
      ? numbersById.get(row.whatsapp_number_id) ?? null
      : null;
    const campaign = row.campaign_source_id
      ? campaignsById.get(row.campaign_source_id) ?? null
      : null;
    const branchId =
      campaign?.default_branch_id ?? number?.default_branch_id ?? null;
    const branch = branchId ? branchesById.get(branchId) ?? null : null;
    const product = campaign?.product_category ?? number?.product_category ?? null;
    const missingCount = row.missing_fields?.length ?? 0;

    return {
      ...row,
      received_at: row.last_message_at ?? row.created_at,
      message_preview: row.first_message_text ?? row.last_message_text,
      whatsapp_number_label: number?.label ?? null,
      whatsapp_display_number: number?.display_number ?? null,
      product_category: product,
      branch_id: branchId,
      branch_name: branch?.name ?? null,
      branch_code: branch?.code ?? null,
      campaign_label: campaign?.label ?? null,
      campaign_platform: campaign?.platform ?? null,
      needs_review:
        row.status === "needs_review" ||
        row.status === "awaiting_details" ||
        missingCount > 0 ||
        (row.parser_confidence != null && row.parser_confidence < 0.5),
    };
  });

  return rows.filter((row) => {
    if (!canViewRawInboxRow(me, row)) return false;
    if (filters.product && row.product_category !== filters.product) return false;
    if (filters.branch_id && row.branch_id !== filters.branch_id) return false;
    return true;
  });
}

async function listCrmActivities(filters: {
  lead_id?: string | null;
  raw_inbox_id?: string | null;
}): Promise<CrmActivityVM[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = createAdminClient();
  let query = admin
    .from("crm_lead_activities")
    .select("*, app_users:actor_user_id ( display_name, email )")
    .order("created_at", { ascending: false })
    .limit(100);

  if (filters.lead_id && filters.raw_inbox_id) {
    query = query.or(`lead_id.eq.${filters.lead_id},raw_inbox_id.eq.${filters.raw_inbox_id}`);
  } else if (filters.lead_id) {
    query = query.eq("lead_id", filters.lead_id);
  } else if (filters.raw_inbox_id) {
    query = query.eq("raw_inbox_id", filters.raw_inbox_id);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listCrmActivities: ${error.message}`);

  type Row = CrmLeadActivity & {
    app_users:
      | { display_name: string | null; email: string | null }
      | { display_name: string | null; email: string | null }[]
      | null;
  };

  return ((data ?? []) as Row[]).map((row) => {
    const actor = pickOne(row.app_users);
    return {
      id: row.id,
      lead_id: row.lead_id,
      raw_inbox_id: row.raw_inbox_id,
      activity_type: row.activity_type,
      actor_user_id: row.actor_user_id,
      description: row.description,
      payload: row.payload,
      created_at: row.created_at,
      activity_label: activityLabel(row.activity_type),
      actor_name: actor?.display_name ?? actor?.email ?? null,
    };
  });
}

async function enrichCrmLeads(leads: CrmLead[]): Promise<CrmLeadVM[]> {
  const [employees, branches, whatsappNumbers, campaignSources] = await Promise.all([
    listCrmAssignableEmployees(),
    listCrmBranches(),
    listCrmWhatsappNumbers(),
    listCrmCampaignSources(),
  ]);
  const employeesById = byId(employees);
  const branchesById = byId(branches);
  const numbersById = byId(whatsappNumbers);
  const campaignsById = byId(campaignSources);

  const activitiesByLead = new Map<string, CrmActivityVM>();
  if (leads.length > 0) {
    const leadIds = leads.map((lead) => lead.id);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("crm_lead_activities")
      .select("*, app_users:actor_user_id ( display_name, email )")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`enrichCrmLeads.activities: ${error.message}`);

    type Row = CrmLeadActivity & {
      app_users:
        | { display_name: string | null; email: string | null }
        | { display_name: string | null; email: string | null }[]
        | null;
    };

    for (const row of (data ?? []) as Row[]) {
      if (!row.lead_id || activitiesByLead.has(row.lead_id)) continue;
      const actor = pickOne(row.app_users);
      activitiesByLead.set(row.lead_id, {
        id: row.id,
        lead_id: row.lead_id,
        raw_inbox_id: row.raw_inbox_id,
        activity_type: row.activity_type,
        actor_user_id: row.actor_user_id,
        description: row.description,
        payload: row.payload,
        created_at: row.created_at,
        activity_label: activityLabel(row.activity_type),
        actor_name: actor?.display_name ?? actor?.email ?? null,
      });
    }
  }

  return leads.map((lead) => {
    const employee = lead.assigned_agent_id
      ? employeesById.get(lead.assigned_agent_id) ?? null
      : null;
    const branch = lead.branch_id ? branchesById.get(lead.branch_id) ?? null : null;
    const whatsappNumber = lead.source_whatsapp_number_id
      ? numbersById.get(lead.source_whatsapp_number_id) ?? null
      : null;
    const campaign = lead.campaign_source_id
      ? campaignsById.get(lead.campaign_source_id) ?? null
      : null;
    const latestActivity = activitiesByLead.get(lead.id) ?? null;

    return {
      ...lead,
      assigned_agent_name: employee?.full_name ?? null,
      assigned_agent_role: employee?.role ?? null,
      branch_name: branch?.name ?? null,
      branch_code: branch?.code ?? null,
      source_whatsapp_label: whatsappNumber?.label ?? null,
      source_whatsapp_display_number: whatsappNumber?.display_number ?? null,
      campaign_label: campaign?.label ?? null,
      campaign_platform: campaign?.platform ?? null,
      latest_activity_at: latestActivity?.created_at ?? null,
      latest_activity_label: latestActivity?.activity_label ?? null,
    };
  });
}

export async function getCrmRawInboxDetail(id: string): Promise<CrmRawInboxDetailVM | null> {
  if (!isSupabaseConfigured()) return null;

  const me = requireActiveCrmUser(await getCurrentUser());
  const rows = await listCrmRawInbox();
  const row = rows.find((item) => item.id === id) ?? null;
  if (!row || !canViewRawInboxRow(me, row)) return null;

  const admin = createAdminClient();
  const [{ data: messageRows, error: messageError }, leadRows, activities] =
    await Promise.all([
      admin
        .from("crm_lead_messages")
        .select("id, content, direction, received_at, created_at")
        .eq("raw_inbox_id", id)
        .order("created_at", { ascending: false }),
      row.lead_id ? getCrmLeadDetail(row.lead_id) : Promise.resolve(null),
      listCrmActivities({ raw_inbox_id: id, lead_id: row.lead_id }),
    ]);
  if (messageError) throw new Error(`getCrmRawInboxDetail messages: ${messageError.message}`);

  return {
    ...row,
    lead: leadRows,
    activities,
    messages: (messageRows ?? []) as CrmRawInboxDetailVM["messages"],
  };
}

export async function listCrmLeads(filters: { assignment?: string } = {}): Promise<CrmLeadVM[]> {
  if (!isSupabaseConfigured()) return [];

  const me = requireActiveCrmUser(await getCurrentUser());
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`listCrmLeads: ${error.message}`);

  const leads = ((data ?? []) as CrmLead[]).filter((lead) => {
    if (!canViewCrmLead(me, lead)) return false;
    if (filters.assignment === "assigned" && !lead.assigned_agent_id) return false;
    if (filters.assignment === "unassigned" && lead.assigned_agent_id) return false;
    return true;
  });
  return enrichCrmLeads(leads);
}

export async function listCrmLeadsForFollowupBoard(opts: {
  scopeToEmployeeId?: string | null;
  statusFilter?: CrmLeadStatus | null;
  countryFilter?: string | null;
}): Promise<CrmFollowupBoardLeadVM[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = createAdminClient();
  let query = admin
    .from("crm_leads")
    .select(
      `
        id,
        customer_name,
        customer_phone,
        status,
        next_followup_at,
        interested_country,
        assigned_agent_id,
        assigned_agent:employees!crm_leads_assigned_agent_id_fkey(full_name),
        source_whatsapp:crm_whatsapp_numbers!crm_leads_source_whatsapp_number_id_fkey(label),
        branch:branches!crm_leads_branch_id_fkey(code)
      `
    )
    .or("next_followup_at.not.is.null,status.not.in.(lost,converted)")
    .order("next_followup_at", { ascending: true, nullsFirst: false });

  if (opts.scopeToEmployeeId) {
    query = query.eq("assigned_agent_id", opts.scopeToEmployeeId);
  }
  if (opts.statusFilter) {
    query = query.eq("status", opts.statusFilter);
  }
  const country = opts.countryFilter?.trim();
  if (country) {
    query = query.ilike("interested_country", `%${country}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listCrmLeadsForFollowupBoard: ${error.message}`);

  type Row = Pick<
    CrmLead,
    | "id"
    | "customer_name"
    | "customer_phone"
    | "status"
    | "next_followup_at"
    | "interested_country"
    | "assigned_agent_id"
  > & {
    assigned_agent:
      | { full_name: string | null }
      | { full_name: string | null }[]
      | null;
    source_whatsapp:
      | { label: string | null }
      | { label: string | null }[]
      | null;
    branch:
      | { code: string | null }
      | { code: string | null }[]
      | null;
  };

  return ((data ?? []) as Row[]).map((row) => {
    const assignedAgent = pickOne(row.assigned_agent);
    const sourceWhatsapp = pickOne(row.source_whatsapp);
    const branch = pickOne(row.branch);
    return {
      id: row.id,
      customer_name: row.customer_name,
      customer_phone: row.customer_phone,
      status: row.status,
      next_followup_at: row.next_followup_at,
      interested_country: row.interested_country,
      assigned_agent_id: row.assigned_agent_id,
      assigned_agent_name: assignedAgent?.full_name ?? null,
      source_whatsapp_label: sourceWhatsapp?.label ?? null,
      branch_code: branch?.code ?? null,
    };
  });
}

export async function getCrmLeadDetail(id: string): Promise<CrmLeadDetailVM | null> {
  if (!isSupabaseConfigured()) return null;

  const me = requireActiveCrmUser(await getCurrentUser());
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getCrmLeadDetail: ${error.message}`);
  if (!data) return null;

  const lead = data as CrmLead;
  if (!canViewCrmLead(me, lead)) return null;

  const [enrichedLead, rawInbox, activities, assignments, employees] = await Promise.all([
    enrichCrmLeads([lead]).then((rows) => rows[0]),
    lead.raw_inbox_id ? listCrmRawInbox().then((rows) => rows.find((row) => row.id === lead.raw_inbox_id) ?? null) : null,
    listCrmActivities({ lead_id: id, raw_inbox_id: lead.raw_inbox_id }),
    admin
      .from("crm_lead_assignments")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: false }),
    listCrmAssignableEmployees(),
  ]);

  if (assignments.error) {
    throw new Error(`getCrmLeadDetail assignments: ${assignments.error.message}`);
  }

  const employeesById = byId(employees);
  type AssignmentRow = {
    id: string;
    status: string;
    method: CrmAssignmentMethod | null;
    to_employee_id: string | null;
    from_employee_id: string | null;
    reason: string | null;
    created_at: string;
  };

  return {
    ...enrichedLead,
    raw_inbox: rawInbox,
    activities,
    assignments: ((assignments.data ?? []) as AssignmentRow[]).map((assignment) => ({
      id: assignment.id,
      status: assignment.status,
      method: assignment.method ?? null,
      to_employee_id: assignment.to_employee_id,
      to_employee_name: assignment.to_employee_id
        ? employeesById.get(assignment.to_employee_id)?.full_name ?? null
        : null,
      from_employee_name: assignment.from_employee_id
        ? employeesById.get(assignment.from_employee_id)?.full_name ?? null
        : null,
      reason: assignment.reason,
      created_at: assignment.created_at,
    })),
  };
}

async function enrichCrmTransfers(
  transfers: CrmLeadTransfer[]
): Promise<CrmLeadTransferVM[]> {
  if (transfers.length === 0) return [];

  const admin = createAdminClient();
  const leadIds = Array.from(new Set(transfers.map((transfer) => transfer.lead_id)));
  const userIds = Array.from(
    new Set(
      transfers
        .flatMap((transfer) => [
          transfer.requested_by_user_id,
          transfer.decided_by_user_id,
        ])
        .filter(Boolean) as string[]
    )
  );

  const [employees, branches, leadsRes, usersRes] = await Promise.all([
    listCrmAssignableEmployees(),
    listCrmBranches(),
    admin
      .from("crm_leads")
      .select(
        "id, customer_phone, customer_name, status, interested_country, city"
      )
      .in("id", leadIds),
    userIds.length > 0
      ? admin
          .from("app_users")
          .select("id, display_name, email")
          .in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (leadsRes.error) {
    throw new Error(`enrichCrmTransfers leads: ${leadsRes.error.message}`);
  }
  if (usersRes.error) {
    throw new Error(`enrichCrmTransfers users: ${usersRes.error.message}`);
  }

  type LeadSummary = Pick<
    CrmLead,
    "id" | "customer_phone" | "customer_name" | "status" | "interested_country" | "city"
  >;
  type UserSummary = {
    id: string;
    display_name: string | null;
    email: string | null;
  };

  const employeesById = byId(employees);
  const branchesById = byId(branches);
  const leadsById = byId((leadsRes.data ?? []) as LeadSummary[]);
  const usersById = byId((usersRes.data ?? []) as UserSummary[]);

  return transfers.map((transfer) => {
    const lead = leadsById.get(transfer.lead_id) ?? null;
    const fromEmployee = transfer.from_employee_id
      ? employeesById.get(transfer.from_employee_id) ?? null
      : null;
    const toEmployee = employeesById.get(transfer.to_employee_id) ?? null;
    const fromBranch = transfer.from_branch_id
      ? branchesById.get(transfer.from_branch_id) ?? null
      : null;
    const toBranch = transfer.to_branch_id
      ? branchesById.get(transfer.to_branch_id) ?? null
      : null;
    const requester = transfer.requested_by_user_id
      ? usersById.get(transfer.requested_by_user_id) ?? null
      : null;
    const decider = transfer.decided_by_user_id
      ? usersById.get(transfer.decided_by_user_id) ?? null
      : null;

    return {
      ...transfer,
      lead_customer_phone: lead?.customer_phone ?? null,
      lead_customer_name: lead?.customer_name ?? null,
      lead_status: lead?.status ?? null,
      lead_interested_country: lead?.interested_country ?? null,
      lead_city: lead?.city ?? null,
      from_employee_name: fromEmployee?.full_name ?? null,
      from_employee_branch_code: fromEmployee?.branch_code ?? null,
      from_branch_name: fromBranch?.name ?? null,
      from_branch_code: fromBranch?.code ?? null,
      to_employee_name: toEmployee?.full_name ?? null,
      to_employee_branch_code: toEmployee?.branch_code ?? null,
      to_branch_name: toBranch?.name ?? null,
      to_branch_code: toBranch?.code ?? null,
      requested_by_name: requester?.display_name ?? requester?.email ?? null,
      decided_by_name: decider?.display_name ?? decider?.email ?? null,
    };
  });
}

export async function listIncomingCrmTransfersForCurrentUser(): Promise<
  CrmLeadTransferVM[]
> {
  if (!isSupabaseConfigured()) return [];

  const me = requireActiveCrmUser(await getCurrentUser());
  const actor = actorFromCurrentUser(me);
  const admin = createAdminClient();
  let query = admin
    .from("crm_lead_transfers")
    .select("*")
    .eq("status", "pending")
    .order("requested_at", { ascending: false })
    .limit(200);

  if (actor.role !== "super_admin") {
    if (!actor.employee_id) return [];
    query = query.eq("to_employee_id", actor.employee_id);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listIncomingCrmTransfersForCurrentUser: ${error.message}`);

  return enrichCrmTransfers((data ?? []) as CrmLeadTransfer[]);
}

export async function listOutgoingCrmTransfersForCurrentUser(): Promise<
  CrmLeadTransferVM[]
> {
  if (!isSupabaseConfigured()) return [];

  const me = requireActiveCrmUser(await getCurrentUser());
  const actor = actorFromCurrentUser(me);
  const admin = createAdminClient();
  let query = admin
    .from("crm_lead_transfers")
    .select("*")
    .order("requested_at", { ascending: false })
    .limit(200);

  if (actor.employee_id) {
    query = query.or(
      `from_employee_id.eq.${actor.employee_id},requested_by_user_id.eq.${actor.id}`
    );
  } else {
    query = query.eq("requested_by_user_id", actor.id);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listOutgoingCrmTransfersForCurrentUser: ${error.message}`);

  return enrichCrmTransfers((data ?? []) as CrmLeadTransfer[]);
}

export async function listAllCrmTransfersForAdmin(
  filters: CrmTransferFilters = {}
): Promise<CrmLeadTransferVM[]> {
  if (!isSupabaseConfigured()) return [];

  const me = requireActiveCrmUser(await getCurrentUser());
  if (me.appUser.role !== "super_admin") {
    throw new Error("Super-admin access required.");
  }

  const admin = createAdminClient();
  let query = admin
    .from("crm_lead_transfers")
    .select("*")
    .order("requested_at", { ascending: false })
    .limit(300);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listAllCrmTransfersForAdmin: ${error.message}`);

  return enrichCrmTransfers((data ?? []) as CrmLeadTransfer[]);
}

export async function getCrmTransferDetail(
  transferId: string
): Promise<CrmLeadTransferDetailVM | null> {
  if (!isSupabaseConfigured()) return null;

  const me = requireActiveCrmUser(await getCurrentUser());
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_lead_transfers")
    .select("*")
    .eq("id", transferId)
    .maybeSingle();

  if (error) throw new Error(`getCrmTransferDetail: ${error.message}`);
  if (!data) return null;

  const transfer = data as CrmLeadTransfer;
  if (!canViewCrmTransfer(me, transfer)) return null;

  const [enrichedTransfer, lead] = await Promise.all([
    enrichCrmTransfers([transfer]).then((rows) => rows[0]),
    getCrmLeadDetail(transfer.lead_id),
  ]);

  return {
    ...enrichedTransfer,
    lead,
  };
}

export async function getPendingCrmTransferForLead(
  leadId: string
): Promise<CrmLeadTransferVM | null> {
  if (!isSupabaseConfigured()) return null;

  const me = requireActiveCrmUser(await getCurrentUser());
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_lead_transfers")
    .select("*")
    .eq("lead_id", leadId)
    .eq("status", "pending")
    .maybeSingle();

  if (error) throw new Error(`getPendingCrmTransferForLead: ${error.message}`);
  if (!data) return null;

  const transfer = data as CrmLeadTransfer;
  if (!canViewCrmTransfer(me, transfer)) return null;

  return enrichCrmTransfers([transfer]).then((rows) => rows[0] ?? null);
}

export async function listCrmLeadTransfersForLead(
  leadId: string
): Promise<CrmLeadTransferVM[]> {
  if (!isSupabaseConfigured()) return [];

  const me = requireActiveCrmUser(await getCurrentUser());
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_lead_transfers")
    .select("*")
    .eq("lead_id", leadId)
    .order("requested_at", { ascending: false });

  if (error) throw new Error(`listCrmLeadTransfersForLead: ${error.message}`);

  const transfers = ((data ?? []) as CrmLeadTransfer[]).filter((transfer) =>
    canViewCrmTransfer(me, transfer)
  );
  return enrichCrmTransfers(transfers);
}

export function normalizeProductCategory(value: string): CrmInitialProductCategory {
  const trimmed = value.trim();
  return (trimmed || "General") as CrmInitialProductCategory;
}

type CrmClientJoinedRow = CrmClient & {
  lead:
    | { customer_phone: string | null; customer_name: string | null }
    | { customer_phone: string | null; customer_name: string | null }[]
    | null;
  assigned_agent:
    | { full_name: string | null }
    | { full_name: string | null }[]
    | null;
  branch:
    | { code: string | null; name: string | null }
    | { code: string | null; name: string | null }[]
    | null;
};

function clientRowToVM(row: CrmClientJoinedRow): CrmClientVM {
  const lead = pickOne(row.lead);
  const assignedAgent = pickOne(row.assigned_agent);
  const branch = pickOne(row.branch);
  return {
    id: row.id,
    lead_id: row.lead_id,
    client_type: row.client_type,
    client_code: row.client_code,
    status: row.status,
    target_country: row.target_country,
    target_level: row.target_level,
    agreement_signed_at: row.agreement_signed_at,
    advance_paid_at: row.advance_paid_at,
    advance_amount: row.advance_amount,
    total_fee: row.total_fee,
    currency: row.currency,
    assigned_agent_id: row.assigned_agent_id,
    branch_id: row.branch_id,
    created_by_user_id: row.created_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    lead_customer_phone: lead?.customer_phone ?? "",
    lead_customer_name: lead?.customer_name ?? null,
    assigned_agent_name: assignedAgent?.full_name ?? null,
    branch_code: branch?.code ?? null,
    branch_name: branch?.name ?? null,
  };
}

type DepartmentJoinRow = {
  department:
    | { name: string | null }
    | { name: string | null }[]
    | null;
};

async function getActorDepartmentName(
  admin: ReturnType<typeof createAdminClient>,
  me: CurrentUser
): Promise<string | null> {
  if (!me.employee?.id) return null;

  const { data, error } = await admin
    .from("employees")
    .select("department:departments(name)")
    .eq("id", me.employee.id)
    .maybeSingle();

  if (error) throw new Error(`getActorDepartmentName: ${error.message}`);
  const department = pickOne((data as DepartmentJoinRow | null)?.department);
  return department?.name ?? null;
}

type CrmClientDocumentAccess = {
  client: CrmClientVM;
  canManageDocuments: boolean;
};

async function getClientDocumentAccess(
  admin: ReturnType<typeof createAdminClient>,
  me: CurrentUser,
  clientId: string,
  meDepartmentName: string | null
): Promise<CrmClientDocumentAccess | null> {
  const { data, error } = await admin
    .from("crm_clients")
    .select(
      `
        *,
        lead:crm_leads!crm_clients_lead_id_fkey(customer_phone, customer_name),
        assigned_agent:employees!crm_clients_assigned_agent_id_fkey(full_name),
        branch:branches!crm_clients_branch_id_fkey(code, name)
      `
    )
    .eq("id", clientId)
    .maybeSingle();

  if (error) throw new Error(`getClientDocumentAccess: ${error.message}`);
  if (!data) return null;

  const client = clientRowToVM(data as CrmClientJoinedRow);
  // Gate on broad view permission (Plan §10 — branch managers may view but not verify).
  if (!canViewCrmClient(me, client)) return null;
  // Action buttons (claim / approve / reject / upload) gated on narrow predicate.
  const canManageDocuments = canVerifyClientDoc(me, client, meDepartmentName);

  return { client, canManageDocuments };
}

type CrmClientDocumentJoinedRow = CrmClientDocument & {
  uploader:
    | { display_name: string | null }
    | { display_name: string | null }[]
    | null;
  reviewer:
    | { display_name: string | null }
    | { display_name: string | null }[]
    | null;
};

function documentRowToVM(row: CrmClientDocumentJoinedRow): CrmClientDocumentVM {
  const uploader = pickOne(row.uploader);
  const reviewer = pickOne(row.reviewer);
  return {
    id: row.id,
    client_id: row.client_id,
    doc_code: row.doc_code,
    doc_state: row.doc_state,
    storage_path: row.storage_path,
    file_name: row.file_name,
    file_size: row.file_size,
    mime_type: row.mime_type,
    uploaded_by_user_id: row.uploaded_by_user_id,
    uploaded_at: row.uploaded_at,
    reviewed_by_user_id: row.reviewed_by_user_id,
    reviewed_at: row.reviewed_at,
    decision_note: row.decision_note,
    superseded_by_id: row.superseded_by_id,
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    uploader_name: uploader?.display_name ?? null,
    reviewer_name: reviewer?.display_name ?? null,
  };
}

type CrmClientApplicationJoinedRow = CrmClientApplication & {
  offer_letter_document:
    | { file_name: string | null }
    | { file_name: string | null }[]
    | null;
};

function applicationRowToVM(row: CrmClientApplicationJoinedRow): CrmClientApplicationVM {
  const offerLetterDocument = pickOne(row.offer_letter_document);
  return {
    id: row.id,
    client_id: row.client_id,
    university_name: row.university_name,
    program_name: row.program_name,
    intake_year: row.intake_year,
    intake_term: row.intake_term,
    status: row.status,
    submitted_at: row.submitted_at,
    decision_at: row.decision_at,
    offer_letter_document_id: row.offer_letter_document_id,
    offer_amount_currency: row.offer_amount_currency,
    tuition_total: row.tuition_total,
    scholarship_amount: row.scholarship_amount,
    notes: row.notes,
    created_by_user_id: row.created_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    offer_letter_file_name: offerLetterDocument?.file_name ?? null,
  };
}

type CrmClientCountryMilestoneJoinedRow = CrmClientCountryMilestone & {
  completed_by:
    | { display_name: string | null }
    | { display_name: string | null }[]
    | null;
};

function milestoneDefinition(
  country: CrmSupportedTargetCountry | null,
  milestoneCode: string
) {
  if (!country) return null;
  return CRM_COUNTRY_MILESTONES[country].find((definition) => definition.code === milestoneCode) ?? null;
}

function milestoneOrder(
  country: CrmSupportedTargetCountry | null,
  milestoneCode: string
): number {
  if (!country) return 10_000;
  const index = CRM_COUNTRY_MILESTONES[country].findIndex((definition) => definition.code === milestoneCode);
  return index === -1 ? 10_000 : index;
}

function milestoneRowToVM(
  row: CrmClientCountryMilestoneJoinedRow,
  country: CrmSupportedTargetCountry | null
): CrmClientCountryMilestoneVM {
  const completedBy = pickOne(row.completed_by);
  return {
    id: row.id,
    client_id: row.client_id,
    milestone_code: row.milestone_code,
    status: row.status,
    due_at: row.due_at,
    completed_at: row.completed_at,
    completed_by_user_id: row.completed_by_user_id,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    definition: milestoneDefinition(country, row.milestone_code),
    completed_by_name: completedBy?.display_name ?? null,
  };
}

async function loadClientVM(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string
): Promise<CrmClientVM | null> {
  const { data, error } = await admin
    .from("crm_clients")
    .select(
      `
        *,
        lead:crm_leads!crm_clients_lead_id_fkey(customer_phone, customer_name),
        assigned_agent:employees!crm_clients_assigned_agent_id_fkey(full_name),
        branch:branches!crm_clients_branch_id_fkey(code, name)
      `
    )
    .eq("id", clientId)
    .maybeSingle();

  if (error) throw new Error(`loadClientVM: ${error.message}`);
  return data ? clientRowToVM(data as CrmClientJoinedRow) : null;
}

function visaSubmitBlockers(
  country: CrmSupportedTargetCountry | null,
  milestones: CrmClientCountryMilestoneVM[]
): string[] {
  if (!country) return [];
  return CRM_COUNTRY_MILESTONES[country]
    .filter((definition) => definition.required)
    .filter((definition) => {
      const row = milestones.find((milestone) => milestone.milestone_code === definition.code);
      return !row || (row.status !== "done" && row.status !== "not_applicable");
    })
    .map((definition) => definition.label);
}

export async function listCrmClients(filters: {
  status?: CrmClientStatus | null;
  scopeToEmployeeId?: string | null;
} = {}): Promise<CrmClientVM[]> {
  if (!isSupabaseConfigured()) return [];

  const me = requireActiveCrmUser(await getCurrentUser());
  const admin = createAdminClient();
  let query = admin
    .from("crm_clients")
    .select(
      `
        *,
        lead:crm_leads!crm_clients_lead_id_fkey(customer_phone, customer_name),
        assigned_agent:employees!crm_clients_assigned_agent_id_fkey(full_name),
        branch:branches!crm_clients_branch_id_fkey(code, name)
      `
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (me.appUser.role === "super_admin") {
    if (filters.scopeToEmployeeId) {
      query = query.eq("assigned_agent_id", filters.scopeToEmployeeId);
    }
  } else if (isBranchManagerOrAboveRole(me.appUser.role) && me.employee?.branch_id) {
    // Branch manager / assistant_manager / manager / admin_hr: see whole branch.
    // → clients.view (scope=branch)
    query = query.eq("branch_id", me.employee.branch_id);
    if (filters.scopeToEmployeeId) {
      query = query.eq("assigned_agent_id", filters.scopeToEmployeeId);
    }
  } else if (me.employee?.id) {
    query = query.eq("assigned_agent_id", me.employee.id);
  } else {
    return [];
  }

  const { data, error } = await query;
  if (error) throw new Error(`listCrmClients: ${error.message}`);
  return ((data ?? []) as CrmClientJoinedRow[]).map(clientRowToVM);
}

export async function getCrmClientDetail(id: string): Promise<{
  client: CrmClientVM;
  activities: CrmClientActivity[];
  payments: CrmClientPayment[];
} | null> {
  if (!isSupabaseConfigured()) return null;

  const me = requireActiveCrmUser(await getCurrentUser());
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_clients")
    .select(
      `
        *,
        lead:crm_leads!crm_clients_lead_id_fkey(customer_phone, customer_name),
        assigned_agent:employees!crm_clients_assigned_agent_id_fkey(full_name),
        branch:branches!crm_clients_branch_id_fkey(code, name)
      `
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getCrmClientDetail: ${error.message}`);
  if (!data) return null;

  const client = clientRowToVM(data as CrmClientJoinedRow);
  if (!canViewCrmClient(me, client)) {
    return null;
  }

  const [activitiesRes, paymentsRes] = await Promise.all([
    admin
      .from("crm_client_activities")
      .select("*")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
    admin
      .from("crm_client_payments")
      .select("*")
      .eq("client_id", client.id)
      .order("paid_at", { ascending: false }),
  ]);

  if (activitiesRes.error) {
    throw new Error(`getCrmClientDetail activities: ${activitiesRes.error.message}`);
  }
  if (paymentsRes.error) {
    throw new Error(`getCrmClientDetail payments: ${paymentsRes.error.message}`);
  }

  return {
    client,
    activities: (activitiesRes.data ?? []) as CrmClientActivity[],
    payments: (paymentsRes.data ?? []) as CrmClientPayment[],
  };
}

export async function getCrmClientDocumentPageData(
  clientId: string
): Promise<CrmClientDocumentAccess | null> {
  if (!isSupabaseConfigured()) return null;

  const me = requireActiveCrmUser(await getCurrentUser());
  const admin = createAdminClient();
  const meDepartmentName = await getActorDepartmentName(admin, me);
  return getClientDocumentAccess(admin, me, clientId, meDepartmentName);
}

export async function listCrmClientDocuments(
  clientId: string,
  opts: { includeSuperseded?: boolean } = {}
): Promise<CrmClientDocumentVM[]> {
  if (!isSupabaseConfigured()) return [];

  const me = requireActiveCrmUser(await getCurrentUser());
  const admin = createAdminClient();
  const meDepartmentName = await getActorDepartmentName(admin, me);
  const access = await getClientDocumentAccess(admin, me, clientId, meDepartmentName);
  if (!access) return [];

  let query = admin
    .from("crm_client_documents")
    .select(
      `
        *,
        uploader:app_users!crm_client_documents_uploaded_by_user_id_fkey(display_name),
        reviewer:app_users!crm_client_documents_reviewed_by_user_id_fkey(display_name)
      `
    )
    .eq("client_id", clientId)
    .order("uploaded_at", { ascending: false });

  if (!opts.includeSuperseded) {
    query = query.is("superseded_by_id", null);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listCrmClientDocuments: ${error.message}`);
  return ((data ?? []) as CrmClientDocumentJoinedRow[]).map(documentRowToVM);
}

export async function listDocsAwaitingReview(opts: {
  scopeToBranchId?: string | null;
} = {}): Promise<Array<{
  document: CrmClientDocumentVM;
  client_id: string;
  client_code: string;
  client_assigned_agent_name: string | null;
}>> {
  if (!isSupabaseConfigured()) return [];

  const me = requireActiveCrmUser(await getCurrentUser());
  const admin = createAdminClient();
  const meDepartmentName = await getActorDepartmentName(admin, me);
  let clientsQuery = admin
    .from("crm_clients")
    .select(
      `
        id,
        client_code,
        assigned_agent_id,
        branch_id,
        assigned_agent:employees!crm_clients_assigned_agent_id_fkey(full_name)
      `
    )
    .order("created_at", { ascending: false })
    .limit(500);

  // Super admins + Operations dept see the whole queue (all branches).
  // Branch managers see their branch's queue.
  // Everyone else sees only docs on clients assigned to them.
  const canSeeAllBranches =
    me.appUser.role === "super_admin" ||
    canVerifyClientDoc(me, { assigned_agent_id: null }, meDepartmentName);
  const canSeeOwnBranch =
    isBranchManagerOrAboveRole(me.appUser.role) && Boolean(me.employee?.branch_id);

  if (opts.scopeToBranchId) {
    clientsQuery = clientsQuery.eq("branch_id", opts.scopeToBranchId);
  }
  if (!canSeeAllBranches) {
    if (canSeeOwnBranch && me.employee?.branch_id) {
      clientsQuery = clientsQuery.eq("branch_id", me.employee.branch_id);
    } else if (me.employee?.id) {
      clientsQuery = clientsQuery.eq("assigned_agent_id", me.employee.id);
    } else {
      return [];
    }
  }

  const { data: clientsData, error: clientsError } = await clientsQuery;
  if (clientsError) throw new Error(`listDocsAwaitingReview clients: ${clientsError.message}`);

  type ReviewClientRow = Pick<CrmClient, "id" | "client_code" | "assigned_agent_id" | "branch_id"> & {
    assigned_agent:
      | { full_name: string | null }
      | { full_name: string | null }[]
      | null;
  };

  const clients = (clientsData ?? []) as ReviewClientRow[];
  if (clients.length === 0) return [];

  const clientIds = clients.map((client) => client.id);
  const clientById = new Map(
    clients.map((client) => {
      const assignedAgent = pickOne(client.assigned_agent);
      return [
        client.id,
        {
          client_code: client.client_code,
          client_assigned_agent_name: assignedAgent?.full_name ?? null,
        },
      ];
    })
  );

  const { data: docsData, error: docsError } = await admin
    .from("crm_client_documents")
    .select(
      `
        *,
        uploader:app_users!crm_client_documents_uploaded_by_user_id_fkey(display_name),
        reviewer:app_users!crm_client_documents_reviewed_by_user_id_fkey(display_name)
      `
    )
    .in("client_id", clientIds)
    .is("superseded_by_id", null)
    .in("doc_state", ["uploaded", "under_review"])
    .order("uploaded_at", { ascending: false })
    .limit(500);

  if (docsError) throw new Error(`listDocsAwaitingReview documents: ${docsError.message}`);

  return ((docsData ?? []) as CrmClientDocumentJoinedRow[]).flatMap((row) => {
    const client = clientById.get(row.client_id);
    if (!client) return [];
    return [{
      document: documentRowToVM(row),
      client_id: row.client_id,
      client_code: client.client_code,
      client_assigned_agent_name: client.client_assigned_agent_name,
    }];
  });
}

export async function getSignedDocumentDownloadUrl(documentId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  const me = requireActiveCrmUser(await getCurrentUser());
  const admin = createAdminClient();
  const meDepartmentName = await getActorDepartmentName(admin, me);
  const { data: documentData, error: documentError } = await admin
    .from("crm_client_documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (documentError) throw new Error(`getSignedDocumentDownloadUrl document: ${documentError.message}`);
  if (!documentData) return null;

  const document = documentData as CrmClientDocument;
  const access = await getClientDocumentAccess(admin, me, document.client_id, meDepartmentName);
  if (!access) return null;

  const { data, error } = await admin.storage
    .from("crm-client-docs")
    .createSignedUrl(document.storage_path, 900);

  if (error) throw new Error(`getSignedDocumentDownloadUrl storage: ${error.message}`);
  return data.signedUrl;
}

export async function listCrmClientApplications(clientId: string): Promise<CrmClientApplicationVM[]> {
  if (!isSupabaseConfigured()) return [];

  const me = requireActiveCrmUser(await getCurrentUser());
  const admin = createAdminClient();
  const { data: clientData, error: clientError } = await admin
    .from("crm_clients")
    .select(
      `
        *,
        lead:crm_leads!crm_clients_lead_id_fkey(customer_phone, customer_name),
        assigned_agent:employees!crm_clients_assigned_agent_id_fkey(full_name),
        branch:branches!crm_clients_branch_id_fkey(code, name)
      `
    )
    .eq("id", clientId)
    .maybeSingle();

  if (clientError) throw new Error(`listCrmClientApplications client: ${clientError.message}`);
  if (!clientData) return [];

  const client = clientRowToVM(clientData as CrmClientJoinedRow);
  if (!canViewCrmClient(me, client)) return [];

  const { data, error } = await admin
    .from("crm_client_applications")
    .select(
      `
        *,
        offer_letter_document:crm_client_documents!crm_client_applications_offer_letter_document_id_fkey(file_name)
      `
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`listCrmClientApplications: ${error.message}`);
  return ((data ?? []) as CrmClientApplicationJoinedRow[]).map(applicationRowToVM);
}

export async function getCrmClientApplication(applicationId: string): Promise<{
  application: CrmClientApplicationVM;
  client: CrmClientVM;
} | null> {
  if (!isSupabaseConfigured()) return null;

  const me = requireActiveCrmUser(await getCurrentUser());
  const admin = createAdminClient();
  const { data: appData, error: appError } = await admin
    .from("crm_client_applications")
    .select(
      `
        *,
        offer_letter_document:crm_client_documents!crm_client_applications_offer_letter_document_id_fkey(file_name)
      `
    )
    .eq("id", applicationId)
    .maybeSingle();

  if (appError) throw new Error(`getCrmClientApplication application: ${appError.message}`);
  if (!appData) return null;

  const application = applicationRowToVM(appData as CrmClientApplicationJoinedRow);
  const { data: clientData, error: clientError } = await admin
    .from("crm_clients")
    .select(
      `
        *,
        lead:crm_leads!crm_clients_lead_id_fkey(customer_phone, customer_name),
        assigned_agent:employees!crm_clients_assigned_agent_id_fkey(full_name),
        branch:branches!crm_clients_branch_id_fkey(code, name)
      `
    )
    .eq("id", application.client_id)
    .maybeSingle();

  if (clientError) throw new Error(`getCrmClientApplication client: ${clientError.message}`);
  if (!clientData) return null;

  const client = clientRowToVM(clientData as CrmClientJoinedRow);
  if (!canViewCrmClient(me, client)) return null;

  return { application, client };
}

export async function listClientDocumentsForApplicationPicker(clientId: string): Promise<Array<{
  id: string;
  doc_code: string;
  file_name: string;
}>> {
  if (!isSupabaseConfigured()) return [];

  const me = requireActiveCrmUser(await getCurrentUser());
  const admin = createAdminClient();
  const meDepartmentName = await getActorDepartmentName(admin, me);
  const access = await getClientDocumentAccess(admin, me, clientId, meDepartmentName);
  if (!access) return [];

  const { data, error } = await admin
    .from("crm_client_documents")
    .select("id, doc_code, file_name")
    .eq("client_id", clientId)
    .eq("doc_state", "approved")
    .is("superseded_by_id", null)
    .order("uploaded_at", { ascending: false });

  if (error) throw new Error(`listClientDocumentsForApplicationPicker: ${error.message}`);
  return (data ?? []) as Array<{ id: string; doc_code: string; file_name: string }>;
}

export async function ensureClientMilestonesSeeded(clientId: string): Promise<{
  country: CrmSupportedTargetCountry | null;
  inserted: number;
}> {
  if (!isSupabaseConfigured()) return { country: null, inserted: 0 };

  const me = requireActiveCrmUser(await getCurrentUser());
  const admin = createAdminClient();
  const client = await loadClientVM(admin, clientId);
  if (!client || !canViewCrmClient(me, client)) return { country: null, inserted: 0 };

  const country = normalizeTargetCountry(client.target_country);
  if (!country) return { country: null, inserted: 0 };

  const definitions = CRM_COUNTRY_MILESTONES[country];
  const { data: existingData, error: existingError } = await admin
    .from("crm_client_country_milestones")
    .select("milestone_code")
    .eq("client_id", clientId);

  if (existingError) throw new Error(`ensureClientMilestonesSeeded existing: ${existingError.message}`);

  const existingCodes = new Set(((existingData ?? []) as { milestone_code: string }[]).map((row) => row.milestone_code));
  const missing = definitions.filter((definition) => !existingCodes.has(definition.code));
  if (missing.length === 0) return { country, inserted: 0 };

  const { data: insertedData, error: insertError } = await admin
    .from("crm_client_country_milestones")
    .upsert(
      missing.map((definition) => ({
        client_id: clientId,
        milestone_code: definition.code,
      })),
      { onConflict: "client_id,milestone_code", ignoreDuplicates: true }
    )
    .select("milestone_code");

  if (insertError) throw new Error(`ensureClientMilestonesSeeded insert: ${insertError.message}`);

  const insertedCodes = ((insertedData ?? []) as { milestone_code: string }[]).map((row) => row.milestone_code);
  if (insertedCodes.length > 0) {
    const { error: activityError } = await admin.from("crm_client_activities").insert({
      client_id: clientId,
      activity_type: "milestones_seeded",
      actor_user_id: me.authUserId,
      description: `Country milestones seeded for ${country}.`,
      payload: {
        country,
        codes: insertedCodes,
      },
    });

    if (activityError) {
      await admin
        .from("crm_client_country_milestones")
        .delete()
        .eq("client_id", clientId)
        .in("milestone_code", insertedCodes);
      throw new Error(`ensureClientMilestonesSeeded activity: ${activityError.message} (rolled back)`);
    }
  }

  return { country, inserted: insertedCodes.length };
}

export async function listClientCountryMilestones(
  clientId: string
): Promise<CrmClientCountryMilestoneVM[]> {
  if (!isSupabaseConfigured()) return [];

  const me = requireActiveCrmUser(await getCurrentUser());
  const admin = createAdminClient();
  const client = await loadClientVM(admin, clientId);
  if (!client || !canViewCrmClient(me, client)) return [];

  const country = normalizeTargetCountry(client.target_country);
  const { data, error } = await admin
    .from("crm_client_country_milestones")
    .select(
      `
        *,
        completed_by:app_users!crm_client_country_milestones_completed_by_user_id_fkey(display_name)
      `
    )
    .eq("client_id", clientId);

  if (error) throw new Error(`listClientCountryMilestones: ${error.message}`);

  return ((data ?? []) as CrmClientCountryMilestoneJoinedRow[])
    .map((row) => milestoneRowToVM(row, country))
    .sort((a, b) => {
      const order = milestoneOrder(country, a.milestone_code) - milestoneOrder(country, b.milestone_code);
      return order || a.milestone_code.localeCompare(b.milestone_code);
    });
}

export async function getCrmClientForVisaPage(clientId: string): Promise<{
  client: CrmClientVM;
  country: CrmSupportedTargetCountry | null;
  milestones: CrmClientCountryMilestoneVM[];
  visaDocs: CrmClientDocumentVM[];
  canManage: boolean;
  canTransitionStatus: boolean;
  isBlockedFromVisaSubmitted: { blocked: boolean; missing: string[] };
} | null> {
  if (!isSupabaseConfigured()) return null;

  const me = requireActiveCrmUser(await getCurrentUser());
  const admin = createAdminClient();
  const meDepartmentName = await getActorDepartmentName(admin, me);
  const client = await loadClientVM(admin, clientId);
  if (!client || !canViewCrmClient(me, client)) return null;

  const country = normalizeTargetCountry(client.target_country);
  const [milestonesRes, docsRes] = await Promise.all([
    admin
      .from("crm_client_country_milestones")
      .select(
        `
          *,
          completed_by:app_users!crm_client_country_milestones_completed_by_user_id_fkey(display_name)
        `
      )
      .eq("client_id", clientId),
    admin
      .from("crm_client_documents")
      .select(
        `
          *,
          uploader:app_users!crm_client_documents_uploaded_by_user_id_fkey(display_name),
          reviewer:app_users!crm_client_documents_reviewed_by_user_id_fkey(display_name)
        `
      )
      .eq("client_id", clientId)
      .is("superseded_by_id", null)
      .order("uploaded_at", { ascending: false }),
  ]);

  if (milestonesRes.error) {
    throw new Error(`getCrmClientForVisaPage milestones: ${milestonesRes.error.message}`);
  }
  if (docsRes.error) {
    throw new Error(`getCrmClientForVisaPage documents: ${docsRes.error.message}`);
  }

  const milestones = ((milestonesRes.data ?? []) as CrmClientCountryMilestoneJoinedRow[])
    .map((row) => milestoneRowToVM(row, country))
    .sort((a, b) => {
      const order = milestoneOrder(country, a.milestone_code) - milestoneOrder(country, b.milestone_code);
      return order || a.milestone_code.localeCompare(b.milestone_code);
    });
  const visaDocs = ((docsRes.data ?? []) as CrmClientDocumentJoinedRow[])
    .map(documentRowToVM)
    .filter((document) =>
      Object.prototype.hasOwnProperty.call(CRM_DOC_CODE_CATEGORY, document.doc_code) &&
      CRM_DOC_CODE_CATEGORY[document.doc_code as keyof typeof CRM_DOC_CODE_CATEGORY] === "visa"
    );
  const missing = visaSubmitBlockers(country, milestones);

  return {
    client,
    country,
    milestones,
    visaDocs,
    canManage: canEditClientMilestone(me, client, meDepartmentName),
    canTransitionStatus: canEditClientStatus(me, client),
    isBlockedFromVisaSubmitted: {
      blocked: missing.length > 0,
      missing,
    },
  };
}

export async function getCrmClientForLead(leadId: string): Promise<CrmClientVM | null> {
  if (!isSupabaseConfigured()) return null;

  const me = requireActiveCrmUser(await getCurrentUser());
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_clients")
    .select(
      `
        *,
        lead:crm_leads!crm_clients_lead_id_fkey(customer_phone, customer_name),
        assigned_agent:employees!crm_clients_assigned_agent_id_fkey(full_name),
        branch:branches!crm_clients_branch_id_fkey(code, name)
      `
    )
    .eq("lead_id", leadId)
    .maybeSingle();

  if (error) throw new Error(`getCrmClientForLead: ${error.message}`);
  if (!data) return null;

  const client = clientRowToVM(data as CrmClientJoinedRow);
  if (!canViewCrmClient(me, client)) {
    return null;
  }
  return client;
}

export async function listCrmLeadsAwaitingConversion(): Promise<Array<{
  lead_id: string;
  customer_name: string | null;
  customer_phone: string;
  assigned_agent_name: string | null;
  converted_at: string | null;
}>> {
  if (!isSupabaseConfigured()) return [];

  const me = requireActiveCrmUser(await getCurrentUser());
  if (me.appUser.role !== "super_admin") {
    throw new Error("Super-admin access required.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_leads")
    .select(
      `
        id,
        customer_name,
        customer_phone,
        updated_at,
        assigned_agent:employees!crm_leads_assigned_agent_id_fkey(full_name),
        client:crm_clients!crm_clients_lead_id_fkey(id)
      `
    )
    .eq("status", "converted")
    .is("client.id", null)
    .order("updated_at", { ascending: false })
    .limit(300);

  if (error) throw new Error(`listCrmLeadsAwaitingConversion: ${error.message}`);

  type Row = Pick<CrmLead, "id" | "customer_name" | "customer_phone" | "updated_at"> & {
    assigned_agent:
      | { full_name: string | null }
      | { full_name: string | null }[]
      | null;
  };

  return ((data ?? []) as Row[]).map((row) => {
    const assignedAgent = pickOne(row.assigned_agent);
    return {
      lead_id: row.id,
      customer_name: row.customer_name,
      customer_phone: row.customer_phone,
      assigned_agent_name: assignedAgent?.full_name ?? null,
      converted_at: row.updated_at,
    };
  });
}
