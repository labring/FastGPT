# @fastgpt/cli

FastGPT 官方命令行工具（`0.1.0-beta.7`），支持双轨认证、配置管理、身份探测、环境诊断、知识库管理与搜索、Agent/工作流同步与测试、MCP/HTTP 工具集、Skill、头像上传及对话管理。

> 要求 Node.js `~24.22.2`、pnpm `10.x`（仓库内工作区开发）。

## 快速开始

```bash
# 构建 CLI 产物（tsdown 或 Bun 二选一）
pnpm --filter @fastgpt/cli build:tsdown
# 或编译为独立可执行文件（输出到 dist/ 与 bin/）
pnpm --filter @fastgpt/cli compile

# 查看帮助
node cli/dist/cli.mjs --help

# 交互登录（内置 localhost:3000 / cloud.fastgpt.cn / cloud.fastgpt.io 与自定义地址选项；支持密码 + 2FA、API Key、Session Token）
node cli/dist/cli.mjs login

# 无交互登录（CI / Agent）
printf '%s\n' "$FASTGPT_API_KEY" | node cli/dist/cli.mjs login --base-url https://cloud.fastgpt.cn --api-key-stdin

# 查看当前身份与环境诊断
node cli/dist/cli.mjs whoami
node cli/dist/cli.mjs doctor
```

## 工作流搭建参考

```bash
fastgpt workflow-build skills --format text
fastgpt workflow-build skills changesets-and-plans --format text
```

第一个命令读取外部搭建 Skill 和参考目录，第二个命令按 ID 读取单篇 Markdown。两个命令都可离线执行，也支持 `--format json`。

## 命令一览

| 命令                        | 说明                                                             | 关键参数                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `login`                     | 登录并保存 Profile 与密钥                                        | `--api-key-stdin`, `--token-stdin`, `--username`, `--password-stdin`, `--language`, `--no-switch`                           |
| `logout`（`auth logout`）   | 退出登录并清理本地凭据                                           | `--local`, `--purge`                                                                                                        |
| `whoami`                    | 查询当前凭据主体、团队、权限与配额                               | `--no-cache-update`                                                                                                         |
| `auth status`               | 查看本地 Profile 与可选实时校验                                  | `--verify`                                                                                                                  |
| `auth list`                 | 列出所有已配置 Profile                                           | —                                                                                                                           |
| `auth switch [profile]`     | 切换当前默认 Profile                                             | —                                                                                                                           |
| `auth switch-team [teamId]` | 切换当前会话团队（Pro 版）                                       | `--team-id <teamId>`                                                                                                        |
| `config list`               | 查看全部配置                                                     | —                                                                                                                           |
| `config get <key>`          | 读取配置项（`currentProfile` / `baseUrl` / `allowInsecureHttp`） | —                                                                                                                           |
| `config set <key> <value>`  | 更新配置项                                                       | —                                                                                                                           |
| `doctor`                    | 检查运行时、存储权限、服务可达性与能力矩阵                       | —                                                                                                                           |
| `commands`                  | 输出命令注册表元数据（供 Agent 自发现）                          | —                                                                                                                           |
| `agent *`                   | Agent 生命周期、目录、版本、日志、`pull/save/publish/test/run`   | `--id`, `--name`, `--type`, `--dir`, `--text`, `--detail`, `--local` / `--remote`, `--dry-run`, `--yes`                     |
| `tool *`                    | 工具目录、MCP 工具集、HTTP 工具集 CRUD、解析与在线试调用         | `--id`, `--url` / `--target-url`, `--tool` / `--tool-path`, `--header-secret`, `--dry-run`, `--yes`                         |
| `skill *`                   | 平台 Skill 与目录 CRUD 及 `.zip` 导入                            | `--id`, `--name`, `--file`, `--source`, `--parent-id`, `--dry-run`, `--yes`                                                 |
| `file upload-avatar`        | 预签名上传 PNG/JPG/JPEG 头像（自动过期，绑定资源后持久化）       | `[filePath]` / `--file`, `--dry-run`                                                                                        |
| `workflow diff/debug/test`  | 工作流差异对比、单步调试与单步断言用例执行                       | `--id`, `--dir`, `--query`, `--cases`, `--remote`, `--timeout`, `--dry-run`                                                 |
| `chat run` / `agent run`    | 调用已发布 Agent，返回 JSON；不传 `--chat-id` 时创建新对话       | `[agentId]` / `--id`, `--text` / `--messages`, `--file` / `--stdin`, `--chat-id`, `--variables`, `--detail`, `--timeout`, `--dry-run` |
| `chat stop`                 | 写入对话停止信号，不等待后台收尾                                 | `--id`, `--chat-id`, `--dry-run`                                                                                            |
| `chat init`                 | 读取 Agent 配置、变量和对话状态，不创建对话                      | `--id`, `--chat-id`                                                                                                         |
| `chat history list`         | 分页查询可访问的对话                                             | `--id`, `--page`, `--page-size`, `--source`                                                                                 |
| `chat history status`       | 批量读取对话生成状态与已读状态                                   | `--id`, `--chat-ids <id1,id2>`                                                                                              |
| `chat history mark-read`    | 标记对话已读                                                     | `--id`, `--chat-id`, `--dry-run`                                                                                            |
| `chat history update`       | 修改对话标题、自定义标题或置顶状态                               | `--id`, `--chat-id`, `--title`, `--custom-title`, `--top <true\|false>`, `--dry-run`                                        |
| `chat history delete`       | 软删除对话                                                       | `--id`, `--chat-id`, `--yes`, `--dry-run`                                                                                   |
| `chat record list`          | 游标分页读取对话消息，默认读取最新一页                           | `--id`, `--chat-id`, `--page-size`, `--prev-id` / `--next-id` / `--initial-id`                                              |
| `chat record detail`        | 读取某条 AI 回复的详细响应                                       | `--id`, `--chat-id`, `--data-id`                                                                                            |

对话命令对接 OpenAPI。应用 API Key 可省略 `--id`，使用其绑定的应用；个人 API Key 和登录态需指定 `--id`（`agent run` 也支持位置参数 `<agentId>`）。API Key 可用 `--custom-uid` 指定对话使用者；已启用代理权限的个人 API Key 可用 `--auth-proxy`，两者互斥。完整参数通过各命令的 `--help` 查看。

`chat record list` 不传游标时读取最新消息，返回的消息按时间正序排列，每次仅查询一页。将 `meta.prevCursor` 传给 `--prev-id` 读取更早的轮次，或将 `meta.nextCursor` 传给 `--next-id` 读取更新的轮次；`--initial-id` 定位指定 `dataId` 的 AI 回复附近。三个 ID 参数互斥，角色由服务端按方向确定。`--page-size` 是参考消息条数，为补齐轮次边界，实际返回条数可能略超。

接口直接返回 `prevCursor`、`nextCursor`，CLI 原样放入 `meta`；无对应方向的下一页时为 `null`。

消息详情等业务操作使用 `dataId`；消息中的 `id` 是已弃用的兼容别名。

`chat run` 默认等待最多 300000 毫秒，可用 `--timeout` 调整。HTTP 超时不会主动停止应用；需要停止时另行执行 `chat stop`。生成失败不会自动重试。

## 全局选项与环境变量

**优先级**：命令行选项 > 环境变量 > 当前 Profile。同时设置 `FASTGPT_TOKEN` 与 `FASTGPT_API_KEY` 会报冲突错误。

**JSON 配置覆盖**：显式命令行参数覆盖 `--file` / `--stdin` 中的对应字段，未指定字段保留文件配置；高阶检索与对话调优字段可通过 `--file` / `--stdin` 传入。

- **常用全局选项**：`--profile <name>`、`--base-url <url>`、`--token <token>`、`--api-key <key>`、`--allow-insecure-http`、`--insecure`、`--ca-cert <path>`、`--format <text|json>`、`--no-color`、`--quiet`
- **环境变量**：`FASTGPT_BASE_URL`、`FASTGPT_API_KEY`、`FASTGPT_TOKEN`、`FASTGPT_PROFILE`、`FASTGPT_CONFIG_DIR`、`FASTGPT_SECRET_STORE=file`、`FASTGPT_FORMAT`
- **凭据存储**：元数据保存在 `~/.config/fastgpt/config.json`（`0600`，Windows 为 `%APPDATA%\fastgpt`）；密钥优先写入系统 Keychain（macOS `security` / Linux `secret-tool`），无桌面环境自动降级为 `0600` 权限的 `credentials.json`。

## 输出协议与退出码

- **输出格式**：TTY 默认可读文本；非 TTY（管道 / Agent）自动切换为 JSON 信封（`schemaVersion: "fastgpt-cli-result/v1"`），正常结果走 `stdout`，错误走 `stderr`。
- **退出码**：`0` 成功、`1` 内部错误、`2` 参数或选项错误、`3` 认证/权限/配额错误、`4` 服务端业务错误、`5` 网络或 TLS 错误。

## 开发命令

```bash
pnpm --filter @fastgpt/cli build:tsdown  # tsdown 构建 dist/cli.mjs（./scripts/build.tsdown.ts）
pnpm --filter @fastgpt/cli build:bun     # Bun 仅打包 JS 产物到 dist/（./scripts/build.bun.ts）
pnpm --filter @fastgpt/cli compile       # Bun 同时打包 dist/ 并编译单文件二进制到 bin/
pnpm --filter @fastgpt/cli typecheck     # TypeScript 类型检查
pnpm --filter @fastgpt/cli test          # 运行 Vitest 单测
pnpm --filter @fastgpt/cli lint          # ESLint 检查
```
