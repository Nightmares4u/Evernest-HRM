import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isBranchManagerOrAboveRole } from "@/lib/auth/permissions";
import { canCreateClientShell } from "@/lib/crm/permissions-clients";
import { listCrmAssignableEmployees } from "@/lib/db/crm";
import { listBranches } from "@/lib/db/queries";
import { createClientShell } from "../actions";

import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

const FIELD =
  "w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-600 focus:ring-blue-600 outline-none";
const BTN_PRIMARY =
  "rounded-md bg-blue-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 transition-colors";

export default async function NewClientShellPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!me || !canCreateClientShell(me)) redirect("/crm/clients");

  const isGlobal =
    me.appUser.role === "super_admin" ||
    me.appUser.role === "admin_hr" ||
    me.appUser.role === "ops";
  const isManager = isBranchManagerOrAboveRole(me.appUser.role);
  const canPickAgent = isGlobal || isManager;

  const [branches, employees] = await Promise.all([
    isGlobal ? listBranches() : Promise.resolve([]),
    canPickAgent ? listCrmAssignableEmployees() : Promise.resolve([]),
  ]);
  // Branch managers assign within their own branch only.
  const assignableEmployees = isGlobal
    ? employees
    : employees.filter((e) => e.branch_id && e.branch_id === me.employee?.branch_id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="New client shell"
        description="Create a client directly — the invoice is created with it (Step 1 registration fee due)."
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "CRM clients", href: "/crm/clients" },
              { label: "New" },
            ]}
          />
        }
      />

      {sp.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
          {sp.error}
        </div>
      )}

      <SectionCard
        title="Client details"
        description={
          canPickAgent
            ? "Assign the shell to a counselor; ops and admins have access to every client."
            : "The shell is created in your name and branch. Ops and admins have access to it automatically."
        }
      >
        <form action={createClientShell} className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Customer name *</span>
            <input name="customer_name" required className={FIELD} />
          </label>
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Customer phone *</span>
            <input name="customer_phone" required className={FIELD} />
          </label>
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Target country</span>
            <input name="target_country" className={FIELD} />
          </label>
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Target level</span>
            <input name="target_level" className={FIELD} />
          </label>
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Total fee (PKR, optional)</span>
            <input name="total_fee" type="number" min="0" step="0.01" className={FIELD} />
          </label>
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Registration fee (PKR, optional)</span>
            <input name="registration_fee" type="number" min="0" step="0.01" className={FIELD} />
            <span className="block text-[11px] font-normal text-gray-400">
              Becomes invoice Step 1 (due). Mark it paid on the financials tab when cash arrives.
            </span>
          </label>

          {isGlobal && (
            <label className="space-y-1 text-xs font-medium text-gray-600">
              <span>Branch</span>
              <select name="branch_id" defaultValue="" className={FIELD}>
                <option value="">No branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.code} - {branch.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {canPickAgent && (
            <label className="space-y-1 text-xs font-medium text-gray-600">
              <span>Assigned counselor</span>
              <select name="assigned_agent_id" defaultValue="" className={FIELD}>
                <option value="">Unassigned</option>
                {assignableEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name}
                    {employee.branch_code ? ` (${employee.branch_code})` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="mt-2 flex justify-end border-t border-gray-100 pt-4 md:col-span-3">
            <button className={`w-full md:w-auto ${BTN_PRIMARY}`}>Create client shell</button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
