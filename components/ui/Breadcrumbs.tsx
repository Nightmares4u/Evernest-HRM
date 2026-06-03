import Link from "next/link";
import { Fragment } from "react";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-sm" aria-label="Breadcrumb">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <Fragment key={i}>
            {item.href && !last ? (
              <Link
                href={item.href}
                className="font-medium text-blue-700 transition-colors hover:text-blue-900"
              >
                {item.label}
              </Link>
            ) : (
              <span className={last ? "text-gray-500" : "text-gray-700"}>{item.label}</span>
            )}
            {!last && <span className="text-gray-300">/</span>}
          </Fragment>
        );
      })}
    </nav>
  );
}
