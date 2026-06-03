"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  User,
  Calendar,
  Clock,
  CheckSquare,
  History,
  Plane,
  Users,
  Settings,
  Inbox,
  UsersRound,
  Briefcase,
  ArrowRightLeft,
  Database,
  CreditCard,
  CalendarOff,
} from "lucide-react";

export type IconKey =
  | "dashboard"
  | "user"
  | "calendar"
  | "clock"
  | "check-square"
  | "history"
  | "plane"
  | "users"
  | "users-round"
  | "briefcase"
  | "arrow-right-left"
  | "inbox"
  | "settings"
  | "credit-card"
  | "calendar-off"
  | "database";

const ICONS: Record<IconKey, any> = {
  dashboard: LayoutDashboard,
  user: User,
  calendar: Calendar,
  clock: Clock,
  "check-square": CheckSquare,
  history: History,
  plane: Plane,
  users: Users,
  "users-round": UsersRound,
  briefcase: Briefcase,
  "arrow-right-left": ArrowRightLeft,
  inbox: Inbox,
  settings: Settings,
  "credit-card": CreditCard,
  "calendar-off": CalendarOff,
  database: Database,
};

export type NavItem = {
  href: string;
  label: string;
  icon?: IconKey;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

function resolveActiveHref(groups: NavGroup[], pathname: string): string | null {
  let best: string | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      const matches =
        pathname === item.href || pathname.startsWith(item.href + "/");
      if (matches && (best === null || item.href.length > best.length)) {
        best = item.href;
      }
    }
  }
  return best;
}

function NavSection({
  group,
  collapsed,
  activeHref,
  onNavigate,
}: {
  group: NavGroup;
  collapsed: boolean;
  activeHref: string | null;
  onNavigate?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  if (group.items.length === 0) return null;

  const items = (
    <div className="mt-1 flex flex-col space-y-1">
      {group.items.map((item) => {
        const isActive = item.href === activeHref;
        const Icon = item.icon ? ICONS[item.icon] : null;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              collapsed ? "justify-center" : ""
            } ${
              isActive
                ? "bg-blue-700 text-white shadow-sm"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            {Icon && (
              <Icon
                className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : "text-slate-400"}`}
              />
            )}
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </div>
  );

  if (collapsed) {
    return <div className="border-t border-slate-800/70 pt-2">{items}</div>;
  }

  return (
    <div className="pt-1">
      {group.title && (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-center justify-between px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-200"
        >
          {group.title}
          {isOpen ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
      )}
      {isOpen && items}
    </div>
  );
}

export function SidebarNav({
  groups,
  collapsed = false,
  onNavigate,
}: {
  groups: NavGroup[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const activeHref = resolveActiveHref(groups, pathname);
  return (
    <>
      {groups.map((group, i) => (
        <NavSection
          key={i}
          group={group}
          collapsed={collapsed}
          activeHref={activeHref}
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
}

export function Sidebar({ groups }: { groups: NavGroup[] }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`hidden h-full flex-shrink-0 flex-col border-r border-slate-800 bg-slate-900 text-white transition-[width] duration-200 lg:flex ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div
        className={`flex h-16 items-center border-b border-slate-800 ${
          collapsed ? "justify-center px-2" : "px-5"
        }`}
      >
        <Link
          href="/dashboard"
          className="flex items-center gap-3 transition-opacity hover:opacity-90"
          title="EN Consultants"
        >
          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md bg-white">
            <Image
              src="/brand/en-logo.jpeg"
              alt="EN Consultants"
              fill
              className="object-contain"
              sizes="32px"
            />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <h1 className="text-sm font-bold leading-none tracking-tight text-white">
                EN Consultants
              </h1>
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                Operations
              </span>
            </div>
          )}
        </Link>
      </div>

      <nav className="flex-1 space-y-3 overflow-y-auto px-2 py-4">
        <SidebarNav groups={groups} collapsed={collapsed} />
      </nav>

      <div className="border-t border-slate-800 p-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-white ${
            collapsed ? "justify-center" : ""
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
