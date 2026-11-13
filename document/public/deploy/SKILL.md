---
name: fastgpt-docker-deploy
description: FastGPT Docker Compose self-hosting deployment workflow. Use when a user asks an AI agent to deploy FastGPT with Docker by referencing /deploy/SKILL.md, including creating an empty fastgpt directory, running the install script in non-interactive mode, starting Docker Compose, monitoring service health, troubleshooting compose issues, and returning the access URL plus root credentials and next steps.
---

# FastGPT Docker 部署

## 目标

在一台已有终端访问权限的 Linux、macOS 或 Windows WSL 服务器上，通过 FastGPT 官方交互式脚本生成 Docker Compose 配置，启动服务，确认 FastGPT 可访问，最后把访问地址、账号、密码和下一步动作交给用户。

## 工作边界

- 优先使用官方脚本：`https://doc.fastgpt.cn/deploy/install.sh`。
- 默认使用脚本非交互模式：国内镜像源、自动随机密钥、检测到的第一个主 IP、`PostgreSQL + pgvector` 向量库。
- 不要覆盖用户已有的 `docker-compose.yml` 或数据卷，除非用户明确同意。
- 不要在公开输出里泄露除 `root` 初始登录密码外的服务 Token、数据库密码或应用密钥。
- 如果宿主机已有反向代理、域名或云厂商防火墙，先完成本机部署验证，再提醒用户开放或映射脚本最终输出的宿主机端口。默认 FastGPT 为 `3000`，OpenSandbox Proxy（`main`）与 `v4.16` 历史 Sandbox Proxy 宿主机默认均为 `3006`（容器内端口 `1006`）；仅旧版外部 S3 下载链路还需要开放 `9000`。

## 部署流程

1. 检查运行环境：

   ```bash
   docker -v
   docker compose version
   curl --version
   ```

   如果 Docker 或 Compose 不存在，先向用户说明缺失项。只有在用户授权安装系统软件时，才安装 Docker。

2. 创建空的 `fastgpt` 部署目录：

   ```bash
   mkdir -p ~/fastgpt
   cd ~/fastgpt
   if [ -n "$(ls -A .)" ]; then
     echo "当前目录非空，请先确认是否继续或改用新的空目录。"
     exit 1
   fi
   ```

   如果目录非空，先读取文件和 `docker compose ps` 判断是否已有部署，不要直接覆盖。让用户确认继续使用当前目录、备份旧文件，或改用新的空目录。

3. 下载并运行官方脚本：

   ```bash
   curl -fsSL https://doc.fastgpt.cn/deploy/install.sh -o install.sh
   FASTGPT_NON_INTERACTIVE=true bash install.sh
   ```

   非交互模式会默认选择最新稳定版本、国内镜像源、`PostgreSQL + pgvector`、自动随机密钥。必须提供用户访问地址 `FASTGPT_FE_DOMAIN`；非本机回环部署时还需提供浏览器可访问的 OpenSandbox Proxy 基地址 `FASTGPT_SANDBOX_PROXY_URL`（如 `https://sandbox.example.com` 或 `http://192.168.1.10:3006`，自动同时承载终端 WS `/terminal` 与文件预览 `/preview`；`v4.16` 历史版本则需同时提供 `ws(s)://` 的 `FASTGPT_SANDBOX_PROXY_URL` 与 `http(s)://` 的 `FASTGPT_SANDBOX_PREVIEW_PROXY_URL`）。当前版本的默认 `short-proxy` 下载模式不需要配置外部 S3 地址。

   `FASTGPT_S3_ENDPOINT` 仅用于仍包含 `STORAGE_EXTERNAL_ENDPOINT` 的本地旧版 Compose。

   可选覆盖项：
   - `FASTGPT_DEPLOY_VERSION`：部署版本，`main`（v4.17）或 `v4.16`。
   - `FASTGPT_REGION`：镜像源，`cn` 或 `global`。
   - `FASTGPT_VECTOR`：向量库，`pg`、`milvus`、`zilliz`、`oceanbase` 或 `seekdb`。
   - `FASTGPT_AUTO_GENERATE_CREDENTIALS`：是否自动随机密钥，默认 `true`。
   - `FASTGPT_LOCAL_COMPOSE_PATH`：使用本地 `docker-compose.yml`。
   - `FASTGPT_PORT`：FastGPT 宿主机端口，默认 `3000`；仅修改 `fastgpt-app` 的宿主机映射。
   - `FASTGPT_SANDBOX_PROXY_PORT`：OpenSandbox Proxy 宿主机端口，`main` 与 `v4.16` 历史版本默认均为 `3006`（映射到容器 `1006`）；仅修改对应 Proxy 服务的宿主机映射。

   `FASTGPT_FE_DOMAIN`、`FASTGPT_SANDBOX_PROXY_URL` 和预览地址是浏览器访问地址，与上述宿主机端口独立。使用反向代理时，即使公网地址使用 `:443`，也不会把 Compose 上游端口改成 `443`。

   记录脚本最终输出中的 `root` 登录密码和提示的访问地址。

4. 启动服务：

   ```bash
   docker compose up -d
   ```

   如果脚本提示需要先预热 OpenSandbox 镜像，先执行脚本输出的 `docker compose --profile prepull pull ...` 命令，再启动服务。

5. 监听运行状态：

   ```bash
   docker compose ps
   docker compose logs --tail=120 fastgpt-app
   ```

   等待核心服务变为 running 或 healthy。重点检查：
   - `fastgpt-app`
   - `fastgpt-mongo`
   - `fastgpt-redis`
   - `fastgpt-vector`
   - `fastgpt-rustfs`
   - `fastgpt-plugin`
   - `fastgpt-aiproxy`

6. 验证访问：

   ```bash
   curl -I http://localhost:3000
   ```

   如果用户设置了 `FASTGPT_PORT`，将命令中的 `3000` 替换为脚本输出的 FastGPT 宿主机端口；如果用户提供了公网 IP 或域名，也验证对应地址。浏览器访问地址应以 `FASTGPT_FE_DOMAIN` 为准。

## 常见问题处理

- 端口冲突：用 `docker compose ps` 和 `docker compose logs` 确认冲突端口，设置 `FASTGPT_PORT` 或 `FASTGPT_SANDBOX_PROXY_PORT` 重新运行脚本，或修改 `docker-compose.yml` 左侧宿主机端口（例如 `3001:3000`），再运行 `docker compose up -d`。
- 旧版 S3 地址错误：仅自定义旧版 Compose 需要检查 `STORAGE_EXTERNAL_ENDPOINT`；该地址必须同时可被客户端和 FastGPT 容器访问，不能是 `127.0.0.1` 或 `localhost`。
- Mongo 启动失败且日志出现 `Illegal instruction`：CPU 可能不支持 AVX，把 Mongo 镜像切换为 4.x 版本后重建相关容器。
- 数据库或向量库未就绪：先看对应容器日志，不要删除数据卷；只有确认是首次失败且没有有效数据时，才建议用户清理数据卷重试。
- 配置文件改动后：运行 `docker compose up -d` 让 Compose 应用变更；必要时只重启相关服务。

## 最终回复

使用用户的语言习惯回复。如果用户使用中文提问，用中文返回；如果用户使用英文提问，用英文返回；如果用户混合使用多种语言，优先使用用户主要使用的语言。

完全成功后，返回：

- FastGPT 访问地址：脚本中设置的 `FASTGPT_FE_DOMAIN`。
- 登录账号：`root`。
- 登录密码：以脚本最终输出为准。支持账号激活的新版本初始密码为 `123456`，首次登录会强制要求修改密码（请提示用户提前准备新密码）；旧版本则为脚本输出的随机密码或 `docker-compose.yml` 中的 `DEFAULT_ROOT_PSW`。
- 已开放或需要开放的宿主机端口：以脚本最终输出的 FastGPT/OpenSandbox Proxy 映射为准（默认 `3000`、`3006`；MCP 为 `3003`）；仅旧版外部 S3 下载链路还需要 `9000`。
- 下一步动作：登录后到 `管理员-模型提供商` 配置语言模型和索引模型；如需使用系统插件，到插件市场安装；如需公网 HTTPS，配置域名和反向代理。

如果未完全成功，返回当前卡住的容器、关键日志、已尝试的修复动作和下一步需要用户确认的事项。
