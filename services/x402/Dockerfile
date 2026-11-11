# Nectar x402 paid export (near:testnet). Build context = repo root:
#   docker build -f services/x402/Dockerfile -t nectar-x402 .
# Ignore rules: services/x402/Dockerfile.dockerignore (allowlist). No key in any layer: the relayer key is runtime
# only (X402_RELAYER_KEY_JSON platform secret, refused if FullAccess; or X402_FACILITATOR_URL). Testnet only.
# NODE_VERSION tag is not in docs/FACTS.md (no docker on the build host, WO-34k); bump if the tag does not resolve.
ARG NODE_VERSION=22.22.2
FROM node:${NODE_VERSION}-bookworm-slim AS deps
ENV CI=1 PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/config.yaml packages/config/config.yaml
COPY services/x402/package.json services/x402/package.json
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter x402

FROM node:${NODE_VERSION}-bookworm-slim
ENV NODE_ENV=production \
    X402_HOST=0.0.0.0
WORKDIR /app
COPY --from=deps --chown=node:node /app /app
COPY --chown=node:node services/x402/src services/x402/src
# x402 imports these dependency-free modules from the sibling services.
COPY --chown=node:node services/feed/package.json services/feed/package.json
COPY --chown=node:node services/feed/src/repo-config.ts services/feed/src/cors.ts services/feed/src/
COPY --chown=node:node services/keeper/package.json services/keeper/package.json
COPY --chown=node:node services/keeper/src/keyfile.ts services/keeper/src/
USER node
WORKDIR /app/services/x402
# PORT is injected by the platform; X402_PORT (unset here) would win; 8790 is the fallback.
EXPOSE 8790
CMD ["node", "--disable-warning=ExperimentalWarning", "src/main.ts"]
