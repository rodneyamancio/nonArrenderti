# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && apt-get clean && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY packages/rules/package.json packages/rules/
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @tenace/api...
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @tenace/types build && pnpm --filter @tenace/rules build && pnpm --filter @tenace/api build
RUN pnpm deploy --filter @tenace/api --prod /out && cd /out && npx prisma generate

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && apt-get clean && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data/uploads && chown node:node /data/uploads
ENV NODE_ENV=production UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY --from=build --chown=node:node /out ./
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
COPY --from=build --chown=node:node /repo/apps/api/prisma ./prisma
ARG BUILD_SHA=""
ENV BUILD_SHA=$BUILD_SHA
USER node
EXPOSE 3311
CMD ["node", "dist/main.js"]
