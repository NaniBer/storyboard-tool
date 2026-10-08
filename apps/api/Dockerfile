FROM node:24-bookworm-slim AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/api/src apps/api/src
RUN npm run build -w @storyboard/api \
    && npm prune --omit=dev

FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/app/data

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN mkdir -p /app/data && chown node:node /app/data

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/dist apps/api/dist

USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
