# syntax=docker/dockerfile:1

# ---- build: install everything, build the React app, then drop dev dependencies
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime: small image, runs as the unprivileged "node" user
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=4000 \
    DB_PATH=/data/freshloop.db
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:4000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server/src/index.js"]
