import Link from "next/link";
import { redirect } from "next/navigation";
import { Chip } from "@/components/StatusChip";
import {
  createAssignmentRule,
  setAssignmentRuleActive,
} from "@/app/(dashboard)/admin/crm/actions";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  CRM_PRODUCT_CATEGORIES,
  listCrmAssignableEmployees,
  listCrmAssignmentRules,
  listCrmBranches,
  listCrmCampaignSources,
  listCrmWhatsappNumbers,
} from "@/lib/db/crm";

type Search = { error?: string; ok?: string };

const INPUT =
  "w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900";

export default async function CrmAssignmentRulesPage({
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

  const [rules, branches, employees, whatsappNumbers, campaignSources] =
    await Promise.all([
      listCrmAssignmentRules(),
      listCrmBranches(),
      listCrmAssignableEmployees(),
      listCrmWhatsappNumbers(),
      listCrmCampaignSources(),
    ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Assignment rules</h1>
          <p className="text-sm text-gray-500">
            Assign matching leads to employee based on parsed lead details.
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
        <h2 className="text-sm font-semibold text-gray-700">Create rule</h2>
        <p className="mt-1 text-sm text-gray-500">
          Match country, city, and product first. Campaign/source, branch, and
          WhatsApp number are optional refiners. Every matching rule assigns to
          one required employee.
        </p>
        <form action={createAssignmentRule} className="mt-4 grid gap-3 lg:grid-cols-6">
          <Field label="Rule name" className="lg:col-span-2">
            <input name="name" required className={INPUT} placeholder="Italy Lahore to counsellor" />
          </Field>
          <Field label="Priority">
            <input name="priority" type="number" defaultValue={100} className={INPUT} />
          </Field>
          <Field label="Lead product/category">
            <select name="match_product_category" className={INPUT}>
              <option value="">Any product</option>
              {CRM_PRODUCT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Interested country">
            <input name="match_country" className={INPUT} placeholder="Italy" />
          </Field>
          <Field label="Lead city">
            <input name="match_city" className={INPUT} placeholder="Lahore" />
          </Field>
          <Field label="Branch filter optional">
            <select name="match_branch_id" className={INPUT}>
              <option value="">Any branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.code} - {branch.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="WhatsApp number optional" className="lg:col-span-2">
            <select name="whatsapp_number_id" className={INPUT}>
              <option value="">Any WhatsApp number</option>
              {whatsappNumbers.map((number) => (
                <option key={number.id} value={number.id}>
                  {number.label} - {number.display_number}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Campaign/source optional" className="lg:col-span-2">
            <select name="campaign_source_id" className={INPUT}>
              <option value="">Any campaign/source</option>
              {campaignSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label} - {source.platform}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assign matching leads to employee" className="lg:col-span-2">
            <select name="target_employee_id" required className={INPUT}>
              <option value="">Choose employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name} ({employee.branch_code ?? "no branch"})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes" className="lg:col-span-3">
            <input name="notes" className={INPUT} placeholder="Why this rule exists" />
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
              Create rule
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Rules</h2>
        {rules.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
            No assignment rules configured yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Rule</Th>
                  <Th>Match</Th>
                  <Th>Assign to employee</Th>
                  <Th>Status</Th>
                  <Th>Notes</Th>
                  <Th className="text-right">Action</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-gray-50">
                    <Td>
                      <div className="font-medium text-gray-900">{rule.name}</div>
                      <div className="text-xs text-gray-500">
                        priority {rule.priority} / specificity {rule.specificity}
                      </div>
                    </Td>
                    <Td className="max-w-sm">
                      <div className="flex flex-wrap gap-1">
                        <RuleChip label="Product" value={rule.match_product_category} />
                        <RuleChip label="Country" value={rule.match_country} />
                        <RuleChip label="City" value={rule.match_city} />
                        <RuleChip
                          label="Branch"
                          value={rule.match_branch_code ?? rule.match_branch_name}
                        />
                        <RuleChip
                          label="WhatsApp"
                          value={rule.whatsapp_number_label}
                        />
                        <RuleChip
                          label="Campaign"
                          value={rule.campaign_label}
                        />
                      </div>
                    </Td>
                    <Td>
                      {rule.target_employee_name ? (
                        <div>
                          <div className="font-medium text-gray-900">
                            {rule.target_employee_name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {rule.target_employee_branch_code ?? "no branch"}
                          </div>
                        </div>
                      ) : (
                        <Chip label="missing employee" tone="red" />
                      )}
                    </Td>
                    <Td>
                      <Chip
                        label={rule.is_active ? "active" : "inactive"}
                        tone={rule.is_active ? "green" : "gray"}
                      />
                    </Td>
                    <Td className="max-w-xs truncate text-gray-500">
                      {rule.reason_template ?? "-"}
                    </Td>
                    <Td className="text-right">
                      <form action={setAssignmentRuleActive}>
                        <input type="hidden" name="id" value={rule.id} />
                        <input
                          type="hidden"
                          name="is_active"
                          value={rule.is_active ? "" : "on"}
                        />
                        <button
                          type="submit"
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
                        >
                          {rule.is_active ? "Deactivate" : "Activate"}
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

function RuleChip({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return <Chip label={`${label}: ${value}`} tone="indigo" />;
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
