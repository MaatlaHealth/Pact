import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { integrationStatuses } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Liveness and configuration report. Never throws: a misconfigured
 * deployment answers 503 with the reason so it can be fixed from the
 * hosting dashboard.
 */
export async function GET() {
  const started = Date.now();
  let configuration: { ok: true } | { ok: false; error: string };
  let integrations: Record<string, boolean> = {};
  try {
    integrations = Object.fromEntries(integrationStatuses().map((s) => [s.name, s.configured]));
    configuration = { ok: true };
  } catch (error) {
    configuration = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  let database: "ok" | "error" = "ok";
  let databaseError: string | undefined;
  let queue = { queued: 0, running: 0, dead: 0 };
  let workerLastSeen: Date | null = null;
  try {
    await db.$queryRaw`SELECT 1`;
    const [queued, running, dead, lastJob] = await Promise.all([
      db.job.count({ where: { status: "QUEUED" } }),
      db.job.count({ where: { status: "RUNNING" } }),
      db.job.count({ where: { status: "DEAD" } }),
      db.job.findFirst({ where: { status: "SUCCEEDED" }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true } }),
    ]);
    queue = { queued, running, dead };
    workerLastSeen = lastJob?.finishedAt ?? null;
  } catch (error) {
    database = "error";
    databaseError = error instanceof Error ? error.message.split("\n")[0].slice(0, 200) : String(error);
  }

  const healthy = configuration.ok && database === "ok";
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      configuration,
      database,
      databaseError,
      queue,
      workerLastSeen,
      integrations,
      latencyMs: Date.now() - started,
      time: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
