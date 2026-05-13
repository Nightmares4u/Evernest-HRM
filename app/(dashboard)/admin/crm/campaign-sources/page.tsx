import Link from "next/link";
import { redirect } from "next/navigation";
import { Chip } from "@/components/StatusChip";
import {
  createCampaignSource,
  setCampaignSourceActive,
} from "@/app/(dashboard)/admin/crm/actions";
import {
  CRM_CAMPAIGN_PLATFORMS,
  CRM_PRODUCT_CATEGORIES,
  listCrmBranches,
  listCrmCampaignSources,
  listCrmWhatsappNumbers,
} from "@/lib/db/crm";
import { getCurrentUser } from "@/lib/auth/current-user";

type Search = { error?: string; ok?: string };

const INPUT =
  "w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900";

export default async function CrmCampaignSourcesPage({
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

  const [branches, whatsappNumbers, sources] = await Promise.all([
    listCrmBranches(),
    listCrmWhatsappNumbers(),
    listCrmCampaignSources(),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Campaign sources</h1>
          <p className="text-sm text-gray-500">
            Map manual campaign/source labels to product categories, branches, and numbers.
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

      <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
        <h2 className="text-sm font-semibold text-gray-700">Add source</h2>
        <form action={createCampaignSource} className="mt-4 grid gap-3 lg:grid-cols-6">
          <Field label="Campaign name" className="lg:col-span-2">
            <input name="label" required className={INPUT} placeholder="May Italy leads" />
          </Field>
          <Field label="Platform">
            <select name="platform" defaultValue="whatsapp_manual" className={INPUT}>
              {CRM_CAMPAIGN_PLATFORMS.map((platform) => (
                <option key={platform} value={platform}>
                  {platform}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mapped WhatsApp number" className="lg:col-span-2">
            <select name="whatsapp_number_id" className={INPUT}>
              <option value="">No number mapping</option>
              {whatsappNumbers.map((number) => (
                <option key={number.id} value={number.id}>
                  {number.label} - {number.display_number}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Product / category">
            <select name="product_category" defaultValue="General" className={INPUT}>
              {CRM_PRODUCT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Default branch optional" className="lg:col-span-2">
            <select name="default_branch_id" className={INPUT}>
              <option value="">No default branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.code} - {branch.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes" className="lg:col-span-3">
            <input name="notes" className={INPUT} placeholder="Source setup note" />
          </Field>
          <div className="flex items-end justify-between gap-3">
            <label className="inline-flex items-center gap-2 pb-2 text-xs font-medium text-gray-700">
              <input name="is_active" type="checkbox" defaultChecked className="rounded border-gray-300" />
              Active
            </label>
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Add source
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Existing sources</h2>
        {sources.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
            No campaign sources configured yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Campaign</Th>
                  <Th>Platform</Th>
                  <Th>WhatsApp number</Th>
                  <Th>Product</Th>
                  <Th>Branch</Th>
                  <Th>Status</Th>
                  <Th>Notes</Th>
                  <Th className="text-right">Action</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sources.map((source) => (
                  <tr key={source.id} className="hover:bg-gray-50">
                    <Td className="font-medium text-gray-900">
                      <div>{source.label}</div>
                      <div className="mt-0.5 text-xs text-gray-400">
                        {source.source_key}
                      </div>
                    </Td>
                    <Td>{source.platform}</Td>
                    <Td>
                      {source.whatsapp_number_label
                        ? `${source.whatsapp_number_label} - ${source.whatsapp_display_number}`
                        : "—"}
                    </Td>
                    <Td>{source.product_category}</Td>
                    <Td>
                      {source.branch_code
                        ? `${source.branch_code} - ${source.branch_name}`
                        : "—"}
                    </Td>
                    <Td>
                      <Chip
                        label={source.is_active ? "active" : "inactive"}
                        tone={source.is_active ? "green" : "gray"}
                      />
                    </Td>
                    <Td className="max-w-xs truncate text-gray-500">
                      {source.notes ?? "—"}
                    </Td>
                    <Td className="text-right">
                      <form action={setCampaignSourceActive}>
                        <input type="hidden" name="id" value={source.id} />
                        <input
                          type="hidden"
                          name="is_active"
                          value={source.is_active ? "" : "on"}
                        />
                        <button
                          type="submit"
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
                        >
                          {source.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </form>
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
