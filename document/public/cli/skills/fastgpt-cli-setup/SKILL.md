---
name: fastgpt-cli-setup
description: Install, initialize, diagnose, and safely operate the official FastGPT CLI (@fastgpt/cli). Use when a user asks an AI agent (Codex, Claude Code, Cursor, Windsurf) to install FastGPT CLI, sign in, check health with doctor, discover capabilities, or automate FastGPT dataset/resource workflows.
---

# FastGPT CLI 智能体初始化与高效操作规范 (Agent Skill)

本 Skill 供 AI 编程助手（Codex、Claude Code、Cursor、Windsurf 等）自动完成 FastGPT 官方 CLI（`fastgpt`）的安装、认证引导、健康体检、低 Token 能力发现与安全执行。

## Agent 核心执行铁律

1. **低 Token 发现与按需查参（先精简后详情）**：
   - 发现全部命令时**务必加 `--compact`**（体量从 61 KB 降至 ~7 KB，节省 90% 上下文）：
     ```bash
     fastgpt commands --compact --format json
     # 或按子域过滤：fastgpt commands --domain "dataset collection" --compact --format json
     ```
   - 需要使用某条具体命令时，再按需拉取该单条命令的完整参数与示例：
     ```bash
     fastgpt commands --command "dataset collection create-file" --format json
     ```
2. **输出裁剪与直接取值（`--fields` / `--pick` / `--raw`）**：
   - 查询列表时附加 `--fields _id,name,type` 只保留关键字段，避免无关渲染属性撑爆上下文：
     ```bash
     fastgpt dataset list --fields _id,name,type --format json
     ```
   - 链式调用需要直接提取单个 ID 或字段时，配合 `--pick` 与 `--raw` 一步到位（免写额外 `jq`/`node` 脚本）：
     ```bash
     DATASET_ID=$(fastgpt dataset create --name "Docs" --pick data.datasetId --raw)
     ```
3. **结构化输出与错误自愈**：
   - Agent 环境下始终传 `--format json`（非 TTY 下也会自动启用 JSON 模式）。
   - **成功 (`exitCode === 0`)**：读取 `stdout` 的 `fastgpt-cli-result/v1` JSON；**失败 (`exitCode !== 0`)**：读取 `stderr` 的错误 JSON，优先按 `error.code` 与 `error.hint` 自愈修正：
     - `2` (`CLI_ARGUMENT_INVALID`)：参数缺失/Zod 校验失败，或破坏性操作缺少 `--yes`
     - `3` (`AUTH_*` / `AUTH_MODE_UNSUPPORTED`)：未登录、凭据过期，或用了 `appKey`/`personalKey` 调仅支持 `token` 的管理命令
     - `4` (`API_ERROR`)：业务错误（资源不存在/配额等）
     - `5` (`NETWORK_ERROR`)：网络/TLS/跨域重定向拦截
4. **凭据零泄露与写操作护栏**：
   - 优先通过环境变量 + `--api-key-stdin` / `--token-stdin` / `--password-stdin` 登录，避免明文密钥进入 shell history；**严禁**在回复中回显密钥。
   - 写操作（`risk: "write"` / `"destructive"`）建议先用 `--dry-run --format json` 预览校验；`destructive` 命令在确认用户意图后附加 `--yes` 执行。
   - 大段文本或 JSON 载荷统一使用 `--file <path>` 或 `--stdin`。

---

## 初始化执行流程（4 步）

### 1. 检查并安装 CLI

要求 **Node.js `>= 20.12.0`**（`@clack/prompts` 依赖 `node:util` 的 `styleText`）。先检测是否已安装，未安装时再执行全局安装：

```bash
node -v
fastgpt --version || (npm install -g @fastgpt/cli || pnpm add -g @fastgpt/cli)
fastgpt --version
```

### 2. 检查登录状态并引导认证

先探测本地是否已有有效会话或凭据：

```bash
fastgpt whoami --format json
```

- **若 `ok: true`**：记录当前用户、团队、Profile 与 `authType`，直接进入第 3 步。
- **若返回退出码 `3`（未登录或已失效）**：询问用户 FastGPT 实例地址（默认公有云 `https://cloud.fastgpt.cn/api`，私有化部署请提供域名），并引导用户选择最安全的登录方式：
  1. **API Key 登录（Agent / CI 自动化首选，通过 stdin 传入避免泄露）**：
     ```bash
     printf '%s' "$FASTGPT_API_KEY" | fastgpt login --api-key-stdin --format json
     # 私有化部署追加：--base-url https://your-domain.com/api
     ```
  2. **Session Token 登录（需使用 `dataset export` / `dataset tag` 等 `token`-only 管理能力时）**：
     ```bash
     printf '%s' "$FASTGPT_TOKEN" | fastgpt login --token-stdin --format json
     ```
  3. **账号密码登录（非交互通过 stdin 传入密码）**：
     ```bash
     printf '%s' "$FASTGPT_PASSWORD" | fastgpt login --username <USERNAME> --password-stdin --format json
     ```
  4. **人类终端交互登录**：若用户希望在本地终端交互输入，请提示用户在自己终端运行 `fastgpt login`，完成后再通知你继续。

登录完成后再次运行 `fastgpt whoami --format json` 验证。

### 3. 检查健康度 (`doctor`)

```bash
fastgpt doctor --format json
```

若 `checks` 中存在 `warn` 或 `fail`（如 Node 版本低于 `20.12.0`、文件权限过宽、自签名证书报错），依据 `hint` 向用户说明并协助修复。

### 4. 动态发现并输出 CLI 能力列表

调用精简清单命令一次获取当前版本的全部能力、风险等级与鉴权要求：

```bash
fastgpt commands --compact --format json
```

解析 `data.commands[]`，按领域分组汇总输出给用户（`auth` / `whoami` / `config` / `doctor` / `dataset` / `dataset collection` / `dataset data` / `dataset train` / `dataset tag` / `dataset synonym`）。

---

## 最终汇报模板

```markdown
### ✅ FastGPT CLI 初始化完成

- **CLI 版本**：<from fastgpt --version>
- **当前身份**：<username>（团队：<teamName>，模式：<authType>）
- **服务端地址**：<baseUrl>
- **健康诊断**：<doctor 摘要，如全部通过>

#### 🚀 当前可用能力域（来自 `fastgpt commands --compact --format json`）
| 命令域 | 命令数 | 代表能力 |
| :--- | :--- | :--- |
| `auth` / `whoami` | ... | 身份查看、Profile 与团队切换 |
| `dataset` | ... | 知识库 CRUD、召回检索、导出、同步与权限治理 |
| `dataset collection` | ... | 文本/链接/本地文件/S3 预签名导入、重训与导出 |
| `dataset data` / `train` | ... | 分块 CRUD/批量推送、自定义索引与训练队列等待 |
| `dataset tag` / `synonym` | ... | 集合打标（Pro）与同义词词表维护 |
| `config` / `doctor` | ... | 本地配置读取与运行时体检 |
```
