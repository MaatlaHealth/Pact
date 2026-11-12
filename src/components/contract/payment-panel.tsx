import { Card, CardHeader, CardBody, KeyValue, StatusBadge, EmptyState, Mono, Badge } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import { formatDate, humanize } from "@/lib/utils";
import { PAYMENT_STATE_LABELS } from "@/lib/policy/state-machine";
import type { ContractDetail } from "@/lib/contracts/loaders";

export function PaymentPanel({ contract }: { contract: ContractDetail }) {
  const order = contract.paypalOrder;
  if (!order) return <EmptyState title="No PayPal order yet" description="An order with intent AUTHORIZE is created when you authorize the payment after negotiation. Nothing is charged until verification passes." />;
  const auth = order.authorizations[0];
  const capture = auth?.captures[0];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader title="Order" action={<StatusBadge status={order.status} />} />
          <CardBody>
            <KeyValue className="sm:grid-cols-1" items={[{ label: "PayPal order ID", value: order.paypalOrderId, mono: true }, { label: "Intent", value: order.intent }, { label: "Amount", value: formatMoney(order.amountCents, order.currency) }, { label: "Environment", value: order.environment.toLowerCase() }, { label: "Payer", value: order.payerEmail ?? "not yet approved" }, { label: "Created", value: formatDate(order.createdAt) }]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Authorization" action={auth ? <StatusBadge status={auth.status} /> : <Badge>none</Badge>} />
          <CardBody>
            {auth ? <KeyValue className="sm:grid-cols-1" items={[{ label: "Authorization ID", value: auth.paypalAuthorizationId, mono: true }, { label: "Held amount", value: formatMoney(auth.amountCents, auth.currency) }, { label: "Expires", value: auth.expirationTime ? formatDate(auth.expirationTime) : "29 days from creation" }, { label: "Created", value: formatDate(auth.createdAt) }]} /> : <p className="text-sm text-muted">Funds are held only after the payer approves and PACT authorizes the order.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Capture" action={capture ? <StatusBadge status={capture.status} /> : <Badge>none</Badge>} />
          <CardBody>
            {capture ? <KeyValue className="sm:grid-cols-1" items={[{ label: "Capture ID", value: capture.paypalCaptureId, mono: true }, { label: "Amount", value: formatMoney(capture.amountCents, capture.currency) }, { label: "Final capture", value: capture.finalCapture ? "yes" : "no" }, { label: "Captured", value: formatDate(capture.createdAt) }]} /> : <p className="text-sm text-muted">Capture happens once, under an idempotency key, after the policy engine allows it.</p>}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Financial operations" description="One row per side effect. The unique key per contract and operation is what prevents a second capture." />
        <CardBody className="p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-faint">
              <tr>
                <th className="px-4 py-2 font-medium">Operation</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Idempotency key</th>
                <th className="px-4 py-2 font-medium">Attempts</th>
                <th className="px-4 py-2 font-medium">Finished</th>
              </tr>
            </thead>
            <tbody>
              {contract.financialOperations.map((op) => (
                <tr key={op.id} className="border-t border-border">
                  <td className="px-4 py-2 text-ink">{humanize(op.operation)}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={op.status} />
                  </td>
                  <td className="px-4 py-2">
                    <Mono>{op.idempotencyKey}</Mono>
                  </td>
                  <td className="px-4 py-2 text-muted">{op.attempts}</td>
                  <td className="px-4 py-2 text-muted">{op.finishedAt ? formatDate(op.finishedAt) : op.lastError ? <span className="text-danger">{op.lastError.slice(0, 80)}</span> : "pending"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Payment events" description="Append-only record of every payment state change and its source." />
        <CardBody>
          <ol className="space-y-2">
            {contract.paymentEvents.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-36 shrink-0 text-xs text-faint">{formatDate(e.createdAt)}</span>
                <Badge tone="neutral">{e.source.toLowerCase()}</Badge>
                <span className="text-ink">{humanize(e.kind.replace(".", " "))}</span>
                {e.fromState && e.toState && e.fromState !== e.toState ? (
                  <span className="text-xs text-muted">
                    {PAYMENT_STATE_LABELS[e.fromState]} to {PAYMENT_STATE_LABELS[e.toState]}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}
