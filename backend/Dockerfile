FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server.js .
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 3177
CMD ["node", "server.js"]
