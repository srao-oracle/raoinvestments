# Build context = repo ROOT (so the worker can bundle apps/web/lib agent code).
# Deploy with: fly deploy -c apps/worker/fly.toml (run from repo root).
FROM node:22-slim
WORKDIR /app/apps/worker

COPY apps/worker/package.json ./
RUN npm install

COPY apps/worker/tsconfig.json ./
COPY apps/worker/src ./src
# The agent pipeline (plain TS) is imported via ../../web/lib and bundled by tsup.
COPY apps/web/lib /app/apps/web/lib

RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/index.js"]
