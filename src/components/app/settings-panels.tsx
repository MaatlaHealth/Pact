"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertCircle, Copy } from "lucide-react";
import type { MembershipRole } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody, Field, Input, Select, Callout, Badge, StatusBadge, Mono } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import { formatMoney } from "@/lib/money";
import { formatDate, cn } from "@/lib/utils";
import type { IntegrationStatus } from "@/lib/env";
import type { SessionOrganization } from "@/lib/auth/session";
import { CreateWorkspaceForm } from "@/components/app/create-workspace";

interface Policy {
  currency: string;
  maxTransactionAmountCents: number;
  monthlyBudgetCents: number;
  perAgentLimitCents: number;
  coldStartAgentLimitCents: number;
  requireHumanApprovalForCapture: boolean;
  humanApprovalAboveCents: number | null;
  subjectiveCriteriaRequireHuman: boolean;
  maxNegotiationRounds: number;
  maxCorrectionAttempts: number;
  allowedCategories: string[];
  captureRateLimitPerHour: number;
  updatedAt: string;
}

interface Props {
  role: MembershipRole;
  currentUserId: string;
  policy: Policy;
  members: { userId: string; name: string; email: string; role: MembershipRole; verified: boolean }[];
  invitations: { id: string; email: string; role: string; expiresAt: string }[];
  apiKeys: { id: string; name: string; prefix: string; scopes: string[]; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }[];
  integrations: IntegrationStatus[];
  webhookUrl: string;
  memberships: SessionOrganization[];
}

type Tab = "policy" | "members" | "keys" | "integrations" | "workspaces";

export function SettingsPanels(props: Props) {
  const [tab, setTab] = useState<Tab>("policy");
  const tabs: { id: Tab; label: string }[] = [
    { id: "policy", label: "Spending policy" },
    { id: "members", label: "Members" },
    { id: "keys", label: "API keys" },
    { id: "integrations", label: "Integrations" },
    { id: "workspaces", label: "Workspaces" },
  ];
  return (
    <div>
      <div className="mb-5 border-b border-border">
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Settings sections">
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined} className={cn("whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium", tab === t.id ? "border-navy text-navy" : "border-transparent text-muted hover:text-ink")}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      {tab === "policy" ? <PolicyForm policy={props.policy} canEdit={props.role === "ADMIN" || props.role === "OWNER"} /> : null}
      {tab === "members" ? <MembersPanel {...props} /> : null}
      {tab === "keys" ? <ApiKeysPanel keys={props.apiKeys} canEdit={props.role === "ADMIN" || props.role === "OWNER"} /> : null}
      {tab === "integrations" ? <IntegrationsPanel integrations={props.integrations} webhookUrl={props.webhookUrl} /> : null}
      {tab === "workspaces" ? <WorkspacesPanel memberships={props.memberships} /> : null}
    </div>
  );
}

function PolicyForm({ policy, canEdit }: { policy: Policy; canEdit: boolean }) {
  const router = useRouter();
  const { push } = useToast();
  const [form, setForm] = useState({ ...policy });
  const [saving, setSaving] = useState(false);
  const money = (key: keyof Policy) => ({
    value: ((form[key] as number | null) ?? 0) / 100,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: Math.round(Number(e.target.value) * 100) })),
  });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { updatedAt, currency, ...rest } = form;
      void updatedAt;
      await api("/api/organizations/current/policy", { method: "PATCH", body: { ...rest, currency, humanApprovalAboveCents: form.humanApprovalAboveCents || null } });
      push({ kind: "success", title: "Spending policy saved" });
      router.refresh();
    } catch (err) {
      push({ kind: "error", title: err instanceof ApiError ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={save}>
      <Card>
        <CardHeader title="Spending policy" description={`Enforced by the policy engine on every lifecycle action. Last updated ${formatDate(policy.updatedAt)}.`} />
        <CardBody className="grid gap-5 md:grid-cols-2">
          <Field label="Currency" htmlFor="currency" hint="all contracts in this workspace">
            <Select id="currency" value={form.currency} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
              {["USD", "EUR", "GBP", "AUD", "CAD"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Maximum transaction amount" htmlFor="maxTx" hint={formatMoney(form.maxTransactionAmountCents, form.currency)}>
            <Input id="maxTx" type="number" min={1} step="0.01" disabled={!canEdit} {...money("maxTransactionAmountCents")} />
          </Field>
          <Field label="Monthly budget" htmlFor="monthly" hint="captured plus outstanding authorizations">
            <Input id="monthly" type="number" min={1} step="0.01" disabled={!canEdit} {...money("monthlyBudgetCents")} />
          </Field>
          <Field label="Per-agent monthly limit" htmlFor="perAgent">
            <Input id="perAgent" type="number" min={1} step="0.01" disabled={!canEdit} {...money("perAgentLimitCents")} />
          </Field>
          <Field label="Cold-start limit for new workers" htmlFor="coldStart" hint="above this, NEW-tier workers need human approval">
            <Input id="coldStart" type="number" min={0} step="0.01" disabled={!canEdit} {...money("coldStartAgentLimitCents")} />
          </Field>
          <Field label="Human approval above" htmlFor="humanAbove" hint="blank to disable">
            <Input id="humanAbove" type="number" min={0} step="0.01" disabled={!canEdit} value={form.humanApprovalAboveCents === null ? "" : form.humanApprovalAboveCents / 100} onChange={(e) => setForm((f) => ({ ...f, humanApprovalAboveCents: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100) }))} />
          </Field>
          <Field label="Negotiation rounds" htmlFor="rounds">
            <Input id="rounds" type="number" min={1} max={10} disabled={!canEdit} value={form.maxNegotiationRounds} onChange={(e) => setForm((f) => ({ ...f, maxNegotiationRounds: Number(e.target.value) }))} />
          </Field>
          <Field label="Correction attempts" htmlFor="corrections">
            <Input id="corrections" type="number" min={0} max={10} disabled={!canEdit} value={form.maxCorrectionAttempts} onChange={(e) => setForm((f) => ({ ...f, maxCorrectionAttempts: Number(e.target.value) }))} />
          </Field>
          <Field label="Captures per hour" htmlFor="rate">
            <Input id="rate" type="number" min={1} max={1000} disabled={!canEdit} value={form.captureRateLimitPerHour} onChange={(e) => setForm((f) => ({ ...f, captureRateLimitPerHour: Number(e.target.value) }))} />
          </Field>
          <div className="space-y-3 md:col-span-2">
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" className="mt-1" disabled={!canEdit} checked={form.requireHumanApprovalForCapture} onChange={(e) => setForm((f) => ({ ...f, requireHumanApprovalForCapture: e.target.checked }))} />
              <span>
                <strong>Require human approval for every capture.</strong> Verification can pass, but money only moves after an admin approves.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" className="mt-1" disabled={!canEdit} checked={form.subjectiveCriteriaRequireHuman} onChange={(e) => setForm((f) => ({ ...f, subjectiveCriteriaRequireHuman: e.target.checked }))} />
              <span>
                <strong>Subjective criteria require human review.</strong> When off, the verifier&apos;s rubric score is accepted for subjective criteria. Objective criteria are never affected.
              </span>
            </label>
            <div className="flex flex-wrap gap-4 text-sm text-ink">
              <span className="font-medium">Allowed categories:</span>
              {["LANDING_PAGE", "JSON_DATASET"].map((c) => (
                <label key={c} className="flex items-center gap-1.5">
                  <input type="checkbox" disabled={!canEdit} checked={form.allowedCategories.includes(c)} onChange={(e) => setForm((f) => ({ ...f, allowedCategories: e.target.checked ? [...f.allowedCategories, c] : f.allowedCategories.filter((x) => x !== c) }))} />
                  {c === "LANDING_PAGE" ? "Landing pages" : "JSON datasets"}
                </label>
              ))}
            </div>
          </div>
        </CardBody>
        {canEdit ? (
          <div className="flex justify-end border-t border-border px-5 py-3">
            <Button type="submit" loading={saving}>
              Save policy
            </Button>
          </div>
        ) : (
          <div className="border-t border-border px-5 py-3 text-xs text-muted">Only admins and owners can change the policy.</div>
        )}
      </Card>
    </form>
  );
}

function MembersPanel({ members, invitations, role, currentUserId }: Props) {
  const router = useRouter();
  const { push } = useToast();
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER" | "VIEWER">("MEMBER");
  const [busy, setBusy] = useState<string | null>(null);
  const canInvite = role === "ADMIN" || role === "OWNER";
  const isOwner = role === "OWNER";

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("invite");
    try {
      const r = await api<{ emailDelivery: string }>("/api/organizations/current/members", { method: "POST", body: { email, role: inviteRole } });
      push(r.emailDelivery === "sent" ? { kind: "success", title: `Invitation sent to ${email}` } : { kind: "info", title: "Invitation created", description: "Email delivery is not configured; the invitation link is in the server log." });
      setEmail("");
      router.refresh();
    } catch (err) {
      push({ kind: "error", title: err instanceof ApiError ? err.message : "Invite failed" });
    } finally {
      setBusy(null);
    }
  };
  const changeRole = async (userId: string, newRole: MembershipRole) => {
    setBusy(userId);
    try {
      await api("/api/organizations/current/members", { method: "PATCH", body: { userId, role: newRole } });
      push({ kind: "success", title: "Role updated" });
      router.refresh();
    } catch (err) {
      push({ kind: "error", title: err instanceof ApiError ? err.message : "Update failed" });
    } finally {
      setBusy(null);
    }
  };
  const remove = async (userId: string) => {
    if (!window.confirm("Remove this member from the workspace?")) return;
    setBusy(userId);
    try {
      await api("/api/organizations/current/members", { method: "DELETE", body: { userId } });
      push({ kind: "success", title: "Member removed" });
      router.refresh();
    } catch (err) {
      push({ kind: "error", title: err instanceof ApiError ? err.message : "Removal failed" });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Members" description="Owners manage roles. Admins approve contracts, payments, and captures. Members create contracts. Viewers read." />
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">
                  {m.name} {m.userId === currentUserId ? <span className="text-xs text-faint">(you)</span> : null}
                </p>
                <p className="text-xs text-muted">{m.email}</p>
              </div>
              {!m.verified ? <Badge tone="warning">unverified</Badge> : null}
              {isOwner && m.userId !== currentUserId ? (
                <Select value={m.role} className="w-32" aria-label={`Role for ${m.name}`} disabled={busy === m.userId} onChange={(e) => changeRole(m.userId, e.target.value as MembershipRole)}>
                  {["OWNER", "ADMIN", "MEMBER", "VIEWER"].map((r) => (
                    <option key={r} value={r}>
                      {r.toLowerCase()}
                    </option>
                  ))}
                </Select>
              ) : (
                <Badge tone="navy">{m.role.toLowerCase()}</Badge>
              )}
              {isOwner && m.userId !== currentUserId ? (
                <Button size="sm" variant="ghost" onClick={() => remove(m.userId)} disabled={busy === m.userId}>
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      {canInvite ? (
        <Card>
          <CardHeader title="Invite a member" />
          <CardBody>
            <form onSubmit={invite} className="flex flex-wrap items-end gap-3">
              <div className="min-w-[240px] flex-1">
                <Field label="Email" htmlFor="invite-email">
                  <Input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
              </div>
              <Field label="Role" htmlFor="invite-role">
                <Select id="invite-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)} className="w-36">
                  <option value="ADMIN">admin</option>
                  <option value="MEMBER">member</option>
                  <option value="VIEWER">viewer</option>
                </Select>
              </Field>
              <Button type="submit" loading={busy === "invite"}>
                Send invitation
              </Button>
            </form>
            {invitations.length ? (
              <ul className="mt-4 space-y-1 text-sm">
                {invitations.map((i) => (
                  <li key={i.id} className="text-muted">
                    {i.email} as {i.role.toLowerCase()}, expires {formatDate(i.expiresAt, { dateStyle: "medium" })}
                  </li>
                ))}
              </ul>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function ApiKeysPanel({ keys, canEdit }: { keys: Props["apiKeys"]; canEdit: boolean }) {
  const router = useRouter();
  const { push } = useToast();
  const [name, setName] = useState("");
  const [write, setWrite] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("create");
    try {
      const r = await api<{ secret: string }>("/api/organizations/current/api-keys", { method: "POST", body: { name, scopes: write ? ["read", "write"] : ["read"] } });
      setSecret(r.secret);
      setName("");
      router.refresh();
    } catch (err) {
      push({ kind: "error", title: err instanceof ApiError ? err.message : "Could not create key" });
    } finally {
      setBusy(null);
    }
  };
  const revoke = async (id: string) => {
    if (!window.confirm("Revoke this key? Integrations using it will stop working.")) return;
    setBusy(id);
    try {
      await api("/api/organizations/current/api-keys", { method: "DELETE", body: { id } });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-4">
      {secret ? (
        <Callout tone="success" title="Copy your new API key now">
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Mono className="text-xs">{secret}</Mono>
            <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(secret); push({ kind: "success", title: "Copied" }); }}>
              <Copy className="h-3.5 w-3.5" aria-hidden /> Copy
            </Button>
          </div>
          <p className="mt-1">It will not be shown again. Send it as <code>Authorization: Bearer ...</code>.</p>
        </Callout>
      ) : null}
      <Card>
        <CardHeader title="API keys" description="Keys act for this workspace. Read keys behave as viewers; write keys as admins." />
        {keys.length === 0 ? (
          <CardBody>
            <p className="text-sm text-muted">No API keys yet.</p>
          </CardBody>
        ) : (
          <ul className="divide-y divide-border">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{k.name}</p>
                  <p className="text-xs text-muted">
                    <Mono>{k.prefix}...</Mono> · {k.scopes.join(", ")} · created {formatDate(k.createdAt, { dateStyle: "medium" })}
                    {k.lastUsedAt ? ` · last used ${formatDate(k.lastUsedAt)}` : " · never used"}
                  </p>
                </div>
                {k.revokedAt ? <StatusBadge status="REVOKED_FAILED" label="revoked" /> : canEdit ? <Button size="sm" variant="ghost" onClick={() => revoke(k.id)} disabled={busy === k.id}>Revoke</Button> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {canEdit ? (
        <Card>
          <CardHeader title="Create a key" />
          <CardBody>
            <form onSubmit={create} className="flex flex-wrap items-end gap-3">
              <div className="min-w-[240px] flex-1">
                <Field label="Name" htmlFor="key-name">
                  <Input id="key-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="CI integration" />
                </Field>
              </div>
              <label className="flex h-10 items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} /> Write access
              </label>
              <Button type="submit" loading={busy === "create"}>
                Create key
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function IntegrationsPanel({ integrations, webhookUrl }: { integrations: IntegrationStatus[]; webhookUrl: string }) {
  return (
    <Card>
      <CardHeader title="Integrations" description="Configured on the server through environment variables. Secrets are never shown here or sent to the browser." />
      <ul className="divide-y divide-border">
        {integrations.map((s) => (
          <li key={s.name} className="flex gap-3 px-5 py-4">
            {s.configured ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden /> : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium capitalize text-ink">
                {s.name.replace(/([A-Z])/g, " $1")} {s.environment ? <span className="text-xs font-normal text-faint">({s.environment})</span> : null}
              </p>
              <p className="text-sm text-muted">{s.detail}</p>
              {s.instructions ? <p className="mt-1 text-xs text-ink-2">{s.instructions}</p> : null}
              {s.name === "webhooks" ? (
                <p className="mt-1 text-xs text-muted">
                  Endpoint: <Mono>{webhookUrl}</Mono>
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function WorkspacesPanel({ memberships }: { memberships: SessionOrganization[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader title="Your workspaces" description="Switch between them from the sidebar." />
        <ul className="divide-y divide-border">
          {memberships.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <div className="flex-1">
                <p className="font-medium text-ink">{m.name}</p>
                <p className="text-xs text-muted">{m.slug}</p>
              </div>
              {m.kind === "JUDGE_DEMO" ? <Badge tone="warning">demo</Badge> : null}
              <Badge tone="navy">{m.role.toLowerCase()}</Badge>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Create another workspace" description="Each workspace has its own policy, contracts, and receipts." />
        <CardBody>
          <CreateWorkspaceForm compact />
        </CardBody>
      </Card>
    </div>
  );
}
