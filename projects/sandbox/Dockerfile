# --------- install dependence -----------
FROM python:3.11-alpine AS python_base

# 安装make和g++
RUN apk add --no-cache make g++

FROM node:20.14.0-alpine AS install

WORKDIR /app

ARG proxy
RUN [ -z "$proxy" ] || sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
RUN apk add --no-cache make g++

# copy py3.11
COPY --from=python_base /usr/local /usr/local

RUN npm install -g pnpm@9.4.0
RUN [ -z "$proxy" ] || pnpm config set registry https://registry.npmmirror.com

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY ./projects/sandbox/package.json ./projects/sandbox/package.json

RUN [ -f pnpm-lock.yaml ] || (echo "Lockfile not found." && exit 1)

RUN pnpm i

# --------- builder -----------
FROM node:20.14.0-alpine AS builder

WORKDIR /app

COPY package.json pnpm-workspace.yaml /app/
COPY --from=install /app/node_modules /app/node_modules
COPY ./projects/sandbox /app/projects/sandbox
COPY --from=install /app/projects/sandbox /app/projects/sandbox

RUN npm install -g pnpm@9.4.0
RUN pnpm --filter=sandbox build

# --------- runner -----------
FROM node:20.14.0-alpine AS runner
WORKDIR /app

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/projects/sandbox /app/projects/sandbox

ENV NODE_ENV=production

CMD ["node", "--no-node-snapshot", "projects/sandbox/dist/main.js"]
