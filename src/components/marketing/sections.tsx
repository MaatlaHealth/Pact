import Link from "next/link";
import { ArrowRight, Bot, FileCheck2, ShieldCheck, Wallet, ScrollText, Fingerprint } from "lucide-react";
import { cn } from "@/lib/utils";

export function Section({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20", className)}>
      {children}
    </section>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-teal">{children}</p>;
}

export function H2({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("text-2xl font-semibold tracking-tight text-ink sm:text-3xl", className)}>{children}</h2>;
}

export function Lead({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mt-3 max-w-2xl text-base leading-relaxed text-muted", className)}>{children}</p>;
}

export function CtaLink({ href, children, variant = "primary" }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  return (
    <Link href={href} className={cn("inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-medium transition", variant === "primary" ? "bg-[#0b2a5b] text-white shadow-sm hover:bg-[#133a78] dark:bg-[#2fd4c2] dark:text-[#0a1628]" : "border border-border bg-surface text-ink hover:border-border-strong")}>
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

/** The protocol pipeline, drawn with real role names and the actual gate between verification and settlement. */
export function PipelineDiagram({ compact }: { compact?: boolean }) {
  const steps = [
    { icon: Bot, name: "Buyer Agent", detail: "Discovers a worker, negotiates a fixed price within the approved budget." },
    { icon: Bot, name: "Worker Agent", detail: "Generates the deliverable with tools and submits hashed files." },
    { icon: FileCheck2, name: "Verifier Agent", detail: "Runs HTTP, browser, Lighthouse, and schema checks. Stores evidence." },
    { icon: ShieldCheck, name: "Policy engine", detail: "Deterministic rules decide ALLOW, DENY, or human approval." },
    { icon: Wallet, name: "PayPal", detail: "Authorization held up front; capture only after an ALLOW." },
  ];
  return (
    <ol className={cn("grid gap-3", compact ? "sm:grid-cols-5" : "md:grid-cols-5")} aria-label="PACT pipeline">
      {steps.map((s, i) => (
        <li key={s.name} className="relative rounded-xl border border-border bg-surface p-4 shadow-card">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-soft text-navy">
              <s.icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-faint">{i + 1}</span>
          </div>
          <p className="mt-3 text-sm font-semibold text-ink">{s.name}</p>
          {!compact ? <p className="mt-1 text-xs leading-relaxed text-muted">{s.detail}</p> : null}
          {i < steps.length - 1 ? <ArrowRight className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-faint md:block" aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}

export function FeatureGrid({ items }: { items: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((f) => (
        <div key={f.title} className="rounded-xl border border-border bg-surface p-5 shadow-card">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-soft text-teal">
            <f.icon className="h-4 w-4" />
          </span>
          <h3 className="mt-4 text-sm font-semibold text-ink">{f.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
        </div>
      ))}
    </div>
  );
}

export const RECEIPT_ICON = ScrollText;
export const PASSPORT_ICON = Fingerprint;
