import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { requireAppContext } from "@/lib/auth/app-context";
import { db } from "@/lib/db";
import { env, integrationStatuses } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { PAYMENT_STATE_LABELS } from "@/lib/policy/state-machine";
import { PageHeader, Card, CardHeader, EmptyState, StatusBadge, Mono, Callout, Badge } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const ctx = await requireAppContext();
  const [orders, webhooks] = await Promise.all([
    db.payPalOrder.findMany({ where: { organizationId: ctx.organization.id }, orderBy: { createdAt: "desc" }, take: 100, include: { contract: { select: { id: true, title: true, paymentState: true } }, authorizations: { orderBy: { createdAt: "desc" }, take: 1, include: { captures: { take: 1 } } } } }),
    db.webhookEvent.findMany({ orderBy: { receivedAt: "desc" }, take: 20 }),
  ]);
  const statuses = integrationStatuses();
  const paypal = statuses.find((s) => s.name === "paypal")!;
  const hooks = statuses.find((s) => s.name === "webhooks")!;
  return (
    <>
      <PageHeader title="Payments" description={`PayPal ${env().PAYPAL_ENVIRONMENT} orders, authorizations, and captures for this workspace. States are read from PayPal responses and webhooks, never from the client.`} actions={<Badge tone={env().PAYPAL_ENVIRONMENT === "live" ? "danger" : "teal"}>PayPal {env().PAYPAL_ENVIRONMENT}</Badge>} />
      {!paypal.configured ? <Callout tone="warning" title="PayPal is not configured" className="mb-4">{paypal.detail} {paypal.instructions}</Callout> : null}
      {paypal.configured && !hooks.configured ? <Callout tone="warning" title="Webhooks are not configured" className="mb-4">{hooks.detail} {hooks.instructions} Reconciliation still works by polling PayPal, but asynchronous captures will be slower to confirm.</Callout> : null}
      {orders.length === 0 ? (
        <EmptyState icon={<Wallet className="h-5 w-5" />} title="No PayPal orders yet" description="An order is created when you authorize a negotiated contract. Nothing appears here until then." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-faint">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Contract</th>
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Authorization</th>
                  <th className="px-4 py-2.5 font-medium">Capture</th>
                  <th className="px-4 py-2.5 font-medium">Payment state</th>
                  <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const auth = o.authorizations[0];
                  const capture = auth?.captures[0];
                  return (
                    <tr key={o.id} className="border-t border-border">
                      <td className="max-w-[240px] px-4 py-3">
                        <Link href={`/app/contracts/${o.contract.id}`} className="block truncate font-medium text-ink hover:text-navy">
                          {o.contract.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Mono>{o.paypalOrderId}</Mono>
                        <p className="text-[11px] text-faint">{o.status}</p>
                      </td>
                      <td className="px-4 py-3">{auth ? <><Mono>{auth.paypalAuthorizationId}</Mono><p className="text-[11px] text-faint">{auth.status}</p></> : <span className="text-faint">none</span>}</td>
                      <td className="px-4 py-3">{capture ? <><Mono>{capture.paypalCaptureId}</Mono><p className="text-[11px] text-faint">{capture.status}</p></> : <span className="text-faint">none</span>}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={o.contract.paymentState} label={PAYMENT_STATE_LABELS[o.contract.paymentState]} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatMoney(o.amountCents, o.currency)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDate(o.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Card className="mt-6">
        <CardHeader title="Recent webhook events" description="Every event PayPal sent, with its signature verification result. Rejected events are kept for audit and never acted on." />
        {webhooks.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No webhook events received" description={hooks.configured ? "PayPal will post events here as orders are approved, authorized, and captured." : "Configure PAYPAL_WEBHOOK_ID and register the endpoint to receive events."} />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {webhooks.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm">
                <Mono>{w.eventType}</Mono>
                <StatusBadge status={w.processingStatus} />
                <Badge tone={w.signatureVerified ? "success" : "danger"}>{w.signatureVerified ? "signature verified" : "unverified"}</Badge>
                <span className="text-xs text-muted">{w.resourceType} {w.resourceId}</span>
                <span className="ml-auto text-xs text-faint">{formatDate(w.receivedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
