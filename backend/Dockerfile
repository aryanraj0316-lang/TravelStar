# TravelStar backend — multi-stage build (docs/REMEDIATION.md Phase 11).
# Final image runs as a non-root user, contains only production deps + the
# compiled dist/ + the Prisma schema/engine, and starts with migrations
# already expected to have been applied by the deploy step (prisma migrate
# deploy), not at container start.

# ---------- deps ----------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
# argon2 compiles a native addon via node-gyp, which needs python3/make/g++ —
# none of which node:20-bookworm-slim ships. Build-stage only: the runtime
# stage below never installs these, so the final image stays slim.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
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
RUN apt-get update \
 && apt-get install -y --no-install-recommends dumb-init \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

USER node
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
