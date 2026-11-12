import Link from "next/link";
import { ArrowRight, Bot, FileCheck2, ShieldCheck, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

export function Section({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24", className)}>
      {children}
    </section>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-teal", className)}>{children}</p>;
}

export function H2({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em] text-ink sm:text-[2.25rem]", className)}>{children}</h2>;
}

export function Lead({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mt-4 max-w-2xl text-[17px] leading-relaxed text-muted", className)}>{children}</p>;
}

export function CtaLink({ href, children, variant = "primary", className }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" | "inverse"; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-medium transition",
        variant === "primary" && "bg-[#0b2a5b] text-white shadow-sm hover:bg-[#133a78] dark:bg-[#2fd4c2] dark:text-[#0a1628] dark:hover:bg-[#4de3d3]",
        variant === "secondary" && "border border-border bg-surface text-ink hover:border-border-strong",
        variant === "inverse" && "bg-white text-[#0b2a5b] hover:bg-[#e4ecf8]",
        className,
      )}
    >
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

/** The protocol pipeline, drawn with real role names and the actual gate between verification and settlement. */
export function PipelineDiagram({ compact }: { compact?: boolean }) {
  const steps = [
    { icon: Bot, name: "Buyer Agent", detail: "Discovers a worker and negotiates a fixed price within the approved budget." },
    { icon: Bot, name: "Worker Agent", detail: "Generates the deliverable with tools and submits hashed files." },
    { icon: FileCheck2, name: "Verifier Agent", detail: "Runs HTTP, browser, Lighthouse, and schema checks. Stores evidence." },
    { icon: ShieldCheck, name: "Policy engine", detail: "Deterministic rules decide ALLOW, DENY, or human approval." },
    { icon: Wallet, name: "PayPal", detail: "Authorization held up front; capture only after an ALLOW." },
  ];
  return (
    <ol className={cn("grid gap-3", compact ? "sm:grid-cols-5" : "md:grid-cols-5")} aria-label="PACT pipeline">
      {steps.map((s, i) => (
        <li key={s.name} className={cn("relative rounded-xl border border-border bg-surface p-4 shadow-card", i === 3 && "border-teal/50 ring-1 ring-teal/30")}>
          <div className="flex items-center gap-2">
            <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", i === 3 ? "bg-teal-soft text-teal" : "bg-navy-soft text-navy")}>
              <s.icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="font-mono text-[11px] text-faint">0{i + 1}</span>
          </div>
          <p className="mt-3 text-sm font-semibold text-ink">{s.name}</p>
          {!compact ? <p className="mt-1 text-xs leading-relaxed text-muted">{s.detail}</p> : null}
          {i < steps.length - 1 ? <ArrowRight className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-faint md:block" aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}
