# @fastgpt/cli

FastGPT 官方命令行工具（`0.1.0-beta.5`），支持双轨认证、配置管理、身份探测、环境诊断、通用 OpenAPI 逃生口、知识库管理、App 生命周期与日志、对话与反馈、模型目录、工作流本地构建与远端同步、插件与代码沙盒查询，以及内置 Agent Skills 分发。

> 要求 Node.js `~24.22.2`（`>=20.12.0`）、pnpm `10.x`（仓库内工作区开发）。

## 快速开始

```bash
# 构建 CLI 产物（tsdown 或 Bun 二选一）
pnpm --filter @fastgpt/cli build:tsdown
# 或编译为独立可执行文件（输出到 dist/ 与 bin/）
pnpm --filter @fastgpt/cli compile

# 查看帮助与命令发现
node cli/dist/cli.mjs --help
node cli/dist/cli.mjs commands --compact --format json

# 交互登录（内置 localhost:3000 / cloud.fastgpt.cn / cloud.fastgpt.io 与自定义地址选项；支持密码 + 2FA、API Key、Session Token）
node cli/dist/cli.mjs login

# 无交互登录（CI / Agent）
printf '%s\n' "$FASTGPT_API_KEY" | node cli/dist/cli.mjs login --base-url https://cloud.fastgpt.cn --api-key-stdin

# 查看当前身份与环境诊断
node cli/dist/cli.mjs whoami
node cli/dist/cli.mjs doctor
```

## 内置 Agent Skills 与工作流搭建参考

```bash
# 管理随 CLI 打包的 5 套官方 Agent Skills（fastgpt-cli / fastgpt-knowledge / fastgpt-chat / fastgpt-app / fastgpt-workflow）
fastgpt skills catalog --format json
fastgpt skills install --target agents --scope project --dry-run --format json
fastgpt skills doctor --format json

# 读取内置工作流搭建 Skill 与细分参考文档（支持离线与 --format json）
fastgpt workflow-build skills --format text
fastgpt workflow-build skills changesets-and-plans --format text
```

## 命令一览

### 认证、配置、诊断与通用 API

| 命令                        | 说明                                                             | 关键参数                                                                                     |
| --------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `login`                     | 登录并保存 Profile 与密钥                                        | `--api-key-stdin`, `--token-stdin`, `--username`, `--password-stdin`, `--language`, `--no-switch` |
| `logout`（`auth logout`）   | 退出登录并清理本地凭据                                           | `--local`, `--purge`                                                                         |
| `whoami`                    | 查询当前凭据主体、团队、权限与配额                               | `--no-cache-update`                                                                          |
| `auth status`               | 查看本地 Profile 与可选实时校验                                  | `--verify`                                                                                   |
| `auth list`                 | 列出所有已配置 Profile                                           | —                                                                                            |
| `auth switch [profile]`     | 切换当前默认 Profile                                             | —                                                                                            |
| `auth switch-team [teamId]` | 切换当前会话团队（Pro 版）                                       | `--team-id <teamId>`                                                                         |
| `config list`               | 查看全部配置                                                     | —                                                                                            |
| `config get <key>`          | 读取配置项（`currentProfile` / `baseUrl` / `allowInsecureHttp`） | —                                                                                            |
| `config set <key> <value>`  | 更新配置项                                                       | —                                                                                            |
| `doctor`                    | 检查运行时、存储权限、服务可达性与能力矩阵                       | —                                                                                            |
| `commands`                  | 输出命令注册表元数据（供 Agent 自发现）                          | `--compact`, `--command <name>`, `--domain <domain>`, `--risk <level>`                       |
| `api schema [path]`         | 检索或展开缓存/在线 OpenAPI 契约（`system` / `dev`）             | `--source`, `--tag`, `--search`, `--method`, `--refresh`, `--offline`                        |
| `api get\|post\|put\|delete\|call` | 通用 OpenAPI 安全请求入口（默认校验 Schema 与高危确认）    | `--query`, `--query-json`, `--body`, `--file`, `--stdin`, `--header`, `--no-validate`, `--raw`, `--output`, `--overwrite`, `--yes`, `--dry-run` |
| `skills catalog\|install\|uninstall\|update\|doctor` | 列出、安装、更新、检查与受管卸载 5 套官方 Agent Skills | `--all`, `--target`, `--scope`, `--dir`, `--force`, `--yes`, `--dry-run`                     |

### 知识库（`dataset` · 21 条命令）

- **主资源（8）**：`dataset list`、`dataset get`、`dataset create`、`dataset update`、`dataset delete`、`dataset search`（支持 1~100 库联合检索、`mixedRecall`、rerank 与 query extension）、`dataset batch-move`、`dataset batch-delete`。
- **集合（8）**：`dataset collection list`、`dataset collection get`、`dataset collection create`、`dataset collection create-text`、`dataset collection create-link`、`dataset collection create-file`（multipart 上传）、`dataset collection update`、`dataset collection delete`。
- **分块（5）**：`dataset data list`、`dataset data get`、`dataset data push`（单批最多 200 条）、`dataset data update`、`dataset data delete`。

### 应用、日志、插件与沙盒（`app`, `plugin`, `code-sandbox`）

| 命令                                     | 说明                                         | 鉴权要求                               |
| ---------------------------------------- | -------------------------------------------- | -------------------------------------- |
| `app list`                               | 分页检索可访问的应用、团队工具与目录         | `token`, `personalKey`                 |
| `app pull / save / publish / test`       | 拉取草稿/版本到本地工作区、保存、发布与测试  | `token`                                |
| `app run`                                | 调用 App 对话（与 `chat run` 参数一致）      | `token`, `personalKey`, `appKey`       |
| `app logs search / list / users`         | 游标搜索、分页列表与活跃使用者查询           | `token`, `personalKey`, `appKey`       |
| `app logs stats / chart`                 | 应用总览与趋势图表（Pro 版专享）             | `token`, `personalKey`, `appKey`       |
| `app logs export`                        | 导出对话日志 CSV（支持 `--output`/`--overwrite`） | `token`, `appKey`（拦截 `personalKey`） |
| `plugin tool list`                       | 检索画布可用插件系统工具与子工具             | `token`, `personalKey`                 |
| `code-sandbox packages`                  | 查询代码沙盒可用的 JS/Python 依赖与内置全局变量 | `token`                                |

### 对话、反馈与模型（`chat`, `model`）

| 命令                                                         | 说明                                         | 关键参数                                                                                     |
| ------------------------------------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `chat run` / `chat stop` / `chat init`                       | 执行、停止或读取 App 对话配置与状态          | `--appId`, `--text` / `--messages`, `--chatId`, `--variables`, `--detail`, `--timeoutMs`, `--dry-run` |
| `chat history list / status / mark-read / update / delete`   | 分页查询、状态检查、标已读、改名置顶与软删除 | `--appId`, `--chatId`, `--chatIds`, `--pageNum`, `--pageSize`, `--offset`, `--source`, `--top`, `--yes`, `--dry-run` |
| `chat record list / detail`                                  | 游标分页读取对话轮次消息与 AI 回复详情       | `--appId`, `--chatId`, `--dataId`, `--pageSize`, `--prevId` / `--nextId` / `--initialId`     |
| `chat feedback update`                                       | 更新或清空某条 AI 回复的用户赞/踩反馈        | `--appId`, `--chatId`, `--dataId`, `--good`, `--bad`, `--clear`, `--dry-run`                 |
| `model list`                                                 | 查询当前成员可用模型、供应商与默认模型 ID    | `--include-source-member`, `--order-by custom`                                               |

App 对话命令仅对接 OpenAPI。应用 API Key 可省略 `--appId`，使用其绑定的 App；个人 API Key 和登录态需指定 App。API Key 可用 `--customUid` 指定对话使用者；已启用代理权限的个人 API Key 可用 `--authProxy`，两者互斥。`chat record list` 游标直接透传 `meta.prevCursor` / `meta.nextCursor`，消息业务操作统一使用 `dataId`。

### 工作流（`workflow`, `workflow-build`）

- **远端对比与单步调试**：`workflow diff`（对比本地 `workflow.json` 与远端草稿）、`workflow debug`（单轮调试运行，支持 `--variables` / `--history-file` / `--entry-nodes` / `--remote` / `--dry-run`）。
- **本地搭建与校验（`workflow-build`）**：`init`（支持 `--offline`）、`inspect`、`validate`、`import`、`build`、`skills`、`meta show|set`、`config list|get|set|unset`、`variable list|add|update|remove`、`template list|show|load`、`node list|show|add|update|move|insert|clone|remove`、`container children`、`edge list|connect|disconnect|reconnect`、`input list|show|add|remove|set|ref|unset|available`、`output list|add|remove`、`tool list|attach|detach`、`changeset plan|apply`。

## 全局选项与环境变量

**优先级**：命令行选项 > 环境变量 > 当前 Profile。同时设置 `FASTGPT_TOKEN` 与 `FASTGPT_API_KEY` 会报冲突错误。

**JSON 配置覆盖**：显式命令行参数覆盖 `--file` / `--stdin` 中的对应字段，未指定字段保留文件配置。

- **常用全局选项**：`--profile <name>`、`--base-url <url>`、`--token <token>`、`--api-key <key>`、`--allow-insecure-http`、`--insecure`、`--ca-cert <path>`、`--format <text|json>`、`--fields <fields>`、`--pick <path>`、`--raw`、`--no-color`、`--quiet`
- **环境变量**：`FASTGPT_BASE_URL`、`FASTGPT_API_KEY`、`FASTGPT_TOKEN`、`FASTGPT_PROFILE`、`FASTGPT_CONFIG_DIR`、`FASTGPT_SECRET_STORE=file`、`FASTGPT_FORMAT`
- **凭据存储**：元数据保存在 `~/.config/fastgpt/config.json`（`0600`，Windows 为 `%APPDATA%\fastgpt`）；密钥优先写入系统 Keychain（macOS `security` / Linux `secret-tool`），无桌面环境自动降级为 `0600` 权限的 `credentials.json`。

## 输出协议与退出码

- **输出格式**：TTY 默认可读文本；非 TTY（管道 / Agent）自动切换为 JSON 信封（`schemaVersion: "fastgpt-cli-result/v1"`），正常结果走 `stdout`，错误走 `stderr`。
- **退出码**：`0` 成功、`1` 内部错误、`2` 参数或选项错误（含破坏性命令缺 `--yes`）、`3` 认证/权限/配额错误、`4` 服务端业务错误、`5` 网络或 TLS 错误。

## 开发命令

```bash
pnpm --filter @fastgpt/cli build:tsdown  # tsdown 构建 dist/cli.mjs（./scripts/build.tsdown.ts）
pnpm --filter @fastgpt/cli build:bun     # Bun 仅打包 JS 产物到 dist/（./scripts/build.bun.ts）
pnpm --filter @fastgpt/cli compile       # Bun 同时打包 dist/ 并编译单文件二进制到 bin/
pnpm --filter @fastgpt/cli typecheck     # TypeScript 类型检查
pnpm --filter @fastgpt/cli test          # 运行 Vitest 单测
pnpm --filter @fastgpt/cli test:bin      # 构建并执行产物冒烟测试
pnpm --filter @fastgpt/cli check:drift   # 严格检查 Registry / Skill / 四层架构漂移
pnpm --filter @fastgpt/cli lint          # ESLint 检查
```
