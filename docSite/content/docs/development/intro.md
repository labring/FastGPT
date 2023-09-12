---
title: '快速开始'
description: '对 FastGPT 进行开发调试'
icon: 'developer_guide'
draft: false
toc: true
weight: 510
---

本文档介绍了如何设置开发环境以构建和测试 [FastGPT](https://fastgpt.run)。


## Tips

1. 用户默认的市区为 `Asia/Shanghai`,非 linux 环境时候，获取系统时间会异常，本地开发时候，可以将用户的时区调整成 UTC（+0）。


## 前置依赖项

您需要在计算机上安装和配置以下依赖项才能构建 [FastGPT](https://fastgpt.run)：

- [Git](http://git-scm.com/)
- [Docker](https://www.docker.com/)
- [Docker Compose](https://docs.docker.com/compose/install/)
- [Node.js v18.x (LTS)](http://nodejs.org)
- [npm](https://www.npmjs.com/) 版本 8.x.x 或 [Yarn](https://yarnpkg.com/)

## 本地开发

要设置一个可工作的开发环境，只需 Fork 项目的 Git 存储库，并部署一个数据库，然后开始进行开发测试。

### Fork 存储库

您需要 Fork [存储库](https://github.com/labring/FastGPT)。

### 克隆存储库

克隆您在 GitHub 上 Fork 的存储库：

```
git clone git@github.com:<github_username>/FastGPT.git
```

client 目录下为 FastGPT 核心代码。NextJS 框架前后端放在一起，API 服务位于 `src/pages/api` 目录内。

### 安装数据库

第一次开发，需要先部署数据库，建议本地开发可以随便找一台 2C2G 的轻量小数据库实践。数据库部署教程：[Docker 快速部署](/docs/installation/docker/)

### 初始配置

**1. 环境变量**

复制.env.template 文件，生成一个.env.local 环境变量文件夹，修改.env.local 里内容才是有效的变量。变量说明见 .env.template

**2. config 配置文件**

复制 data/config.json 文件，生成一个 data/config.local.json 配置文件。具体的参数说明，可参考 [config 配置说名](/docs/development/configuration)

**注意：json 配置文件不能包含注释，介绍中为了方便看才加入的注释**

这个文件大部分时候不需要修改。只需要关注 SystemParams 里的参数：

- `vectorMaxProcess`: 向量生成最大进程，根据数据库和 key 的并发数来决定，通常单个 120 号，2c4g 服务器设置 10~15。
- `qaMaxProcess`: QA 生成最大进程
- `pgIvfflatProbe`: PostgreSQL vector 搜索探针，没有添加 vector 索引时可忽略。

### 运行

```bash
cd client
pnpm i
pnpm dev
```

### 镜像打包

```bash
docker build -t dockername/fastgpt .
```

## 创建拉取请求

在进行更改后，打开一个拉取请求（PR）。提交拉取请求后，FastGPT 团队/社区的其他人将与您一起审查它。

如果遇到问题，比如合并冲突或不知道如何打开拉取请求，请查看 GitHub 的[拉取请求教程](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests)，了解如何解决合并冲突和其他问题。一旦您的 PR 被合并，您将自豪地被列为[贡献者表](https://github.com/labring/FastGPT/graphs/contributors)中的一员。

## 加入社区

遇到困难了吗？有任何问题吗? 加入微信群与开发者和用户保持沟通。

<center><image width="400px" src="/wechat-fastgpt.webp" /></center>
