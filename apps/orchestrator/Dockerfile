# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.27.0 --activate
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY apps/orchestrator/package.json apps/orchestrator/
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/orchestrator apps/orchestrator
RUN pnpm --filter @ai-testing/orchestrator build

FROM mcr.microsoft.com/playwright:v1.49.1-noble AS runtime
RUN corepack enable && corepack prepare pnpm@10.27.0 --activate
WORKDIR /app
COPY --from=build /repo/node_modules /app/node_modules
COPY --from=build /repo/packages/shared /app/packages/shared
COPY --from=build /repo/apps/orchestrator/dist /app/dist
COPY --from=build /repo/apps/orchestrator/package.json /app/package.json
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/index.js"]
