"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, FileText, Bot, Radio, FileCheck2, Wallet, ScrollText, CheckSquare, History, Settings, LogOut, ChevronsUpDown, Menu, X, FlaskConical } from "lucide-react";
import { Logo, LogoMark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client/api";
import type { SessionOrganization, SessionUser } from "@/lib/auth/session";

const nav = [
  { href: "/app", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/app/contracts", label: "Contracts", icon: FileText },
  { href: "/app/agents", label: "Agents", icon: Bot },
  { href: "/app/activity", label: "Live activity", icon: Radio },
  { href: "/app/verifications", label: "Verifications", icon: FileCheck2 },
  { href: "/app/payments", label: "Payments", icon: Wallet },
  { href: "/app/receipts", label: "Receipts", icon: ScrollText },
  { href: "/app/approvals", label: "Approvals", icon: CheckSquare },
  { href: "/app/audit", label: "Audit history", icon: History },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

interface ShellProps {
  user: SessionUser;
  organization: SessionOrganization | null;
  memberships: SessionOrganization[];
  pendingApprovals: number;
  paypalEnvironment: string;
  deploymentLabel: string | null;
  children: React.ReactNode;
}

export function AppShell({ user, organization, memberships, pendingApprovals, paypalEnvironment, deploymentLabel, children }: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const signOut = async () => {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/sign-in");
    router.refresh();
  };
  const switchOrg = async (id: string) => {
    setSwitching(true);
    await api("/api/organizations/switch", { method: "POST", body: { organizationId: id } });
    router.refresh();
    setSwitching(false);
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-4">
        <Logo height={30} href="/app" />
        <button type="button" className="lg:hidden" aria-label="Close navigation" onClick={() => setOpen(false)}>
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      {organization ? (
        <div className="px-3">
          <label className="sr-only" htmlFor="workspace-switch">
            Workspace
          </label>
          <div className="relative">
            <select id="workspace-switch" value={organization.id} disabled={switching || memberships.length < 2} onChange={(e) => switchOrg(e.target.value)} className="h-10 w-full appearance-none rounded-lg border border-border bg-surface pl-3 pr-8 text-sm font-medium text-ink">
              {memberships.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-faint" aria-hidden />
          </div>
          <p className="mt-1 px-1 text-[11px] text-faint">Your role: {organization.role.toLowerCase()}</p>
        </div>
      ) : null}
      <nav aria-label="Application" className="mt-4 flex-1 space-y-0.5 px-3">
        {nav.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition", active ? "bg-navy-soft text-navy" : "text-muted hover:bg-surface-2 hover:text-ink")}>
              <item.icon className="h-4 w-4" aria-hidden />
              <span className="flex-1">{item.label}</span>
              {item.href === "/app/approvals" && pendingApprovals > 0 ? <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">{pendingApprovals}</span> : null}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-soft text-xs font-semibold text-navy" aria-hidden>
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{user.name}</p>
            <p className="truncate text-[11px] text-faint">{user.email}</p>
          </div>
          <button type="button" onClick={signOut} aria-label="Sign out" className="text-faint hover:text-ink">
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:block">{sidebar}</aside>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 bg-surface shadow-card">{sidebar}</aside>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur sm:px-6">
          <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border lg:hidden" aria-label="Open navigation" onClick={() => setOpen(true)}>
            <Menu className="h-4 w-4" aria-hidden />
          </button>
          <div className="lg:hidden">
            <LogoMark size={26} />
          </div>
          <div className="flex-1" />
          <span className={cn("hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium sm:inline-flex", paypalEnvironment === "live" ? "border-danger/40 bg-danger-soft text-danger" : "border-teal/30 bg-teal-soft text-teal")}>
            PayPal {paypalEnvironment}
          </span>
          {organization?.kind === "JUDGE_DEMO" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning-soft px-2.5 py-1 text-[11px] font-medium text-warning">
              <FlaskConical className="h-3.5 w-3.5" aria-hidden />
              Judge demo workspace
            </span>
          ) : null}
          {deploymentLabel ? <span className="hidden rounded-full border border-border px-2.5 py-1 text-[11px] text-muted md:inline-flex">{deploymentLabel}</span> : null}
          <ThemeToggle />
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
