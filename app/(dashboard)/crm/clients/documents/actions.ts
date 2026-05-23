"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { canVerifyClientDoc } from "@/lib/crm/permissions-clients";
import { getSignedDocumentDownloadUrl } from "@/lib/db/crm";
import { createAdminClient } from "@/lib/supabase/server";
import {
  CRM_DOC_CODES,
  CRM_DOC_CODE_LABELS,
  type CrmClient,
  type CrmClientDocument,
  type CrmDocCode,
} from "@/lib/types/crm";

type ActionResult = {
  ok: boolean;
  message: string;
  leadId?: never;
  clientId?: string;
};

const STORAGE_BUCKET = "crm-client-docs";
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function isCrmDocCode(value: string): value is CrmDocCode {
  return (CRM_DOC_CODES as readonly string[]).includes(value);
}

function sanitizeFileName(fileName: string): string {
  const stripped = fileName.replace(/[/:\\]/g, "").replace(/[\u0000-\u001f]/g, "").trim();
  return (stripped || "document").slice(0, 100);
}

function parseOptionalDate(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function requireActiveUser(me: CurrentUser | null): CurrentUser {
  if (!me) {
    throw new Error("CRM document actions require a signed-in user.");
  }
  if (!me.appUser.is_active) {
    throw new Error("CRM document actions require an active user.");
  }
  return me;
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

async function loadClientForDocumentAction(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string
): Promise<CrmClient | null> {
  const { data, error } = await admin
    .from("crm_clients")
    .select("*")
    .eq("id", clientId)
    .maybeSingle();

  if (error) throw new Error(`loadClientForDocumentAction: ${error.message}`);
  return (data as CrmClient | null) ?? null;
}

async function loadDocumentForAction(
  admin: ReturnType<typeof createAdminClient>,
  documentId: string
): Promise<CrmClientDocument | null> {
  const { data, error } = await admin
    .from("crm_client_documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw new Error(`loadDocumentForAction: ${error.message}`);
  return (data as CrmClientDocument | null) ?? null;
}

function forbidden(clientId: string): ActionResult {
  return {
    ok: false,
    clientId,
    message: "Only the assigned counselor, Operations, or super admin can manage client documents.",
  };
}

async function assertCanManageClientDocument(
  admin: ReturnType<typeof createAdminClient>,
  me: CurrentUser,
  meDepartmentName: string | null,
  clientId: string
): Promise<{ ok: true; client: CrmClient } | { ok: false; result: ActionResult }> {
  const client = await loadClientForDocumentAction(admin, clientId);
  if (!client) {
    return { ok: false, result: { ok: false, clientId, message: "Client not found." } };
  }

  if (!canVerifyClientDoc(me, client, meDepartmentName)) {
    return { ok: false, result: forbidden(clientId) };
  }

  return { ok: true, client };
}

export async function uploadClientDocument(formData: FormData): Promise<ActionResult> {
  const me = requireActiveUser(await getCurrentUser());
  const admin = createAdminClient();
  const meDepartmentName = await getActorDepartmentName(admin, me);
  const clientId = readString(formData, "client_id");
  const docCodeRaw = readString(formData, "doc_code");
  const note = readString(formData, "note") || null;
  const expiresAt = parseOptionalDate(readString(formData, "expires_at"));

  if (!clientId) return { ok: false, message: "Client id is required." };
  if (!isCrmDocCode(docCodeRaw)) {
    return { ok: false, clientId, message: "Unknown document code." };
  }

  const access = await assertCanManageClientDocument(admin, me, meDepartmentName, clientId);
  if (!access.ok) return access.result;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return { ok: false, clientId, message: "File is required." };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, clientId, message: "File must be 25 MB or smaller." };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { ok: false, clientId, message: "Unsupported file type" };
  }

  const fileName = sanitizeFileName(file.name);
  const storagePath = `clients/${clientId}/${docCodeRaw}/${Date.now()}_${fileName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return { ok: false, clientId, message: `Could not upload file: ${uploadError.message}` };
  }

  const { data: oldDocs, error: oldDocsError } = await admin
    .from("crm_client_documents")
    .select("id")
    .eq("client_id", clientId)
    .eq("doc_code", docCodeRaw)
    .is("superseded_by_id", null)
    .order("uploaded_at", { ascending: false });

  if (oldDocsError) {
    return { ok: false, clientId, message: `Could not check existing document: ${oldDocsError.message}` };
  }

  const { data: newDoc, error: insertError } = await admin
    .from("crm_client_documents")
    .insert({
      client_id: clientId,
      doc_code: docCodeRaw,
      storage_path: storagePath,
      file_name: fileName,
      file_size: file.size,
      mime_type: file.type,
      uploaded_by_user_id: me.authUserId,
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (insertError || !newDoc) {
    return { ok: false, clientId, message: `Could not record document: ${insertError?.message ?? "No row returned."}` };
  }

  const oldDocumentIds = ((oldDocs as { id: string }[] | null) ?? []).map(d => d.id);
  if (oldDocumentIds.length > 0) {
    const { error: supersedeError } = await admin
      .from("crm_client_documents")
      .update({ superseded_by_id: (newDoc as CrmClientDocument).id })
      .in("id", oldDocumentIds);

    if (supersedeError) {
      return { ok: false, clientId, message: `Document uploaded, but history update failed: ${supersedeError.message}` };
    }
  }

  const document = newDoc as CrmClientDocument;
  const { error: activityError } = await admin.from("crm_client_activities").insert({
    client_id: clientId,
    activity_type: "doc_uploaded",
    actor_user_id: me.authUserId,
    description: `${CRM_DOC_CODE_LABELS[docCodeRaw as CrmDocCode] ?? docCodeRaw} uploaded.`,
    payload: {
      doc_code: docCodeRaw,
      document_id: document.id,
      file_name: fileName,
      supersedes: oldDocumentIds,
      note,
      expires_at: expiresAt,
    },
  });

  if (activityError) {
    return { ok: false, clientId, message: `Document uploaded, but activity failed: ${activityError.message}` };
  }

  revalidateClientDocumentPaths(clientId);
  return { ok: true, clientId, message: "Document uploaded." };
}

export async function uploadClientDocumentForm(formData: FormData): Promise<void> {
  await uploadClientDocument(formData);
}

export async function claimDocumentForReview(formData: FormData): Promise<ActionResult> {
  const me = requireActiveUser(await getCurrentUser());
  const admin = createAdminClient();
  const meDepartmentName = await getActorDepartmentName(admin, me);
  const documentId = readString(formData, "document_id");
  if (!documentId) return { ok: false, message: "Document id is required." };

  const document = await loadDocumentForAction(admin, documentId);
  if (!document) return { ok: false, message: "Document not found." };
  const access = await assertCanManageClientDocument(admin, me, meDepartmentName, document.client_id);
  if (!access.ok) return access.result;
  if (document.superseded_by_id) {
    return { ok: false, clientId: document.client_id, message: "Superseded documents cannot be reviewed." };
  }
  if (document.doc_state !== "uploaded") {
    return { ok: false, clientId: document.client_id, message: "Only uploaded documents can be claimed." };
  }

  const { error } = await admin
    .from("crm_client_documents")
    .update({
      doc_state: "under_review",
      reviewed_by_user_id: me.authUserId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", document.id);

  if (error) return { ok: false, clientId: document.client_id, message: `Could not claim document: ${error.message}` };

  revalidateClientDocumentPaths(document.client_id);
  return { ok: true, clientId: document.client_id, message: "Document claimed for review." };
}

export async function claimDocumentForReviewForm(formData: FormData): Promise<void> {
  await claimDocumentForReview(formData);
}

export async function approveClientDocument(formData: FormData): Promise<ActionResult> {
  return decideClientDocument(formData, "approved");
}

export async function approveClientDocumentForm(formData: FormData): Promise<void> {
  await approveClientDocument(formData);
}

export async function rejectClientDocument(formData: FormData): Promise<ActionResult> {
  return decideClientDocument(formData, "rejected_resubmit");
}

export async function rejectClientDocumentForm(formData: FormData): Promise<void> {
  await rejectClientDocument(formData);
}

export async function downloadClientDocument(formData: FormData): Promise<void> {
  const documentId = readString(formData, "document_id");
  const clientId = readString(formData, "client_id");
  const signedUrl = documentId ? await getSignedDocumentDownloadUrl(documentId) : null;
  if (!signedUrl) {
    redirect(clientId ? `/crm/clients/${clientId}/documents?error=Download%20not%20available` : "/crm/clients");
  }
  redirect(signedUrl);
}

async function decideClientDocument(
  formData: FormData,
  decision: "approved" | "rejected_resubmit"
): Promise<ActionResult> {
  const me = requireActiveUser(await getCurrentUser());
  const admin = createAdminClient();
  const meDepartmentName = await getActorDepartmentName(admin, me);
  const documentId = readString(formData, "document_id");
  const note = readString(formData, "note");

  if (!documentId) return { ok: false, message: "Document id is required." };
  if (decision === "rejected_resubmit" && !note) {
    return { ok: false, message: "Rejection reason is required." };
  }

  const document = await loadDocumentForAction(admin, documentId);
  if (!document) return { ok: false, message: "Document not found." };
  const access = await assertCanManageClientDocument(admin, me, meDepartmentName, document.client_id);
  if (!access.ok) return access.result;
  if (document.superseded_by_id) {
    return { ok: false, clientId: document.client_id, message: "Superseded documents cannot be reviewed." };
  }
  if (document.doc_state !== "uploaded" && document.doc_state !== "under_review") {
    return { ok: false, clientId: document.client_id, message: "Only uploaded or under-review documents can be decided." };
  }

  const { error: updateError } = await admin
    .from("crm_client_documents")
    .update({
      doc_state: decision,
      reviewed_by_user_id: me.authUserId,
      reviewed_at: new Date().toISOString(),
      decision_note: note || null,
    })
    .eq("id", document.id);

  if (updateError) {
    return { ok: false, clientId: document.client_id, message: `Could not update document: ${updateError.message}` };
  }

  const activityType = decision === "approved" ? "doc_approved" : "doc_rejected";
  const { error: activityError } = await admin.from("crm_client_activities").insert({
    client_id: document.client_id,
    activity_type: activityType,
    actor_user_id: me.authUserId,
    description:
      decision === "approved"
        ? `${document.doc_code} approved.`
        : `${document.doc_code} rejected for resubmission.`,
    payload: {
      doc_code: document.doc_code,
      document_id: document.id,
      note: note || null,
    },
  });

  if (activityError) {
    return { ok: false, clientId: document.client_id, message: `Document updated, but activity failed: ${activityError.message}` };
  }

  revalidateClientDocumentPaths(document.client_id);
  return {
    ok: true,
    clientId: document.client_id,
    message: decision === "approved" ? "Document approved." : "Document rejected for resubmission.",
  };
}

function revalidateClientDocumentPaths(clientId: string): void {
  revalidatePath("/crm/clients");
  revalidatePath(`/crm/clients/${clientId}`);
  revalidatePath(`/crm/clients/${clientId}/documents`);
  revalidatePath("/admin/crm/clients/doc-review");
}
ed, but activity failed: ${activityError.message}` };
  }

  revalidateClientDocumentPaths(document.client_id);
  return {
    ok: true,
    clientId: document.client_id,
    message: decision === "approved" ? "Document approved." : "Document rejected for resubmission.",
  };
}

function revalidateClientDocumentPaths(clientId: string): void {
  revalidatePath("/crm/clients");
  revalidatePath(`/crm/clients/${clientId}`);
  revalidatePath(`/crm/clients/${clientId}/documents`);
  revalidatePath("/admin/crm/clients/doc-review");
}
