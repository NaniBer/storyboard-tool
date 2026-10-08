FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/api/src apps/api/src
RUN npm run build -w @storyboard/api

FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/app/data

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --workspace=@storyboard/api \
    && npm cache clean --force \
    && mkdir -p /app/data \
    && chown node:node /app/data

COPY --from=build /app/apps/api/dist apps/api/dist

USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
