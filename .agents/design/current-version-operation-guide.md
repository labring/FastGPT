# FastGPT 当前 fork 操作指南

## 版本盘点

当前本地仓库：

- 本地路径：`/Users/jeffrey/Documents/AI_Vibe/FastGPT/source`
- 当前分支：`enterprise/internal-hardening`
- 当前提交：`5d94fb520 chore: add enterprise deployment hardening baseline`
- fork remote：`https://github.com/miraclelu/FastGPT.git`
- upstream fetch：`https://github.com/labring/FastGPT.git`
- upstream push：已禁用，避免误推原仓库

当前部署文件中的稳定版本来自 `deploy/version/v4.14/args.json`：

| 组件 | 镜像版本 |
| --- | --- |
| FastGPT 主服务 | `v4.14.22` |
| fastgpt-code-sandbox | `v4.14.22` |
| fastgpt-mcp_server | `v4.14.22` |
| fastgpt-plugin | `v0.6.2` |
| agent volume-manager | `v0.1.2` |
| agent-sandbox-image | `v0.1.2` |
| AIProxy | `v0.5.8` |
| MongoDB | `5.0.32` |
| Redis | `7.2-alpine` |
| PgVector | `0.8.0-pg15` |
| MinIO | `RELEASE.2025-09-07T16-13-09Z` |

`deploy/version/main/args.json` 已指向 `v4.15.0-beta1`，属于 beta 路径。企业内部正式使用建议先以 `v4.14` 稳定部署文件为准，上线前再确认 upstream release 和迁移说明。

## 目录入口

| 路径 | 用途 |
| --- | --- |
| `README.md` | 官方快速介绍 |
| `deploy/version/v4.14/` | 稳定版部署模板来源 |
| `document/public/deploy/docker/v4.14/global/docker-compose.pg.yml` | 当前生成好的 global + PgVector Docker Compose |
| `deploy/dev/docker-compose.yml` | 本地开发依赖服务，不包含 FastGPT 主服务 |
| `projects/app/.env.template` | FastGPT 主服务完整环境变量样板 |
| `deploy/enterprise/` | 本 fork 新增的企业内部部署安全基线 |
| `.agents/issue/enterprise-internal-hardening.md` | 企业内部强化问题分析 |
| `.agents/design/enterprise-internal-hardening.md` | 企业内部强化设计与 TODO |

## 适用场景

### POC 或功能验证

可以使用官方 Docker Compose 快速跑起来，重点验证：

1. 知识库导入与检索质量。
2. 工作流编排是否覆盖内部流程。
3. 模型供应商、AIProxy、费用和延迟。
4. 插件、MCP、沙盒是否真的需要启用。

### 企业内部正式使用

不要直接使用官方示例默认值。必须先完成：

1. 更换所有默认密码和 token。
2. 配置 HTTPS 域名、对象存储外部地址、CORS allowlist。
3. 启用 IP 限流、内网 IP 检查、可信反向代理校验。
4. 收敛外露端口，只保留 Web 入口给用户访问。
5. 建立数据库备份、日志留存、升级演练。

## 本地 POC 快速启动

以下方式适合临时验证，不适合生产。

```bash
cd /Users/jeffrey/Documents/AI_Vibe/FastGPT/source
mkdir -p /tmp/fastgpt-poc
cp document/public/deploy/docker/v4.14/global/docker-compose.pg.yml /tmp/fastgpt-poc/docker-compose.yml
cd /tmp/fastgpt-poc
```

准备 `config.json`。官方 compose 会挂载 `./config.json:/app/data/config.json`，必须保证该文件存在。可以从官方安装脚本或文档下载，也可以后续把配置管理纳入企业部署目录。

启动：

```bash
docker compose up -d
docker compose ps
```

访问：

```text
http://localhost:3000
```

默认账号：

```text
username: root
password: 1234
```

首次进入后配置模型。至少需要配置语言模型和索引模型，否则知识库和对话无法正常工作。

停止：

```bash
docker compose down
```

清理数据卷会删除数据库和对象存储数据，只能用于 POC：

```bash
docker compose down -v
```

## 企业内部部署前检查

本 fork 已新增企业部署安全基线：

```bash
cd /Users/jeffrey/Documents/AI_Vibe/FastGPT/source
cp deploy/enterprise/.env.example deploy/enterprise/.env.enterprise
```

生成密钥：

```bash
openssl rand -base64 48
```

替换 `deploy/enterprise/.env.enterprise` 中所有 `<...>` 占位符，再执行检查：

```bash
pnpm security:check-env deploy/enterprise/.env.enterprise
```

检查脚本会拦截：

1. 未替换的占位符。
2. `1234`、`123456`、`token`、`fastgptsecret`、`minioadmin` 等弱默认值。
3. 生产域名未使用 HTTPS。
4. 使用 localhost、127.0.0.1、0.0.0.0 作为外部入口。
5. 未启用 `USE_IP_LIMIT`、`CHECK_INTERNAL_IP`、`TRUSTED_PROXY_ENABLE`、`SANDBOX_CHECK_INTERNAL_IP`。
6. 未配置 `TRUSTED_PROXY_IPS` 或 CORS allowlist。

`.env.enterprise` 不要提交到 Git。

## 正式部署建议

推荐先复制官方 PgVector compose，作为企业部署版本的起点：

```bash
mkdir -p deploy/runtime
cp document/public/deploy/docker/v4.14/global/docker-compose.pg.yml deploy/runtime/docker-compose.yml
```

上线前必须把以下内容改成环境变量或 secret 注入：

| 配置 | 官方示例值 | 处理方式 |
| --- | --- | --- |
| root 密码 | `1234` | 改为临时高强度密码 |
| ROOT_KEY | `fastgpt-xxx` | 改为高强度 secret |
| TOKEN_KEY | `fastgpt` | 改为高强度 secret |
| FILE_TOKEN_KEY | `filetokenkey` | 改为高强度 secret |
| AES256_SECRET_KEY | `fastgptsecret` | 改为高强度 secret |
| Mongo 密码 | `mypassword` | 改为高强度密码 |
| Redis 密码 | `mypassword` | 改为高强度密码 |
| PostgreSQL 密码 | `password` | 改为高强度密码 |
| MinIO 账号密码 | `minioadmin` | 改为高强度账号密码 |
| plugin token | `token` | 改为高强度 token |
| code sandbox token | `codesandbox` | 改为高强度 token |
| volume manager token | `vmtoken` | 改为高强度 token |
| AIProxy token | `token` | 改为高强度 token |

生产环境建议只对外暴露：

1. FastGPT Web 入口，经过 HTTPS 反向代理。
2. 必要时暴露对象存储下载域名，最好与主域名隔离。

不建议直接对用户网段暴露：

1. MongoDB `27017`
2. PostgreSQL `5432`
3. Redis `6379`
4. MinIO console `9001`
5. 插件服务
6. 沙盒服务
7. AIProxy 管理入口
8. MCP server，除非有明确调用方和认证边界

## 模型配置

FastGPT 启动后需要配置模型。常见路径：

1. 登录 root。
2. 进入账号或系统的模型供应商配置页面。
3. 配置语言模型。
4. 配置索引模型。
5. 如使用 AIProxy，确认 `AIPROXY_API_ENDPOINT` 和 `AIPROXY_API_TOKEN` 与 AIProxy 的 `ADMIN_KEY` 一致。

企业内部建议先明确：

1. 模型数据是否允许出境。
2. 是否使用 Azure OpenAI、私有模型网关或本地模型。
3. embedding 维度是否与向量库索引一致。
4. 是否需要内容审查或敏感词策略。

## 知识库与 RAG 操作

POC 建议流程：

1. 建立一个部门级知识库。
2. 导入少量高质量文档，优先使用 PDF、DOCX、MD、CSV、XLSX。
3. 在知识库单点搜索中验证召回。
4. 建立一个应用，绑定知识库。
5. 调整检索参数、重排模型、引用显示。
6. 收集错误回答样本，回到文档切块和检索配置修正。

正式使用时要补充：

1. 文档来源和同步责任人。
2. 敏感资料分类。
3. 知识库更新周期。
4. 删除和失效流程。
5. 对话日志保留策略。

## 沙盒与插件使用

当前 compose 默认包含：

1. `fastgpt-code-sandbox`
2. `opensandbox-server`
3. `fastgpt-volume-manager`
4. `fastgpt-plugin`
5. `fastgpt-mcp-server`

如果只是普通知识库问答，第一阶段可以先关闭不需要的沙盒、MCP 或部分插件能力，降低攻击面。

如果启用沙盒：

1. `CHECK_INTERNAL_IP` 和 `SANDBOX_CHECK_INTERNAL_IP` 必须为 `true`。
2. 限制请求次数、超时、响应大小和模块白名单。
3. 避免沙盒容器访问企业核心内网。
4. 对 Docker socket 挂载保持警惕，能不用就不用，必须用时隔离宿主机。

## 日常运维命令

查看服务：

```bash
docker compose ps
```

查看主服务日志：

```bash
docker compose logs -f fastgpt-app
```

查看数据库、对象存储和沙盒日志：

```bash
docker compose logs -f fastgpt-mongo fastgpt-vector fastgpt-redis fastgpt-minio
docker compose logs -f fastgpt-code-sandbox fastgpt-plugin opensandbox-server
```

重启主服务：

```bash
docker compose restart fastgpt-app
```

拉取新镜像并重启：

```bash
docker compose pull
docker compose up -d
```

检查容器健康：

```bash
docker compose ps --format json
```

## 升级流程

升级前：

1. 阅读对应版本升级文档和 release notes。
2. 备份 MongoDB、向量库、Redis 持久化数据、MinIO bucket。
3. 记录当前镜像 tag 和 `config.json`。
4. 在 staging 环境演练升级。

升级部署模板：

1. 修改 `deploy/version/v4.14/args.json` 的 tag。
2. 执行：

```bash
pnpm gen:deploy
```

3. 检查生成的 `document/public/deploy/docker/v4.14/` 文件差异。
4. 将差异同步到企业部署 runtime compose。
5. 执行安全检查和 staging 验证。

## Git 操作

同步 upstream：

```bash
git fetch upstream
git switch enterprise/internal-hardening
git merge upstream/main
```

推送 fork：

```bash
git push origin enterprise/internal-hardening
```

查看当前改动：

```bash
git status --short --branch
git diff --stat
```

## 当前待办

1. 增加 `deploy/runtime/docker-compose.enterprise.yml`，把官方弱默认值全部改为 `${ENV}` 注入。
2. 让 `deploy/enterprise/.env.example` 能直接驱动 runtime compose。
3. 增加 CI workflow，自动跑 `pnpm security:check-env`。
4. 补 SSO/OAuth/SAML 接入说明。
5. 补备份恢复 runbook。
6. 补日志、审计、敏感字段脱敏策略。
