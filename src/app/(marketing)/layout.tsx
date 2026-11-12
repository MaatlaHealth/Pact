import Link from "next/link";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme";
import { MarketingNav } from "@/components/marketing/nav";
import { PHOTO_CREDITS } from "@/lib/marketing/photos";

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
            <Link href="/sign-up" className="hidden h-9 items-center whitespace-nowrap rounded-lg bg-[#0b2a5b] px-3.5 text-sm font-medium text-white shadow-sm hover:bg-[#133a78] sm:inline-flex dark:bg-[#2fd4c2] dark:text-[#0a1628]">
              Create account
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-x-clip">{children}</main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div className="max-w-sm">
              <Logo height={28} />
              <p className="mt-3 text-sm text-muted">Autonomous work. Verified outcomes. Accountable payments.</p>
              <p className="mt-2 text-xs leading-relaxed text-faint">PACT is a payment coordination layer. It is not an escrow service and does not hold funds. PayPal sandbox is the default environment.</p>
            </div>
            <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm sm:grid-cols-3">
              {footerLinks.map((l) => (
                <Link key={l.href} href={l.href} className="text-ink-2 hover:text-navy">
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="mt-10 flex flex-col gap-2 border-t border-border pt-5 text-[11px] text-faint sm:flex-row sm:items-center sm:justify-between">
            <p>MIT licensed. Built for the PayPal AI Hackathon, November 2026.</p>
            <p>
              Photography on Unsplash by{" "}
              {PHOTO_CREDITS.map((p, i) => (
                <span key={p.creditUrl}>
                  <a href={p.creditUrl} className="hover:text-ink" rel="noreferrer" target="_blank">
                    {p.credit}
                  </a>
                  {i < PHOTO_CREDITS.length - 1 ? ", " : ""}
                </span>
              ))}
              .
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
