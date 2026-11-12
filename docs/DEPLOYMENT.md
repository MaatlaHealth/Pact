# Deployment

PACT needs a web process, a long-running worker with Chromium, PostgreSQL, and object storage. Serverless function hosts are not suitable for the worker. The configuration below targets Render for everything; for Netlify (web) plus a separate worker host, see [NETLIFY.md](NETLIFY.md).

## Render (recommended)

`render.yaml` defines:

- `pact-web`: the Next.js server, Docker image, `PROCESS=web`, health check at `/api/health`.
- `pact-worker`: the same image with `PROCESS=worker`. Give it at least 2 GB of memory for Chromium and Lighthouse.
- `pact-db`: managed PostgreSQL.

Steps:

1. Fork or push this repository to GitHub and create a new Blueprint on Render pointing at it. Render reads `render.yaml`.
2. Set the environment variables marked `sync: false` in the dashboard for both services. They are the same set for web and worker:
   - `APP_URL` (the public URL Render assigns, for example `https://pact-web.onrender.com`)
   - `APP_SECRET` (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, optionally `PAYPAL_PAYEE_EMAIL`
   - `GEMINI_API_KEY`
   - `RESEND_API_KEY`, `EMAIL_FROM` (a verified sender)
   - `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` (for R2 or MinIO), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
   - `RECEIPT_SIGNING_KEY_ID`, `RECEIPT_SIGNING_PRIVATE_KEY_PEM`, `RECEIPT_SIGNING_PUBLIC_KEY_PEM` (from `npm run keys:generate`, base64 single-line values)
   - `JUDGE_EMAIL`, `JUDGE_PASSWORD` on the web service only, used by the judge seed command
3. Deploy. The image's start script runs `prisma migrate deploy` and `prisma db seed` before starting the web process.
4. Register the PayPal webhook at `<APP_URL>/api/webhooks/paypal` and set `PAYPAL_WEBHOOK_ID`, then redeploy.
5. Create the judge account from the Render shell on the web service: `npm run judge:seed`.
6. Smoke test: open `<APP_URL>/api/health`, the home page, sign in as the judge, and run the walkthrough in `JUDGE_ACCESS.md`.

## Object storage

Deliverables, evidence screenshots, and Lighthouse reports must survive restarts. Use AWS S3, Cloudflare R2, or MinIO:

- R2: create a bucket and an API token; set `S3_ENDPOINT=https://<account id>.r2.cloudflarestorage.com`, `S3_REGION=auto`.
- S3: set `S3_REGION` to the bucket region and leave `S3_ENDPOINT` empty.

`STORAGE_DRIVER=local` writes to the container's filesystem and is for development only.

## Docker Compose (local full stack)

```bash
docker compose up --build
```

This starts PostgreSQL, MinIO, the web server on port 3000, and the worker. Copy `.env.example` to `.env` first and fill in the integration keys. The compose file wires `DATABASE_URL` and the MinIO storage variables automatically.

## Custom domain

Add the domain in Render, point DNS at it, and set `APP_URL` to the new origin. Update the PayPal webhook URL and the return URL's host is derived from `APP_URL`, so no other change is needed.

## Health and logs

`GET /api/health` returns database status, queue depth (queued, running, dead), the last successful job time (a proxy for worker liveness), and which integrations are configured. Both processes write JSON logs to stdout with secrets redacted.

## Upgrading

Push to the branch Render watches. Migrations run on deploy. For schema changes that are not backward compatible, deploy the worker after the web service.
