# Standalone worker image. Build context = apps/worker (deploy from that dir).
FROM node:22-slim
WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/index.js"]
