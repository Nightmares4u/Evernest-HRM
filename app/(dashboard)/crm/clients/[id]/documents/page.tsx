import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatCrmDateTime } from "@/lib/crm/format";
import {
  getCrmClientDocumentPageData,
  listCrmClientDocuments,
} from "@/lib/db/crm";
import {
  CRM_DOC_CATEGORIES,
  CRM_DOC_CODES,
  CRM_DOC_CODE_CATEGORY,
  CRM_DOC_CODE_LABELS,
  defaultExpandedDocCategories,
  type CrmClientDocState,
  type CrmClientDocumentVM,
  type CrmDocCategory,
  type CrmDocCode,
} from "@/lib/types/crm";
import {
  approveClientDocumentForm,
  claimDocumentForReviewForm,
  downloadClientDocument,
  rejectClientDocumentForm,
  uploadClientDocumentForm,
} from "../../documents/actions";
import { getCurrentUser } from "@/lib/auth/current-user";

import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable, Td } from "@/components/ui/DataTable";
import { LifecycleTabs } from "@/components/ui/LifecycleTabs";

type Search = { error?: string; ok?: string };

const DOC_STATE_TONES: Record<
  CrmClientDocState,
  "green" | "amber" | "red" | "blue" | "gray" | "blue" | "yellow" | "teal"
> = {
  uploaded: "blue",
  under_review: "yellow",
  approved: "green",
  rejected_resubmit: "red",
  expired: "gray",
};

export default async function ClientDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Search>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.appUser.is_active) redirect("/dashboard?error=Active%20user%20required");

  const [access, documents] = await Promise.all([
    getCrmClientDocumentPageData(id),
    listCrmClientDocuments(id, { includeSuperseded: true }),
  ]);

  if (!access) notFound();

  const { client } = access;
  const latestDocuments = documents.filter((document) => !document.superseded_by_id);
  const latestByCode = new Map(latestDocuments.map((d) => [d.doc_code, d]));
  const history = groupHistory(documents);

  const stats = computeStats(latestByCode);
  const expanded = new Set<CrmDocCategory>(
    defaultExpandedDocCategories(client.target_level)
  );

  const docsAwaitingReview = latestDocuments.filter((d) =>
    d.doc_state === "uploaded" || d.doc_state === "under_review"
  ).length;

  const tabs = [
    { href: `/crm/clients/${client.id}/documents`, label: "Documents", badge: docsAwaitingReview, badgeTone: "yellow" as const },
    { href: `/crm/clients/${client.id}/applications`, label: "Applications" },
    { href: `/crm/clients/${client.id}/visa`, label: "Visa Stage" },
    { href: `/crm/clients/${client.id}/financials`, label: "Financials" },
    { href: `/crm/clients/${client.id}/closure`, label: "Closure" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client Documents"
        description={`${client.lead_customer_name || client.lead_customer_phone} ${client.target_level ? `· ${formatLevel(client.target_level)}` : ""} ${client.target_country ? `· ${client.target_country}` : ""}`}
        breadcrumbs={
          <div className="flex items-center gap-2 mb-2 text-sm">
            <Link href="/crm/clients" className="font-medium text-blue-600 hover:text-blue-500 transition-colors">
              CRM clients
            </Link>
            <span className="text-gray-400">/</span>
            <Link
              href={`/crm/clients/${client.id}`}
              className="font-medium text-blue-600 hover:text-blue-500 transition-colors"
            >
              {client.client_code}
            </Link>
            <span className="text-gray-400">/</span>
            <span className="text-gray-500">Documents</span>
          </div>
        }
        action={
          <Link
            href={`/crm/clients/${client.id}`}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 transition-colors"
          >
            Back to client shell
          </Link>
        }
      />

      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {sp.ok && <Notice tone="green">{sp.ok}</Notice>}

      <LifecycleTabs tabs={tabs} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Approved" value={stats.approved} tone="green" />
        <StatCard label="Pending review" value={stats.pending} tone="amber" />
        <StatCard label="Needs resubmit" value={stats.rejected} tone="red" />
        <StatCard label="Not uploaded" value={stats.missing} tone="gray" />
      </div>

      <div className="space-y-4">
        {CRM_DOC_CATEGORIES.map((category) => {
          const codesInCategory = CRM_DOC_CODES.filter(
            (code) => CRM_DOC_CODE_CATEGORY[code] === category.code
          );
          const counts = countByCategoryState(codesInCategory, latestByCode);
          if (codesInCategory.length === 0) return null;

          return (
            <details
              key={category.code}
              className="group rounded-lg bg-white shadow ring-1 ring-black/5"
              open={expanded.has(category.code)}
            >
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">{category.label}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{category.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {counts.approved > 0 && (
                    <StatusBadge label={`${counts.approved} approved`} tone="green" />
                  )}
                  {counts.pending > 0 && (
                    <StatusBadge label={`${counts.pending} pending`} tone="amber" />
                  )}
                  {counts.rejected > 0 && (
                    <StatusBadge label={`${counts.rejected} needs resubmit`} tone="red" />
                  )}
                  {counts.missing > 0 && (
                    <StatusBadge label={`${counts.missing} missing`} tone="gray" />
                  )}
                </div>
              </summary>

              <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  {codesInCategory.map((code) => {
                    const document = latestByCode.get(code);
                    return (
                      <DocSlot
                        key={code}
                        clientId={client.id}
                        code={code}
                        document={document}
                        history={history.get(code) ?? []}
                        canManage={access.canManageDocuments}
                      />
                    );
                  })}
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

function DocSlot({
  clientId,
  code,
  document,
  history,
  canManage,
}: {
  clientId: string;
  code: CrmDocCode;
  document: CrmClientDocumentVM | undefined;
  history: CrmClientDocumentVM[];
  canManage: boolean;
}) {
  const state = effectiveDocState(document);
  const hasFile = Boolean(document);
  const isApproved = state === "approved";
  const isPending = state === "uploaded" || state === "under_review";
  const isRejected = state === "rejected_resubmit";
  const canDecide =
    canManage && hasFile && (document!.doc_state === "uploaded" || document!.doc_state === "under_review");

  const ringColor = isApproved
    ? "ring-green-200"
    : isRejected
    ? "ring-red-200"
    : isPending
    ? "ring-amber-200"
    : "ring-gray-200";

  return (
    <article className={`rounded-lg bg-white p-4 shadow-sm ring-1 ring-inset ${ringColor}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">
            {CRM_DOC_CODE_LABELS[code]}
          </h3>
          <p className="text-[11px] uppercase tracking-wide text-gray-400 mt-0.5">{code}</p>
        </div>
        {hasFile ? (
          <StatusBadge label={formatLabel(state)} tone={DOC_STATE_TONES[state]} />
        ) : (
          <StatusBadge label="Not uploaded" tone="gray" />
        )}
      </div>

      {hasFile && document && (
        <div className="mt-4 space-y-1.5 text-xs text-gray-600">
          <div className="truncate font-medium text-gray-800">
            {document.file_name}
            <span className="ml-2 text-gray-400">· {formatFileSize(document.file_size)}</span>
          </div>
          <div>
            <span className="text-gray-400">Uploaded by</span> {document.uploader_name ?? "—"} <span className="text-gray-400">·</span>{" "}
            {formatCrmDateTime(document.uploaded_at)}
          </div>
          {document.reviewer_name && (
            <div>
              <span className="text-gray-400">Reviewed by</span> {document.reviewer_name} <span className="text-gray-400">·</span>{" "}
              {formatCrmDateTime(document.reviewed_at)}
            </div>
          )}
          {document.decision_note && isRejected && (
            <div className="mt-2 rounded-md bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
              <span className="font-semibold">Rejection reason:</span> {document.decision_note}
            </div>
          )}
        </div>
      )}

      {hasFile && document && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <form action={downloadClientDocument}>
            <input type="hidden" name="client_id" value={clientId} />
            <input type="hidden" name="document_id" value={document.id} />
            <button className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 transition-colors">
              Download
            </button>
          </form>
          {canManage && document.doc_state === "uploaded" && (
            <form action={claimDocumentForReviewForm}>
              <input type="hidden" name="document_id" value={document.id} />
              <button className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 transition-colors">
                Claim for review
              </button>
            </form>
          )}
          {canDecide && (
            <form action={approveClientDocumentForm}>
              <input type="hidden" name="document_id" value={document.id} />
              <button className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-500 transition-colors">
                Approve
              </button>
            </form>
          )}
        </div>
      )}

      {canDecide && document && (
        <form action={rejectClientDocumentForm} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="document_id" value={document.id} />
          <input
            name="note"
            required
            placeholder="Rejection reason"
            className="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-900 focus:border-red-500 focus:ring-red-500 outline-none"
          />
          <button className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 transition-colors">
            Reject
          </button>
        </form>
      )}

      <details className="mt-4 rounded-md border border-dashed border-gray-200 bg-gray-50/50">
        <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-100/50 transition-colors">
          {hasFile ? "Re-upload / History" : "Upload file"}
        </summary>
        <div className="space-y-4 p-4 border-t border-dashed border-gray-200">
          <CompactUploadForm clientId={clientId} code={code} />
          {history.length > 1 && (
            <div className="mt-4">
              <DataTable columns={["Version", "Status", "Uploaded"]}>
                {history.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <Td>
                      <div className="font-medium text-gray-900">{row.file_name}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">{formatFileSize(row.file_size)}</div>
                    </Td>
                    <Td>
                      <StatusBadge
                        label={formatLabel(effectiveDocState(row))}
                        tone={DOC_STATE_TONES[effectiveDocState(row)]}
                      />
                    </Td>
                    <Td className="whitespace-nowrap text-xs">{formatCrmDateTime(row.uploaded_at)}</Td>
                  </tr>
                ))}
              </DataTable>
            </div>
          )}
        </div>
      </details>
    </article>
  );
}

function CompactUploadForm({ clientId, code }: { clientId: string; code: CrmDocCode }) {
  return (
    <form action={uploadClientDocumentForm} className="space-y-3">
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="doc_code" value={code} />
      <input
        name="file"
        type="file"
        required
        accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.docx,application/pdf,image/jpeg,image/png,image/heic,image/heif,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="block w-full text-xs text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-blue-800 file:transition-colors"
      />
      <div className="flex flex-wrap gap-2">
        <input
          name="expires_at"
          type="date"
          placeholder="Expires"
          className="w-32 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
        />
        <input
          name="note"
          placeholder="Note (optional)"
          className="flex-1 min-w-[120px] rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
        />
        <button className="rounded-md bg-blue-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 transition-colors">
          Upload
        </button>
      </div>
      <p className="text-[11px] text-gray-400">
        PDF, JPG, PNG, HEIC, or DOCX · Max 25 MB
      </p>
    </form>
  );
}

// ---------- helpers ----------

type DocStateBucket = "approved" | "pending" | "rejected" | "missing";

function bucketOf(state: CrmClientDocState | "missing"): DocStateBucket {
  if (state === "approved") return "approved";
  if (state === "rejected_resubmit") return "rejected";
  if (state === "missing") return "missing";
  return "pending";
}

function computeStats(latestByCode: Map<string, CrmClientDocumentVM>) {
  let approved = 0;
  let pending = 0;
  let rejected = 0;
  let missing = 0;
  for (const code of CRM_DOC_CODES) {
    const doc = latestByCode.get(code);
    if (!doc) {
      missing += 1;
      continue;
    }
    const b = bucketOf(effectiveDocState(doc));
    if (b === "approved") approved += 1;
    else if (b === "pending") pending += 1;
    else if (b === "rejected") rejected += 1;
  }
  return { approved, pending, rejected, missing };
}

function countByCategoryState(
  codes: readonly CrmDocCode[],
  latestByCode: Map<string, CrmClientDocumentVM>
) {
  let approved = 0;
  let pending = 0;
  let rejected = 0;
  let missing = 0;
  for (const code of codes) {
    const doc = latestByCode.get(code);
    if (!doc) {
      missing += 1;
      continue;
    }
    const b = bucketOf(effectiveDocState(doc));
    if (b === "approved") approved += 1;
    else if (b === "pending") pending += 1;
    else if (b === "rejected") rejected += 1;
  }
  return { approved, pending, rejected, missing };
}

function groupHistory(documents: CrmClientDocumentVM[]): Map<string, CrmClientDocumentVM[]> {
  const grouped = new Map<string, CrmClientDocumentVM[]>();
  for (const document of documents) {
    const rows = grouped.get(document.doc_code) ?? [];
    rows.push(document);
    grouped.set(document.doc_code, rows);
  }
  return grouped;
}

function effectiveDocState(document: CrmClientDocumentVM | undefined): CrmClientDocState {
  if (!document) return "uploaded";
  if (document.expires_at && Date.parse(document.expires_at) < Date.now()) return "expired";
  return document.doc_state;
}

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatLevel(value: string): string {
  if (value === "phd") return "PhD";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Notice({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "green" | "red";
}) {
  const classes =
    tone === "green"
      ? "border-green-200 bg-green-50 text-green-700"
      : "border-red-200 bg-red-50 text-red-700";
  return <div className={`rounded-md border px-4 py-3 text-sm shadow-sm ${classes}`}>{children}</div>;
}
