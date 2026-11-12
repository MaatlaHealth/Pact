# Hosting on Netlify

PACT runs on Netlify as a split deployment:

| Part | Where | Why |
| --- | --- | --- |
| Web application (pages, API, SSE, PayPal return and webhook endpoints) | Netlify (Next.js adapter) | Request and response work fits serverless functions |
| Worker (agents, Chromium verification, Lighthouse, reconciliation, receipts) | A long-running host: Render background worker, Fly.io, Railway, a VPS, or Docker anywhere | Netlify functions stop at 60 seconds and do not ship Chromium; a verification run with Lighthouse takes longer than that |
| PostgreSQL | Neon, Supabase, Render, or any managed PostgreSQL with a pooled connection string | Both parts share one database |
| Object storage | Cloudflare R2, AWS S3, or MinIO | Netlify functions have no persistent disk |

The application code is the same in both parts. `netlify.toml` configures the web build; `render.yaml` can deploy just the worker (`pact-worker`) and the database if you do not already have one.

## Web on Netlify

1. Import the GitHub repository in Netlify. The `netlify.toml` sets the build command, Node 22, and the Next.js plugin.
2. Set environment variables (Site configuration, Environment variables). All values are the same as `.env.example` except:
   - `APP_URL`: the Netlify site URL (for example `https://pact-protocol.netlify.app`) or your custom domain.
   - `DATABASE_URL`: a pooled connection string. On Neon use the `-pooler` host; on Supabase use the transaction pooler on port 6543.
   - `DATABASE_POOL_MAX`: 3 (the default when `NETLIFY` is set).
   - `STORAGE_DRIVER=s3` and the `S3_*` variables. `local` storage does not work on Netlify.
   - `RECEIPT_SIGNING_*`, `GEMINI_API_KEY`, `PAYPAL_*`, `RESEND_API_KEY`, `EMAIL_FROM`.
3. Deploy. Migrations are not run by the Netlify build; run `npx prisma migrate deploy` once from your machine or CI with `DATABASE_URL` set to the production database, then `npm run db:seed`.
4. Register the PayPal webhook at `https://<site>/api/webhooks/paypal` and set `PAYPAL_WEBHOOK_ID`.
5. Create the judge account from your machine against the production database: `JUDGE_EMAIL=... JUDGE_PASSWORD=... DATABASE_URL=... npm run judge:seed`.

## Worker elsewhere

The worker needs the same environment variables as the web app, including the production `DATABASE_URL`, the same `S3_*` storage, and `APP_URL` pointing at the Netlify site (the verifier loads deliverable previews from there).

Render: create a Blueprint from `render.yaml` and keep only `pact-worker` (and `pact-db` if you want Render's PostgreSQL), or create a Background Worker manually with the Docker runtime and `PROCESS=worker`.

Docker anywhere:

```bash
docker build -t pact .
docker run --env-file .env.production -e PROCESS=worker pact
```

Give the worker at least 2 GB of memory for Chromium and Lighthouse.

## What was adapted for Netlify

- Server-Sent Events streams close themselves after 45 seconds and carry event ids; the browser's `EventSource` reconnects and resumes from `Last-Event-ID`, so live views keep working under the 60-second function limit.
- The Prisma `pg` pool is capped at 3 connections per function instance on Netlify.
- The receipt PDF route declares the pdfkit font data and the logo as traced files so they are bundled into the function.
- `next/image` is served through Netlify Image CDN; Unsplash is the only remote image host allowed.
- The Playwright browser download is skipped during the web build.

## Limits to keep in mind

- Any single API request must finish within 60 seconds. Contract generation (one Gemini call) normally takes 10 to 30 seconds; if your model is slower, raise `GEMINI_MAX_TOKENS_PER_RUN` down or move generation to a job.
- Webhook processing is queued to the worker; if the worker is down, events are stored and processed when it returns.
- `/api/health` reports `workerLastSeen`; if it is null or old, the worker is not running.
