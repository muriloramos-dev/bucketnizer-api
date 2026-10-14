
# syntax=docker/dockerfile:1

# Base
FROM node:22-alpine AS base
WORKDIR /app

# Dependencies
FROM base AS deps

COPY package*.json ./
RUN npm ci

# Build
FROM deps AS build

COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY src ./src

RUN npm run build

# Production dependencies
FROM base AS prod-deps

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force

# Runtime
FROM node:22-alpine AS runner

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
