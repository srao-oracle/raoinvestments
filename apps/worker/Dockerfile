# Build context = repo root (pnpm workspace). Deploy with:
#   fly deploy . -c apps/worker/fly.toml --dockerfile apps/worker/Dockerfile
FROM node:22-slim
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter worker build

WORKDIR /repo/apps/worker
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/index.js"]
