import { createAdminClient } from "@/lib/supabase/server";
import type { Branch } from "@/lib/types/hrm";
import type {
  CrmCampaignSource,
  CrmInitialProductCategory,
  CrmJsonObject,
  CrmJsonValue,
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

export async function listCrmRawInbox(
  filters: CrmRawInboxFilters = {}
): Promise<CrmRawInboxVM[]> {
  if (!isSupabaseConfigured()) return [];

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
    if (filters.product && row.product_category !== filters.product) return false;
    if (filters.branch_id && row.branch_id !== filters.branch_id) return false;
    return true;
  });
}

export function normalizeProductCategory(value: string): CrmInitialProductCategory {
  const trimmed = value.trim();
  return (trimmed || "General") as CrmInitialProductCategory;
}
