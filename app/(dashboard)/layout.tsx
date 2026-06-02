import { getCurrentUser } from "@/lib/auth/current-user";
import { isBranchManagerOrAboveRole } from "@/lib/auth/permissions";
import { AppShell } from "@/components/ui/AppShell";
import type { NavGroup, NavItem } from "@/components/ui/Sidebar";

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

  const coreNav: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/profile", label: "My Profile", icon: "user" },
  ];

  const hrmNav: NavItem[] = [
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/attendance", label: "Attendance", icon: "clock" },
    { href: "/tasks", label: "Tasks", icon: "check-square" },
    { href: "/tasks/history", label: "My Task History", icon: "history" },
    { href: "/leave", label: "Leave", icon: "plane" },
    { href: "/employees", label: "Employees", icon: "users" },
  ];

  const crmNav: NavItem[] = [
    { href: "/crm/leads", label: "Leads", icon: "users-round" },
    { href: "/crm/clients", label: "Clients", icon: "briefcase" },
    { href: "/crm/leads/follow-ups", label: "Follow-ups", icon: "calendar" },
    { href: "/crm/transfers", label: "Transfers", icon: "arrow-right-left" },
  ];
  if (isSuperAdmin) {
    crmNav.push({ href: "/crm/inbox", label: "Raw Inbox", icon: "inbox" });
  }

  const adminNav: NavItem[] = [];
  if (isSuperAdmin) {
    adminNav.push(
      { href: "/admin/crm", label: "Admin CRM", icon: "settings" },
      { href: "/admin/financials", label: "Financials", icon: "credit-card" },
      { href: "/admin/holidays", label: "Paid Holidays", icon: "calendar-off" },
      { href: "/admin/payroll", label: "Payroll Preview", icon: "credit-card" },
      { href: "/admin/tasks/maintenance", label: "Task Maintenance", icon: "database" }
    );
  } else if (canManage) {
    adminNav.push(
      { href: "/admin/leave", label: "Leave Admin", icon: "plane" },
      { href: "/admin/tasks", label: "Task Admin", icon: "check-square" }
    );
  }

  const navGroups: NavGroup[] = [
    { title: "Core", items: coreNav },
    { title: "HRM", items: hrmNav },
    { title: "CRM", items: crmNav },
  ];
  if (adminNav.length > 0) {
    navGroups.push({ title: "Admin", items: adminNav });
  }

  const userLabel =
    me?.appUser.display_name ?? (supabaseConfigured ? "Signed in" : "Mock User");
  const role = me?.appUser.role ?? "";

  return (
    <AppShell
      groups={navGroups}
      userLabel={userLabel}
      role={role}
      isMock={!supabaseConfigured}
    >
      {children}
    </AppShell>
  );
}
