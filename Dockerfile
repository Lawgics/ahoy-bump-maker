FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY server/package.json ./
RUN npm install --omit=dev

COPY server/server.js ./
COPY web/ ./public/

EXPOSE 80

CMD ["node", "server.js"]
