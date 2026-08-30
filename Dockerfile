# SEALED server (and watchdog) image — the only part of the project that needs a long-running host.
# The static site (web + Ashfall) is built separately (see vercel.json / `pnpm build:site`).
#
#   docker build -t sealed-server .
#   docker run -p 4000:4000 -e SEALED_CLUSTER=devnet -e SEALED_WALLET_JSON="$(cat ~/.config/solana/id.json)" \
#              -v sealed-data:/app/server/data sealed-server
#   # watchdog: same image, different command
#   docker run -p 4100:4100 -e SEALED_CLUSTER=devnet -e SEALED_SERVER=http://<server-host>:4000 \
#              sealed-server pnpm --filter watchdog start
FROM node:22-slim
RUN corepack enable && corepack prepare pnpm@11.23.0 --activate
WORKDIR /app

# Install with the lockfile first so source edits do not bust the dependency layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/
COPY watchdog/package.json watchdog/
COPY scripts/package.json scripts/
COPY web/package.json web/
COPY games/ashfall/package.json games/ashfall/
COPY packages/ashfall-math/package.json packages/ashfall-math/
RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY server ./server
COPY watchdog ./watchdog

ENV NODE_ENV=production PORT=4000 WATCHDOG_PORT=4100
EXPOSE 4000 4100
VOLUME ["/app/server/data"]
WORKDIR /app/server
CMD ["pnpm", "start"]
