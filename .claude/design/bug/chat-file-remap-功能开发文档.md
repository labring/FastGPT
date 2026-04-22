# 功能开发文档

## 文档标识

- 任务前缀：`chat-file-remap`
- 文档文件名：`chat-file-remap-功能开发文档.md`
- 更新时间：2026-04-22
- 文档定位：实现对齐与验收口径（仅修新流量，不回填历史）

## 0. 开发目标与约束

- 功能目标：修复新流量中 file-only 消息退化为 `null` 的问题，把文件解析内容固化到当前轮 user 文本并入库。
- 代码范围：保存前增强函数、`v1/v2/chatTest` 保存链路、`chat/tool` 运行时文件拼接链路、相关测试与日志清理。
- 非目标（明确不做）：历史数据回填、`file_url` 直传模型、API/DB schema 调整。
- 实现原则：简单优先、最小改动、避免不必要抽象。
- 必须遵循规范：`references/style-standards-entry.md`。
- 适用维度（从需求分析继承）：API[ ] DB[ ] Front[ ] Logger[ ] Package[x] BugFix[x] DocUpdate[x] DocI18n[ ]。

## 1. 实施任务拆解（可直接执行）

| 任务ID | 任务名称 | 责任层（API/Service/DB/Front） | 输入 | 输出 | 完成定义（DoD） |
|---|---|---|---|---|---|
| T1 | 保存前增强函数统一入口 | Service | 当前轮 `userContent`（含 file） | `enrichedUserContent` | `enrichUserContentWithParsedFiles` 可把 `<FilesContent>` 追加到 user 文本 |
| T2 | v1/v2 保存链路接入增强结果 | API/Service | `enrichedUserContent` | v1/v2 使用增强值保存 | `ensure/prepare/finalize/push/updateInteractive` 不再使用原始 `userQuestion` 保存 |
| T3 | chatTest 保存链路同步接入 | API/Service | `enrichedUserContent` | chatTest 与 v1/v2 行为一致 | chatTest 在 prepare 与 finalize/updateInteractive 同步使用增强值 |
| T4 | 运行时消息拼接口径对齐 | Service | 当前轮 `fileLinks/inputFiles` | 文件内容仅进入当前轮 user input | `chat.ts/tool/index.ts` 不再把文件内容拼进 system，且不再读取 histories 文件 URL |
| T5 | 清理调试日志与补齐回归测试 | Service/Test | T1-T4 改动后的链路 | 干净日志 + 可执行测试 | 清理临时 `console` 输出，新增/更新测试覆盖核心场景 |

## 2. 文件级改动清单

| 文件路径 | 改动类型（新增/修改/删除） | 变更摘要 | 关键代码（可伪代码） | 关联任务ID |
|---|---|---|---|---|
| `packages/service/core/chat/utils.ts` | 修改 | 复用并统一 `enrichUserContentWithParsedFiles` 作为保存前增强入口 | `const enriched = await enrichUserContentWithParsedFiles(...)` | T1 |
| `projects/app/src/pages/api/v1/chat/completions.ts` | 修改 | 保存参数改用 `enrichedUserQuestion` | `userContent: enrichedUserQuestion` | T2 |
| `projects/app/src/pages/api/v2/chat/completions.ts` | 修改 | 保存参数改用 `enrichedUserQuestion` | `userContent: enrichedUserQuestion` | T2 |
| `projects/app/src/pages/api/core/chat/chatTest.ts` | 修改 | 保存参数改用 `enrichedUserQuestion` | `userContent: enrichedUserQuestion` | T3 |
| `packages/service/core/workflow/dispatch/ai/chat.ts` | 修改 | 文件提示词改拼到 `finalUserInput`，并去除 histories 文件回读 | `const finalUserInput = [replaceInputValue, filePrompt].join(...)` | T4 |
| `packages/service/core/workflow/dispatch/ai/tool/index.ts` | 修改 | 与 chat 路径对齐：文件提示词进 user，system 不再接收文件内容；URL 仅取当前轮 | `const finalUserInput = [userChatInput, filePrompt].join(...)` | T4 |
| `packages/service/core/ai/llm/utils.ts` | 修改 | 清理调试输出，保留 `file_url` 过滤逻辑 | 删除临时 `console.*` | T5 |
| `test/cases/service/core/chat/utils.test.ts` | 新增/修改 | 补齐保存前增强场景测试 | file-only/file+text/多文件/空解析 | T5 |
| `test/cases/service/core/ai/llm/utils.test.ts` | 修改 | 增加 `file_url` 过滤后的回归断言 | 有 text 时不退化 `null` | T5 |

### 2.1 关键代码片段（用于规划核对）

```ts
// 保存前增强
const enrichedUserQuestion = await enrichUserContentWithParsedFiles({
  userContent: userQuestion,
  requestOrigin: req.headers.origin,
  maxFiles: chatConfig?.fileSelectConfig?.maxFiles || 20,
  customPdfParse: chatConfig?.fileSelectConfig?.customPdfParse,
  teamId,
  tmbId: String(tmbId)
});
```

```ts
// v1/v2/chatTest 保存阶段统一使用增强后的 userContent
await finalizeChatRound({
  ...params,
  userContent: enrichedUserQuestion
});
```

## 3. 后端实施说明

### 3.1 API 改动

N/A（无对外接口结构变化）。

### 3.2 Service/Core 改动

| 模块 | 函数/类型 | 具体改动 | 依赖关系 |
|---|---|---|---|
| `packages/service/core/chat/utils.ts` | `enrichUserContentWithParsedFiles` | 仅处理当前轮 file URL，解析后拼接 `<FilesContent>` 到 user 文本；无文件或解析为空则不改原值 | 依赖 `getFileContentFromLinks` |
| `projects/app/src/pages/api/v1/chat/completions.ts` | `handler` | 保存链路统一使用 `enrichedUserQuestion` | 依赖增强函数 |
| `projects/app/src/pages/api/v2/chat/completions.ts` | `handler` | 保存链路统一使用 `enrichedUserQuestion` | 依赖增强函数 |
| `projects/app/src/pages/api/core/chat/chatTest.ts` | `handler` | 调试链路保存同样使用 `enrichedUserQuestion` | 依赖增强函数 |
| `packages/service/core/workflow/dispatch/ai/chat.ts` | `getMultiInput/getChatMessages` | URL 仅取当前轮 `fileLinks/inputFiles`；不再读取 histories 文件 URL；文件内容拼接至当前轮 user input | 与保存前固化策略一致 |
| `packages/service/core/workflow/dispatch/ai/tool/index.ts` | `getMultiInput/dispatchRunTools` | 与 chat 路径一致；不再将文件内容拼到 system prompt；保留 `hasReadFilesTool` 分支 | tool 调用行为与 chat 一致 |
| `packages/service/core/ai/llm/utils.ts` | `loadRequestMessages` | 保持 `file_url` 过滤逻辑，不改协议行为，仅清理调试输出 | 与上游固化策略协同 |

### 3.3 数据层改动

N/A（不改 schema、索引、迁移逻辑）。

### 3.4 Bug 修复实施（命中时必填）

| 项目 | 内容 |
|---|---|
| 问题点文件 | `packages/service/core/ai/llm/utils.ts`、`projects/app/src/pages/api/v1/chat/completions.ts`、`projects/app/src/pages/api/v2/chat/completions.ts`、`projects/app/src/pages/api/core/chat/chatTest.ts`、`packages/service/core/workflow/dispatch/ai/chat.ts`、`packages/service/core/workflow/dispatch/ai/tool/index.ts` |
| 问题点函数/代码段 | `loadRequestMessages`、三个路由的保存参数组装、`getMultiInput/getChatMessages/dispatchRunTools` |
| 触发条件 | file-only 新轮次消息 |
| 根因（直接原因） | `file_url` 被过滤后无文本可保留 |
| 根因（深层原因） | 文件内容未在保存前固化到 user 文本 |
| 修复动作 | 保存前增强并统一接入三条保存链路 |
| 影响范围 | 新流量 chat 历史持久化与历史回放 |

修复关键代码（可伪代码）：

```ts
if (hasFileInCurrentUserRound) {
  enrichedUserContent = appendFilesContentToUserText(userContent);
}
save(userContent: enrichedUserContent);
```

回归验证：

1. 原始 file-only 场景不再落 `null`。
2. 次轮不重写首轮内容。
3. 无 file 场景无回归。

## 4. 前端实施说明

N/A（本期无前端改动）。

## 5. 日志与可观测性

| 触发点 | 日志级别 | category | 字段 | 备注 |
|---|---|---|---|---|
| 临时调试日志清理 | N/A | N/A | N/A | 删除临时 `console.log/console.dir`，不新增日志点 |

注意事项：

- 不新增观测方案。
- 不在用户敏感消息上打印调试内容。

## 6. 文档更新提醒（必填）

规范来源：`references/doc-update-reminder.md`

| 文档路径 | 文档类型 | 更新原因 | 计划更新内容 | 负责人 | 截止时间 | 状态 |
|---|---|---|---|---|---|---|
| `chat-file-remap-需求设计文档.md` | 研发设计文档 | 统一口径为“仅修新流量” | 更新背景、范围、方案、验收 | Codex | 2026-04-22 | 本次完成（2026-04-22） |
| `chat-file-remap-功能开发文档.md` | 研发开发文档 | 同步实施任务与测试口径 | 更新任务拆解、改动清单、测试计划 | Codex | 2026-04-22 | 本次完成（2026-04-22） |

## 7. 文档 i18n 实施说明（命中时必填）

N/A，原因：本次未改 `document/content/docs` 目录。

## 8. 测试与验证

测试规范来源：`references/testing-standards.md`

### 8.1 测试文件映射（必填）

| 源文件路径 | 文件类型（packages/projects） | 目标测试文件路径 | 是否跳过 | 跳过理由 |
|---|---|---|---|---|
| `packages/service/core/chat/utils.ts` | packages | `test/cases/service/core/chat/utils.test.ts` | 否 | 保存前增强核心逻辑 |
| `projects/app/src/pages/api/v1/chat/completions.ts` | projects | `-` | 是 | 当前仓库无 `chatFilePersist` 路由测试文件，本期以单测+联调核验 |
| `projects/app/src/pages/api/v2/chat/completions.ts` | projects | `-` | 是 | 当前仓库无 `chatFilePersist` 路由测试文件，本期以单测+联调核验 |
| `projects/app/src/pages/api/core/chat/chatTest.ts` | projects | `-` | 是 | 当前仓库无 `chatFilePersist` 路由测试文件，本期以单测+联调核验 |
| `packages/service/core/workflow/dispatch/ai/chat.ts` | packages | `-` | 是 | 当前未新增 dispatch 层定向单测，依赖联调验证 |
| `packages/service/core/workflow/dispatch/ai/tool/index.ts` | packages | `-` | 是 | 当前未新增 dispatch 层定向单测，依赖联调验证 |
| `packages/service/core/ai/llm/utils.ts` | packages | `test/cases/service/core/ai/llm/utils.test.ts` | 否 | 回归 `file_url` 过滤行为 |

### 8.2 自动化测试设计

| 类型 | 用例 | 预期结果 |
|---|---|---|
| 单元测试 | 用例1：首轮 file-only | human 入库内容含 `<FilesContent>`，不为 `null` |
| 单元测试 | 用例2：首轮 file+text，次轮 text-only | 首轮内容保持不变，不被重写 |
| 单元测试 | 用例3：同轮多个 file | 固化文本中多文件段顺序稳定 |
| 单元测试 | 用例4：无 file 普通轮次 | 行为与现状一致 |
| 回归测试 | `loadRequestMessages` 过滤 `file_url` | 修复后新数据历史回放不退化为 `null` |

### 8.3 场景覆盖核对

| 场景 | 是否覆盖 | 对应用例/describe |
|---|---|---|
| 基础场景 | 是 | file-only、file+text |
| 复杂场景 | 否 | v1/v2/chatTest 三链路一致性目前依赖联调，待补路由级自动化测试 |
| 边界值 | 是 | 多文件、空解析 |
| 安全边界（死循环/系统崩溃/超大数据） | 否 | 本期不涉及容量治理 |
| 异常场景 | 是 | 文件解析失败时不污染原 userContent |

### 8.4 执行命令与结果

```shell
pnpm -s vitest run test/cases/service/core/chat/utils.test.ts test/cases/service/core/ai/llm/utils.test.ts
```

| 命令 | 结果 | 覆盖率（行/分支） | 备注 |
|---|---|---|---|
| `pnpm -s vitest run test/cases/service/core/chat/utils.test.ts test/cases/service/core/ai/llm/utils.test.ts` | 已通过（49 tests） | 覆盖率由 vitest 输出 | 2026-04-22 本地执行通过；包含 `file_url` 过滤回归断言 |

### 8.5 手工验证（可选）

| 场景 | 操作步骤 | 预期结果 |
|---|---|---|
| 正常流程 | 首轮上传文件并提问，次轮继续文本提问 | 首轮 human 内容持久化文件正文且保持不变 |
| 异常流程 | 首轮上传不可解析文件 | 不报致命错误，保持原有兜底行为 |
| 调试流程 | 使用 chatTest 发送 file-only | 与 v1/v2 一样不再出现 `null` 退化 |

## 9. 质量自检清单

- [x] 保存链路三入口（v1/v2/chatTest）均接入增强后的 `userContent`
- [x] 未改动 API/DB schema
- [x] 未引入 `file_url` 直传模型逻辑
- [x] 调试日志已清理
- [x] 测试场景覆盖用例1-4与回归项
- [x] 运行时不再将文件内容拼接到 system prompt
- [x] 运行时不再读取 histories 文件 URL
- [x] 文档更新提醒已填写
- [x] 明确“仅修新流量，不回填历史”

## 10. 发布与回滚

### 10.1 发布步骤

1. 完成 T1-T4 代码实现与测试。
2. 执行自动化测试并记录结果。
3. 合并发布。

### 10.2 回滚触发条件

- 新流量出现历史写入异常或链路不一致。

### 10.3 回滚步骤

1. 回退 `enrichedUserContent` 接入改动。
2. 恢复到原始保存链路并重新验证。

## 11. AI 实施提示（给执行模型）

- 严格按 T1 -> T2 -> T3 -> T4 顺序执行。
- 不扩展到历史回填与协议调整。
- 每完成一个任务即补对应测试与结果。
