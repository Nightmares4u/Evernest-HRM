import Link from "next/link";
import { redirect } from "next/navigation";
import { updatePersonalPayrollProfile } from "@/app/(dashboard)/profile/actions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getEmployeeProfile } from "@/lib/db/queries";
import {
  personalProfileCompletionStatus,
  personalProfileFieldLabel,
  PERSONAL_PROFILE_FIELDS,
  REQUIRED_PERSONAL_PROFILE_FIELDS,
  type PersonalProfileField,
} from "@/lib/employees/personal-profile";
import type { EmployeeProfileVM } from "@/lib/db/queries";

type Search = { error?: string; ok?: string };

const INPUT_CLASS =
  "mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const [me, sp] = await Promise.all([getCurrentUser(), searchParams]);
  if (!me) redirect("/login");

  const employee = me.employee ? await getEmployeeProfile(me.employee.id) : null;
  if (!employee) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-gray-900">My Profile</h1>
        <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
          <p className="text-sm text-gray-600">
            No employee profile is linked to this account yet.
          </p>
          {me.appUser.role === "super_admin" && (
            <Link
              href="/employees"
              className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-500"
            >
              Open employee directory
            </Link>
          )}
        </section>
      </div>
    );
  }

  const completion = personalProfileCompletionStatus(employee);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500">
          HR and payroll forwarding details for {employee.full_name}.
        </p>
      </header>

      {sp.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {sp.error}
        </div>
      )}
      {sp.ok && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          {sp.ok}
        </div>
      )}

      <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Completion status</h2>
            <p className="mt-1 text-sm text-gray-600">
              {completion.complete
                ? "Complete"
                : `Missing required fields: ${completion.missingLabels.join(", ")}`}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              completion.complete
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {completion.complete ? "Complete" : "Missing required fields"}
          </span>
        </div>
      </section>

      <PersonalProfileForm employee={employee} />
    </div>
  );
}

function PersonalProfileForm({ employee }: { employee: EmployeeProfileVM }) {
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Personal and banking details</h2>
        <p className="mt-1 text-xs text-gray-500">
          Login email remains separate. Contact email is used for notifications.
        </p>
      </div>
      <form action={updatePersonalPayrollProfile} className="mt-5 grid gap-4 md:grid-cols-2">
        <input type="hidden" name="employee_id" value={employee.id} />
        <input type="hidden" name="redirect_to" value="/profile" />
        <ReadonlyField label="Login/system email" value={employee.email || "Not set"} />
        {PERSONAL_PROFILE_FIELDS.map((field) => (
          <ProfileField
            key={field}
            field={field}
            value={employee[field] ?? ""}
          />
        ))}
        <div className="md:col-span-2">
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
          >
            Save profile details
          </button>
        </div>
      </form>
    </section>
  );
}

function ProfileField({
  field,
  value,
}: {
  field: PersonalProfileField;
  value: string;
}) {
  const isRequired = REQUIRED_PERSONAL_PROFILE_FIELDS.includes(
    field as (typeof REQUIRED_PERSONAL_PROFILE_FIELDS)[number]
  );
  const type = field === "contact_email" ? "email" : "text";
  return (
    <label className="block text-xs font-medium text-gray-700">
      {personalProfileFieldLabel(field)}
      {isRequired && <span className="text-red-500"> *</span>}
      <input
        name={field}
        type={type}
        defaultValue={value}
        required={isRequired}
        className={INPUT_CLASS}
      />
    </label>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="block text-xs font-medium text-gray-700">
      {label}
      <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-normal text-gray-600">
        {value}
      </div>
    </div>
  );
}
