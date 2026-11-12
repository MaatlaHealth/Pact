"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Field, Input, Callout } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/client/api";
import { useToast } from "@/components/ui/toast";

function AuthCard({ title, description, children, footer }: { title: string; description?: string; children?: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Card>
      <CardBody className="p-6 sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        <div className="mt-6">{children}</div>
        {footer ? <div className="mt-6 text-center text-sm text-muted">{footer}</div> : null}
      </CardBody>
    </Card>
  );
}

function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/app";
  return value;
}

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const next = safeNext(params.get("next"));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/login", { method: "POST", body: { email, password } });
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed.");
      setLoading(false);
    }
  };

  return (
    <AuthCard title="Sign in" description="Welcome back to your PACT workspace." footer={<>No account yet? <Link href="/sign-up" className="font-medium text-navy hover:underline">Create one</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {params.get("verified") === "1" ? <Callout tone="success">Email verified. Sign in to continue.</Callout> : null}
        {params.get("reset") === "1" ? <Callout tone="success">Password updated. Sign in with your new password.</Callout> : null}
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        <Button type="submit" className="w-full" loading={loading}>
          Sign in
        </Button>
        <p className="text-center text-xs">
          <Link href="/forgot-password" className="text-muted hover:text-ink">
            Forgot your password?
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

export function SignUpForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", organizationName: "" });
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDetails([]);
    setLoading(true);
    try {
      await api("/api/auth/register", { method: "POST", body: { ...form, organizationName: form.organizationName || undefined } });
      router.push("/verify-email");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        const d = err.details as { problems?: string[] } | { path: string; message: string }[] | undefined;
        if (Array.isArray(d)) setDetails(d.map((x) => `${x.path}: ${x.message}`));
        else if (d?.problems) setDetails(d.problems);
      } else setError("Registration failed.");
      setLoading(false);
    }
  };

  return (
    <AuthCard title="Create your account" description="A workspace holds your spending policy, contracts, and receipts." footer={<>Already registered? <Link href="/sign-in" className="font-medium text-navy hover:underline">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Your name" htmlFor="name">
          <Input id="name" autoComplete="name" required value={form.name} onChange={update("name")} />
        </Field>
        <Field label="Work email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={update("email")} />
        </Field>
        <Field label="Password" htmlFor="password" hint="12+ characters, mixed case, a number">
          <Input id="password" type="password" autoComplete="new-password" required minLength={12} value={form.password} onChange={update("password")} />
        </Field>
        <Field label="Workspace name" htmlFor="organizationName" hint="optional, you can create one later">
          <Input id="organizationName" value={form.organizationName} onChange={update("organizationName")} placeholder="Acme Studio" />
        </Field>
        {error ? (
          <div className="text-sm text-danger" role="alert">
            <p>{error}</p>
            {details.length ? (
              <ul className="mt-1 list-disc pl-5 text-xs">
                {details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <Button type="submit" className="w-full" loading={loading}>
          Create account
        </Button>
        <p className="text-center text-xs text-faint">By continuing you agree to use the PayPal sandbox until live payments are deliberately enabled by your workspace owner.</p>
      </form>
    </AuthCard>
  );
}

export function VerifyEmailPanel({ initialToken, emailConfigured, verified, email }: { initialToken: string | null; emailConfigured: boolean; verified: boolean; email: string | null }) {
  const router = useRouter();
  const { push } = useToast();
  const [state, setState] = useState<"idle" | "verifying" | "done" | "error">(initialToken ? "verifying" : "idle");
  const [message, setMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!initialToken) return;
    let cancelled = false;
    api<{ verified: boolean }>("/api/auth/verify-email", { method: "POST", body: { token: initialToken } })
      .then(() => {
        if (cancelled) return;
        setState("done");
        router.refresh();
      })
      .catch((err) => {
        if (cancelled) return;
        setState("error");
        setMessage(err instanceof ApiError ? err.message : "Verification failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [initialToken, router]);

  const resend = async () => {
    setResending(true);
    try {
      const r = await api<{ sent: boolean; emailDelivery: string }>("/api/auth/verify-email", { method: "PUT" });
      push(r.sent ? { kind: "success", title: "Verification email sent" } : { kind: "info", title: "Email delivery is not configured", description: "The verification link was written to the server log. Ask the administrator to open it for you." });
    } catch (err) {
      push({ kind: "error", title: err instanceof ApiError ? err.message : "Could not resend." });
    } finally {
      setResending(false);
    }
  };

  if (verified || state === "done") {
    return (
      <AuthCard title="Email verified" description="Your account is active.">
        <Button className="w-full" onClick={() => router.push("/app")}>
          Continue to your workspace
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Verify your email" description={email ? `We sent a verification link to ${email}.` : "Open the link in the verification email to activate your account."}>
      {state === "verifying" ? <p className="text-sm text-muted">Checking your link...</p> : null}
      {state === "error" ? <Callout tone="danger">{message}</Callout> : null}
      {!emailConfigured ? (
        <Callout tone="warning" title="Email delivery is not configured on this deployment">
          Verification links are written to the server log instead of being emailed. The administrator can copy the link from the log, or set RESEND_API_KEY to enable delivery.
        </Callout>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" onClick={resend} loading={resending} className="flex-1">
          Resend email
        </Button>
        <Button variant="ghost" onClick={() => router.push("/sign-in")}>
          Sign in
        </Button>
      </div>
    </AuthCard>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState<null | string>(null);
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api<{ emailDelivery: string }>("/api/auth/password", { method: "POST", body: { email } });
      setDone(r.emailDelivery);
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthCard title="Reset your password" description="Enter your email and we will send a reset link if an account exists.">
      {done ? (
        <Callout tone={done === "sent" ? "success" : "warning"}>{done === "sent" ? "If an account exists for that email, a reset link is on its way." : "Email delivery is not configured on this deployment. If the account exists, the reset link was written to the server log."}</Callout>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" loading={loading}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (!token) return <AuthCard title="Invalid link" description="This reset link is missing its token. Request a new one." />;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/password", { method: "PUT", body: { token, password } });
      router.push("/sign-in?reset=1");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reset failed.");
      setLoading(false);
    }
  };
  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="New password" htmlFor="password" hint="12+ characters, mixed case, a number">
          <Input id="password" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        <Button type="submit" className="w-full" loading={loading}>
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}

export function AcceptInvitationPanel({ token, signedIn }: { token: string; signedIn: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const accept = async () => {
    setLoading(true);
    try {
      await api(`/api/invitations/${token}`, { method: "POST" });
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept the invitation.");
      setLoading(false);
    }
  };
  return (
    <AuthCard title="Workspace invitation" description={signedIn ? "Accept to join the workspace with the role you were invited as." : "Sign in or create an account with the invited email address, then return to this link."}>
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {signedIn ? (
        <Button className="mt-2 w-full" onClick={accept} loading={loading}>
          Accept invitation
        </Button>
      ) : (
        <div className="flex gap-2">
          <Link href={`/sign-in?next=${encodeURIComponent(`/invitations/${token}`)}`} className="flex-1">
            <Button className="w-full">Sign in</Button>
          </Link>
          <Link href="/sign-up" className="flex-1">
            <Button variant="secondary" className="w-full">
              Create account
            </Button>
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
