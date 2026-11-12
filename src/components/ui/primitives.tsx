import { forwardRef } from "react";
import Link from "next/link";
import { cn, humanize } from "@/lib/utils";

export function Card({ className, children, as: Tag = "div" }: { className?: string; children: React.ReactNode; as?: "div" | "section" | "article" }) {
  return <Tag className={cn("rounded-xl border border-border bg-surface shadow-card", className)}>{children}</Tag>;
}

export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink placeholder:text-faint transition focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30 disabled:opacity-60", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn("w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint transition focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30 disabled:opacity-60", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn("h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink transition focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30", className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({ className, children, htmlFor, hint }: { className?: string; children: React.ReactNode; htmlFor?: string; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1.5 block text-xs font-medium text-ink-2", className)}>
      {children}
      {hint ? <span className="ml-1 font-normal text-faint">{hint}</span> : null}
    </label>
  );
}

export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor} hint={hint}>
        {label}
      </Label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type Tone = "neutral" | "navy" | "teal" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-border",
  navy: "bg-navy-soft text-navy border-navy/20",
  teal: "bg-teal-soft text-teal border-teal/30",
  success: "bg-success-soft text-success border-success/30",
  warning: "bg-warning-soft text-warning border-warning/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  info: "bg-info-soft text-info border-info/30",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5", toneClasses[tone], className)}>
      {dot ? <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-current pulse-dot" aria-hidden /> : null}
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  if (/CAPTURED|PASSED|APPROVED|SUCCEEDED|COMPLETED|AUTHORIZED|ACTIVE|TRUSTED/.test(status)) return "success";
  if (/FAILED|VOIDED|EXPIRED|DENIED|REJECTED|DISPUTED|CANCELLED|DEAD|ERROR|SUSPENDED/.test(status)) return "danger";
  if (/CORRECTION|HUMAN|PENDING|UNCERTAIN|AWAITING|QUEUED/.test(status)) return "warning";
  if (/NEGOTIAT|PROGRESS|VERIFICATION|RUNNING|ELIGIBLE|ESTABLISHED/.test(status)) return "info";
  if (/DRAFT|NEW|NONE|NOT_STARTED/.test(status)) return "neutral";
  return "navy";
}

export function StatusBadge({ status, label, live }: { status: string; label?: string; live?: boolean }) {
  return (
    <Badge tone={statusTone(status)} dot={live}>
      {label ?? humanize(status)}
    </Badge>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong px-6 py-14 text-center">
      {icon ? <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-navy-soft text-navy">{icon}</div> : null}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-teal">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: Tone }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tracking-tight tabular-nums", tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-ink")}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-faint">{hint}</p> : null}
    </Card>
  );
}

export function KeyValue({ items, className }: { items: { label: string; value: React.ReactNode; mono?: boolean }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2", className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-faint">{item.label}</dt>
          <dd className={cn("mt-0.5 break-all text-sm text-ink", item.mono && "font-mono text-xs")}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <code className={cn("rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2 break-all", className)}>{children}</code>;
}

export function TextLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("font-medium text-navy underline-offset-4 hover:underline", className)}>
      {children}
    </Link>
  );
}

export function Callout({ tone = "info", title, children, className }: { tone?: Tone; title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm", toneClasses[tone], className)} role={tone === "danger" ? "alert" : undefined}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={cn(title && "mt-1", "text-[13px] leading-relaxed opacity-90")}>{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} aria-hidden />;
}
