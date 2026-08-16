"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/outreach", label: "Home", match: (p: string) => p === "/outreach" },
  { href: "/outreach/leads", label: "Leads", match: (p: string) => p.startsWith("/outreach/leads") },
  { href: "/outreach/opportunities", label: "Opportunities", match: (p: string) => p.startsWith("/outreach/opportunities") },
  { href: "/outreach/quotes", label: "Quotes", match: (p: string) => p.startsWith("/outreach/quotes") },
  { href: "/outreach/accounts", label: "Accounts", match: (p: string) => p.startsWith("/outreach/accounts") },
];

export function OutreachNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Outreach" className="flex flex-wrap items-end gap-0 bg-brand-teal-deep px-3">
      <span className="mr-3 hidden py-2 text-sm font-semibold text-white sm:inline">Outreach</span>
      {ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-[3px] px-3 py-2.5 text-sm text-white/85 hover:bg-white/10",
              active ? "border-brand-orange font-semibold text-white" : "border-transparent",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
