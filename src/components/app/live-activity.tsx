"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardHeader, CardBody, EmptyState } from "@/components/ui/primitives";
import { ActivityList, type ActivityItem } from "@/components/app/activity-list";
import { cn } from "@/lib/utils";

export function LiveActivity({ initial }: { initial: ActivityItem[] }) {
  const [events, setEvents] = useState<ActivityItem[]>(initial);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState<"all" | "AGENT" | "SYSTEM" | "USER" | "WEBHOOK">("all");
  const last = useRef<string | null>(initial[initial.length - 1]?.id ?? null);

  useEffect(() => {
    const source = new EventSource(`/api/activity?stream=1${last.current ? `&since=${last.current}` : ""}`);
    source.addEventListener("ready", () => setConnected(true));
    source.addEventListener("activity", (e) => {
      const event = JSON.parse((e as MessageEvent).data) as ActivityItem;
      last.current = event.id;
      setEvents((prev) => (prev.some((x) => x.id === event.id) ? prev : [...prev, event].slice(-500)));
    });
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, []);

  const visible = [...events].reverse().filter((e) => filter === "all" || e.actorType === filter);
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            Workspace timeline
            <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-normal", connected ? "text-teal" : "text-faint")}>
              <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-teal" : "bg-faint")} aria-hidden /> {connected ? "live" : "reconnecting"}
            </span>
          </span>
        }
        description={`${events.length} events loaded`}
        action={
          <div className="flex gap-1" role="group" aria-label="Filter by actor">
            {(["all", "AGENT", "SYSTEM", "USER", "WEBHOOK"] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)} className={cn("rounded-md px-2 py-1 text-xs font-medium", filter === f ? "bg-navy-soft text-navy" : "text-muted hover:bg-surface-2")}>
                {f === "all" ? "All" : f.toLowerCase()}
              </button>
            ))}
          </div>
        }
      />
      <CardBody>{visible.length === 0 ? <EmptyState title="No activity yet" description="Create a contract to see agents, the policy engine, and PayPal at work." /> : <ActivityList events={visible} />}</CardBody>
    </Card>
  );
}
