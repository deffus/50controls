FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json yarn.lock* ./
COPY prisma ./prisma/
COPY docker/stage-client.cjs ./docker/stage-client.cjs
# The exported lockfile can differ from the hosted dependency baseline.
RUN yarn install --non-interactive
RUN yarn prisma generate && node docker/stage-client.cjs

# Explicit one-off database initialization; never run automatically at startup.
FROM deps AS init
COPY data ./data
COPY scripts/seed.ts scripts/safe-seed.ts ./scripts/
COPY docker/initialize.cjs ./docker/initialize.cjs
ENV PORTABLE_INIT=1
CMD ["node", "docker/initialize.cjs"]

FROM deps AS builder
COPY . .
# Isolated container configuration; the managed host configuration stays intact.
RUN cp docker/next.config.cjs next.config.js
# Build regenerates route declarations before its mandatory type check.
RUN yarn build
RUN test -f .next/standalone/server.js && test -f .next/standalone/node_modules/.prisma/client/index.js

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 --ingroup nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
