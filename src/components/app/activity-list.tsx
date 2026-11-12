import Link from "next/link";
import { Bot, User, Cog, Webhook } from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";

export interface ActivityItem {
  id: string;
  createdAt: string;
  actorType: string;
  actorLabel: string | null;
  action: string;
  title: string;
  description: string | null;
  severity: string;
  contractId: string | null;
}

const icons: Record<string, React.ComponentType<{ className?: string }>> = { AGENT: Bot, USER: User, SYSTEM: Cog, WEBHOOK: Webhook };

export function ActivityList({ events, linkContracts = true, dense }: { events: ActivityItem[]; linkContracts?: boolean; dense?: boolean }) {
  return (
    <ol className={cn("space-y-3", dense && "space-y-2")}>
      {events.map((e) => {
        const Icon = icons[e.actorType] ?? Cog;
        return (
          <li key={e.id} className="flex gap-3">
            <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", e.severity === "CRITICAL" || e.severity === "WARNING" ? "bg-warning-soft text-warning" : e.actorType === "AGENT" ? "bg-teal-soft text-teal" : "bg-navy-soft text-navy")}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm text-ink", dense && "text-[13px]")}>{e.title}</p>
              {e.description && !dense ? <p className="mt-0.5 text-xs leading-relaxed text-muted">{e.description}</p> : null}
              <p className="mt-0.5 text-[11px] text-faint">
                {e.actorLabel ?? e.actorType.toLowerCase()} · {relativeTime(e.createdAt)}
                {linkContracts && e.contractId ? (
                  <>
                    {" · "}
                    <Link href={`/app/contracts/${e.contractId}`} className="text-navy hover:underline">
                      contract
                    </Link>
                  </>
                ) : null}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
