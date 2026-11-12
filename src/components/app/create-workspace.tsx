"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Field, Input } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/client/api";

export function CreateWorkspaceForm({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api("/api/organizations", { method: "POST", body: { name } });
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the workspace.");
      setLoading(false);
    }
  };
  const form = (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Workspace name" htmlFor="ws-name" error={error}>
        <Input id="ws-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Studio" />
      </Field>
      <Button type="submit" loading={loading} className={compact ? undefined : "w-full"}>
        Create workspace
      </Button>
    </form>
  );
  if (compact) return form;
  return (
    <Card>
      <CardBody className="p-6">{form}</CardBody>
    </Card>
  );
}
