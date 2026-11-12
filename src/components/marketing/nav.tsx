"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/platform", label: "Platform" },
  { href: "/trust", label: "Trust" },
  { href: "/developers", label: "Developers" },
  { href: "/judge", label: "For judges" },
];

export function MarketingNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={cn("rounded-lg px-3 py-2 text-sm font-medium transition", pathname === l.href ? "bg-surface-2 text-ink" : "text-muted hover:text-ink")}>
            {l.label}
          </Link>
        ))}
      </nav>
      <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border md:hidden" aria-expanded={open} aria-controls="mobile-nav" aria-label="Toggle navigation" onClick={() => setOpen((v) => !v)}>
        {open ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
      </button>
      {open ? (
        <div id="mobile-nav" className="absolute inset-x-0 top-16 border-b border-border bg-surface p-3 shadow-card md:hidden">
          <nav aria-label="Mobile" className="flex flex-col">
            {[...links, { href: "/sign-in", label: "Sign in" }, { href: "/sign-up", label: "Create account" }].map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-surface-2">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </>
  );
}
