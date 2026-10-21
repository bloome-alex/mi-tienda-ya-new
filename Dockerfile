# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json package-lock.json ./
COPY api/package.json ./api/package.json
COPY client/package.json ./client/package.json
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run check && npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim AS runtime
ARG INSTALL_CHROMIUM=true
ENV NODE_ENV=production \
    PORT=5000 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    UPLOAD_DIR=/app/api/data/uploads \
    WHATSAPP_DATA_PATH=/app/api/data/whatsapp

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates dumb-init \
    && if [ "$INSTALL_CHROMIUM" = "true" ]; then apt-get install -y --no-install-recommends chromium fonts-liberation; fi \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/package-lock.json ./package-lock.json
COPY --from=build --chown=node:node /app/api/package.json ./api/package.json
COPY --from=build --chown=node:node /app/api/src ./api/src
COPY --from=build --chown=node:node /app/client/package.json ./client/package.json
COPY --from=build --chown=node:node /app/client/src/services/design.js ./client/src/services/design.js
COPY --from=build --chown=node:node /app/client/src/services/storeCopy.js ./client/src/services/storeCopy.js
COPY --from=build --chown=node:node /app/client/src/services/audit.js ./client/src/services/audit.js
COPY --from=build --chown=node:node /app/client/dist ./client/dist
RUN mkdir -p /app/api/data/uploads/images /app/api/data/uploads/receipts /app/api/data/whatsapp \
    && chown -R node:node /app/api/data

USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "api/src/index.js"]
