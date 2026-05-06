FROM node:20-alpine

RUN apk add --no-cache openssl python3 make g++
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json

RUN pnpm install --filter @yanlu/api... --no-frozen-lockfile

COPY apps/api apps/api

RUN pnpm --filter @yanlu/api prisma:generate
RUN pnpm --filter @yanlu/api build

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["sh", "-c", "pnpm prisma:generate && node dist/main.js"]
