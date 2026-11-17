# @fastgpt/cli

FastGPT 官方命令行工具（`0.1.0-beta.3`），支持双轨认证、配置管理、身份探测、环境诊断、知识库管理、多知识库统一搜索及 App 对话管理。

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
| `chat run`                  | 调用 App，返回 JSON；不传 `chatId` 时创建新对话                  | `--appId`, `--text` / `--messages`, `--file` / `--stdin`, `--chatId`, `--variables`, `--detail`, `--timeoutMs`, `--dry-run` |
| `chat stop`                 | 写入 App 对话停止信号，不等待后台收尾                            | `--appId`, `--chatId`, `--dry-run`                                                                                          |
| `chat init`                 | 读取 App 配置、变量和对话状态，不创建对话                        | `--appId`, `--chatId`                                                                                                       |
| `chat history list`         | 分页查询可访问的 App 对话                                        | `--appId`, `--pageNum`, `--pageSize`, `--offset`, `--source`                                                                |
| `chat history status`       | 批量读取 App 对话生成状态与已读状态                              | `--appId`, `--chatIds <id1,id2>`                                                                                            |
| `chat history mark-read`    | 标记 App 对话已读                                                | `--appId`, `--chatId`, `--dry-run`                                                                                          |
| `chat history update`       | 修改 App 对话标题、自定义标题或置顶状态                          | `--appId`, `--chatId`, `--title`, `--customTitle`, `--top <true\|false>`, `--dry-run`                                       |
| `chat history delete`       | 软删除 App 对话                                                  | `--appId`, `--chatId`, `--yes`, `--dry-run`                                                                                 |
| `chat record list`          | 游标分页读取 App 消息，默认读取最新一页                          | `--appId`, `--chatId`, `--pageSize`, `--prevId` / `--nextId` / `--initialId`                                                |
| `chat record detail`        | 读取 App 某条 AI 回复的详细响应                                  | `--appId`, `--chatId`, `--dataId`                                                                                           |

App 对话命令仅对接 OpenAPI。应用 API Key 可省略 `--appId`，使用其绑定的 App；个人 API Key 和登录态需指定 App。API Key 可用 `--customUid` 指定对话使用者；已启用代理权限的个人 API Key 可用 `--authProxy`，两者互斥。完整参数通过各命令的 `--help` 查看。

`chat record list` 不传游标时读取最新消息，返回的消息按时间正序排列，每次仅查询一页。将 `meta.prevCursor` 传给 `--prevId` 读取更早的轮次，或将 `meta.nextCursor` 传给 `--nextId` 读取更新的轮次；`--initialId` 定位指定 `dataId` 的 AI 回复附近。三个 ID 参数互斥，角色由服务端按方向确定。`--pageSize` 是参考消息条数，为补齐轮次边界，实际返回条数可能略超。

接口直接返回 `prevCursor`、`nextCursor`，CLI 原样放入 `meta`；无对应方向的下一页时为 `null`。

消息详情等业务操作使用 `dataId`；消息中的 `id` 是已弃用的兼容别名。

`chat run` 默认等待最多 300000 毫秒，可用 `--timeoutMs` 调整。HTTP 超时不会主动停止 App；需要停止时另行执行 `chat stop`。生成失败不会自动重试。

## 全局选项与环境变量

**优先级**：命令行选项 > 环境变量 > 当前 Profile。同时设置 `FASTGPT_TOKEN` 与 `FASTGPT_API_KEY` 会报冲突错误。

**JSON 配置覆盖**：显式命令行参数覆盖 `--file` / `--stdin` 中的对应字段，未指定字段保留文件配置。搜索筛选按子字段合并；`--no-rerank` 和 `--no-queryExtension` 会覆盖该功能的整块配置，同次命令中与关闭状态矛盾的子参数仍会报错。

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
