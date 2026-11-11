# Nectar Feed (REST + Feed MCP on one port). Build context = repo root:
#   docker build -f services/feed/Dockerfile -t nectar-feed .
# Ignore rules: services/feed/Dockerfile.dockerignore (allowlist; BuildKit reads <Dockerfile>.dockerignore).
# No secrets in any layer: keys/API tokens are runtime env or mounted files only. Testnet only.
# NODE_VERSION tag is not in docs/FACTS.md (no docker on the build host, WO-34k); bump if the tag does not resolve.
ARG NODE_VERSION=22.22.2
FROM node:${NODE_VERSION}-bookworm-slim AS deps
ENV CI=1 PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/config.yaml packages/config/config.yaml
COPY services/feed/package.json services/feed/package.json
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter feed

FROM node:${NODE_VERSION}-bookworm-slim
ENV NODE_ENV=production \
    FEED_SINGLE_PORT=1 \
    FEED_HOST=0.0.0.0 \
    FEED_DB_PATH=/data/feed.sqlite \
    FEED_START_BLOCK=head
WORKDIR /app
COPY --from=deps --chown=node:node /app /app
COPY --chown=node:node services/feed/src services/feed/src
COPY --chown=node:node services/feed/openapi.yaml services/feed/openapi.yaml
# skill.ts imports the dependency-free health math from the keeper (same numbers as contracts/tests/model.csv).
COPY --chown=node:node services/keeper/package.json services/keeper/package.json
COPY --chown=node:node services/keeper/src/health.ts services/keeper/src/health.ts
RUN mkdir -p /data && chown node:node /data
USER node
WORKDIR /app/services/feed
# PORT is injected by the platform (single public port); FEED_PORT 8788 is the fallback.
EXPOSE 8788
CMD ["node", "--disable-warning=ExperimentalWarning", "src/main.ts"]
