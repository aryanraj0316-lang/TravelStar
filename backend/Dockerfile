# TravelStar backend — multi-stage build (docs/REMEDIATION.md Phase 11).
# Final image runs as a non-root user, contains only production deps + the
# compiled dist/ + the Prisma schema/engines. Pending migrations are applied
# by the server itself at start-up (src/lib/auto-migrate.ts).

# ---------- deps ----------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
# argon2 compiles a native addon via node-gyp, which needs python3/make/g++ —
# none of which node:20-bookworm-slim ships. Build-stage only: the runtime
# stage below never installs these, so the final image stays slim.
# openssl here too, not only at runtime: Prisma downloads its engines during
# `npm ci` for the OpenSSL it detects. Without openssl it falls back to the
# 1.1 engines, the runtime (OpenSSL 3) then tries to download the 3.0 schema
# engine at container start, and `prisma migrate deploy` fails with "Can't
# write to /app/node_modules/@prisma/engines" — migrations silently never
# applied in production.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl && rm -rf /var/lib/apt/lists/*
# Full install (incl. dev) so the build stage can run tsc; prisma generate
# runs via the postinstall hook.
RUN npm ci

# ---------- build ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build \
 && npm prune --omit=dev

# ---------- runtime ----------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# dumb-init for correct signal forwarding (graceful shutdown in server.ts).
# openssl so Prisma's runtime platform detection (ldconfig/openssl version)
# can actually find libssl on this image instead of guessing the wrong
# engine target.
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init openssl && rm -rf /var/lib/apt/lists/*

# Owned by the runtime user so the Prisma CLI can still fetch a missing
# engine at start-up instead of failing the migration outright.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

USER node
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENV PRISMA_CLI_QUERY_ENGINE_TYPE=binary

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
