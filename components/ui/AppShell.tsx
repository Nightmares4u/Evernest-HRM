"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X, ChevronDown, LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { Sidebar, SidebarNav, type NavGroup } from "@/components/ui/Sidebar";
import { Avatar } from "@/components/ui/Avatar";
import { AssistantFloatingButton } from "@/components/ui/AssistantFloatingButton";

export function AppShell({
  groups,
  userLabel,
  role,
  isMock,
  children,
}: {
  groups: NavGroup[];
  userLabel: string;
  role: string;
  isMock: boolean;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const roleLabel = role
    ? role
        .split("_")
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ")
    : "";

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar groups={groups} />

      {/* Mobile off-canvas drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-slate-900 text-white shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-slate-800 px-4">
              <span className="flex items-center gap-2">
                <span className="relative h-8 w-8 overflow-hidden rounded-md bg-white">
                  <Image
                    src="/brand/en-logo.jpeg"
                    alt="EN Consultants"
                    fill
                    className="object-contain"
                    sizes="32px"
                  />
                </span>
                <span className="text-sm font-bold">EN Consultants</span>
              </span>
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-3 overflow-y-auto px-2 py-4">
              <SidebarNav groups={groups} onNavigate={() => setMobileOpen(false)} />
            </nav>
          </aside>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
            <span className="relative h-7 w-7 overflow-hidden rounded-md ring-1 ring-gray-200">
              <Image
                src="/brand/en-logo.jpeg"
                alt="EN Consultants"
                fill
                className="object-contain"
                sizes="28px"
              />
            </span>
            <span className="text-sm font-semibold text-gray-900">EN Consultants</span>
          </Link>

          <div className="relative ml-auto flex items-center gap-3">
            {isMock && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                mock mode
              </span>
            )}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-gray-100"
            >
              <Avatar name={userLabel} />
              <span className="hidden text-sm font-medium text-gray-700 sm:block">{userLabel}</span>
              <ChevronDown className="hidden h-4 w-4 text-gray-400 sm:block" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-lg bg-white p-1 shadow-lg ring-1 ring-gray-200">
                  <div className="border-b border-gray-100 px-3 py-2">
                    <div className="text-sm font-medium text-gray-900">{userLabel}</div>
                    {roleLabel && <div className="text-xs text-gray-500">{roleLabel}</div>}
                  </div>
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    My profile
                  </Link>
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-4 pb-24 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>

      <AssistantFloatingButton />
    </div>
  );
}
