# FastGPT CLI（`@fastgpt/cli`）开发规范、架构约束与准入护栏

> 导航索引：[index.md](./index.md) · 设计基线：[design.md](./design.md) · 任务看板：[tasks/README.md](./tasks/README.md) · [飞书多维表格](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc)
>
> 本文档面向所有认领 [tasks/README.md](./tasks/README.md) 任务的协作者与 AI Coding Agent。合入 `cli/` 的任何 PR 都必须严格遵守以下红线与约定。

---

## 1. 四层单向 DDD 架构与目录隔离

`cli/src/` 严格划分为 4 层，**只允许单向向下依赖：`cli -> domain -> infra -> shared`**：

| 层级 | 目录 | 职责 | 严禁导入 |
|---|---|---|---|
| **shared** | `src/shared/` | 纯类型、错误类、URL 规范化、脱敏工具、加密/哈希纯函数 | `node:fs`、`node:os`、`node:child_process`、网络请求、任何上层模块 |
| **infra** | `src/infra/` | 外部副作用适配器：配置文件仓储、Keychain/文件凭据、HTTP/TLS/SSE 客户端、Clack 提示、Renderer 渲染器 | `domain`、`cli`、`commander` |
| **domain** | `src/domain/` | 按业务域组织的领域服务与用例编排（如 `auth/`、`dataset/`、`chat/`、`app/`、`workflow/`） | **`commander`**、**`node:fs`**、**`node:os`**、**`process.stdout/stderr`**、**`picocolors`**、**`@clack/prompts`**（只能通过注入的端口接口交互） |
| **cli** | `src/cli/` | 组合根 `container.ts`、命令中间件 `pipeline.ts`、Commander 建树 `program.ts`、全局注册表 `registry.ts`、各域 `commands/` | 禁止在 `commands/*.ts` 里直接拼 HTTP 请求或绕过 `domain` 服务 |

### 并行开发防冲突文件边界

多个协作者并行开发不同业务域时，必须遵守“**域内自闭 + 注册点单行接入**”原则：

- **允许新建/修改的自留地（按 `<domain>` 隔离）**：
  - 领域逻辑：`src/domain/<domain>/*.ts`（或子目录）
  - 命令定义：`src/cli/commands/<domain>.ts`（命令较少）或 `src/cli/commands/<domain>/*.ts`（命令较多时，如 `dataset`）
  - 单元测试：`test/domain/<domain>.test.ts` 与 `test/cli/<domain>-commands.test.ts`
- **仅限单行登记的共享文件**（禁止顺手重构其他域的代码）：
  - `src/cli/container.ts`：注入新领域服务实例
  - `src/cli/registry.ts`：追加 `...create<Domain>CommandSpecs()`
  - `src/cli/program.ts`：`GROUP_DESCRIPTIONS` 补充一级分组描述
- **共享基础设施修改需先走 `T00`**：除 `T00` 外，业务域 Task **不得私自大改** `pipeline.ts`、`fastgpt-http-client.ts`、`renderer.ts`、`auth-resolver.ts`。

---

## 2. 代码风格与 Monorepo 硬性禁忌

继承仓库根规范 [.agents/code/syntax.md](../../code/syntax.md) 与 `cli/` 约定：

1. **文件命名**：所有源码与测试文件一律使用 **`kebab-case`**（如 `dataset-service.ts`、`collection-commands.ts`），不混用 `camelCase` / `PascalCase`。
2. **顶层函数**：顶层函数统一使用 **`function` 声明**（`export function createDatasetService(...)`），不使用 `export const foo = (...) =>` 定义顶层函数（对象方法与局部回调除外）。
3. **类型定义**：一律使用 **`type`**，不使用 `interface`。优先通过 Zod schema 用 `z.infer<typeof FooSchema>` 推导类型。
4. **禁止 re-export / barrel**：禁止写 `export { ... } from '...'`、`export * from '...'` 或仅用于汇总导出的 `index.ts`。调用方必须从实际定义文件直接导入。
5. **严格等值与条件赋值**：
   - 只用 `===` / `!==`，禁止 `==` / `!=`；默认值用 `??`，不用 `||`（避免 `0`/`false`/`''` 被覆盖）。
   - 多分支变量赋值使用 **IIFE**，避免先 `let x; if (...) x = ...`。
   - 调用可选回调使用 `cb?.()`。
6. **中文注释约定**：导出函数、核心流程函数使用 `/** ... */` 注释说明职责与边界；复杂流程用 `// 1. ...` 分段并说明“为什么这么做”。
7. **禁止引入污染全局类型的包**：
   - **绝对禁止**在 `cli/` 引入 `@types/bun`、`import ... from 'bun'` 或任何 `bun:*` 模块（既避免和 Node `@types/node` 类型冲突，也保证源码跨 Node / Bun 双路构建一致；`scripts/build.bun.ts` 只允许使用局部结构类型读取 `globalThis.Bun`）。
8. **禁止服务端与原生依赖**：
   - **绝对禁止**在 `cli/` 中导入 `@fastgpt/service`、`mongoose`、`next` 或任何 DB/Redis 客户端。
   - 仅允许依赖 `@fastgpt/global`（纯类型、常量、Zod Schema）与纯 JS 包（`commander`、`@clack/prompts`、`ky`、`picocolors`、`zod` 等）。
   - **禁止**引入原生 C++ addon（如 `keytar`、`better-sqlite3`）或额外 `postinstall` 下载二进制，确保 `tsdown`（Node ESM）与 `bun build --compile`（单文件）双路构建随时可用。

---

## 3. 契约驱动与鉴权门禁规范

### 3.1 Zod 契约单一事实源

- 业务请求/响应数据结构优先直接从 `@fastgpt/global/openapi/...` 或 `@fastgpt/global/core/...` 导入既有 Zod Schema 与类型（如 `SearchDatasetTestBodySchema`、`CreateDatasetBodySchema`）。
- 仅 CLI 特有的命令行参数解析 Schema（例如把 `--page 1 --page-size 20` 转成请求体）放在 `src/cli/commands/<domain>/` 内部。

### 3.2 `authModes` 精确声明铁律

`cli/src/cli/pipeline.ts` 会在发出 HTTP 请求前执行 `assertAuthAllowed` 本地拦截，**严禁猜测或抄错 `authModes`**：

1. 实现任何命令前，必须先打开对应后端路由 `projects/app/src/pages/api/<path>.ts`，核实其鉴权调用：
   - 仅调用 `authCert({ authToken: true })` 或 `authApp` / `authDataset` / `authUserPer` 未传 `authApiKey: true` → **`authModes: ['token']`**
   - 传入 `authApiKey: true` 且未传 `authAppApiKey: true` → **`authModes: ['token', 'personalKey']`**
   - 同时传入 `authApiKey: true, authAppApiKey: true`（如 `/v2/chat/completions`、`/core/app/logs/list`）→ **`authModes: ['token', 'personalKey', 'appKey']`**
   - 纯本地操作（如 `config`、`skills`、`workflow validate`）→ **`authModes: ['none']`**
2. 对于同一个命令行下不同子命令支持不同凭据的情况，允许不同子命令声明各自的 `authModes`（例如 `app list` 为 `['token', 'personalKey']`，而 `app detail` / `app update` / `app version publish` 必须为 `['token']`）。

### 3.3 统一 HTTP 客户端规范

- 所有远端请求**必须**通过 `container.createHttpClient({ baseUrl, insecure, caCertPath })`（或 `resolvedAuth` 构造的客户端）发起，**严禁**直接调用 `globalThis.fetch`、`axios` 或硬编码 `headers`。
- 理由：只有经过 `FastGptHttpClient` 才能统一处理 `X-FastGPT-Client` 追踪头、非 loopback HTTPS 校验、`--ca-cert`/`--insecure`、FastGPT `{ code, statusText, message, data }` 信封解包、514/`unAuthApiKey` 错误映射与密钥脱敏。

---

## 4. 命令交互、输入输出与安全护栏

### 4.1 `CliCommandSpec` 完整元数据

每个命令必须通过 `CliCommandSpec` 注册（自动同时生成 Commander 帮助、`commands --format json` 清单和未来 MCP Tool 描述）：

- `path`：命令路径数组（如 `['dataset', 'collection', 'list']`），全小写 `kebab-case`。
- `summary`：一句话英文摘要（与现有 `auth`/`config`/`doctor` 风格保持一致），`options` description 同理。
- `risk`：精确标注 `'read' | 'write' | 'destructive' | 'admin'`。
- `authModes`：严格核对后的凭据集合。
- `positionalArgs` / `options` / `examples`：至少提供 1 条可复制执行的 `examples`。

### 4.2 stdout / stderr 与 JSON 信封铁律

- **非 TTY 自动 JSON**：已在 `src/cli/run.ts` 统一处理（非 TTY 默认 `--format json`）。
- **stdout 纯净原则**：`stdout` 只能写入命令的最终结果（JSON 信封或渲染后的文本；流式命令除外，见 `T00`/`T03` 约定）。所有 spinner、进度提示、Warning、dry-run 提示、调试信息必须走 `stderr`（并在 `--quiet` 或 `--format json` 下静默进度条）。
- **禁止泄漏敏感信息**：任何错误信息、dry-run 预览、HTTP 调试日志、文件路径提示，凡可能出现 token / apiKey / secret / cookie / presign query 签名串的内容，都必须经过 `redactText` / `redactValue`。
- **禁止绕过 Prompter**：需要交互输入或确认时，必须使用注入的 `prompter`（`isInteractive` 为 `false` 时，包括 `--format json` 场景，严禁弹窗阻塞）。

### 4.3 `--dry-run` 与 `destructive` 二次确认护栏

1. **所有 `risk: 'write'` 与 `risk: 'destructive'` 的写操作**：
   - 必须支持 `--dry-run`（由 `T00` 在公共管线或共享 helper 提供标准行为）。
   - `--dry-run` 阶段**仅做本地参数校验与构造预览，绝不发出变更请求**；返回 `changed: false`，`data` 包含 `{ dryRun: true, method, path, query, bodySummary, risk }`（必须已脱敏）。
2. **所有 `risk: 'destructive'` 的删除/覆盖/重置操作**（如 `app delete`、`dataset delete`、`dataset collection delete`、`chat history clear`、`team apikey delete`）：
   - TTY 交互模式：未传 `--yes` 时必须通过 `prompter` 显式确认（危险级建议提示目标 ID 或名称）。
   - **非 TTY / `--format json`（Agent / CI）模式**：未显式传入 `--yes`（或 `--confirm <id>`）时，**必须拒绝执行并返回退出码 `2`（`CLI_ARGUMENT_INVALID`）**，并在 `hint` 中给出 `--yes` 用法示例。

### 4.4 大载荷与分页标准

- **JSON 载荷输入**：涉及复杂结构体的写命令（如 `app create/import`、`workflow push`、`dataset data insert`）统一支持 `--file <path>` 与 `--stdin`（读取文件或 `-`），避免超长 JSON 塞进命令行参数。
- **分页规范**：列表命令统一暴露 `--page <n>`、`--page-size <n>`（或游标接口用 `--next-id` / `--prev-id`），并在 `CliResult.meta` 中标准化回传 `{ total, page, pageSize, hasMore }`（有游标时补充 `nextCursor`）。

### 4.5 退出码语义规范

必须严格使用 `src/shared/errors.ts` 中对应的错误类，禁止随意 `process.exit`：

| 退出码 | 错误类 / `CliErrorCode` | 适用场景 |
|---|---|---|
| `0` | — | 成功（含 `--dry-run` 预览成功） |
| `1` | `CliError` (`CLI_INTERNAL_ERROR`) | 未预期内部异常 |
| `2` | `CliArgumentError` (`CLI_ARGUMENT_INVALID`) | 参数缺失/格式错误、JSON 解析失败、非 TTY 缺少 `--yes` |
| `3` | `CliAuthError` (`AUTH_*` / `TLS_OR_URL_INVALID`) | 未登录、凭据过期/超额、401/403/514、`authModes` 不匹配、不安全 URL |
| `4` | `CliApiError` (`API_ERROR`) | 业务层错误（如 404 资源不存在、配额业务校验失败、服务端 4xx/5xx） |
| `5` | `CliNetworkError` (`NETWORK_ERROR`) | TCP/DNS/TLS 握手失败、连接超时、SSE 流中断 |

---

## 5. 测试与交付验收标准

每个 Task 提交前必须满足以下全部条件：

1. **禁止依赖真实公网/本地实例的单测**：所有命令至少包含 `test/domain/<domain>.test.ts` 与 `test/cli/<domain>-commands.test.ts`，通过注入 mock `fetchFn` 与临时 `FASTGPT_CONFIG_DIR` 覆盖：
   - 正常链路（text 与 `--format json` 两种渲染输出）
   - `authModes` 门禁拦截（例如用 `personalKey`/`appKey` 调 `token`-only 命令时未发 HTTP 请求即返回退出码 `3`）
   - `--dry-run` 不发请求且脱敏输出
   - `destructive` 命令在非 TTY 无 `--yes` 时返回退出码 `2`
   - 服务端返回 404/514/业务错误时的退出码映射
2. **本地必跑全套门禁命令**（全部 exit code 0）：
   ```bash
   pnpm --filter @fastgpt/cli test:ci
   pnpm --filter @fastgpt/cli lint
   pnpm --filter @fastgpt/cli build:bun
   pnpm --filter @fastgpt/cli compile
   ./cli/bin/fastgpt --version
   pnpm --filter @fastgpt/app typecheck
   ```
3. **格式化**：提交前对改动文件执行 `pnpm prettier --check <files>`，确保与仓库一致。
