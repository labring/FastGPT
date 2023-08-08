# 本地开发

第一次开发，需要先部署数据库，建议本地开发可以随便找一台 2c2g 的轻量小数据库实践。数据库部署教程：[Docker 快速部署](../deploy/docker.md)

client 目录下为 FastGPT 核心代码。NextJS 框架前后端在一起的，api 服务位于 src/pages/api 内。

## 初始配置

**1. 环境变量**

复制.env.template 文件，生成一个.env.local 环境变量文件夹，修改.env.local 里内容才是有效的变量。变量说明见 .env.template

**2. config 配置文件**

复制 data/config.json 文件，生成一个 data/config.local.json 配置文件。

这个文件大部分时候不需要修改。只需要关注 SystemParams 里的参数：

```
"vectorMaxProcess": 向量生成最大进程，根据数据库和 key 的并发数来决定，通常单个 120 号，2c4g 服务器设置10~15。
"qaMaxProcess": QA 生成最大进程
"pgIvfflatProbe": PG vector 搜索探针，没有添加 vector 索引时可忽略。
```

## 运行

```
cd client
pnpm i
pnpm dev
```

## 镜像打包

```bash
docker build -t c121914yu/fastgpt .
```
