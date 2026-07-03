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
- 如果宿主机已有反向代理、域名或云厂商防火墙，先完成本机部署验证，再提醒用户开放或映射 `3000`、`9000`、`3003`。

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

   非交互模式会默认选择最新稳定版本、国内镜像源、`PostgreSQL + pgvector`、自动随机密钥，并把 S3/MCP 地址设置为检测到的第一个主 IP。

   如果用户明确给了公网域名或固定 IP，用环境变量覆盖 endpoint：

   ```bash
   FASTGPT_NON_INTERACTIVE=true \
   FASTGPT_S3_ENDPOINT=https://s3.example.com:9000 \
   FASTGPT_MCP_ENDPOINT=https://mcp.example.com:3003 \
   bash install.sh
   ```

   可选覆盖项：
   - `FASTGPT_DEPLOY_VERSION`：部署版本，例如 `v4.15` 或 `main`。
   - `FASTGPT_REGION`：镜像源，`cn` 或 `global`。
   - `FASTGPT_VECTOR`：向量库，`pg`、`milvus`、`zilliz`、`oceanbase` 或 `seekdb`。
   - `FASTGPT_AUTO_GENERATE_CREDENTIALS`：是否自动随机密钥，默认 `true`。
   - `FASTGPT_LOCAL_COMPOSE_PATH`：使用本地 `docker-compose.yml`。

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
   - `fastgpt-minio`
   - `fastgpt-plugin`
   - `fastgpt-aiproxy`

6. 验证访问：

   ```bash
   curl -I http://localhost:3000
   ```

   如果用户提供了公网 IP 或域名，也验证对应地址。浏览器访问地址通常是 `http://<服务器地址>:3000`。

## 常见问题处理

- 端口冲突：用 `docker compose ps` 和 `docker compose logs` 确认冲突端口，修改 `docker-compose.yml` 左侧宿主机端口，例如 `3001:3000`，再运行 `docker compose up -d`。
- S3 地址错误：检查 `STORAGE_EXTERNAL_ENDPOINT`，必须是客户端和 FastGPT 容器都能访问的地址，不能是 `127.0.0.1` 或 `localhost`。
- Mongo 启动失败且日志出现 `Illegal instruction`：CPU 可能不支持 AVX，把 Mongo 镜像切换为 4.x 版本后重建相关容器。
- 数据库或向量库未就绪：先看对应容器日志，不要删除数据卷；只有确认是首次失败且没有有效数据时，才建议用户清理数据卷重试。
- 配置文件改动后：运行 `docker compose up -d` 让 Compose 应用变更；必要时只重启相关服务。

## 最终回复

使用用户的语言习惯回复。如果用户使用中文提问，用中文返回；如果用户使用英文提问，用英文返回；如果用户混合使用多种语言，优先使用用户主要使用的语言。

完全成功后，返回：

- FastGPT 访问地址，例如 `http://<服务器地址>:3000`。
- 登录账号：`root`。
- 登录密码：脚本输出的随机密码，或 `docker-compose.yml` 中的 `DEFAULT_ROOT_PSW`。
- 已开放或需要开放的端口：`3000`、`9000`、`3003`。
- 下一步动作：登录后到 `账号-模型提供商` 配置语言模型和索引模型；如需使用系统插件，到插件市场安装；如需公网 HTTPS，配置域名和反向代理。

如果未完全成功，返回当前卡住的容器、关键日志、已尝试的修复动作和下一步需要用户确认的事项。
