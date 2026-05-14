# Multi-stage build for the Next.js listener UI.
# Produces a slim standalone image (~150MB) suitable for production.

# ---- deps ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci

# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY web/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=7700
ENV HOSTNAME=0.0.0.0

RUN groupadd -r next && useradd -r -g next next

# Standalone output bundles only the runtime files Next.js needs.
COPY --from=build --chown=next:next /app/.next/standalone ./
COPY --from=build --chown=next:next /app/.next/static ./.next/static

USER next
EXPOSE 7700
CMD ["node", "server.js"]
