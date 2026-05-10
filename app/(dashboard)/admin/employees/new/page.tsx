import Link from "next/link";
import { redirect } from "next/navigation";
import { createEmployee } from "@/app/(dashboard)/admin/employees/actions";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  listBranches,
  listDepartments,
  listEmployees,
  listShifts,
} from "@/lib/db/queries";
import type { EmploymentStatus, UserRole } from "@/lib/types/hrm";

const USER_ROLES: { value: UserRole; label: string; hint: string }[] = [
  { value: "employee", label: "Employee", hint: "Standard staff access" },
  { value: "manager", label: "Manager", hint: "Team-level account" },
  { value: "branch_manager", label: "Branch manager", hint: "Branch operations" },
  { value: "admin_hr", label: "Admin HR", hint: "HR administration" },
  { value: "super_admin", label: "Super admin", hint: "Full company access" },
];

const EMPLOYMENT_STATUSES: { value: EmploymentStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "terminated", label: "Terminated" },
];

const INPUT_CLASS =
  "block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

type Search = { error?: string };

export default async function NewEmployeePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const [me, branches, departments, shifts, employees, sp] = await Promise.all([
    getCurrentUser(),
    listBranches(),
    listDepartments(),
    listShifts(),
    listEmployees(),
    searchParams,
  ]);

  if (!me) redirect("/login");
  if (me.appUser.role !== "super_admin") {
    redirect("/dashboard?error=Super-admin access required");
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-gray-500">
            <Link href="/employees" className="text-indigo-600 hover:text-indigo-500">
              Employees
            </Link>{" "}
            / New employee
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">
            Add employee
          </h1>
          <p className="text-sm text-gray-500">
            Create the login and HR profile together so attendance, leave,
            calendar, tasks, and payroll preview connect immediately.
          </p>
        </div>
        <Link
          href="/employees"
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
        >
          Back to employees
        </Link>
      </header>

      {sp.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {sp.error}
        </div>
      )}

      <form
        action={createEmployee}
        className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5"
      >
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">Profile</h2>
          <p className="mt-1 text-xs text-gray-500">
            Required fields are used to link the employee into branch schedules,
            leave balances, calendar views, and salary previews.
          </p>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <Field label="Full name" required>
            <input
              name="full_name"
              required
              autoComplete="name"
              className={INPUT_CLASS}
              placeholder="Employee full name"
            />
          </Field>

          <Field label="Email" required>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className={INPUT_CLASS}
              placeholder="name@enconsultants.com"
            />
          </Field>

          <Field label="Phone">
            <input
              name="phone"
              autoComplete="tel"
              className={INPUT_CLASS}
              placeholder="Optional phone number"
            />
          </Field>

          <Field label="Monthly salary" required>
            <input
              name="monthly_salary"
              type="number"
              min="0"
              step="1"
              required
              className={INPUT_CLASS}
              placeholder="130000"
            />
          </Field>

          <Field label="Branch" required>
            <select name="branch_id" required className={INPUT_CLASS}>
              <option value="">Choose branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} ({branch.code})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Department/category" required>
            <select name="department_id" required className={INPUT_CLASS}>
              <option value="">Choose department/category</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Shift" required>
            <select name="shift_id" required className={INPUT_CLASS}>
              <option value="">Choose shift</option>
              {shifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shift.name} ({shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Manager">
            <select name="manager_id" className={INPUT_CLASS}>
              <option value="">No manager</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name} · {employee.email}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Role" required>
            <select name="role" required defaultValue="employee" className={INPUT_CLASS}>
              {USER_ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label} — {role.hint}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Role / job title">
            <input
              name="role_description"
              className={INPUT_CLASS}
              placeholder="Sales consultant, HR officer, closer..."
            />
          </Field>

          <Field label="Employment status" required>
            <select
              name="employment_status"
              required
              defaultValue="active"
              className={INPUT_CLASS}
            >
              {EMPLOYMENT_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Initial password" required>
            <input
              name="initial_password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={INPUT_CLASS}
              placeholder="Minimum 8 characters"
            />
            <p className="mt-1 text-xs text-gray-500">
              The password is sent to Supabase Auth and is never displayed in
              logs or audit history.
            </p>
          </Field>
        </div>

        <div className="grid gap-3 border-t border-gray-100 px-5 py-4 sm:grid-cols-2">
          <label className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700">
            <input
              type="checkbox"
              name="attendance_exempt"
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Attendance exempt
          </label>
          <label className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700">
            <input
              type="checkbox"
              name="remote_allowed"
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Remote allowed
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4">
          <Link
            href="/employees"
            className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Create employee
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-gray-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
