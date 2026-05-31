import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isBranchManagerOrAboveRole } from "@/lib/auth/permissions";

type NavItem = {
  href: string;
  label: string;
  superAdminOnly?: boolean;
};

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/profile", label: "My Profile" },
  { href: "/calendar", label: "Calendar" },
  { href: "/attendance", label: "Attendance" },
  { href: "/tasks", label: "Tasks" },
  { href: "/tasks/history", label: "My Task History" },
  { href: "/leave", label: "Leave" },
  { href: "/employees", label: "Employees" },
  { href: "/admin", label: "Admin" },
] satisfies NavItem[];

const CRM_NAV = [
  { href: "/crm/leads", label: "Leads" },
  { href: "/crm/clients", label: "Clients" },
  { href: "/crm/leads/follow-ups", label: "Follow-ups" },
  { href: "/crm/transfers", label: "Transfers" },
  { href: "/crm/assistant", label: "Assistant" },
  { href: "/crm/inbox", label: "Raw Inbox", superAdminOnly: true },
] satisfies NavItem[];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const me = await getCurrentUser();
  const isSuperAdmin = me?.appUser.role === "super_admin";
  const canManage = me ? isBranchManagerOrAboveRole(me.appUser.role) : false;
  const baseNav = canManage ? NAV : NAV.filter((item) => item.href !== "/admin");
  const navItems = isSuperAdmin
    ? [...baseNav, { href: "/admin/tasks/history", label: "Company Task History" }]
    : baseNav;
  const crmNavItems = CRM_NAV.filter((item) => !item.superAdminOnly || isSuperAdmin);
  const adminNavItems = isSuperAdmin
    ? [
        { href: "/admin/crm", label: "Admin CRM" },
        { href: "/admin/financials", label: "Financials" },
        { href: "/admin/holidays", label: "Paid Holidays" },
        { href: "/admin/payroll", label: "Payroll Preview" },
      ]
    : canManage
      ? [{ href: "/admin/leave", label: "Leave Admin" }, { href: "/admin/tasks", label: "Task Admin" }]
      : [];

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <aside className="flex w-64 flex-shrink-0 flex-col bg-white shadow-md">
        <div className="flex h-16 items-center justify-center border-b px-4">
          <h1 className="text-xl font-bold text-gray-800">EN HRM</h1>
        </div>
        <nav className="mt-6 flex flex-col space-y-1 px-4">
          <NavSection items={navItems} />
          <NavSection title="CRM" items={crmNavItems} />
          {adminNavItems.length > 0 && (
            <NavSection title="Admin" items={adminNavItems} />
          )}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <header className="flex h-16 items-center bg-white px-8 shadow-sm">
          <div className="ml-auto flex items-center space-x-4">
            {!supabaseConfigured && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                mock mode
              </span>
            )}
            <span className="text-sm font-medium text-gray-700">
              {supabaseConfigured ? "Signed in" : "Mock User"}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm text-red-600 hover:text-red-800"
              >
                Logout
              </button>
            </form>
          </div>
        </header>
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}

function NavSection({
  title,
  items,
}: {
  title?: string;
  items: ReadonlyArray<NavItem>;
}) {
  if (items.length === 0) return null;

  return (
    <div className={title ? "pt-4" : ""}>
      {title && (
        <div className="px-4 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
          {title}
        </div>
      )}
      <div className="flex flex-col space-y-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center rounded-md px-4 py-2 text-gray-700 hover:bg-gray-100"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
