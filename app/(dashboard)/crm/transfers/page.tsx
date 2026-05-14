import Link from "next/link";
import { redirect } from "next/navigation";
import { Chip } from "@/components/StatusChip";
import {
  acceptLeadTransfer,
  cancelLeadTransfer,
  rejectLeadTransfer,
} from "@/app/(dashboard)/crm/transfers/actions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatCrmDateTime } from "@/lib/crm/format";
import {
  listIncomingCrmTransfersForCurrentUser,
  listOutgoingCrmTransfersForCurrentUser,
  type CrmLeadTransferVM,
} from "@/lib/db/crm";
import type { CrmTransferStatus } from "@/lib/types/crm";

type Search = { error?: string; ok?: string };

const STATUS_TONES: Record<CrmTransferStatus, "green" | "amber" | "red" | "gray" | "indigo"> = {
  pending: "amber",
  accepted: "green",
  rejected: "red",
  cancelled: "gray",
  admin_override: "indigo",
};

export default async function CrmTransfersPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.appUser.is_active) redirect("/dashboard?error=Active%20user%20required");

  const [incomingTransfers, outgoingTransfers] = await Promise.all([
    listIncomingCrmTransfersForCurrentUser(),
    listOutgoingCrmTransfersForCurrentUser(),
  ]);
  const isSuperAdmin = me.appUser.role === "super_admin";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Lead Transfers</h1>
          <p className="text-sm text-gray-500">
            Review incoming handoff requests and track leads you have passed to other counselors.
          </p>
        </div>
        <Link
          href="/crm/leads"
          className="rounded-md bg-white px-3 py-1.5 text-sm text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
        >
          CRM leads
        </Link>
      </header>

      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {sp.ok && <Notice tone="green">{sp.ok}</Notice>}

      <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Accepting a transfer moves the lead into your assigned leads. Rejecting keeps it with the current counselor.
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Incoming transfers</h2>
          <span className="text-xs text-gray-500">{incomingTransfers.length} pending</span>
        </div>
        {incomingTransfers.length === 0 ? (
          <EmptyState>No incoming transfer requests.</EmptyState>
        ) : (
          <div className="grid gap-4">
            {incomingTransfers.map((transfer) => (
              <IncomingTransferCard key={transfer.id} transfer={transfer} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Outgoing transfers</h2>
          <span className="text-xs text-gray-500">{outgoingTransfers.length} shown</span>
        </div>
        {outgoingTransfers.length === 0 ? (
          <EmptyState>No outgoing transfer requests.</EmptyState>
        ) : (
          <div className="grid gap-4">
            {outgoingTransfers.map((transfer) => (
              <OutgoingTransferCard
                key={transfer.id}
                transfer={transfer}
                canCancel={
                  transfer.status === "pending" &&
                  (isSuperAdmin || transfer.requested_by_user_id === me.authUserId)
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function IncomingTransferCard({ transfer }: { transfer: CrmLeadTransferVM }) {
  return (
    <article className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <LeadSummary transfer={transfer} />
        <Chip label={transfer.status} tone={STATUS_TONES[transfer.status]} />
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Current owner" value={employeeLabel(transfer.from_employee_name, transfer.from_employee_branch_code)} />
        <Info label="Requested by" value={transfer.requested_by_name ?? "-"} />
        <Info label="Requested" value={formatCrmDateTime(transfer.requested_at)} />
        <Info label="Reason" value={transfer.reason} />
      </dl>

      <div className="mt-5 grid gap-3 lg:grid-cols-[auto,1fr]">
        <form action={acceptTransferForm} className="flex items-end gap-2">
          <input type="hidden" name="transfer_id" value={transfer.id} />
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Accept note optional</span>
            <input
              name="note"
              className="w-64 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
              placeholder="Optional note"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Accept lead
          </button>
        </form>

        <form action={rejectTransferForm} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="transfer_id" value={transfer.id} />
          <label className="min-w-72 flex-1 space-y-1 text-xs font-medium text-gray-600">
            <span>Reject note required</span>
            <textarea
              name="note"
              required
              rows={2}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
              placeholder="Why are you rejecting this transfer?"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-red-600 ring-1 ring-inset ring-red-200 hover:bg-red-50"
          >
            Reject
          </button>
        </form>
      </div>
    </article>
  );
}

function OutgoingTransferCard({
  transfer,
  canCancel,
}: {
  transfer: CrmLeadTransferVM;
  canCancel: boolean;
}) {
  return (
    <article className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <LeadSummary transfer={transfer} />
        <Chip label={transfer.status} tone={STATUS_TONES[transfer.status]} />
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
        <Info label="Target counselor" value={employeeLabel(transfer.to_employee_name, transfer.to_employee_branch_code)} />
        <Info label="Requested" value={formatCrmDateTime(transfer.requested_at)} />
        <Info label="Reason" value={transfer.reason} />
        <Info label="Decision note" value={transfer.decision_note ?? "-"} />
        <div>
          {canCancel ? (
            <form action={cancelTransferForm}>
              <input type="hidden" name="transfer_id" value={transfer.id} />
              <button
                type="submit"
                className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
              >
                Cancel transfer
              </button>
            </form>
          ) : (
            <span className="text-xs text-gray-400">No action</span>
          )}
        </div>
      </dl>
    </article>
  );
}

function LeadSummary({ transfer }: { transfer: CrmLeadTransferVM }) {
  const title = transfer.lead_customer_name || transfer.lead_customer_phone || "Lead";
  return (
    <div>
      <Link
        href={`/crm/leads/${transfer.lead_id}`}
        className="font-medium text-indigo-600 hover:text-indigo-500"
      >
        {title}
      </Link>
      {transfer.lead_customer_name && (
        <div className="mt-0.5 text-xs text-gray-500">{transfer.lead_customer_phone}</div>
      )}
      <div className="mt-1 text-xs text-gray-500">
        {[transfer.lead_interested_country, transfer.lead_city].filter(Boolean).join(" / ") || "-"}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 text-gray-900">{value}</dd>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
      {children}
    </p>
  );
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
  return <div className={`rounded-md border px-4 py-2 text-sm ${classes}`}>{children}</div>;
}

function employeeLabel(name: string | null, branchCode: string | null): string {
  if (!name) return "-";
  return branchCode ? `${name} (${branchCode})` : name;
}

async function acceptTransferForm(formData: FormData) {
  "use server";
  const result = await acceptLeadTransfer(
    String(formData.get("transfer_id") ?? ""),
    String(formData.get("note") ?? "")
  );
  redirectWithResult(result);
}

async function rejectTransferForm(formData: FormData) {
  "use server";
  const result = await rejectLeadTransfer(
    String(formData.get("transfer_id") ?? ""),
    String(formData.get("note") ?? "")
  );
  redirectWithResult(result);
}

async function cancelTransferForm(formData: FormData) {
  "use server";
  const result = await cancelLeadTransfer(String(formData.get("transfer_id") ?? ""));
  redirectWithResult(result);
}

function redirectWithResult(result: { ok: boolean; message: string }): never {
  const key = result.ok ? "ok" : "error";
  redirect(`/crm/transfers?${key}=${encodeURIComponent(result.message)}`);
}
