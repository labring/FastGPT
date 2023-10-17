---
title: 'Docker Compose 快速部署'
description: '使用 Docker Compose 快速部署 FastGPT'
icon: ''
draft: false
toc: true
weight: 720
---

## 准备条件

服务器要求：2C2G 起

### 1. 准备好代理环境（国外服务器可忽略）

确保可以访问 OpenAI，具体方案可以参考：[代理方案](/docs/installation/proxy/)。或直接在 Sealos 上 [部署 OneAPI](/docs/installation/one-api)，既解决代理问题也能实现多 Key 轮询、接入其他大模型。

### 2. 多模型支持

FastGPT 使用了 one-api 项目来管理模型池，其可以兼容 OpenAI 、Azure 、国内主流模型和本地模型等。

可选择 [Sealos 快速部署 OneAPI](/docs/installation/one-api)，更多部署方法可参考该项目的 [README](https://github.com/songquanpeng/one-api)，也可以直接通过以下按钮一键部署：

[![](https://fastly.jsdelivr.net/gh/labring-actions/templates@main/Deploy-on-Sealos.svg)](https://cloud.sealos.io/?openapp=system-fastdeploy%3FtemplateName%3Done-api)

## 一、安装 Docker 和 docker-compose

{{< tabs tabTotal="3" >}}
{{< tab tabName="Linux" >}}
{{< markdownify >}}

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | bash -s docker --mirror Aliyun
systemctl enable --now docker
# 安装 docker-compose
curl -L https://github.com/docker/compose/releases/download/2.20.3/docker-compose-`uname -s`-`uname -m` -o /usr/local/bin/docker-compose
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

**注意: `docker-compose.yml` 配置文件中 Mongo 为 5.x，部分服务器不支持，需手动更改其镜像版本为 4.4.24**

```bash
mkdir fastgpt
cd fastgpt
curl -O https://raw.githubusercontent.com/labring/FastGPT/main/files/deploy/fastgpt/docker-compose.yml
curl -O https://raw.githubusercontent.com/labring/FastGPT/main/projects/app/data/config.json
```


## 三、启动容器

修改`docker-compose.yml`中的`OPENAI_BASE_URL`和`CHAT_API_KEY`即可，对应为 API 的地址和 key。

```bash
# 在 docker-compose.yml 同级目录下执行
docker-compose pull
docker-compose up -d
```

## 四、访问 FastGPT

目前可以通过 `ip:3000` 直接访问(注意防火墙)。登录用户名为 `root`，密码为`docker-compose.yml`环境变量里设置的 `DEFAULT_ROOT_PSW`。

如果需要域名访问，请自行安装并配置 Nginx。

## QA

### 如何更新？

执行下面命令会自动拉取最新镜像，一般情况下不需要执行额外操作。

```bash
docker-compose pull
docker-compose up -d
```

### 如何自定义配置文件？

修改`config.json`文件，并执行`docker-compose up -d`重起容器。具体配置，参考[配置详解](/docs/development/configuration)。

### 如何检查自定义配置文件是否挂载

1. `docker logs fastgpt` 可以查看日志，在启动容器后，第一次请求网页，会进行配置文件读取，可以看看有没有读取成功以及有无错误日志。
2. `docker exec -it fastgpt sh` 进入 FastGPT 容器，可以通过`ls data`查看目录下是否成功挂载`config.json`文件。可通过`cat data/config.json`查看配置文件。

**可能不生效的原因**

1. 挂载目录不正确
2. 配置文件不正确，日志中会提示`invalid json`，配置文件需要是标准的 JSON 文件。

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

mongo连接失败，检查
1. mongo 服务有没有起来(有些 cpu 不支持 AVX，无法用 mongo5，需要换成 mongo4.x，可以dockerhub找个最新的4.x，修改镜像版本，重新运行）
2. 环境变量（账号密码，注意host和port）


### 错误排查方式

遇到问题先按下面方式排查。

1. `docker ps -a` 查看所有容器运行状态，检查是否全部 running，如有异常，尝试`docker logs 容器名`查看对应日志。
2. 不懂 docker 不要瞎改端口，只需要改`OPENAI_BASE_URL`和`CHAT_API_KEY`即可。
