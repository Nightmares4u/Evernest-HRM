"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";

export type TabItem = {
  href: string;
  label: string;
  badge?: number | null;
  badgeTone?: "red" | "yellow" | "amber" | "gray" | "green" | "blue" | "teal" | "blue";
};

export function LifecycleTabs({ tabs }: { tabs: TabItem[] }) {
  const pathname = usePathname();

  return (
    <div className="border-b border-gray-200 mb-6">
      <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`
                whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors
                ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }
                flex items-center gap-2
              `}
            >
              {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <StatusBadge label={String(tab.badge)} tone={tab.badgeTone || "gray"} />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
