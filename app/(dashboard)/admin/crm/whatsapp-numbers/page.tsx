import Link from "next/link";
import { redirect } from "next/navigation";
import { Chip } from "@/components/StatusChip";
import {
  clearWhatsappNumberFallback,
  createWhatsappNumber,
  setWhatsappNumberActive,
  updateWhatsappNumberFallback,
  updateWhatsappNumberMetaId,
  updateWhatsappNumberOwner,
} from "@/app/(dashboard)/admin/crm/actions";
import {
  CRM_PRODUCT_CATEGORIES,
  listCrmAssignableEmployees,
  listCrmBranches,
  listCrmWhatsappNumbers,
} from "@/lib/db/crm";
import { getCurrentUser } from "@/lib/auth/current-user";

type Search = { error?: string; ok?: string };

const INPUT =
  "w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900";

export default async function CrmWhatsappNumbersPage({
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

  const [branches, numbers, employees] = await Promise.all([
    listCrmBranches(),
    listCrmWhatsappNumbers(),
    listCrmAssignableEmployees(),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">WhatsApp numbers</h1>
          <p className="text-sm text-gray-500">
            Map receiving EN WhatsApp numbers to products, branches, and counselor owners.
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
        <h2 className="text-sm font-semibold text-gray-700">Add mapping</h2>
        <form action={createWhatsappNumber} className="mt-4 grid gap-3 lg:grid-cols-6">
          <Field label="Label / name" className="lg:col-span-2">
            <input name="label" required className={INPUT} placeholder="Italy admissions" />
          </Field>
          <Field label="Display phone number" className="lg:col-span-2">
            <input name="display_number" required className={INPUT} placeholder="+92..." />
          </Field>
          <Field label="phone_number_id optional" className="lg:col-span-2">
            <input name="phone_number_id" className={INPUT} placeholder="Meta ID later" />
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
          <Field label="Assigned counselor" className="lg:col-span-2">
            <select name="assigned_employee_id" className={INPUT}>
              <option value="">Unassigned (rules fallback only)</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name} ({employee.branch_code ?? "no branch"})
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] font-normal text-gray-500">
              Leads received on this number are assigned to this counselor.
            </span>
          </Field>
          <Field label="Notes" className="lg:col-span-2">
            <input name="notes" className={INPUT} placeholder="Manual setup note" />
          </Field>
          <div className="flex items-end justify-between gap-3">
            <label className="inline-flex items-center gap-2 pb-2 text-xs font-medium text-gray-700">
              <input name="is_active" type="checkbox" defaultChecked className="rounded border-gray-300" />
              Active
            </label>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Add number
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Existing mappings</h2>
          <p className="mt-1 text-xs text-gray-500">
            Fallback only affects new leads while active. The default counselor remains the owner of this number.
          </p>
        </div>
        {numbers.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
            No WhatsApp number mappings yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Label</Th>
                  <Th>Display number</Th>
                  <Th>Product</Th>
                  <Th>Branch</Th>
                  <Th>Assigned counselor</Th>
                  <Th>Temporary fallback</Th>
                  <Th>Status</Th>
                  <Th>Notes</Th>
                  <Th className="text-right">Action</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {numbers.map((number) => (
                  <tr key={number.id} className="hover:bg-gray-50">
                    <Td className="font-medium text-gray-900">
                      <div>{number.label}</div>
                      <form
                        action={updateWhatsappNumberMetaId}
                        className="mt-1 flex items-center gap-1"
                      >
                        <input type="hidden" name="id" value={number.id} />
                        <input
                          name="phone_number_id"
                          defaultValue={number.phone_number_id ?? ""}
                          placeholder="phone_number_id"
                          className="w-36 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-900"
                        />
                        <button
                          type="submit"
                          className="text-[11px] font-medium text-blue-600 hover:text-blue-500"
                        >
                          Save
                        </button>
                      </form>
                      {!number.phone_number_id && (
                        <div className="mt-0.5 text-[10px] text-amber-600">
                          Set the Meta id WAB2C sends so inbound auto-assigns.
                        </div>
                      )}
                    </Td>
                    <Td>{number.display_number}</Td>
                    <Td>{number.product_category}</Td>
                    <Td>
                      {number.branch_code
                        ? `${number.branch_code} - ${number.branch_name}`
                        : "—"}
                    </Td>
                    <Td>
                      <form
                        action={updateWhatsappNumberOwner}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="id" value={number.id} />
                        <select
                          name="assigned_employee_id"
                          defaultValue={number.assigned_employee_id ?? ""}
                          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900"
                        >
                          <option value="">Unassigned</option>
                          {employees.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              {employee.full_name}
                              {employee.branch_code ? ` (${employee.branch_code})` : ""}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="text-xs font-medium text-blue-600 hover:text-blue-500"
                        >
                          Save
                        </button>
                      </form>
                      {number.assigned_employee_name ? (
                        <div className="mt-1 text-[11px] text-gray-500">
                          Current: {number.assigned_employee_name}
                          {number.assigned_employee_branch_code
                            ? ` (${number.assigned_employee_branch_code})`
                            : ""}
                        </div>
                      ) : (
                        <div className="mt-1 text-[11px] text-gray-400">
                          No counselor — rules fallback only
                        </div>
                      )}
                    </Td>
                    <Td className="min-w-80">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Chip
                          label={
                            number.fallback_active
                              ? number.fallback_is_currently_active
                                ? "fallback active"
                                : "fallback scheduled"
                              : "fallback inactive"
                          }
                          tone={
                            number.fallback_active
                              ? number.fallback_is_currently_active
                                ? "green"
                                : "amber"
                              : "gray"
                          }
                        />
                        {number.fallback_employee_name && (
                          <span className="text-[11px] text-gray-500">
                            {number.fallback_employee_name}
                            {number.fallback_employee_branch_code
                              ? ` (${number.fallback_employee_branch_code})`
                              : ""}
                          </span>
                        )}
                      </div>
                      {(number.fallback_reason ||
                        number.fallback_starts_at ||
                        number.fallback_ends_at) && (
                        <div className="mb-2 space-y-0.5 text-[11px] text-gray-500">
                          {number.fallback_reason && <div>Reason: {number.fallback_reason}</div>}
                          {(number.fallback_starts_at || number.fallback_ends_at) && (
                            <div>
                              Window: {formatDateTimePKT(number.fallback_starts_at)} to{" "}
                              {formatDateTimePKT(number.fallback_ends_at)}
                            </div>
                          )}
                        </div>
                      )}
                      <form action={updateWhatsappNumberFallback} className="space-y-2">
                        <input type="hidden" name="id" value={number.id} />
                        <select
                          name="fallback_employee_id"
                          defaultValue={number.fallback_employee_id ?? ""}
                          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900"
                        >
                          <option value="">No fallback counselor</option>
                          {employees.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              {employee.full_name}
                              {employee.branch_code ? ` (${employee.branch_code})` : ""}
                            </option>
                          ))}
                        </select>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <input
                            name="fallback_starts_at"
                            type="datetime-local"
                            defaultValue={formatDateTimeLocalPKT(number.fallback_starts_at)}
                            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900"
                          />
                          <input
                            name="fallback_ends_at"
                            type="datetime-local"
                            defaultValue={formatDateTimeLocalPKT(number.fallback_ends_at)}
                            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900"
                          />
                        </div>
                        <input
                          name="fallback_reason"
                          defaultValue={number.fallback_reason ?? ""}
                          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900"
                          placeholder="Reason, e.g. leave or break coverage"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                            <input
                              name="fallback_active"
                              type="checkbox"
                              defaultChecked={number.fallback_active}
                              className="rounded border-gray-300"
                            />
                            Active
                          </label>
                          <button
                            type="submit"
                            className="text-xs font-medium text-blue-600 hover:text-blue-500"
                          >
                            Save fallback
                          </button>
                        </div>
                      </form>
                      <form action={clearWhatsappNumberFallback} className="mt-1 text-right">
                        <input type="hidden" name="id" value={number.id} />
                        <button
                          type="submit"
                          className="text-xs font-medium text-gray-500 hover:text-gray-700"
                        >
                          Clear fallback
                        </button>
                      </form>
                    </Td>
                    <Td>
                      <Chip
                        label={number.is_active ? "active" : "inactive"}
                        tone={number.is_active ? "green" : "gray"}
                      />
                    </Td>
                    <Td className="max-w-xs truncate text-gray-500">
                      {number.notes ?? "—"}
                    </Td>
                    <Td className="text-right">
                      <form action={setWhatsappNumberActive}>
                        <input type="hidden" name="id" value={number.id} />
                        <input
                          type="hidden"
                          name="is_active"
                          value={number.is_active ? "" : "on"}
                        />
                        <button
                          type="submit"
                          className="text-xs font-medium text-blue-600 hover:text-blue-500"
                        >
                          {number.is_active ? "Deactivate" : "Activate"}
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

function formatDateTimeLocalPKT(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const karachiOffsetMs = 5 * 60 * 60 * 1000;
  return new Date(date.getTime() + karachiOffsetMs).toISOString().slice(0, 16);
}

function formatDateTimePKT(iso: string | null): string {
  if (!iso) return "open";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "invalid";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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
