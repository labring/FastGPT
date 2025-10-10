# --------- install dependence -----------
FROM python:3.11-alpine AS python_base
# 安装make和g++以及libseccomp开发包
RUN apk add --no-cache make g++ tar wget gperf automake libtool linux-headers libseccomp-dev

WORKDIR /app
COPY projects/sandbox/requirements.txt /app/requirements.txt

# 先安装Cython和其他Python依赖
RUN pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple Cython && \
    pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple -r /app/requirements.txt

# 下载、编译并安装libseccomp及其Python绑定
ENV VERSION_RELEASE=2.5.5
RUN wget https://github.com/seccomp/libseccomp/releases/download/v2.5.5/libseccomp-2.5.5.tar.gz && \
    tar -zxvf libseccomp-2.5.5.tar.gz && \
    cd libseccomp-2.5.5 && \
    ./configure --prefix=/usr && \
    make && \
    make install && \
    cd src/python && \
    python setup.py install && \
    cd /app && \
    rm -rf libseccomp-2.5.5 libseccomp-2.5.5.tar.gz


FROM node:20.14.0-alpine AS install

WORKDIR /app

ARG proxy
RUN [ -z "$proxy" ] || sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
RUN apk add --no-cache make g++ python3

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

RUN apk add --no-cache libffi libffi-dev strace bash
COPY --from=python_base /usr/local /usr/local
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/projects/sandbox /app/projects/sandbox

ENV NODE_ENV=production
ENV PATH="/usr/local/bin:${PATH}"

CMD ["node", "--no-node-snapshot", "projects/sandbox/dist/main.js"]
