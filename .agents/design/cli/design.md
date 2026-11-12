> 状态：正式设计基线 v1.2 · 2026-11-12（已冻结架构、命令面与 9 需求包 × 24 细粒度 PRD 拆解，可作为协同开发正式参考）
> 索引入口：[index.md](./index.md) · 研发规范：[engineering-standards.md](./engineering-standards.md) · 任务拆解：[tasks/README.md](./tasks/README.md)
> 飞书同步：[设计方案文档](https://fael3z0zfze.feishu.cn/docx/GK3LdwUfEon2T8xTC9kcADohn6d) · [任务分配多维表格](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc)

## 1. 背景与目标

FastGPT 目前缺少统一的命令行入口。我们希望提供一个类似 lark-cli 的 CLI，同时服务三类使用者：

- 人：本地开发、运维、排障
- CI/CD：应用导出/导入、发布、知识库同步
- Agent：通过稳定的 JSON 输出、自描述命令和配套 Skill 操作 FastGPT

目标不是“把 API 包一层”，而是建立一套稳定、可组合、对 Agent 友好的操作平面。

## 2. 设计原则

- 契约驱动：以 `packages/global/openapi` 为单一事实源，不重复手写 API 定义。
- 机器优先：非 TTY 默认 JSON；stdout 只放结果，日志走 stderr；稳定退出码。
- 默认安全：读操作无确认；写操作支持 `--dry-run`；破坏性操作必须确认。
- 一份注册表，四种消费方：`--help`、`commands --json`、MCP tools、Skill 文档都由同一份命令定义生成。

## 3. 现有基础

- OpenAPI：`packages/global/openapi`，运行时 `/api/apidoc/devapi.json`、`/api/apidoc/systemopenapi.json`。
- `packages/workflow-cli`：已验证“命令注册表 + zod 入参 + dry-run + checksum + JSON envelope”的 Agent-friendly 形态。
- `projects/mcp_server`：已验证 MCP 网关形态。
- 认证现状：服务端支持三类运行时凭据——`token`（Session，全量管理接口）、`personal` API Key（团队成员级 OpenAPI 密钥）、`app` API Key（单应用绑定密钥，仅限对话/日志等 `authAppApiKey` 接口）；旧版仅提供面向 Session 的 `tokenLogin` 与面向 API Key 的 `/support/openapi/health`，缺少统一的 `whoami` 接口；多团队列表与切换仅商业版（Pro）提供。

## 4. 架构设计（四层 DDD + 依赖注入）

```text
cli/
  src/
    shared/      types / errors / redact / url / crypto（无外部 I/O 依赖）
    infra/       config-repository / secrets(Strategy+Composite) / http(ky+TLS) / ui(clack+picocolors)
    domain/      auth(strategies+probe-chain+resolver+service) / profile(descriptors) / doctor(checks)
    cli/         container(DI) / pipeline(Middleware) / program(commander) / registry / commands
```

代码与工程约束：
- **四层单向依赖**：`cli -> domain -> infra -> shared`；`domain` 层只依赖端口类型，不碰 `commander` 或 `process.stdout`。
- **关键设计模式**：Strategy（凭据存储、登录方式、输出渲染）、Chain of Responsibility（四级 `whoami` 探活链）、Pipeline Middleware（鉴权预检 + 渲染 + 退出码映射）、Descriptor Table（`CONFIG_DESCRIPTORS` 表驱动配置）、Composition Root DI（`container.ts`）。
- **代码风格**：文件命名全部 `kebab-case`；顶层函数统一使用 `function` 声明；禁止 barrel / re-export。
- **核心纯 JS 依赖**（由 `tsdown` 打包进产物，同样兼容 `bun build --compile`）：`commander`（命令树）、`@clack/prompts`（交互提示）、`ky`（HTTP 客户端）、`picocolors`（终端着色）。

命令定义即元数据：

```ts
{
  path: ['dataset', 'search'],
  summary: '知识库检索测试',
  input: SearchDatasetTestBodySchema,
  risk: 'read',              // read | write | destructive | admin
  authModes: ['token', 'personalKey'],
  examples: [...]
}
```

输出协议：

```json
{
  "schemaVersion": "fastgpt-cli-result/v1",
  "ok": true,
  "command": "dataset list",
  "data": {},
  "meta": { "requestId": "...", "durationMs": 12, "nextCursor": null },
  "warnings": []
}
```

退出码：0 成功、2 参数错误、3 认证/权限、4 业务错误、5 网络/服务不可用。

## 5. 命令面（按业务领域拆分）

命令面先按 FastGPT 真实业务领域固定顶层命名空间（对齐 `packages/global/openapi/` 与 `packages/workflow-cli`），再按优先级与依赖关系拆解为独立可认领的任务包（见 [engineering-standards.md](./engineering-standards.md) 与 [tasks/README.md](./tasks/README.md)）。

### 5.1 CLI 底座与通用能力域（非特定业务）

| 顶层命令 | 职责边界 | 核心子命令 | 状态 / 优先级 |
|---|---|---|---|
| `login` / `logout` / `whoami` / `auth` | 身份登录、登出、主体探测、多 Profile 与 Pro 团队切换 | `login`、`logout`、`whoami`、`auth <status \| list \| switch \| switch-team>` | **已完成（Phase 0）** |
| `config` | 本地 Profile 非敏感配置读写 | `config <list \| get \| set \| unset>` | **已完成（Phase 0）** |
| `doctor` / `commands` | 运行环境/凭据自检、Agent 命令清单自描述 | `doctor`、`commands` | **已完成（Phase 0）** |
| `api` | OpenAPI 通用逃生口（覆盖所有未单独封装的低频/长尾接口） | `api <method> <path>`、`api schema [path]` | **P0 收尾（T01）** |
| `skills` | 为 Claude Code / Codex / Cursor 等 Agent 工具分发 CLI 技能包（与平台 `skill` 区分） | `skills <catalog \| install \| uninstall \| update \| doctor>` | **P3（T11）** |

> **`skill` vs `skills` 消歧护栏**：平台自身 AI Skill 资源固定为单数 `fastgpt skill`，CLI 向外部 Agent 安装的技能包固定为复数 `fastgpt skills`。两者动词集合严格错开（`list/get/create/debug` vs `catalog/install/uninstall/update`），并在误输入时（如 `fastgpt skill install`）给出互指纠错提示。

### 5.2 核心业务域命令树

所有平台资源命令遵循 `fastgpt <domain> [sub-resource] <action>` 树形规范：

| 顶层领域 | 负责业务边界 | 规划子命令 | 主要凭据 | 任务包 |
|---|---|---|---|---|
| **`app`** | 应用管理、文件夹、发布版本、发布渠道、日志与评测 | `list \| get \| create \| update \| delete \| copy \| pin \| export \| import`<br>`app folder ...`<br>`app version list \| detail \| latest \| publish \| update`<br>`app channel ...`（Playground / OutLink / 微信扫码）<br>`app logs ...` / `app eval ...` | `token`（`list` 兼容 `personalKey`，`logs` 兼容 `appKey`） | `T04`（P1） |
| **`workflow`** | 独立一级域：工作流 DSL 本地编排与云端 GitOps（复用 `workflow-cli` / `@fastgpt/workflow-core`） | 云端同步：`pull \| push \| diff \| publish \| debug \| sandbox-packages \| optimize-code`<br>本地 DSL：`node \| edge \| variable \| input \| output \| tool \| container \| validate \| changeSet \| template \| meta` | `token` | `T06`（P2） |
| **`dataset`** | 知识库、集合、分块数据、文件上传、训练排队、检索与 API 知识库 | `list \| get \| create \| update \| delete \| search \| sync \| export`<br>`dataset collection list \| get \| create \| update \| delete \| read \| export \| sync`<br>`dataset data list \| get \| insert \| update \| delete`<br>`dataset file upload \| preview`<br>`dataset train status \| queue \| error \| retry`<br>`dataset tag ...` / `dataset synonym ...` | `token` / `personalKey` | `T02`（P1） |
| **`chat`** | 对话执行（含 SSE 流式）、停止、初始化、历史会话、消息记录与反馈 | `chat run <appId> [message]`（`--stream` / `--chat-id` / `--file` / `--variables`）<br>`chat init`、`chat stop`<br>`chat history list \| status \| rename \| delete \| clear`<br>`chat record list \| delete \| quote \| feedback` | `token` / `personalKey` / `appKey` | `T03`（P1） |
| **`model`** | 模型目录查询、详情、配置与连通性测试 | `model list`、`model detail`、`model catalog`、`model test` | `token` / `personalKey` | `T05`（P1） |
| **`tool`** | 系统工具、工具集、HTTP 工具与团队插件（不含 MCP） | `tool list \| get \| preview`<br>`tool http create \| update \| parse-schema \| run`<br>`tool plugin list \| detail \| upload \| delete` | `token`（部分查接口兼容 `personalKey`） | `T07`（P2） |
| **`mcp`** | 独立一级域：外部 MCP 工具消费、平台 MCP Server 发布、CLI 本地 stdio MCP 代理 | `mcp tool parse \| create \| update \| list \| run`<br>`mcp server list \| create \| update \| delete \| tools \| call`<br>`mcp serve [--allow ... --read-only]` | `token` / `personalKey`（`serve` 继承底层命令门禁） | `T08`（P2） |
| **`skill`** | FastGPT 平台 AI Skill 资源与沙盒调试 | `skill list \| get \| create \| update \| delete \| copy \| export \| import \| debug \| runtime \| version` | `token`（`detail` 等部分读接口兼容 `personalKey`） | `T09`（P2） |
| **`team`** | 团队列表与切换、成员/部门/群组、API Key 管理、协作者与账单用量 | `team list \| switch \| members \| org \| group \| invitation`<br>`team apikey list \| create \| update \| copy \| delete`<br>`team usage \| bill \| plan` | `token` | `T10`（P3） |
| **`admin`** | 系统管理员域（高危隔离命名空间，默认不进入 `mcp serve` 暴露面） | `admin user \| team \| app \| dataset \| model \| channel \| audit \| license \| system ...` | `token`（管理员/Root） | `T10`（P3） |

### 5.3 跨领域统一交互与安全约定

- **风险分级与确认门禁**：所有命令必须声明 `risk: 'read' | 'write' | 'destructive' | 'admin'`。`write`/`destructive` 需逐步支持 `--dry-run`；`destructive` 在 TTY 下要求二次确认，在非 TTY / `--format json` 下默认拒绝并要求显式 `--yes` 或 `--confirm <targetId>`。
- **鉴权门禁溯源**：每个子命令的 `authModes` 必须严格核对服务端 `projects/app/src/pages/api/**` 的 `authCert` / `authApp` / `authDataset` / `authUserPer` 实际标志，禁止臆测。
- **输入输出约定**：大 JSON 载荷统一支持 `--file <path>` / `--stdin`；列表命令统一支持 `--page` / `--page-size`（或 `--offset`）并在 `meta` 透传分页状态；流式输出支持 SSE 文本直出与 NDJSON 事件流两种消费形态。

## 6. 认证策略：API Key + 登录态双轨（详细工程设计）

### 6.1 服务端鉴权现状与三类凭据

通过核对 `packages/service/support/permission/auth/common.ts` 与 `packages/service/support/openapi/auth.ts`，FastGPT 服务端实际存在三类运行时凭据：

| 凭据类型 | 服务端标识 | 权限模型与覆盖范围 | 有效期 / 限制 |
|---|---|---|---|
| **Session Token** | `AuthUserTypeEnum.token` | 完整用户 + 团队权限（`TeamPermission`），覆盖全部管理接口与数据接口 | Redis `SessionCache` 存储，固定 **7 天 TTL**（604800s），受 `maxLoginSession` 限制 |
| **Personal API Key** | `AuthUserTypeEnum.apikey` + `ApiKeyTypeEnum.personal` | 继承创建者成员 ACL，覆盖 System OpenAPI 及标注 `authApiKey: true` 的接口；无法访问只允许 `authToken` 的接口（如 `app/detail`、`app/update`、`app/copy`、发布等） | 支持配置 `expiredTime` 与 `maxUsagePoints`（Pro 版强制校验） |
| **App API Key** | `AuthUserTypeEnum.apikey` + `ApiKeyTypeEnum.app` | 强制绑定单一 `boundAppId`，**不授予成员 ACL**（`isOwner=false, canWrite=false`），仅可访问显式开启 `authAppApiKey: true` 的接口（如 `v1/v2 chat/completions`、`app/logs/*`、`chat/init`） | 支持配置 `expiredTime` 与 `maxUsagePoints` |

**现有探活与团队接口现状**：
- `GET /api/support/user/account/tokenLogin`：仅支持 `authToken: true`，用于校验 Session 并返回用户/团队信息。
- `GET /api/support/openapi/health`：仅支持 `authApiKey` / `authAppApiKey`，需通过 query `?apiKey=...` 传参，仅返回 `{ valid, type, usagePoints, maxUsagePoints, appId }`，缺少用户、团队、Key 名称、到期时间与可用能力描述。
- `GET /api/proApi/support/user/team/list` 与 `PUT /api/proApi/support/user/team/switch`：仅商业版（Pro）提供，切换团队后签发新 Session Token；API Key 绑定固定团队，不支持跨团队切换。

---

### 6.2 HTTP 请求头组装协议

CLI 不维护浏览器 Cookie Jar，直接通过标准化请求头与服务端交互，并在所有请求附带客户端标识以便审计追踪：

| 凭据模式 | 发送请求头 | 说明与边界 |
|---|---|---|
| **API Key（Personal / App）** | `Authorization: Bearer <apiKey>` | 服务端 `parseHeaderCert` 通过 `authorization.split(' ')[1]` 提取密钥；若传入 `<apiKey>-<24位appId>` 兼容格式，App Key 下服务端会忽略后缀只认绑定 `boundAppId` |
| **Session Token** | `token: <sessionToken>` | 服务端 `token \|\| cookies['fastgpt_token']` 优先读取 `token` 请求头，CLI 无需解析 `Set-Cookie`（可同时附带 `Cookie: fastgpt_token=<sessionToken>` 兼容反代/旧版本） |
| **通用追踪头** | `X-FastGPT-Client: fastgpt-cli/<version> (<os>-<arch>; <runtime>/<ver>)` | 便于服务端网关日志、审计日志与问题排查识别来源 |

**传输安全要求**：
- 非 `localhost` / `127.0.0.1` 默认强制要求 `https://`，遇到明文 `http://` 时本地拒绝并提示（需显式 `--allow-insecure-http` 才放行，仅限内网调试）。
- 支持 `--ca-cert <path>` 加载私有 CA，或 `--insecure` 跳过 TLS 校验（会在 stderr 打印告警）。

---

### 6.3 登录状态机与交互流程

#### 1. 交互式登录（`fastgpt login`）

完全对齐 `projects/app/src/pages/api/support/user/account/` 下的登录与二次验证状态机：

```text
[确认 Base URL 与认证方式]
         │
         ├──► 选择 API Key ──► 隐藏输入 key ──► 调 whoami（或降级 health）校验并落盘
         │
         └──► 选择账号密码登录
                   │
                   ▼
             本地计算 password = sha256(utf8(rawPassword)) （64位小写 hex，绝不传原文/不落盘密码）
                   │
                   ▼
             GET /api/support/user/account/preLogin?username=<username>
                   │  返回 30s 有效预登录 code（超时自动重试获取）
                   ▼
             POST /api/support/user/account/loginByPassword
               Body: { username, password, code, language: 'zh-CN' }
                   │
                   ├───────────────────────────────────────┐
                   ▼ (直接登录成功)                         ▼ (status === 'verificationRequired')
             获得 { user, token }                    获得 { challenge, channel, maskedTarget, expiredAt }
                   │                                       │
                   │                                       ▼
                   │                                 POST /api/support/user/account/login/verification/captcha
                   │                                   Body: { challenge } ──► 返回 base64 图片验证码
                   │                                       │
                   │                                       ▼
                   │                                 写入临时 png 并调用系统默认查看器打开（支持直接输出路径/ASCII提示）
                   │                                 用户输入图片验证码 captcha
                   │                                       │
                   │                                       ▼
                   │                                 POST /api/support/user/account/login/verification/sendCode
                   │                                   Body: { challenge, captcha } ──► 触发短信/邮件验证码
                   │                                       │
                   │                                       ▼
                   │                                 用户输入 6 位验证码 code
                   │                                       │
                   │                                       ▼
                   │                                 POST /api/support/user/account/login/verification/verify
                   │                                   Body: { challenge, code } ──► 获得 { user, token }
                   │                                       │
                   └───────────────────────────────────────┘
                                       │
                                       ▼
             调 whoami（或 tokenLogin）补全 user/team/permission 元数据
                                       │
                                       ▼
             凭据写入 Keychain（或降级 credentials.json），元数据写入 config.json
```

#### 2. 非交互、SSO 兜底与相关子命令

- **脚本 / CI 无交互录入**：
  - `fastgpt login --api-key-stdin` / `fastgpt login --token-stdin`（避免密钥进入 shell history 与 `ps` 参数列表）。
  - `fastgpt login --base-url <url> --api-key <key>` / `--token <token>`。
  - **非 TTY 保护**：检测到 `!isTTY` 或传递了 `--json` 时，禁止触发任何交互式输入；若缺少凭据，直接以退出码 `2` 返回结构化错误及参数示例。
- **SSO / 企微登录兜底**：P0 不启动本地 HTTP 回调监听浏览器 OAuth；用户在网页完成 SSO 登录后，从浏览器复制 session token，通过 `fastgpt login --token-stdin` 注入。
- **登出与团队切换**：
  - `fastgpt logout`（alias `auth logout`）：Session 模式下调用 `GET /api/support/user/account/loginout` 吊销服务端会话并清除本地凭据；API Key 模式只清理本地凭据（提示如要彻底失效需在控制台删除 Key）。
  - `fastgpt auth switch <profile>`：切换本地多环境/多账号 Profile。
  - `fastgpt auth switch-team <teamId>`（Session 模式 + Pro 服务端）：调用 `PUT /api/proApi/support/user/team/switch`，获取新 `token` 并原子替换当前 Profile 的凭据与团队缓存；开源版或缺少该接口时提示重新登录。

---

### 6.4 本地配置与凭据隔离存储

配置目录默认为 `~/.config/fastgpt/`（Windows 为 `%APPDATA%\fastgpt\`），支持通过 `FASTGPT_CONFIG_DIR` 覆盖，目录权限强制 `0700`。配置文件与敏感凭据物理隔离：

#### 1. 非敏感元数据：`config.json`（权限 `0600`）

```json
{
  "schemaVersion": 1,
  "currentProfile": "prod",
  "profiles": {
    "prod": {
      "baseUrl": "https://cloud.fastgpt.in/api",
      "authType": "token",
      "user": { "userId": "64ad85a7463006c963799a01", "username": "dev@fastgpt.in" },
      "team": { "teamId": "64ad85a7463006c963799a02", "teamName": "核心研发", "tmbId": "64ad85a7463006c963799a03" },
      "isRoot": false,
      "sessionExpiresAt": 1763356800000,
      "updatedAt": 1762752000000
    },
    "ci-bot": {
      "baseUrl": "https://cloud.fastgpt.in/api",
      "authType": "apikey",
      "apiKeyType": "personal",
      "apiKeyName": "CI-Pipeline",
      "maskedSecret": "fastgpt-******9a0f",
      "user": { "userId": "64ad85a7463006c963799a01", "username": "dev@fastgpt.in" },
      "team": { "teamId": "64ad85a7463006c963799a02", "teamName": "核心研发", "tmbId": "64ad85a7463006c963799a03" }
    }
  }
}
```

#### 2. 敏感凭据存储（两级降级，不引入原生 C++ addon）

为了兼容第 8 节“禁止原生 addon、预留 Bun 单文件编译”的约束，Keychain 不依赖 `keytar`，而是通过系统原生命令行工具适配：

1. **优先系统 Keychain**：
   - macOS：调用 `/usr/bin/security`（service=`fastgpt-cli`，account=`profile:<name>`）。
   - Linux：检测 `secret-tool`（libsecret）；无桌面会话或命令缺失时进入降级分支。
   - Windows：调用 PowerShell / Win32 Credential Manager 封装。
2. **Headless / 容器自动降级**：写入同目录下 `credentials.json`（强制创建模式 `0600`，写入前校验权限若被放宽至 group/other 可读则报错退出），并在首次降级及 `fastgpt doctor` 中向 stderr 输出提示。

#### 3. 优先级与脱敏规则

- **解析优先级**：CLI Flag（`--token` / `--api-key` / `--base-url`） > 环境变量 > `--profile` 指定配置 > `currentProfile`。
- **环境变量**：
  - `FASTGPT_BASE_URL`
  - `FASTGPT_API_KEY`（自动识别为 `apikey` 模式）
  - `FASTGPT_TOKEN`（自动识别为 `token` 模式）
  - `FASTGPT_PROFILE`
  - `FASTGPT_CONFIG_DIR`
- **冲突处理**：同时设置 `FASTGPT_API_KEY` 与 `FASTGPT_TOKEN` 时，除非命令通过 `--auth-mode` 显式指定，否则报参数冲突错误（退出码 `2`），防止静默用错身份。
- **日志脱敏（Redaction）**：HTTP client、debug 日志、`--dry-run` 预览及错误栈统一遮蔽 `Authorization`、`token`、`Cookie` 与 query 中的 `apiKey`，只保留前缀与末 4 位。

---

### 6.5 运行时凭证决策流水线与能力门禁

每个注册命令在元数据中精确声明允许的凭据集合，而不是模糊的布尔值：

```ts
type AuthCredentialKind = 'token' | 'personalKey' | 'appKey';

// 示例：
// app update       -> authModes: ['token']
// dataset search   -> authModes: ['token', 'personalKey']
// chat completions -> authModes: ['token', 'personalKey', 'appKey']
// model list       -> authModes: ['token', 'personalKey', 'appKey', 'anonymous']
```

**执行前本地预检（Pre-flight Gate）**：

1. 解析本次生效的 `baseUrl` 与唯一凭据（区分 `token` / `personalKey` / `appKey`；若本地 Profile 尚不知道 `apiKeyType`，在首次调 `whoami` 或 `/support/openapi/health` 后缓存结果）。
2. 检查生效凭据是否在当前命令的 `authModes` 中：
   - 若命中（如用 `appKey` 调 `dataset search`，或用 `personalKey` 调 `app update`），**直接本地拦截，不发出网络请求**，返回退出码 `3` 与结构化错误 `AUTH_MODE_UNSUPPORTED` 及可执行修复提示：
     - 缺 Session：`Run 'fastgpt login' to sign in, or pass '--token'`
     - 用了 App Key 调团队级命令：`Current key is app-scoped (bound to appId=...), which cannot access dataset/team resources. Switch to a personal API Key or run 'fastgpt login'.`
3. 检查本地缓存的过期时间（Session `sessionExpiresAt` 或 Key `expiredTime`），已过期直接提示重登或续期。
4. 组装请求头发送请求；若服务端返回 401 / `unAuthorization` / `unAuthApiKey` / `API Key is expired` / `API Key is over usage`，统一映射为退出码 `3`，结合错误文本输出针对性 hint，并提示可运行 `fastgpt doctor` 自检。

---

### 6.6 `whoami` 接口契约设计与版本兼容降级

#### 1. 为什么必须设计 `whoami`

没有统一 `whoami` 时，CLI 面临两个问题：API Key 登录后无法自动填充用户名/团队名/Key 名称等本地 Profile 元数据；`fastgpt doctor` 和 CI 门禁无法用同一语义同时校验 Token 有效期与 API Key 配额。

因此建议在服务端新增轻量接口 `GET /api/support/user/account/whoami`（核心逻辑复用 `authCert` 与 `getUserDetail`，仅约数十行代码）。

#### 2. `whoami` 接口契约（已在 `worktree-fastgpt-cli` 实现）

- **Route**: `GET /api/support/user/account/whoami`
- **鉴权**: `authCert({ req, authToken: true, authApiKey: true, authAppApiKey: true })`
- **入参**: 无业务 Query/Body 参数（不创建空 Schema）
- **权限摘要复用**：`TeamPermissionSummarySchema` 定义在 `packages/global/support/permission/user/controller.ts`，由 `whoami` 响应契约复用
- **响应 Schema（`packages/global/openapi/support/user/account/whoami/api.ts`）**：

```ts
export const WhoamiResponseSchema = z.discriminatedUnion('authType', [
  // 分支 1：Session Token
  z.object({
    authType: z.literal(AuthUserTypeEnum.token),
    user: z.object({
      userId: ObjectIdSchema,
      username: z.string(),
      avatar: z.string().nullish()
    }),
    team: WhoamiTeamSchema.extend({
      permission: TeamPermissionSummarySchema
    }),
    isRoot: z.boolean(),
    session: z.object({
      createdAt: z.number().int().nonnegative(),
      expiresAt: z.number().int().nonnegative()
    })
  }),

  // 分支 2：API Key（Personal / App）
  z.object({
    authType: z.literal(AuthUserTypeEnum.apikey),
    apiKeyType: ApiKeyTypeSchema, // 'personal' | 'app'
    user: z.object({
      userId: ObjectIdSchema,
      username: z.string()
    }),
    team: WhoamiTeamSchema.extend({
      // App Key 不授予成员 ACL，permission 为 null
      permission: TeamPermissionSummarySchema.nullable()
    }),
    apiKey: z.object({
      id: ObjectIdSchema,
      name: z.string(),
      maskedKey: z.string(),
      boundAppId: ObjectIdSchema.optional(),
      boundAppName: z.string().optional(),
      authProxy: z.boolean(),
      limit: z.object({
        expiredTime: z.string().nullable(),
        maxUsagePoints: z.number(),
        usagePoints: z.number(),
        remainingPoints: z.number().nullable() // maxUsagePoints < 0 时为 null
      })
    })
  })
]);
```

> 注：以上 Schema 全部复用仓库既有枚举与字段命名（`AuthUserTypeEnum`、`ApiKeyTypeSchema`、`TeamPermissionSummarySchema`、`TeamMemberRoleEnum`）；暂不硬编码未由服务端强制校验的 `capabilities` 字符串数组，待后续引入 PAT 时再在 `discriminatedUnion` 新增带真实 `scopes` 的分支。

#### 3. 服务端未升级时的三层降级兼容策略

CLI 不能假设所有部署实例都已升级到包含 `whoami` 的版本，因此探活与 `fastgpt whoami` 采用三级降级：

```text
1. 首选调用 GET /api/support/user/account/whoami（使用标准 Header：token 或 Authorization: Bearer）
     │
     ├──► 200 OK：获得完整身份、团队、权限摘要、Session 过期时间 / API Key 类型、绑定应用与积分配额
     │
     └──► 404 Not Found（旧版服务端）：进入兼容降级
            ├── 若当前凭据为 token：
            │     调用 GET /api/support/user/account/tokenLogin 拿到 user / team / permission
            └── 若当前凭据为 apikey：
                  1) 先试 GET /api/support/openapi/health?apiKey=<key>（仅作旧版兼容，日志全量脱敏）
                     可识别 personal vs app、usagePoints、maxUsagePoints、appId
                  2) 若仍返回 404（更早期版本）：
                     回退轻量只读探活 POST /api/core/dataset/listV2（Body: { pageSize: 1, pageNum: 1 }）
                     仅能判定 Key 对知识库是否连通，并标记 serverFeatures.whoami = false
```

#### 4. `whoami` 带来的 CLI 能力升级

- **`fastgpt login` 自动回填**：输入 API Key 或 Token 后调一次 `whoami`，自动补全 `config.json` 中的 `user`、`team`、`apiKeyType`、`boundAppId` 与 `maskedSecret`，无需人工填写。
- **`fastgpt whoami [--json]`**：人看高亮卡片，Agent/CI 看结构化 JSON，可作为 CI 流水线前置断言（检查 `remainingPoints`、`boundAppId` 或 `session.expiresAt`）。
- **`fastgpt doctor` 主动预警与能力矩阵**：
  - 提前预警 Session 即将过期（如剩余 < 24h）或 API Key 配额耗尽/临近过期；
  - 结合 `authType`、`apiKeyType`、`team.permission` 与命令元数据 `authModes`，逐模块输出当前凭据下哪些命令可用、哪些需升级为 Session 或 Personal Key。

---

### 6.7 后续演进（不在 P0）

- **PAT（Personal Access Token）**：用户 + 团队维度、可配置细粒度 `scopes`（如 `app:write` / `workflow:publish` / `dataset:read`）、可设过期与随时撤销、带独立使用审计。一旦服务端支持 PAT，只需在 `AuthProvider` 新增 `pat` 分支即可打通无头 CI 与管理操作。
- **SSO / 企微浏览器登录回调**：OAuth / 扫码设备流或本地 loopback 回调，替代目前 `--token-stdin` 粘贴方式。
- **审计扩展**：服务端审计日志透出 `X-FastGPT-Client` 与 Token/Key 身份标识。

## 7. AI 能力与 Skills

- CLI 内建 AI 保持少量：`chat run`、`dataset search`、`workflow optimize-code` / 生成（调用服务端 AI 接口，产出草稿后必须走 validate/diff）。
- 配套 5 个本地 Agent Skill（通过 `fastgpt skills install` 分发到 Claude Code / Codex / Cursor，与平台 `fastgpt skill` 资源命令区分）：
  - `fastgpt-cli`：认证、输出协议、安全规则、`api` 逃生口与自发现
  - `fastgpt-app`：应用生命周期与发布
  - `fastgpt-workflow`：工作流 DSL 编辑与发布
  - `fastgpt-knowledge`：知识库摄取、训练、检索调试
  - `fastgpt-chat-eval`：对话、反馈、评测
- `fastgpt mcp serve` 复用同一份 `CliCommandSpec` registry 暴露 MCP tools，默认只读且排除 `admin` 域。

## 8. 技术选型：npm 优先，预留单文件发布

### 8.1 结论

第一阶段只发布 npm 包，但代码、构建和目录结构按“双产物”设计；后续可以在不重写命令面的前提下增加单文件二进制发布。

- **第一阶段（P0–P1）**：`@fastgpt/cli` 发布到 npm，`npx fastgpt` / `npm i -g` 可用。
- **后续（按需求触发）**：同一份代码通过 `bun build --compile` 产出各平台二进制，走 GitHub Releases；如需要“npm 安装即得原生二进制”，再加 wrapper 或平台子包。

### 8.2 为什么 npm 优先

- 包体小：现有 workflow-cli 完整 bundle 约 2.8MB，加上命令面预计 4–6MB；不把 85MB 的 Bun 二进制塞进 npm tarball。
- 迭代快：复用 `packages/global/openapi`、zod、workflow-core，发布链路最短。
- Agent 友好：`npx @fastgpt/cli` 在开发机和 CI 上都容易用。
- 单文件不是当前瓶颈：Bun compile 实测 hello world 85MB、workflow-cli 87MB；lark-cli 纯 Go 全功能 46MB。体积收益不足以支撑现在就做双语言/双产物发布。

### 8.3 预留单文件发布的设计约束

1. **运行时无关的 core**：命令注册表、OpenAPI client、输出协议、错误模型不依赖 Node/Bun 特有 API；入口只做 runtime 适配。
2. **只用标准 API**：`fetch`、`fs/promises`、`stream`、`readline`、`AbortSignal`；禁止 `bun:*` 和原生 addon（如 keytar）。
3. **构建双目标**：npm 产物用 tsdown/esbuild 打 `target=node`；CI 额外跑一次 `bun build --compile`（至少 linux-x64）做 smoke test，不发布，提前暴露兼容性问题。
4. **分发解耦**：npm 包只含 JS 产物；二进制走 GitHub Releases，后续可加 Homebrew/Scoop/Docker。npm 包不依赖 postinstall 下载。
5. **版本同源**：`package.json` 是唯一版本源；二进制通过构建注入版本，`fastgpt --version` 必须一致。
6. **doctor 识别运行时**：输出 Node/Bun、平台、版本、认证模式、服务端版本，方便双产物排查。
7. **跨平台细节抽象**：配置目录、keychain、终端检测、信号处理、文件上传、SSE 都要在 Node 和 Bun 下验证。

### 8.4 后续触发条件

出现以下任一情况，再启动单文件发布：

- 用户/CI 环境没有 Node，且 `npx` 不可接受；
- 需要离线安装或单文件分发；
- 启动延迟成为 Agent 高频调用的瓶颈；
- 需要嵌入 Docker/CI 镜像，减少运行时依赖。

### 8.5 技术选型对比（实测）

| 方案 | 产物体积 | 冷启动 | 复用 TS | 结论 |
|---|---:|---:|---|---|
| TS + npm/npx | ~3–6MB + Node | ~100–130ms | 完整 | **第一阶段采用** |
| TS + Bun compile | ~85MB | ~56ms | 完整 | 预留，按需启用 |
| 纯 Go + cobra | 30–50MB（全功能） | ~30ms | 无 | 不优先，除非必须无 Node 且 <50MB |
| Go + goja | 20–35MB（估） | ~20–40ms | 仅纯逻辑 | 不推荐，绑定层成本高 |
| Node SEA | ~115MB | 100ms+ | 完整 | 不推荐 |

实测环境：macOS arm64；lark-cli 1.0.99 为纯 Go + cobra 46MB；Bun 1.4.4 hello world 85MB；现有 workflow-cli Node 启动约 100–130ms。

## 9. 里程碑与并行任务拆解

> 完整开发规范见 [engineering-standards.md](./engineering-standards.md)，各模块可认领任务详见 [tasks/README.md](./tasks/README.md)。

- **前置 PR / Phase 0（已在 Draft PR `labring/FastGPT#8334` 完成）**：服务端 `GET /api/support/user/account/whoami` + `@fastgpt/cli` 认证底座（三类凭据识别、登录/2FA 状态机、Keychain/`0600` 隔离存储、本地门禁、三层探活降级、`login`/`logout`/`whoami`/`auth`/`config`/`doctor`/`commands`、tsdown + Bun 双路构建）。
- **Phase 0.5 · 公共运行时扩展（前置阻塞项 `T00`）**：为 HTTP 客户端补充 SSE / multipart / 下载能力；为执行管线补充 `--dry-run`、破坏性操作确认门禁、`--file`/`--stdin` 与分页渲染支持。
- **Phase 1 · 逃生口与高频核心域（可并行：`T01`、`T02`、`T03`、`T04`、`T05`）**：`api` 逃生口、`dataset`、`chat`、`app`、`model`。
- **Phase 2 · 工作流与扩展生态（可并行：`T06`、`T07`、`T08`、`T09`）**：`workflow`（复用 `workflow-cli`）、`tool`、`mcp`、`skill`。
- **Phase 3 · 治理、Agent 技能包与漂移门禁（可并行：`T10`、`T11`）**：`team` & `admin`、`fastgpt skills` 技能分发与 OpenAPI 漂移 CI 检查。
- **Phase 4（按需）**：单文件二进制发布（GitHub Releases / Homebrew / Docker）；PAT、SSO 浏览器登录、审计增强。

## 10. 后续演进与治理事项（不阻塞 P1~P3 并行开发）

- `GET /api/support/user/account/whoami` 是否补充 `SystemOpenApiTagMap` 标签进入 `/api/apidoc/systemopenapi.json` 对外公开文档？（当前仅注册于 Dev API）
- PAT（Personal Access Token）何时在服务端立项，以补齐无头 CI 场景下 `app`/`workflow` 写入接口？
- SSO / 企微浏览器 OAuth 回调何时立项？（当前以 `--token-stdin` 兜底）
- `fastgpt-workflow` 独立二进制在并入 `fastgpt workflow` 后，是保留过渡别名还是逐步下线？
- npm 包名与公开发布流程（`@fastgpt/cli` 是否设为公开包发布至 npmjs）
- `admin` 命令是否提供构建裁剪开关或默认在 `mcp serve` 中永久禁用？

## 11. 修订记录

- v0.1（2026-11-09）：初稿，确定问题边界、现有基础、架构骨架与待确认项。
- v0.2（2026-11-10）：技术选型确定为“npm 优先、预留单文件发布”，补充实测对比与设计约束。
- v0.3（2026-11-10）：认证策略确定为 API Key + Session 双轨；PAT、SSO、多团队切换列为后续；补充登录流程、凭据存储与能力矩阵。
- v0.4（2026-11-10）：细化第 6 节认证工程设计（三类凭据对齐 `origin/main`、HTTP 头协议、登录/2FA 状态机、配置与凭据分离 Schema、本地门禁流水线、`whoami` 接口 Zod 契约与三层降级策略）。
- v0.5（2026-11-10）：完成 `GET /api/support/user/account/whoami` 服务端契约与接口实现，对齐 `WhoamiResponseSchema`（增加 `boundAppName`，移除未落地的 `capabilities` 占位数组）。
- v0.6（2026-11-10）：调整里程碑为“认证底座优先、再定稿命令面”；完成 `packages/cli` 认证最小闭环（`login`/`logout`/`whoami`/`auth`/`config`/`doctor`/`commands`）与 Bun 编译兼容性验证。
- v0.7（2026-11-10）：按四层 DDD 架构（`shared`/`infra`/`domain`/`cli`）重构 `packages/cli`，引入 `commander`、`@clack/prompts`、`ky`、`picocolors`，统一 `kebab-case` 命名与顶层 `function` 声明风格。
- v0.8（2026-11-11）：确定第 5 节按业务领域拆分的顶层命令树（`workflow` 与 `mcp` 独立一级、`skill` 平台 vs `skills` Agent 包护栏）；补充 [engineering-standards.md](./engineering-standards.md) 与 [tasks/README.md](./tasks/README.md) 拆解多人并行任务。
- v1.0（2026-11-11）：移除草稿状态，升级为协同开发正式参考基线；新增 [index.md](./index.md) 索引与飞书任务分配多维表格联动。
- v1.1（2026-11-11）：将 `@fastgpt/cli` 从 `packages/cli/` 迁至仓库根目录 `cli/`（与 `projects/`、`packages/` 平级），彻底隔离主应用 Docker 构建与全局 `tsconfig` 扫描。
- v1.2（2026-11-12）：重构飞书多维表格与任务映射为 **9 业务需求包（`PKG-00`~`PKG-08`）× 44 原子 FR × 24 细粒度可并行 PRD**，默认视图均配置按彩色需求包可折叠分组。
