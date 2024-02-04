---
weight: 749
title: "常见开发 & 部署问题"
description: "FastGPT 常见开发 & 部署问题"
icon: upgrade
draft: false
images: []
---

## 错误排查方式

遇到问题先按下面方式排查。

1. `docker ps -a` 查看所有容器运行状态，检查是否全部 running，如有异常，尝试`docker logs 容器名`查看对应日志。
2. 不懂 docker 不要瞎改端口，只需要改`OPENAI_BASE_URL`和`CHAT_API_KEY`即可。
3. 容器都运行正常的，`docker logs 容器名` 查看报错日志
4. 无法解决时，可以找找[Issue](https://github.com/labring/FastGPT/issues)，或新提 Issue，私有部署错误，务必提供详细的日志，否则很难排查。


## 通用问题

### insufficient_user_quota user quota is not enough 

OneAPI 账号的余额不足，默认 root 用户只有 200 刀，可以手动修改。

### xxx渠道找不到

OneAPI 中没有配置该模型渠道。

### 页面中可以正常回复，API 报错

页面中是用 stream=true 模式，所以API也需要设置 stream=true 来进行测试。部分模型接口（国产居多）非 Stream 的兼容有点垃圾。

### Incorrect API key provided: sk-xxxx.You can find your api Key at xxx

OneAPI 的 API Key 配置错误，需要修改`OPENAI_API_KEY`环境变量，并重启容器（先 stop 然后 rm 掉，最后再 up -d 运行一次）。可以`exec`进入容器，`env`查看环境变量是否生效。

## Docker 部署常见问题

### 如何更新？

1. 查看[更新文档](/docs/development/upgrading/intro/)，确认要升级的版本，避免跨版本升级。
2. 修改镜像 tag 到指定版本
3. 执行下面命令会自动拉取镜像：

    ```bash
    docker-compose pull
    docker-compose up -d
    ```

4. 执行初始化脚本（如果有）

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

## 本地开发问题

### TypeError: Cannot read properties of null (reading 'useMemo' )

用 Node18 试试，可能最新的 Node 有问题。 本地开发流程：

1. 根目录: `pnpm i`
2. 复制 `config.json` -> `config.local.json`
3. 复制 `.env.template` -> `.env.local`
4. `cd projects/app`
5. `pnpm dev`