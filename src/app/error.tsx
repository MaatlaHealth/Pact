"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-semibold text-ink">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-muted">The error has been logged on the server. Nothing financial happens without an explicit, recorded policy decision, so it is safe to retry.</p>
      {error.digest ? <p className="mt-1 font-mono text-xs text-faint">ref {error.digest}</p> : null}
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
