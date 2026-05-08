import Link from "next/link";
import { signOut } from "@/app/login/actions";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/attendance", label: "Attendance" },
  { href: "/tasks", label: "Tasks" },
  { href: "/leave", label: "Leave" },
  { href: "/employees", label: "Employees" },
  { href: "/admin", label: "Admin" },
] as const;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <aside className="flex w-64 flex-shrink-0 flex-col bg-white shadow-md">
        <div className="flex h-16 items-center justify-center border-b px-4">
          <h1 className="text-xl font-bold text-gray-800">EN HRM</h1>
        </div>
        <nav className="mt-6 flex flex-col space-y-1 px-4">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center rounded-md px-4 py-2 text-gray-700 hover:bg-gray-100"
            >
              {item.label}
            </Link>
          ))}
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
