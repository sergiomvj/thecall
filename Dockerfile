FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm ci
RUN npx prisma generate

COPY index.html metadata.json tsconfig.json vite.config.ts ./
COPY src ./src
COPY server ./server
COPY scripts ./scripts

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["sh", "-c", "npm run start"]
