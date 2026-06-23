FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=96
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js storagePath.js ./
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 3177
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:3177/healthz || exit 1
CMD ["node", "server.js"]
