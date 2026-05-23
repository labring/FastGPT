# Build from repository root:
#   docker build -f projects/volume-manager/Dockerfile -t fastgpt-volume-manager:latest .

FROM node:24-alpine AS builder

WORKDIR /app

ARG proxy

RUN npm install -g pnpm@10.33.2

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY projects/volume-manager/ ./projects/volume-manager/

RUN if [ -z "$proxy" ]; then \
      pnpm install --frozen-lockfile --ignore-scripts --filter @fastgpt/volume-manager...; \
    else \
      pnpm install --frozen-lockfile --ignore-scripts --filter @fastgpt/volume-manager... --registry=https://registry.npmmirror.com; \
    fi

RUN cd /app/projects/volume-manager && pnpm build

FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/projects/volume-manager/dist ./dist

EXPOSE 3000

CMD ["node", "dist/index.js"]
