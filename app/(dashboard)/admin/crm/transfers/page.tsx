import Link from "next/link";
import { redirect } from "next/navigation";
import { Chip } from "@/components/StatusChip";
import {
  adminOverrideTransfer,
  cancelLeadTransfer,
  rejectLeadTransfer,
} from "@/app/(dashboard)/crm/transfers/actions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatCrmDateTime } from "@/lib/crm/format";
import {
  listAllCrmTransfersForAdmin,
  type CrmLeadTransferVM,
} from "@/lib/db/crm";
import type { CrmTransferStatus } from "@/lib/types/crm";

type StatusFilter = CrmTransferStatus | "all";
type Search = { error?: string; ok?: string; status?: string };

const STATUSES: StatusFilter[] = [
  "all",
  "pending",
  "accepted",
  "rejected",
  "cancelled",
  "admin_override",
];

const STATUS_TONES: Record<CrmTransferStatus, "green" | "amber" | "red" | "gray" | "indigo"> = {
  pending: "amber",
  accepted: "green",
  rejected: "red",
  cancelled: "gray",
  admin_override: "indigo",
};

export default async function AdminCrmTransfersPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.appUser.role !== "super_admin") {
    redirect("/dashboard?error=Super-admin%20access%20required");
  }

  const status = normalizeStatus(sp.status);
  const transfers = await listAllCrmTransfersForAdmin({ status });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/admin/crm" className="text-sm text-indigo-600 hover:text-indigo-500">
              CRM admin
            </Link>
            <span className="text-sm text-gray-400">/</span>
            <span className="text-sm text-gray-500">Transfers</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">
            CRM Transfer Monitor
          </h1>
          <p className="text-sm text-gray-500">
            Track pending, accepted, rejected, cancelled, and admin-overridden lead handoffs.
          </p>
        </div>
        <Link
          href="/crm/transfers"
          className="rounded-md bg-white px-3 py-1.5 text-sm text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
        >
          Counselor inbox
        </Link>
      </header>

      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {sp.ok && <Notice tone="green">{sp.ok}</Notice>}

      <section className="rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
        <form className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Status</span>
            <select
              name="status"
              defaultValue={status}
              className="w-52 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
            >
              {STATUSES.map((option) => (
                <option key={option} value={option}>
                  {statusLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Filter
          </button>
          <Link
            href="/admin/crm/transfers"
            className="rounded-md bg-white px-4 py-2 text-sm text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
          >
            Reset
          </Link>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Transfer records</h2>
          <span className="text-xs text-gray-500">{transfers.length} shown</span>
        </div>
        {transfers.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
            No transfer records found.
          </p>
        ) : (
          <div className="grid gap-4">
            {transfers.map((transfer) => (
              <TransferMonitorCard key={transfer.id} transfer={transfer} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TransferMonitorCard({ transfer }: { transfer: CrmLeadTransferVM }) {
  return (
    <article className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <LeadSummary transfer={transfer} />
        <Chip label={transfer.status} tone={STATUS_TONES[transfer.status]} />
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <Info
          label="From counselor"
          value={employeeLabel(transfer.from_employee_name, transfer.from_employee_branch_code)}
        />
        <Info
          label="To counselor"
          value={employeeLabel(transfer.to_employee_name, transfer.to_employee_branch_code)}
        />
        <Info label="Requested by" value={transfer.requested_by_name ?? "-"} />
        <Info label="Decided by" value={transfer.decided_by_name ?? "-"} />
        <Info label="Requested" value={formatCrmDateTime(transfer.requested_at)} />
        <Info label="Decided" value={formatCrmDateTime(transfer.decided_at)} />
        <Info label="Reason" value={transfer.reason} />
        <Info label="Decision note" value={transfer.decision_note ?? "-"} />
      </dl>

      {transfer.status === "pending" && (
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <form action={forceAcceptTransferForm} className="space-y-2">
            <input type="hidden" name="transfer_id" value={transfer.id} />
            <label className="block space-y-1 text-xs font-medium text-gray-600">
              <span>Override note optional</span>
              <textarea
                name="note"
                rows={2}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                placeholder="Admin override note"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Force accept
            </button>
          </form>

          <form action={rejectTransferForm} className="space-y-2">
            <input type="hidden" name="transfer_id" value={transfer.id} />
            <label className="block space-y-1 text-xs font-medium text-gray-600">
              <span>Reject note required</span>
              <textarea
                name="note"
                required
                rows={2}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                placeholder="Reason for rejection"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-red-600 ring-1 ring-inset ring-red-200 hover:bg-red-50"
            >
              Reject
            </button>
          </form>

          <form action={cancelTransferForm} className="flex items-end">
            <input type="hidden" name="transfer_id" value={transfer.id} />
            <button
              type="submit"
              className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
            >
              Cancel
            </button>
          </form>
        </div>
      )}
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

function normalizeStatus(value: string | undefined): StatusFilter {
  return STATUSES.includes(value as StatusFilter) ? (value as StatusFilter) : "all";
}

function statusLabel(status: StatusFilter): string {
  return status === "all"
    ? "All"
    : status
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

async function forceAcceptTransferForm(formData: FormData) {
  "use server";
  const result = await adminOverrideTransfer(
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
  redirect(`/admin/crm/transfers?${key}=${encodeURIComponent(result.message)}`);
}
