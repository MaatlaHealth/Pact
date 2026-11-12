"use client";

/** Minimal, dependency-free visual for pass/fail counts. Values are real counts. */
export function VerificationRateChart({ passed, failed }: { passed: number; failed: number }) {
  const total = passed + failed;
  const passPct = total === 0 ? 0 : Math.round((passed / total) * 100);
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-3xl font-semibold tabular-nums text-ink">{passPct}%</p>
          <p className="text-xs text-muted">pass rate across {total} completed run{total === 1 ? "" : "s"}</p>
        </div>
        <dl className="text-right text-xs">
          <div>
            <dt className="inline text-muted">Passed </dt>
            <dd className="inline font-semibold text-success">{passed}</dd>
          </div>
          <div>
            <dt className="inline text-muted">Failed </dt>
            <dd className="inline font-semibold text-danger">{failed}</dd>
          </div>
        </dl>
      </div>
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${passed} passed, ${failed} failed`}>
        <div className="bg-success" style={{ width: `${passPct}%` }} />
        <div className="bg-danger" style={{ width: `${100 - passPct}%` }} />
      </div>
    </div>
  );
}
