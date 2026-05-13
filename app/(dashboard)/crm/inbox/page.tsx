import Link from "next/link";
import { redirect } from "next/navigation";
import { Chip } from "@/components/StatusChip";
import { createManualRawIntake } from "@/app/(dashboard)/admin/crm/actions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatCrmDateTime } from "@/lib/crm/format";
import {
  CRM_PRODUCT_CATEGORIES,
  CRM_RAW_STATUSES,
  listCrmBranches,
  listCrmCampaignSources,
  listCrmRawInbox,
  listCrmWhatsappNumbers,
} from "@/lib/db/crm";
import type { CrmRawStatus } from "@/lib/types/crm";

type Search = {
  error?: string;
  ok?: string;
  status?: string;
  product?: string;
  branch_id?: string;
  date_from?: string;
};

const INPUT =
  "w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900";

const STATUS_TONES: Record<CrmRawStatus, "green" | "amber" | "gray" | "indigo" | "yellow" | "red"> = {
  raw_new: "indigo",
  awaiting_details: "amber",
  details_received: "green",
  needs_review: "yellow",
  qualified: "green",
  spam_duplicate: "red",
};

export default async function CrmInboxPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.appUser.is_active) redirect("/dashboard?error=Active%20user%20required");
  const canCreateMockIntake = me.appUser.role === "super_admin";

  const [branches, whatsappNumbers, campaignSources, rows] = await Promise.all([
    listCrmBranches(),
    listCrmWhatsappNumbers(),
    listCrmCampaignSources(),
    listCrmRawInbox({
      status: sp.status,
      product: sp.product,
      branch_id: sp.branch_id,
      date_from: sp.date_from,
    }),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">CRM raw inbox</h1>
          <p className="text-sm text-gray-500">
            Raw WhatsApp-style intake queue. This phase uses manual/mock entries only.
          </p>
        </div>
        <Link
          href="/admin/crm"
          className="rounded-md bg-white px-3 py-1.5 text-sm text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
        >
          CRM admin
        </Link>
      </header>

      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {sp.ok && <Notice tone="green">{sp.ok}</Notice>}

      {canCreateMockIntake && (
        <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
          <h2 className="text-sm font-semibold text-gray-700">Manual mock intake</h2>
          <form action={createManualRawIntake} className="mt-4 grid gap-3 lg:grid-cols-6">
            <Field label="Phone number" className="lg:col-span-2">
              <input name="sender_phone" required className={INPUT} placeholder="+92..." />
            </Field>
            <Field label="WhatsApp number mapping" className="lg:col-span-2">
              <select name="whatsapp_number_id" className={INPUT}>
                <option value="">No mapping</option>
                {whatsappNumbers
                  .filter((number) => number.is_active)
                  .map((number) => (
                    <option key={number.id} value={number.id}>
                      {number.label} - {number.display_number}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Campaign/source optional" className="lg:col-span-2">
              <select name="campaign_source_id" className={INPUT}>
                <option value="">manual_mock</option>
                {campaignSources
                  .filter((source) => source.is_active)
                  .map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.label} - {source.platform}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Received at" className="lg:col-span-2">
              <input
                type="datetime-local"
                name="received_at"
                defaultValue={datetimeLocalPKT()}
                className={INPUT}
              />
            </Field>
            <Field label="Message text" className="lg:col-span-3">
              <textarea
                name="message_text"
                required
                rows={3}
                className={INPUT}
                placeholder="Student inquiry message"
              />
            </Field>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Create raw intake
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
        <form className="grid gap-3 lg:grid-cols-5">
          <Field label="Status">
            <select name="status" defaultValue={sp.status ?? ""} className={INPUT}>
              <option value="">All statuses</option>
              {CRM_RAW_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Product / category">
            <select name="product" defaultValue={sp.product ?? ""} className={INPUT}>
              <option value="">All products</option>
              {CRM_PRODUCT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Branch">
            <select name="branch_id" defaultValue={sp.branch_id ?? ""} className={INPUT}>
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.code} - {branch.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="From date">
            <input
              type="date"
              name="date_from"
              defaultValue={sp.date_from ?? ""}
              className={INPUT}
            />
          </Field>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Filter
            </button>
            <Link
              href="/crm/inbox"
              className="rounded-md bg-white px-4 py-2 text-sm text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
            >
              Reset
            </Link>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Latest raw intake</h2>
          <span className="text-xs text-gray-500">{rows.length} shown</span>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
            No raw inbox rows match the current filters.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Received</Th>
                  <Th>Phone</Th>
                  <Th>Incoming number</Th>
                  <Th>Message</Th>
                  <Th>Status</Th>
                  <Th>Product</Th>
                  <Th>Branch</Th>
                  <Th>Campaign/source</Th>
                  <Th>Lead</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <Td className="whitespace-nowrap text-gray-500">
                      {formatCrmDateTime(row.received_at)}
                    </Td>
                    <Td className="font-medium text-gray-900">
                      <Link
                        href={`/crm/inbox/${row.id}`}
                        className="text-indigo-600 hover:text-indigo-500"
                      >
                        {row.sender_phone}
                      </Link>
                    </Td>
                    <Td>
                      {row.whatsapp_number_label ? (
                        <div>
                          <div className="font-medium text-gray-900">
                            {row.whatsapp_number_label}
                          </div>
                          <div className="text-xs text-gray-500">
                            {row.whatsapp_display_number}
                          </div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="max-w-xs">
                      <div className="truncate text-gray-700">
                        {row.message_preview ?? "—"}
                      </div>
                      {row.needs_review && (
                        <div className="mt-1">
                          <Chip label="needs review" tone="yellow" />
                        </div>
                      )}
                    </Td>
                    <Td>
                      <Chip
                        label={row.status}
                        tone={STATUS_TONES[row.status] ?? "gray"}
                      />
                    </Td>
                    <Td>{row.product_category ?? "—"}</Td>
                    <Td>
                      {row.branch_code ? `${row.branch_code} - ${row.branch_name}` : "—"}
                    </Td>
                    <Td>
                      {row.campaign_label ? (
                        <div>
                          <div>{row.campaign_label}</div>
                          <div className="text-xs text-gray-500">
                            {row.campaign_platform}
                          </div>
                        </div>
                      ) : (
                        "manual_mock"
                      )}
                    </Td>
                    <Td>
                      {row.lead_id ? (
                        <Link
                          href={`/crm/leads/${row.lead_id}`}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
                        >
                          Lead linked
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-400">Placeholder</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function datetimeLocalPKT(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`space-y-1 text-xs font-medium text-gray-600 ${className}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
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
