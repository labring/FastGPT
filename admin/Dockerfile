# Install dependencies only when needed
FROM node:current-alpine AS builder
RUN npm config set registry https://registry.npmmirror.com/
RUN apk add --no-cache libc6-compat && npm install -g pnpm
RUN pnpm config set registry https://registry.npmmirror.com/

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED 1
ENV VITE_PUBLIC_SERVER_URL ''
# Install dependencies based on the preferred package manager
COPY . .
RUN \
  [ -f pnpm-lock.yaml ] && pnpm install || \
  (echo "Lockfile not found." && exit 1)

RUN pnpm build

# Production image, copy all the files and run next
FROM node:current-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

RUN sed -i 's/https/http/' /etc/apk/repositories
RUN apk add curl \
  && apk add ca-certificates \
  && update-ca-certificates

COPY package.json pnpm-lock.yaml* ./
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/service ./service
COPY --from=builder /app/dist ./dist

RUN npm config set registry https://registry.npmmirror.com/
RUN npm install -g pnpm
RUN pnpm config set registry https://registry.npmmirror.com/
RUN pnpm install --prod
RUN npm remove -g pnpm

ENV PORT=3001

EXPOSE 3001

CMD ["node", "server.js"]
