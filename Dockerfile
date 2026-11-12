# PACT Protocol: one image for the web server and the worker.
# The Playwright base image ships Chromium and its system dependencies, which
# the worker needs for verification and Lighthouse.

FROM mcr.microsoft.com/playwright:v1.65.0-noble AS base
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --include=dev --no-audit --no-fund \
 && npm approve-scripts prisma protobufjs @prisma/engines esbuild \
 && npm rebuild prisma protobufjs @prisma/engines esbuild

FROM deps AS build
COPY . .
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build \
    APP_SECRET=build-time-placeholder-secret-not-used-at-runtime-0000
RUN npx prisma generate && npx next build

FROM base AS runtime
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/tsconfig.json ./
COPY --from=build /app/next.config.ts ./
COPY docker/start.sh ./docker/start.sh
RUN chmod +x ./docker/start.sh
EXPOSE 3000
ENV PROCESS=web
CMD ["./docker/start.sh"]
