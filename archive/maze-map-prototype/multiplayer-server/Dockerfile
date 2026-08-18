FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs game-rules.mjs ./

ENV PORT=8788
EXPOSE 8788

CMD ["node", "server.mjs"]
