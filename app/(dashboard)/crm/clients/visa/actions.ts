"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import {
  canEditClientMilestone,
  canEditClientStatus,
} from "@/lib/crm/permissions-clients";
import { createAdminClient } from "@/lib/supabase/server";
import {
  CRM_COUNTRY_MILESTONES,
  normalizeTargetCountry,
  type CrmClient,
  type CrmClientCountryMilestone,
  type CrmClientMilestoneStatus,
  type CrmClientStatus,
} from "@/lib/types/crm";

const MILESTONE_STATUSES: CrmClientMilestoneStatus[] = [
  "not_started",
  "in_progress",
  "done",
  "not_applicable",
];

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function requireActiveUser(me: CurrentUser | null): CurrentUser {
  if (!me) redirect("/login");
  if (!me.appUser.is_active) redirect("/dashboard?error=Active%20user%20required");
  return me;
}

function redirectVisa(clientId: string, key: "ok" | "error", message: string): never {
  redirect(`/crm/clients/${clientId}/visa?${key}=${encodeURIComponent(message)}`);
}

function parseMilestoneStatus(value: string): CrmClientMilestoneStatus | null {
  return MILESTONE_STATUSES.includes(value as CrmClientMilestoneStatus)
    ? (value as CrmClientMilestoneStatus)
    : null;
}

function parseOptionalDateTime(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

type DepartmentJoinRow = {
  department:
    | { name: string | null }
    | { name: string | null }[]
    | null;
};

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

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

async function loadClient(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string
): Promise<CrmClient | null> {
  const { data, error } = await admin
    .from("crm_clients")
    .select("*")
    .eq("id", clientId)
    .maybeSingle();

  if (error) throw new Error(`loadClient: ${error.message}`);
  return (data as CrmClient | null) ?? null;
}

async function loadMilestoneWithClient(
  admin: ReturnType<typeof createAdminClient>,
  milestoneId: string
): Promise<{ milestone: CrmClientCountryMilestone; client: CrmClient } | null> {
  const { data, error } = await admin
    .from("crm_client_country_milestones")
    .select("*")
    .eq("id", milestoneId)
    .maybeSingle();

  if (error) throw new Error(`loadMilestoneWithClient milestone: ${error.message}`);
  if (!data) return null;

  const milestone = data as CrmClientCountryMilestone;
  const client = await loadClient(admin, milestone.client_id);
  if (!client) return null;
  return { milestone, client };
}

export async function setMilestoneStatus(formData: FormData): Promise<void> {
  const me = requireActiveUser(await getCurrentUser());
  const admin = createAdminClient();
  const meDepartmentName = await getActorDepartmentName(admin, me);
  const clientId = readString(formData, "client_id");
  const milestoneId = readString(formData, "milestone_id");
  const toStatus = parseMilestoneStatus(readString(formData, "to_status"));
  const dueAt = parseOptionalDateTime(readString(formData, "due_at"));
  const note = readString(formData, "note") || null;

  if (!clientId) redirect("/crm/clients?error=Client%20id%20is%20required");
  if (!milestoneId) redirectVisa(clientId, "error", "Milestone id is required.");
  if (!toStatus) redirectVisa(clientId, "error", "Invalid milestone status.");

  const loaded = await loadMilestoneWithClient(admin, milestoneId);
  if (!loaded) redirectVisa(clientId, "error", "Milestone not found.");
  const { milestone, client } = loaded;
  if (!canEditClientMilestone(me, client, meDepartmentName)) {
    redirectVisa(client.id, "error", "Only the assigned counselor, Operations, or super admin can update milestones.");
  }

  // Snapshot the original milestone state for A-8 rollback compensation
  // if the activity-log insert below fails. Will be replaced by a Postgres
  // RPC wrapper in a follow-up — see CRM_BOARD.md "RPC migration".
  const original = {
    status: milestone.status,
    due_at: milestone.due_at,
    notes: milestone.notes,
    completed_at: milestone.completed_at,
    completed_by_user_id: milestone.completed_by_user_id,
  };

  const { error: updateError } = await admin
    .from("crm_client_country_milestones")
    .update({
      status: toStatus,
      due_at: dueAt,
      notes: note,
      completed_at: toStatus === "done" ? new Date().toISOString() : null,
      completed_by_user_id: toStatus === "done" ? me.authUserId : null,
    })
    .eq("id", milestone.id);

  if (updateError) {
    redirectVisa(client.id, "error", `Could not update milestone: ${updateError.message}`);
  }

  const { error: activityError } = await admin.from("crm_client_activities").insert({
    client_id: client.id,
    activity_type: "milestone_status_changed",
    actor_user_id: me.authUserId,
    description: `Milestone ${milestone.milestone_code} changed from ${milestone.status} to ${toStatus}.`,
    payload: {
      milestone_id: milestone.id,
      milestone_code: milestone.milestone_code,
      from_status: milestone.status,
      to_status: toStatus,
      note,
    },
  });

  if (activityError) {
    // Compensation: revert the milestone row to its original state so we
    // don't persist a status change without an audit trail.
    await admin
      .from("crm_client_country_milestones")
      .update({
        status: original.status,
        due_at: original.due_at,
        notes: original.notes,
        completed_at: original.completed_at,
        completed_by_user_id: original.completed_by_user_id,
      })
      .eq("id", milestone.id);
    redirectVisa(
      client.id,
      "error",
      `Milestone updated, but activity failed: ${activityError.message} (rolled back).`
    );
  }

  revalidateVisaPaths(client.id);
  redirectVisa(client.id, "ok", "Milestone updated.");
}

export async function transitionClientToVisaPrep(formData: FormData): Promise<void> {
  const me = requireActiveUser(await getCurrentUser());
  const admin = createAdminClient();
  const clientId = readString(formData, "client_id");
  const note = readString(formData, "note") || null;
  if (!clientId) redirect("/crm/clients?error=Client%20id%20is%20required");

  const client = await loadClient(admin, clientId);
  if (!client) redirectVisa(clientId, "error", "Client not found.");
  if (!canEditClientStatus(me, client)) {
    redirectVisa(client.id, "error", "Only the assigned counselor or super admin can move client status forward.");
  }
  if (client.status !== "offer_accepted") {
    redirectVisa(client.id, "error", "Only offer_accepted clients can move to visa prep.");
  }

  await updateClientStatusWithActivity(admin, me, client, "visa_prep", "client_status_changed", note);
  revalidateVisaPaths(client.id);
  redirectVisa(client.id, "ok", "Client moved to visa prep.");
}

export async function transitionClientToVisaSubmitted(formData: FormData): Promise<void> {
  const me = requireActiveUser(await getCurrentUser());
  const admin = createAdminClient();
  const clientId = readString(formData, "client_id");
  const note = readString(formData, "note") || null;
  if (!clientId) redirect("/crm/clients?error=Client%20id%20is%20required");

  const client = await loadClient(admin, clientId);
  if (!client) redirectVisa(clientId, "error", "Client not found.");
  if (!canEditClientStatus(me, client)) {
    redirectVisa(client.id, "error", "Only the assigned counselor or super admin can submit visa files.");
  }
  if (client.status !== "visa_prep") {
    redirectVisa(client.id, "error", "Only visa_prep clients can move to visa_submitted.");
  }

  const missing = await requiredMilestoneBlockers(admin, client);
  if (missing.length > 0) {
    redirectVisa(
      client.id,
      "error",
      `Cannot submit visa file: ${missing.length} required milestones remaining: ${missing.join(", ")}`
    );
  }

  await updateClientStatusWithActivity(admin, me, client, "visa_submitted", "client_status_changed", note);
  revalidateVisaPaths(client.id);
  redirectVisa(client.id, "ok", "Visa file submitted.");
}

export async function rollbackClientStatus(formData: FormData): Promise<void> {
  const me = requireActiveUser(await getCurrentUser());
  const admin = createAdminClient();
  const clientId = readString(formData, "client_id");
  const toStatus = readString(formData, "to_status") as CrmClientStatus;
  const reason = readString(formData, "reason");
  if (!clientId) redirect("/crm/clients?error=Client%20id%20is%20required");
  if (me.appUser.role !== "super_admin") {
    redirectVisa(clientId, "error", "Only super admin can roll back visa status.");
  }
  if (!reason) {
    redirectVisa(clientId, "error", "Rollback reason is required.");
  }

  const client = await loadClient(admin, clientId);
  if (!client) redirectVisa(clientId, "error", "Client not found.");

  const valid =
    (client.status === "visa_prep" && toStatus === "offer_accepted") ||
    (client.status === "visa_submitted" && toStatus === "visa_prep");
  if (!valid) {
    redirectVisa(client.id, "error", `Invalid rollback: ${client.status} -> ${toStatus}`);
  }

  await updateClientStatusWithActivity(admin, me, client, toStatus, "client_status_rolled_back", reason);
  revalidateVisaPaths(client.id);
  redirectVisa(client.id, "ok", "Client status rolled back.");
}

async function requiredMilestoneBlockers(
  admin: ReturnType<typeof createAdminClient>,
  client: CrmClient
): Promise<string[]> {
  const country = normalizeTargetCountry(client.target_country);
  if (!country) return [];

  const { data, error } = await admin
    .from("crm_client_country_milestones")
    .select("milestone_code, status")
    .eq("client_id", client.id);

  if (error) throw new Error(`requiredMilestoneBlockers: ${error.message}`);
  const statusByCode = new Map(
    ((data ?? []) as Array<{ milestone_code: string; status: CrmClientMilestoneStatus }>).map((row) => [
      row.milestone_code,
      row.status,
    ])
  );

  return CRM_COUNTRY_MILESTONES[country]
    .filter((definition) => definition.required)
    .filter((definition) => {
      const status = statusByCode.get(definition.code);
      return status !== "done" && status !== "not_applicable";
    })
    .map((definition) => definition.label);
}

async function updateClientStatusWithActivity(
  admin: ReturnType<typeof createAdminClient>,
  me: CurrentUser,
  client: CrmClient,
  toStatus: CrmClientStatus,
  activityType: "client_status_changed" | "client_status_rolled_back",
  note: string | null
): Promise<void> {
  const fromStatus = client.status;
  const { error: updateError } = await admin
    .from("crm_clients")
    .update({ status: toStatus })
    .eq("id", client.id);

  if (updateError) throw new Error(`updateClientStatusWithActivity update: ${updateError.message}`);

  const { error: activityError } = await admin.from("crm_client_activities").insert({
    client_id: client.id,
    activity_type: activityType,
    actor_user_id: me.authUserId,
    description: `Client status changed from ${fromStatus} to ${toStatus}.`,
    payload: {
      from: fromStatus,
      to: toStatus,
      note,
      reason: activityType === "client_status_rolled_back" ? note : null,
    },
  });

  if (activityError) {
    await admin
      .from("crm_clients")
      .update({ status: fromStatus })
      .eq("id", client.id);
    throw new Error(`updateClientStatusWithActivity activity: ${activityError.message} (rolled back)`);
  }
}

function revalidateVisaPaths(clientId: string): void {
  revalidatePath("/crm/clients");
  revalidatePath(`/crm/clients/${clientId}`);
  revalidatePath(`/crm/clients/${clientId}/visa`);
}
