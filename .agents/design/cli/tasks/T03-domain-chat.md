# T03：`chat` 对话执行（含 SSE 流式）与历史会话域

- **阶段 / 优先级**：Phase 1 · P1（高频主力域，唯一重度覆盖 `appKey` 凭据）
- **状态**：待前置 T00（飞书多维表格 Record: `reczz28YDq8uVFMC` · [任务看板](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc)）
- **前置依赖**：T00（需要 SSE 解析器、流式渲染、确认门禁与上传适配器）
- **开发红线**：必读 [engineering-standards.md](../engineering-standards.md) · 总览 [design.md](../design.md) · 索引 [index.md](../index.md)
- **可并行性**：T00 合入后与 T01、T02、T04 ~ T10 完全并行

---

## 1. 目标

实现与 FastGPT 应用对话（同步 & 流式 SSE）、暂停生成、会话初始化、历史会话列表/重命名/删除、消息与引用详情查询及反馈提交。

---

## 2. 命令设计与接口映射

> 务必核对 `projects/app/src/pages/api/v2/chat/**` 与 `projects/app/src/pages/api/core/chat/**` 的 `authCert` / `authChatCert` 规则，精准区分哪些接口放行 `appKey`。

| 命令 | 对应服务端接口 | 风险 | `authModes` | 说明 |
|---|---|---|---|---|
| `chat run [appId] [message]` | `/v2/chat/completions`（默认）或 `--v1` 走 `/v1/chat/completions` | `write` | `['token', 'personalKey', 'appKey']` | 支持 `--stream` / `--no-stream`、`--chat-id`、`--variables <json>`、`--detail`、`--message` / `--stdin`、`--file <path>`（多模态上传） |
| `chat stop` | `/v2/chat/stop` | `write` | `['token', 'personalKey', 'appKey']` | 停止进行中的响应（`--app-id`、`--chat-id`） |
| `chat test <appId> [message]` | `/core/chat/chatTest` | `write` | `['token']` | 调试尚未发布的草稿工作流/应用（支持 `--file` 传入本地草稿 JSON） |
| `chat init` | `/core/chat/init` | `read` | 核对路由后确定 | 获取应用开场白、输入引导与历史基础信息 |
| `chat history list` | `/core/chat/history/getHistories` | `read` | `['token', 'personalKey', 'appKey']`（核对） | 支持 `--app-id`、分页 |
| `chat history update <chatId>` | `/core/chat/history/updateHistory` | `write` | 核对路由 | 重命名或置顶会话 |
| `chat history delete <chatId>` | `/core/chat/history/delHistory` | `destructive` | 核对路由 | 删除单条会话（需 `--yes`） |
| `chat history clear` | `/core/chat/history/clearHistories` | `destructive` | 核对路由 | 清空应用下全部会话（强制 `--confirm <appId>` 或 `--yes`） |
| `chat record list <chatId>` | `/core/chat/record/getPaginationRecords` / `getRecords_v2` | `read` | 核对路由 | 拉取消息记录与流程节点耗时 |
| `chat record detail <chatId> <dataId>` | `/core/chat/record/getResData` | `read` | 核对路由 | 查看单条 AI 回复完整节点运行数据（`responseData`） |
| `chat record quote` | `/core/chat/record/getQuote` | `read` | 核对路由 | 查看知识库引用源 |
| `chat record delete <chatId> <dataId>` | `/core/chat/record/delete` | `destructive` | 核对路由 | 删除单条消息 |
| `chat feedback` | `/core/chat/feedback/updateUserFeedback` | `write` | 核对路由 | 提交点赞/点踩与自定义反馈 |

---

## 3. 核心实现要点与限制

### 3.1 `appKey` 场景下的 `appId` 自动推导与互斥保护
- 当当前生效凭据是 **`appKey`** 时，服务端绑定了唯一 `boundAppId`（已在 `config.json` 或 `whoami` 缓存）。
- 若用户执行 `fastgpt chat run "你好"` 未传 `<appId>`，可从 `resolvedAuth.credential.boundAppId` 自动回填；若用户显式传入了与 `boundAppId` 不一致的 `appId`，本地直接警告或以 `CliArgumentError` 提示。
- 若当前凭据为 `token` 或 `personalKey`，`appId` 为必填参数（缺少时抛 `CliArgumentError`）。

### 3.2 流式输出协议（TTY vs `--format json`）
- **非流式（默认或 `--no-stream`）**：走标准 `executeCommandWithPipeline`，text 模式打印回复文本与可选引用/节点耗时摘要，JSON 模式返回标准 `fastgpt-cli-result/v1` 信封。
- **流式（`--stream`）**：
  - **TTY 文本模式**：实时将增量 delta chunk 写入 `stdout`，结束时在 `stderr`（除非 `--quiet`）输出 `chatId` / `responseData` 摘要；若启用 `--detail`，同时展示节点执行阶段事件（`flowNodeStatus`）。
  - **`--format json`（非 TTY 或管道）**：按 **NDJSON**（每行一个 JSON 事件 `{ "schemaVersion": "fastgpt-cli-stream/v1", "event": "...", "data": ... }`）实时吐出，最后一行 emit `"event": "done"` 汇总完整响应；禁止把未包信封的零散纯文本混进 `--format json` 的 stdout。
- 捕获 `SIGINT`（Ctrl+C）时取消 `AbortController`，若已拿到 `chatId` 与 `appId` 可选提示或尝试调 `/v2/chat/stop`。

### 3.3 目录落点
- `src/domain/chat/chat-service.ts`
- `src/domain/chat/history-service.ts`
- `src/cli/commands/chat/*.ts`

---

## 4. 验收标准与测试清单

- [ ] 单测覆盖：`chat run` 非流式 JSON 信封输出、SSE 流式在 text 与 `--format json` (NDJSON) 下的正确解析。
- [ ] 单测覆盖：`appKey` 缺省 `appId` 时自动使用 `boundAppId`；`token`/`personalKey` 缺 `appId` 时退出码 `2`。
- [ ] 单测覆盖：`chat test` 使用 `personalKey` 时本地门禁拦截返回退出码 `3`。
- [ ] 单测覆盖：`chat history clear` / `delete` 非 TTY 无 `--yes` 返回退出码 `2`。
- [ ] 全套本地门禁（`test:ci` / `lint` / `build:bun` / `compile` / `app typecheck`）通过。
