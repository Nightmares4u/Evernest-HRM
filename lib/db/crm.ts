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
  CrmAssignmentRule,
  CrmCampaignSource,
  CrmInitialProductCategory,
  CrmJsonObject,
  CrmJsonValue,
  CrmLead,
  CrmLeadActivity,
  CrmRawInbox,
  CrmRawStatus,
  CrmWhatsappNumber,
} from "@/lib/types/crm";

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
    to_employee_id: string | null;
    to_employee_name: string | null;
    from_employee_name: string | null;
    reason: string | null;
    created_at: string;
  }>;
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
  const [{ data: numbers, error: numbersError }, branches] = await Promise.all([
    admin
      .from("crm_whatsapp_numbers")
      .select("*")
      .order("is_active", { ascending: false })
      .order("label"),
    listCrmBranches(),
  ]);
  if (numbersError) throw new Error(`listCrmWhatsappNumbers: ${numbersError.message}`);

  const branchesById = byId(branches);
  return ((numbers ?? []) as CrmWhatsappNumber[]).map((number) => {
    const branch = number.default_branch_id
      ? branchesById.get(number.default_branch_id) ?? null
      : null;
    return {
      ...number,
      branch_name: branch?.name ?? null,
      branch_code: branch?.code ?? null,
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
  await Promise.all(
    leads.map(async (lead) => {
      const activities = await listCrmActivities({ lead_id: lead.id });
      if (activities[0]) activitiesByLead.set(lead.id, activities[0]);
    })
  );

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

export function normalizeProductCategory(value: string): CrmInitialProductCategory {
  const trimmed = value.trim();
  return (trimmed || "General") as CrmInitialProductCategory;
}
