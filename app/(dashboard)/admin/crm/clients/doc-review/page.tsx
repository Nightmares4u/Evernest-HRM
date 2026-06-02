import Link from "next/link";
import { redirect } from "next/navigation";
import { Chip } from "@/components/StatusChip";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatCrmDateTime } from "@/lib/crm/format";
import { listDocsAwaitingReview } from "@/lib/db/crm";
import {
  CRM_DOC_CODE_LABELS,
  type CrmClientDocState,
  type CrmDocCode,
} from "@/lib/types/crm";

type Search = { status?: string };
type StatusFilter = "uploaded" | "under_review" | "both";

const STATUS_TONES: Record<
  CrmClientDocState,
  "green" | "amber" | "red" | "blue" | "gray" | "blue" | "yellow" | "teal"
> = {
  uploaded: "blue",
  under_review: "yellow",
  approved: "green",
  rejected_resubmit: "red",
  expired: "gray",
};

export default async function ClientDocumentReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.appUser.is_active) redirect("/dashboard?error=Active%20user%20required");

  const status = parseStatus(sp.status);
  const rows = await listDocsAwaitingReview();
  const filteredRows =
    status === "both"
      ? rows
      : rows.filter((row) => row.document.doc_state === status);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/admin/crm" className="text-sm text-blue-600 hover:text-blue-500">
              CRM admin
            </Link>
            <span className="text-sm text-gray-400">/</span>
            <span className="text-sm text-gray-500">Document review</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">
            Client document review
          </h1>
          <p className="text-sm text-gray-500">
            Uploaded and under-review client documents in your visible scope.
          </p>
        </div>
        <Link
          href="/crm/clients"
          className="rounded-md bg-white px-3 py-1.5 text-sm text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
        >
          CRM clients
        </Link>
      </header>

      <section className="rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
        <form className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Status</span>
            <select
              name="status"
              defaultValue={status}
              className="w-52 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
            >
              <option value="both">Uploaded and under review</option>
              <option value="uploaded">Uploaded</option>
              <option value="under_review">Under review</option>
            </select>
          </label>
          <button className="rounded-md bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
            Filter
          </button>
          <Link
            href="/admin/crm/clients/doc-review"
            className="rounded-md bg-white px-4 py-2 text-sm text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
          >
            Reset
          </Link>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Awaiting review</h2>
          <span className="text-xs text-gray-500">{filteredRows.length} documents</span>
        </div>
        {filteredRows.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
            No uploaded or under-review documents are visible for your role.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Client</Th>
                  <Th>Document</Th>
                  <Th>Status</Th>
                  <Th>Uploaded</Th>
                  <Th>Uploader</Th>
                  <Th>Assigned counselor</Th>
                  <Th>Action</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((row) => {
                  const docCode = row.document.doc_code as CrmDocCode;
                  return (
                    <tr key={row.document.id} className="hover:bg-gray-50">
                      <Td>
                        <Link
                          href={`/crm/clients/${row.client_id}/documents`}
                          className="font-medium text-blue-600 hover:text-blue-500"
                        >
                          {row.client_code}
                        </Link>
                      </Td>
                      <Td>
                        <div className="font-medium text-gray-900">
                          {CRM_DOC_CODE_LABELS[docCode] ?? row.document.doc_code}
                        </div>
                        <div className="text-xs text-gray-500">{row.document.file_name}</div>
                      </Td>
                      <Td>
                        <Chip
                          label={formatLabel(row.document.doc_state)}
                          tone={STATUS_TONES[row.document.doc_state]}
                        />
                      </Td>
                      <Td>{formatCrmDateTime(row.document.uploaded_at)}</Td>
                      <Td>{row.document.uploader_name ?? "-"}</Td>
                      <Td>{row.client_assigned_agent_name ?? "Unassigned"}</Td>
                      <Td>
                        <Link
                          href={`/crm/clients/${row.client_id}/documents`}
                          className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-blue-600 ring-1 ring-inset ring-blue-200 hover:bg-blue-50"
                        >
                          Open client docs
                        </Link>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function parseStatus(value: string | undefined): StatusFilter {
  if (value === "uploaded" || value === "under_review") return value;
  return "both";
}

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}
