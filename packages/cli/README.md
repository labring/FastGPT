# @fastgpt/cli

FastGPT 官方命令行工具（`0.1.0-alpha.1`），当前包含双轨认证、配置管理、身份探测与诊断能力。

> 要求 Node.js `~24.22.2`、pnpm `10.x`（仓库内工作区开发）。

## 快速开始

```bash
# 构建 CLI 产物（tsdown 或 Bun 二选一）
pnpm --filter @fastgpt/cli build:tsdown
# 或编译为独立可执行文件（输出到 dist/ 与 bin/）
pnpm --filter @fastgpt/cli compile

# 查看帮助
node packages/cli/dist/cli.mjs --help

# 交互登录（内置 localhost:3000 / cloud.fastgpt.cn / cloud.fastgpt.io 与自定义地址选项；支持密码 + 2FA、API Key、Session Token）
node packages/cli/dist/cli.mjs login

# 无交互登录（CI / Agent）
printf '%s\n' "$FASTGPT_API_KEY" | node packages/cli/dist/cli.mjs login --base-url https://cloud.fastgpt.cn --api-key-stdin

# 查看当前身份与环境诊断
node packages/cli/dist/cli.mjs whoami
node packages/cli/dist/cli.mjs doctor
```

## 命令一览

| 命令 | 说明 | 关键参数 |
|---|---|---|
| `login` | 登录并保存 Profile 与密钥 | `--api-key-stdin`, `--token-stdin`, `--username`, `--password-stdin`, `--language`, `--no-switch` |
| `logout`（`auth logout`） | 退出登录并清理本地凭据 | `--local`, `--purge` |
| `whoami` | 查询当前凭据主体、团队、权限与配额 | `--no-cache-update` |
| `auth status` | 查看本地 Profile 与可选实时校验 | `--verify` |
| `auth list` | 列出所有已配置 Profile | — |
| `auth switch [profile]` | 切换当前默认 Profile | — |
| `auth switch-team [teamId]` | 切换当前会话团队（Pro 版） | `--team-id <teamId>` |
| `config list` | 查看全部配置 | — |
| `config get <key>` | 读取配置项（`currentProfile` / `baseUrl` / `allowInsecureHttp`） | — |
| `config set <key> <value>` | 更新配置项 | — |
| `doctor` | 检查运行时、存储权限、服务可达性与能力矩阵 | — |
| `commands` | 输出命令注册表元数据（供 Agent 自发现） | — |

## 全局选项与环境变量

**优先级**：命令行选项 > 环境变量 > 当前 Profile。同时设置 `FASTGPT_TOKEN` 与 `FASTGPT_API_KEY` 会报冲突错误。

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
