import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { integrationStatuses } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let database: "ok" | "error" = "ok";
  let queue = { queued: 0, running: 0, dead: 0 };
  try {
    await db.$queryRaw`SELECT 1`;
    const [queued, running, dead] = await Promise.all([db.job.count({ where: { status: "QUEUED" } }), db.job.count({ where: { status: "RUNNING" } }), db.job.count({ where: { status: "DEAD" } })]);
    queue = { queued, running, dead };
  } catch {
    database = "error";
  }
  const lastJob = database === "ok" ? await db.job.findFirst({ where: { status: "SUCCEEDED" }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true } }).catch(() => null) : null;
  const body = {
    status: database === "ok" ? "ok" : "degraded",
    database,
    queue,
    workerLastSeen: lastJob?.finishedAt ?? null,
    integrations: Object.fromEntries(integrationStatuses().map((s) => [s.name, s.configured])),
    latencyMs: Date.now() - started,
    time: new Date().toISOString(),
  };
  return NextResponse.json(body, { status: database === "ok" ? 200 : 503 });
}
