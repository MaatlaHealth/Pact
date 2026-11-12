import Link from "next/link";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme";
import { MarketingNav } from "@/components/marketing/nav";

const footerLinks = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/platform", label: "Platform" },
  { href: "/trust", label: "Trust and verification" },
  { href: "/developers", label: "Developers" },
  { href: "/receipts/verify", label: "Verify a receipt" },
  { href: "https://github.com/MaatlaHealth/Pact", label: "Source code" },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo priority />
          <MarketingNav />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/sign-in" className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-ink-2 hover:bg-surface-2 sm:inline-flex">
              Sign in
            </Link>
            <Link href="/sign-up" className="inline-flex h-9 items-center rounded-lg bg-[#0b2a5b] px-3.5 text-sm font-medium text-white shadow-sm hover:bg-[#133a78] dark:bg-[#2fd4c2] dark:text-[#0a1628]">
              Create account
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-x-clip">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo height={28} />
            <p className="mt-3 text-sm text-muted">Autonomous work. Verified outcomes. Accountable payments.</p>
            <p className="mt-2 text-xs text-faint">PACT is a payment coordination layer. It is not an escrow service and does not hold funds. PayPal sandbox is the default environment.</p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm sm:grid-cols-3">
            {footerLinks.map((l) => (
              <Link key={l.href} href={l.href} className="text-ink-2 hover:text-navy">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
