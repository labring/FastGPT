---
title: 'Docker Compose 快速部署'
description: '使用 Docker Compose 快速部署 FastGPT'
icon: ''
draft: false
toc: true
weight: 707
---

## 推荐配置

{{< table "table-hover table-striped-columns" >}}
| 环境 | 最低配置（单节点） | 推荐配置 |
| ---- | ---- | ---- |
| 测试 | 2c2g  | 2c4g |
| 100w 组向量 | 4c8g 50GB | 4c16g 50GB |
| 500w 组向量 | 8c32g | 16c64g 200GB |
{{< /table >}}

## 部署架构图

![](/imgs/sealos-fastgpt.webp)


### 1. 准备好代理环境（国外服务器可忽略）

确保可以访问 OpenAI，具体方案可以参考：[代理方案](/docs/development/proxy/)。或直接在 Sealos 上 [部署 OneAPI](/docs/development/one-api)，既解决代理问题也能实现多 Key 轮询、接入其他大模型。

### 2. 多模型支持

FastGPT 使用了 one-api 项目来管理模型池，其可以兼容 OpenAI 、Azure 、国内主流模型和本地模型等。

可选择 [Sealos 快速部署 OneAPI](/docs/development/one-api)，更多部署方法可参考该项目的 [README](https://github.com/songquanpeng/one-api)，也可以直接通过以下按钮一键部署：

<a href="https://template.cloud.sealos.io/deploy?templateName=one-api" rel="external" target="_blank"><img src="https://cdn.jsdelivr.net/gh/labring-actions/templates@main/Deploy-on-Sealos.svg" alt="Deploy on Sealos"/></a>

## 一、安装 Docker 和 docker-compose

{{< tabs tabTotal="3" >}}
{{< tab tabName="Linux" >}}
{{< markdownify >}}

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | bash -s docker --mirror Aliyun
systemctl enable --now docker
# 安装 docker-compose
curl -L https://github.com/docker/compose/releases/download/v2.20.3/docker-compose-`uname -s`-`uname -m` -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
# 验证安装
docker -v
docker-compose -v
# 如失效，自行百度~
```

{{< /markdownify >}}
{{< /tab >}}
{{< tab tabName="MacOS" >}}
{{< markdownify >}}
推荐直接使用 [Orbstack](https://orbstack.dev/)。可直接通过 Homebrew 来安装：

```bash
brew install orbstack
```

或者直接[下载安装包](https://orbstack.dev/download)进行安装。
{{< /markdownify >}}
{{< /tab >}}
{{< tab tabName="Windows" >}}
{{< markdownify >}}

我们建议将源代码和其他数据绑定到 Linux 容器中时，将其存储在 Linux 文件系统中，而不是 Windows 文件系统中。

可以选择直接[使用 WSL 2 后端在 Windows 中安装 Docker Desktop](https://docs.docker.com/desktop/wsl/)。

也可以直接[在 WSL 2 中安装命令行版本的 Docker](https://nickjanetakis.com/blog/install-docker-in-wsl-2-without-docker-desktop)。

{{< /markdownify >}}
{{< /tab >}}
{{< /tabs >}}

## 二、创建目录并下载 docker-compose.yml

依次执行下面命令，创建 FastGPT 文件并拉取`docker-compose.yml`和`config.json`，执行完后目录下会有 2 个文件。

非 Linux 环境或无法访问外网环境，可手动创建一个目录，并下载下面2个链接的文件: [docker-compose.yml](https://github.com/labring/FastGPT/blob/main/files/deploy/fastgpt/docker-compose.yml),[config.json](https://github.com/labring/FastGPT/blob/main/projects/app/data/config.json)

**注意: `docker-compose.yml` 配置文件中 Mongo 为 5.x，部分服务器不支持，需手动更改其镜像版本为 4.4.24**（需要自己在docker hub下载，阿里云镜像没做备份）

```bash
mkdir fastgpt
cd fastgpt
curl -O https://raw.githubusercontent.com/labring/FastGPT/main/files/deploy/fastgpt/docker-compose.yml
curl -O https://raw.githubusercontent.com/labring/FastGPT/main/projects/app/data/config.json
```

## 三、启动容器

在 docker-compose.yml 同级目录下执行。请确保`docker-compose`版本最好在2.17以上，否则可能无法执行自动化命令。

```bash
# 启动容器
docker-compose up -d
# 等待10s，OneAPI第一次总是要重启几次才能连上Mysql
sleep 10
# 重启一次oneapi(由于OneAPI的默认Key有点问题，不重启的话会提示找不到渠道，临时手动重启一次解决，等待作者修复)
docker restart oneapi
```

## 四、打开 OneAPI 添加模型

可以通过`ip:3001`访问OneAPI，默认账号为`root`密码为`123456`。

在OneApi中添加合适的AI模型渠道。[点击查看相关教程](/docs/development/one-api/)

## 五、访问 FastGPT

目前可以通过 `ip:3000` 直接访问(注意防火墙)。登录用户名为 `root`，密码为`docker-compose.yml`环境变量里设置的 `DEFAULT_ROOT_PSW`。

如果需要域名访问，请自行安装并配置 Nginx。

首次运行，会自动初始化 root 用户，密码为 `1234`（与环境变量中的`DEFAULT_ROOT_PSW`一致），日志里会提示一次`MongoServerError: Unable to read from a snapshot due to pending collection catalog changes;`可忽略。

## FAQ

### Mongo 副本集自动初始化失败

最新的 docker-compose 示例优化 Mongo 副本集初始化，实现了全自动。目前在 unbuntu20,22 centos7, wsl2, mac, window 均通过测试。如果你的环境特殊，可以手动初始化副本集：

1. 终端中执行下面命令，创建mongo密钥：

```bash
openssl rand -base64 756 > ./mongodb.key
chmod 600 ./mongodb.key
# 修改密钥权限，部分系统是admin，部分是root
chown 999:root ./mongodb.key
```

2. 修改 docker-compose.yml，挂载密钥
  
```yml
mongo:
  #  image: mongo:5.0.18
  # image: registry.cn-hangzhou.aliyuncs.com/fastgpt/mongo:5.0.18 # 阿里云
  container_name: mongo
  ports:
    - 27017:27017
  networks:
    - fastgpt
  command: mongod --keyFile /data/mongodb.key --replSet rs0
  environment:
    # 默认的用户名和密码，只有首次允许有效
    - MONGO_INITDB_ROOT_USERNAME=myusername
    - MONGO_INITDB_ROOT_PASSWORD=mypassword
  volumes:
    - ./mongo/data:/data/db
    - ./mongodb.key:/data/mongodb.key
```

3. 重启服务

```bash
docker-compose down
docker-compose up -d
```

4. 进入容器执行副本集合初始化

```bash
# 查看 mongo 容器是否正常运行
docker ps 
# 进入容器
docker exec -it mongo bash

# 连接数据库（这里要填Mongo的用户名和密码）
mongo -u myusername -p mypassword --authenticationDatabase admin

# 初始化副本集。如果需要外网访问，mongo:27017 。如果需要外网访问，需要增加Mongo连接参数：directConnection=true
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "mongo:27017" }
  ]
})
# 检查状态。如果提示 rs0 状态，则代表运行成功
rs.status()
```

### 如何修改API地址和密钥

默认是写了OneAPi的连接地址和密钥，可以通过修改`docker-compose.yml`中，fastgpt容器的环境变量实现。


`OPENAI_BASE_URL`（API 接口的地址，需要加/v1）
`CHAT_API_KEY`（API 接口的凭证）。

修改完后重启：

```bash
docker-compose down
docker-compose up -d
```

### 如何更新版本？

1. 查看[更新文档](/docs/development/upgrading/intro/)，确认要升级的版本，避免跨版本升级。
2. 修改镜像 tag 到指定版本
3. 执行下面命令会自动拉取镜像：

    ```bash
    docker-compose pull
    docker-compose up -d
    ```

4. 执行初始化脚本（如果有）

### 如何自定义配置文件？

修改`config.json`文件，并执行`docker-compose down`再执行`docker-compose up -d`重起容器。具体配置，参考[配置详解](/docs/development/configuration)。

### 如何检查自定义配置文件是否挂载

1. `docker logs fastgpt` 可以查看日志，在启动容器后，第一次请求网页，会进行配置文件读取，可以看看有没有读取成功以及有无错误日志。
2. `docker exec -it fastgpt sh` 进入 FastGPT 容器，可以通过`ls data`查看目录下是否成功挂载`config.json`文件。可通过`cat data/config.json`查看配置文件。

**可能不生效的原因**

1. 挂载目录不正确
2. 配置文件不正确，日志中会提示`invalid json`，配置文件需要是标准的 JSON 文件。
3. 修改后，没有`docker-compose down`再`docker-compose up -d`，restart是不会重新挂载文件的。

### 如何检查环境变量是否正常加载

1. `docker exec -it fastgpt sh` 进入 FastGPT 容器。
2. 直接输入`env`命令查看所有环境变量。


### 为什么无法连接`本地模型`镜像。

`docker-compose.yml`中使用了桥接的模式建立了`fastgpt`网络，如想通过0.0.0.0或镜像名访问其它镜像，需将其它镜像也加入到网络中。

### 端口冲突怎么解决？

docker-compose 端口定义为：`映射端口:运行端口`。

桥接模式下，容器运行端口不会有冲突，但是会有映射端口冲突，只需将映射端口修改成不同端口即可。

如果`容器1`需要连接`容器2`，使用`容器2:运行端口`来进行连接即可。

（自行补习 docker 基本知识）

### relation "modeldata" does not exist

PG 数据库没有连接上/初始化失败，可以查看日志。FastGPT 会在每次连接上 PG 时进行表初始化，如果报错会有对应日志。

1. 检查数据库容器是否正常启动
2. 非 docker 部署的，需要手动安装 pg vector 插件
3. 查看 fastgpt 日志，有没有相关报错

### Operation `auth_codes.findOne()` buffering timed out after 10000ms

mongo连接失败，查看mongo的运行状态对应日志。

可能原因：

1. mongo 服务有没有起来（有些 cpu 不支持 AVX，无法用 mongo5，需要换成 mongo4.x，可以docker hub找个最新的4.x，修改镜像版本，重新运行）
2. 连接数据库的环境变量填写错误（账号密码，注意host和port，非容器网络连接，需要用公网ip并加上 directConnection=true）
3. 副本集启动失败。导致容器一直重启。

### 首次部署，root用户提示未注册

日志会有错误提示。大概率是没有启动 Mongo 副本集模式。

### 无法导出知识库、无法使用语音输入/播报

没配置 SSL 证书，无权使用部分功能。