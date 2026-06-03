"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { canEditClientApplication, isClientTerminal } from "@/lib/crm/permissions-clients";
import { createAdminClient } from "@/lib/supabase/server";
import type {
  CrmClient,
  CrmClientApplication,
  CrmClientApplicationIntakeTerm,
  CrmClientApplicationStatus,
  CrmClientStatus,
} from "@/lib/types/crm";

const APPLICATION_STATUSES: CrmClientApplicationStatus[] = [
  "draft",
  "submitted",
  "under_review",
  "offer",
  "rejected",
  "waitlisted",
  "accepted",
  "declined",
  "withdrawn",
];

const INTAKE_TERMS: CrmClientApplicationIntakeTerm[] = ["fall", "spring", "summer"];
const DECISION_STATUSES = new Set<CrmClientApplicationStatus>([
  "offer",
  "accepted",
  "declined",
  "rejected",
]);
const CRM_FINANCIAL_CURRENCY = "PKR";

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function requireActiveUser(me: CurrentUser | null): CurrentUser {
  if (!me) redirect("/login");
  if (!me.appUser.is_active) redirect("/dashboard?error=Active%20user%20required");
  return me;
}

function redirectClientApplications(clientId: string, key: "ok" | "error", message: string): never {
  redirect(`/crm/clients/${clientId}/applications?${key}=${encodeURIComponent(message)}`);
}

function parseIntakeYear(value: string): number | null {
  if (!value) return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2020 || year > 2035) return NaN;
  return year;
}

function parseIntakeTerm(value: string): CrmClientApplicationIntakeTerm | null {
  if (!value) return null;
  return INTAKE_TERMS.includes(value as CrmClientApplicationIntakeTerm)
    ? (value as CrmClientApplicationIntakeTerm)
    : null;
}

function parseMoney(value: string): number | null {
  if (!value) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : NaN;
}

function parseDecisionDate(value: string): string {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function parseStatus(value: string): CrmClientApplicationStatus | null {
  return APPLICATION_STATUSES.includes(value as CrmClientApplicationStatus)
    ? (value as CrmClientApplicationStatus)
    : null;
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

async function loadApplicationWithClient(
  admin: ReturnType<typeof createAdminClient>,
  applicationId: string
): Promise<{ application: CrmClientApplication; client: CrmClient } | null> {
  const { data, error } = await admin
    .from("crm_client_applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle();

  if (error) throw new Error(`loadApplicationWithClient application: ${error.message}`);
  if (!data) return null;

  const application = data as CrmClientApplication;
  const client = await loadClient(admin, application.client_id);
  if (!client) return null;
  return { application, client };
}

async function assertCanEditApplication(
  admin: ReturnType<typeof createAdminClient>,
  me: CurrentUser,
  clientId: string
): Promise<CrmClient> {
  const client = await loadClient(admin, clientId);
  if (!client) redirectClientApplications(clientId, "error", "Client not found.");
  if (!canEditClientApplication(me, client)) {
    redirectClientApplications(clientId, "error", "Only the assigned counselor or super admin can edit applications.");
  }
  if (isClientTerminal(client)) {
    redirectClientApplications(
      client.id,
      "error",
      `Cannot modify applications on a ${client.status} client.`
    );
  }
  return client;
}

function rejectIfTerminalApplication(client: CrmClient): void {
  if (isClientTerminal(client)) {
    redirectClientApplications(
      client.id,
      "error",
      `Cannot modify applications on a ${client.status} client.`
    );
  }
}

export async function createApplication(formData: FormData): Promise<void> {
  const me = requireActiveUser(await getCurrentUser());
  const admin = createAdminClient();
  const clientId = readString(formData, "client_id");
  if (!clientId) redirect("/crm/clients?error=Client%20id%20is%20required");

  await assertCanEditApplication(admin, me, clientId);

  const universityName = readString(formData, "university_name");
  const programName = readString(formData, "program_name") || null;
  const intakeYear = parseIntakeYear(readString(formData, "intake_year"));
  const intakeTerm = parseIntakeTerm(readString(formData, "intake_term"));
  const notes = readString(formData, "notes") || null;

  if (!universityName) {
    redirectClientApplications(clientId, "error", "University name is required.");
  }
  if (Number.isNaN(intakeYear)) {
    redirectClientApplications(clientId, "error", "Intake year must be between 2020 and 2035.");
  }

  const { data, error } = await admin
    .from("crm_client_applications")
    .insert({
      client_id: clientId,
      university_name: universityName,
      program_name: programName,
      intake_year: intakeYear,
      intake_term: intakeTerm,
      notes,
      created_by_user_id: me.authUserId,
    })
    .select("*")
    .single();

  if (error || !data) {
    redirectClientApplications(clientId, "error", `Could not create application: ${error?.message ?? "No row returned."}`);
  }

  const application = data as CrmClientApplication;
  const { error: activityError } = await admin.from("crm_client_activities").insert({
    client_id: clientId,
    activity_type: "application_created",
    actor_user_id: me.authUserId,
    description: `Application created for ${universityName}.`,
    payload: {
      application_id: application.id,
      university_name: universityName,
      program_name: programName,
      intake_year: intakeYear,
      intake_term: intakeTerm,
    },
  });

  if (activityError) {
    redirectClientApplications(clientId, "error", `Application created, but activity failed: ${activityError.message}`);
  }

  revalidateClientApplicationPaths(clientId);
  redirectClientApplications(clientId, "ok", "Application created.");
}

export async function updateApplicationFields(formData: FormData): Promise<void> {
  const me = requireActiveUser(await getCurrentUser());
  const admin = createAdminClient();
  const applicationId = readString(formData, "application_id");
  if (!applicationId) redirect("/crm/clients?error=Application%20id%20is%20required");

  const loaded = await loadApplicationWithClient(admin, applicationId);
  if (!loaded) redirect("/crm/clients?error=Application%20not%20found");
  const { application, client } = loaded;

  if (!canEditClientApplication(me, client)) {
    redirectClientApplications(client.id, "error", "Only the assigned counselor or super admin can edit applications.");
  }
  rejectIfTerminalApplication(client);

  const universityName = readString(formData, "university_name");
  const programName = readString(formData, "program_name") || null;
  const intakeYear = parseIntakeYear(readString(formData, "intake_year"));
  const intakeTerm = parseIntakeTerm(readString(formData, "intake_term"));
  const tuitionTotal = parseMoney(readString(formData, "tuition_total"));
  const scholarshipAmount = parseMoney(readString(formData, "scholarship_amount"));
  const notes = readString(formData, "notes") || null;
  const offerLetterDocumentId = readString(formData, "offer_letter_document_id") || null;

  if (!universityName) {
    redirectClientApplications(client.id, "error", "University name is required.");
  }
  if (Number.isNaN(intakeYear)) {
    redirectClientApplications(client.id, "error", "Intake year must be between 2020 and 2035.");
  }
  if (Number.isNaN(tuitionTotal) || Number.isNaN(scholarshipAmount)) {
    redirectClientApplications(client.id, "error", "Money fields must be zero or greater.");
  }
  if (offerLetterDocumentId) {
    const ok = await verifyOfferDocument(admin, client.id, offerLetterDocumentId);
    if (!ok) {
      redirectClientApplications(client.id, "error", "Offer letter document must be an approved current client document.");
    }
  }

  const { error } = await admin
    .from("crm_client_applications")
    .update({
      university_name: universityName,
      program_name: programName,
      intake_year: intakeYear,
      intake_term: intakeTerm,
      tuition_total: tuitionTotal,
      scholarship_amount: scholarshipAmount,
      offer_amount_currency: CRM_FINANCIAL_CURRENCY,
      notes,
      offer_letter_document_id: offerLetterDocumentId,
    })
    .eq("id", application.id);

  if (error) {
    redirectClientApplications(client.id, "error", `Could not update application: ${error.message}`);
  }

  revalidateClientApplicationPaths(client.id);
  redirectClientApplications(client.id, "ok", "Application updated.");
}

export async function transitionApplicationStatus(formData: FormData): Promise<void> {
  const me = requireActiveUser(await getCurrentUser());
  const admin = createAdminClient();
  const applicationId = readString(formData, "application_id");
  const toStatus = parseStatus(readString(formData, "to_status"));
  const note = readString(formData, "note") || null;
  if (!applicationId) redirect("/crm/clients?error=Application%20id%20is%20required");
  if (!toStatus) redirect("/crm/clients?error=Invalid%20application%20status");

  const loaded = await loadApplicationWithClient(admin, applicationId);
  if (!loaded) redirect("/crm/clients?error=Application%20not%20found");
  const { application, client } = loaded;

  if (!canEditClientApplication(me, client)) {
    redirectClientApplications(client.id, "error", "Only the assigned counselor or super admin can update application status.");
  }
  rejectIfTerminalApplication(client);

  if (!isValidTransition(application.status, toStatus)) {
    redirectClientApplications(client.id, "error", `Invalid transition: ${application.status} -> ${toStatus}`);
  }

  const update: Partial<CrmClientApplication> = {
    status: toStatus,
  };
  if (toStatus === "submitted" && !application.submitted_at) {
    update.submitted_at = new Date().toISOString();
  }
  if (DECISION_STATUSES.has(toStatus)) {
    update.decision_at = parseDecisionDate(readString(formData, "decision_date"));
  }

  const { error: updateError } = await admin
    .from("crm_client_applications")
    .update(update)
    .eq("id", application.id);

  if (updateError) {
    if (toStatus === "accepted" && updateError.code === "23505") {
      redirectClientApplications(client.id, "error", "Another application is already accepted.");
    }
    redirectClientApplications(client.id, "error", `Could not update application status: ${updateError.message}`);
  }

  const autoBump = await applyClientStatusAutoBump(admin, client, toStatus);

  const { error: activityError } = await admin.from("crm_client_activities").insert({
    client_id: client.id,
    activity_type: "application_status_changed",
    actor_user_id: me.authUserId,
    description: `Application status changed from ${application.status} to ${toStatus}.`,
    payload: {
      application_id: application.id,
      from_status: application.status,
      to_status: toStatus,
      note,
    },
  });

  if (activityError) {
    redirectClientApplications(client.id, "error", `Status changed, but activity failed: ${activityError.message}`);
  }

  if (autoBump) {
    const { error: bumpActivityError } = await admin.from("crm_client_activities").insert({
      client_id: client.id,
      activity_type: "client_status_auto_bumped",
      actor_user_id: me.authUserId,
      description: `Client status auto-bumped from ${autoBump.from_status} to ${autoBump.to_status}.`,
      payload: {
        trigger_application_id: application.id,
        from_status: autoBump.from_status,
        to_status: autoBump.to_status,
      },
    });

    if (bumpActivityError) {
      redirectClientApplications(client.id, "error", `Status changed, but client status activity failed: ${bumpActivityError.message}`);
    }
  }

  revalidateClientApplicationPaths(client.id);
  redirectClientApplications(client.id, "ok", "Application status updated.");
}

export async function deleteApplication(formData: FormData): Promise<void> {
  const me = requireActiveUser(await getCurrentUser());
  const admin = createAdminClient();
  const applicationId = readString(formData, "application_id");
  if (!applicationId) redirect("/crm/clients?error=Application%20id%20is%20required");
  if (me.appUser.role !== "super_admin") {
    redirect("/dashboard?error=Super-admin%20access%20required");
  }

  const loaded = await loadApplicationWithClient(admin, applicationId);
  if (!loaded) redirect("/crm/clients?error=Application%20not%20found");
  const { application, client } = loaded;
  rejectIfTerminalApplication(client);
  if (application.status !== "draft") {
    redirectClientApplications(client.id, "error", "Only draft applications can be deleted.");
  }

  const { error: deleteError } = await admin
    .from("crm_client_applications")
    .delete()
    .eq("id", application.id);

  if (deleteError) {
    redirectClientApplications(client.id, "error", `Could not delete application: ${deleteError.message}`);
  }

  const { error: activityError } = await admin.from("crm_client_activities").insert({
    client_id: client.id,
    activity_type: "application_deleted",
    actor_user_id: me.authUserId,
    description: `Draft application deleted for ${application.university_name}.`,
    payload: {
      application_id: application.id,
      university_name: application.university_name,
      program_name: application.program_name,
    },
  });

  if (activityError) {
    redirectClientApplications(client.id, "error", `Application deleted, but activity failed: ${activityError.message}`);
  }

  revalidateClientApplicationPaths(client.id);
  redirectClientApplications(client.id, "ok", "Application deleted.");
}

function isValidTransition(
  from: CrmClientApplicationStatus,
  to: CrmClientApplicationStatus
): boolean {
  if (from === to) return false;
  if (to === "withdrawn") return from !== "accepted";
  if (to === "accepted" || to === "declined") return from === "offer";
  if (from === "draft") return to === "submitted";
  if (from === "submitted") return to === "under_review";
  if (from === "under_review") return to === "offer" || to === "rejected" || to === "waitlisted";
  if (from === "waitlisted") return to === "offer" || to === "rejected";
  return false;
}

async function verifyOfferDocument(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  documentId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("crm_client_documents")
    .select("id")
    .eq("id", documentId)
    .eq("client_id", clientId)
    .eq("doc_state", "approved")
    .is("superseded_by_id", null)
    .maybeSingle();

  if (error) throw new Error(`verifyOfferDocument: ${error.message}`);
  return Boolean(data);
}

async function applyClientStatusAutoBump(
  admin: ReturnType<typeof createAdminClient>,
  client: CrmClient,
  toStatus: CrmClientApplicationStatus
): Promise<{ from_status: CrmClientStatus; to_status: CrmClientStatus } | null> {
  const currentStatus = client.status;
  let nextStatus: CrmClientStatus | null = null;

  if (
    toStatus === "submitted" &&
    (currentStatus === "onboarding" || currentStatus === "doc_review" || currentStatus === "uni_selection")
  ) {
    nextStatus = "applying";
  } else if (toStatus === "offer" && currentStatus === "applying") {
    nextStatus = "offer_in_hand";
  } else if (toStatus === "accepted") {
    nextStatus = "offer_accepted";
  } else if (
    (toStatus === "withdrawn" || toStatus === "rejected" || toStatus === "declined") &&
    currentStatus === "offer_in_hand"
  ) {
    const { count, error } = await admin
      .from("crm_client_applications")
      .select("id", { count: "exact", head: true })
      .eq("client_id", client.id)
      .in("status", ["offer", "accepted"]);

    if (error) throw new Error(`applyClientStatusAutoBump: ${error.message}`);
    if ((count ?? 0) === 0) nextStatus = "applying";
  }

  if (!nextStatus || nextStatus === currentStatus) return null;

  const { error } = await admin
    .from("crm_clients")
    .update({ status: nextStatus })
    .eq("id", client.id);

  if (error) throw new Error(`applyClientStatusAutoBump update: ${error.message}`);
  return {
    from_status: currentStatus,
    to_status: nextStatus,
  };
}

function revalidateClientApplicationPaths(clientId: string): void {
  revalidatePath("/crm/clients");
  revalidatePath(`/crm/clients/${clientId}`);
  revalidatePath(`/crm/clients/${clientId}/applications`);
}
