# T00：公共运行时扩展（HTTP 流式/上传/下载 + 安全护栏 + 输入输出基础件）

- **所属需求包**：`PKG-00` 认证底座与公共运行时（Record: `reczz28YGuG6P2j0`）
- **覆盖 FR**：`FR-004` HTTP 客户端扩展、`FR-005` 统一确认与 dry-run 门禁、`FR-006` 大载荷读取与分页渲染
- **阶段 / 优先级**：Phase 0.5 · P0（所有后续业务 Task 的前置阻塞项）
- **状态**：待认领（PRD Record: `reczz28YDq8uUbAc` · [飞书任务看板](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc)）
- **前置依赖**：Phase 0 认证底座（已完成，见 [labring/FastGPT#8334](https://github.com/labring/FastGPT/pull/8334)）
- **开发红线**：必读 [engineering-standards.md](../engineering-standards.md) · 总览 [design.md](../design.md) · 索引 [index.md](../index.md)
- **可并行性**：建议优先由 1 人快速落地并合入；其余业务域基于此分支开展，避免各自重复实现文件上传、SSE、`--dry-run` 与二次确认。

---

## 1. 目标

在现有 `cli/` 之上补齐 Phase 0 未包含的通用能力，使所有 P1~P3 业务域开箱即用：
1. HTTP 客户端支持 `multipart/form-data` 上传、二进制流/文件下载（如导出 CSV/Zip）、以及 **SSE（Server-Sent Events）流式解析**。
2. 命令管线与领域层支持标准 **`--dry-run` 预览** 与 **`risk: 'destructive'` 二次确认门禁**。
3. 统一大 JSON 文件/stdin 读取（`--file` / `--stdin`）、分页参数解析与标准列表/表格文本渲染。

---

## 2. 具体交付范围与落点

### 2.1 `src/infra/http/fastgpt-http-client.ts`（扩展 `FastGptHttpClient`）
新增 3 个方法，保持与 `request()` 相同的认证头（`token` / `Authorization`）、`X-FastGPT-Client`、TLS/CA、`redactText` 脱敏与错误分级映射：
1. `requestRaw(params)` -> 返回 `{ status, headers, bodyText | arrayBuffer }`（用于下载导出文件、非 JSON 响应如 `app logs export`、`dataset collection export`、`skill export`、以及本地 `S3` presign PUT）。
2. `uploadMultipart(params)` -> 支持 `FormData`（`file` + JSON 字段 `data`），供 `dataset collection create/localFile`、`dataset synonym uploadFile`、`plugin pkg upload` 等复用。注意 `ky` 上传 `FormData` 时不得手动写死 `Content-Type: multipart/form-data`（需由运行时自动生成 boundary）。
3. `streamSse(params)` -> 返回 `AsyncIterable<{ event?: string; data: string; id?: string }>`，正确处理分块截断、`\r\n` 行结束符、`[DONE]` 终止符、以及 `AbortSignal` 取消，并支持错误响应 JSON（如 HTTP 401/514/500）抛出 `CliAuthError` / `CliApiError`。

### 2.2 `src/cli/pipeline.ts` & `src/shared/types.ts`（统一 `--dry-run` 与破坏性操作确认）
1. 全局/通用选项规范化：
   - 定义标准确认与预览选项工厂（如 `DRY_RUN_OPTION`、`YES_OPTION`、`CONFIRM_OPTION`），避免各命令命名五花八门（禁止有的叫 `--force` 有的叫 `--skip-confirm`）。
   - 若命令传入 `--dry-run`，执行器应能便捷返回统一结构：`{ changed: false, data: { dryRun: true, method, path, query, body, risk } }`（经 `redactValue` 脱敏）。
2. 破坏性操作确认助手（`assertDestructiveConfirmed` / `confirmDestructiveAction`）：
   - 当命令 `spec.risk === 'destructive'` 且非 `--dry-run` 时：
     - 若处于非交互环境（`!prompter.isInteractive` 或 `--format json`），**未传 `--yes` 且未传匹配 `--confirm <target>` 时，直接抛出 `CliArgumentError`（退出码 `2`）**，提示必须显式传入 `--yes`。
     - 若处于交互式 TTY 且未传 `--yes`，通过 `prompter` 触发确认（需确认库中 `Prompter` 补充 `confirm(params: { message: string; initialValue?: boolean }): Promise<boolean>`，并在 `createClackPrompter` / `createNonTtyPrompter` 实现）。

### 2.3 `src/infra/ui/prompter.ts` & `src/infra/ui/renderer.ts`
1. `Prompter` 新增 `confirm` 方法（用于破坏性操作交互确认）。
2. `createTextRenderer` 增强数组/列表展示：当 `result.data` 为 `{ list: [...], total?: number }` 或数组时，在保持结构清晰的前提下输出紧凑可读的列对齐视图或摘要，避免长数组在文本模式下过于冗长。
3. 补充通用 NDJSON / 流式输出辅助器（`stdout` 逐块直出或 `--format json` 下按行输出 NDJSON 事件），供 `T03 chat run --stream`、`T09 skill debug` 复用。

### 2.4 `src/shared/input.ts`（纯解析）& `src/infra/fs/file-io.ts`（本地文件适配器）
- 提供标准输入读取组合：支持从 `--data <json>`、`--file <path>` 或 `--file -` / `--stdin` 读取 JSON 对象并进行 `JSON.parse` 错误封装（抛 `CliArgumentError`，退出码 `2`）。
- 提供二进制安全写入文件 helper（用于 `export` / `pull` 下载落盘，处理父目录创建与 `--overwrite` 检查）。

### 2.5 分页选项约定（`src/shared/pagination.ts`）
- 提供通用的 `--page`、`--page-size`、`--offset` 参数声明与提取函数，确保与 `packages/global/openapi/api.ts` 的 `PaginationSchema`（`pageNum` / `offset` 二选一互斥）兼容。

---

## 3. 限制与非目标

- **不得破坏现有 Phase 0 接口签名**：`login`、`logout`、`whoami`、`auth`、`config`、`doctor`、`commands` 的现有行为与测试必须 100% 保持通过。
- **不引入新第三方流式/表格重型依赖**（优先原生 `TextDecoder` / `ReadableStream` SSE 解析与 `FormData` + `Blob`/`File` 标准 API，确保 Node 24 与 Bun `compile` 双兼容）。
- **禁止在 `domain/` 层直接读写文件**：`file-io.ts` 属于 `infra/`，只通过依赖注入提供给 `domain/` 或在 `cli/commands/` 层完成读写转换后将内存数据传给 `domain/`。

---

## 4. 验收标准与测试清单

- [ ] `test/infra/http-and-renderer.test.ts` 补充测试：
  - SSE 跨 chunk 换行拼接、`event:` / `data:` 解析、`[DONE]` 结束、服务端返回 401/500 JSON 错误时正确抛 `CliAuthError` / `CliApiError`。
  - `uploadMultipart` 正确发送 `FormData` 且携带 `token` / `authorization` 与 `x-fastgpt-client` 头。
  - `requestRaw` 正确读取二进制或纯文本下载响应。
  - 列表数据结构在 text 模式下可读渲染、JSON 模式下保持 `fastgpt-cli-result/v1` 信封与敏感字段脱敏。
- [ ] `test/cli/pipeline-guards.test.ts` 新增测试：
  - `destructive` 命令在 `isTTY: false` 无 `--yes` 时返回退出码 `2`（`CLI_ARGUMENT_INVALID`）。
  - `destructive` 命令在 `--format json` 无 `--yes` 时不触发交互且返回退出码 `2`。
  - `destructive` 命令在 `isTTY: true` 通过 mock `prompter.confirm` 拒绝时中止执行且不发 HTTP 请求。
  - `--file` / `--stdin` 读取与畸形 JSON 报错（退出码 `2`）。
- [ ] 执行 `engineering-standards.md` 第 5 节全部门禁命令（含 `build:bun`、`compile`、`app typecheck`）全部通过。
