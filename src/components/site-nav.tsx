"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { JSX } from "react";

const links = [
  { href: "/", label: "클래스", match: (path: string) => path === "/" || path.startsWith("/classes/") },
  { href: "/bookings/lookup", label: "예약 조회", match: (path: string) => path.startsWith("/bookings/lookup") },
];

export function SiteNav(): JSX.Element {
  const pathname = usePathname();

  return (
    <nav aria-label="고객 메뉴" className="flex shrink-0 items-center gap-1">
      {links.map(({ href, label, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex h-11 items-center gap-1.5 rounded-[var(--radius-pill)] px-3.5 text-[15px] whitespace-nowrap text-[var(--text-strong)] transition-colors duration-120 hover:bg-[var(--surface-raised)] max-[641px]:px-3 max-[641px]:text-sm ${active ? "bg-[var(--surface-raised)] font-semibold" : "font-medium"}`}
          >
            {href === "/bookings/lookup" && <Search aria-hidden="true" className="size-[18px] max-[641px]:hidden" />}
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
