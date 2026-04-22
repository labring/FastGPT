# HelperBot SSE 异常前缀串文案 Bug 修复文档

## 1. 问题背景

- 问题现象：辅助生成在部分请求中返回内容前出现固定前缀  
  `Error: 响应过程出现异常~您好！请问您希望这个流程模板实现什么功能？...`
- 影响：错误文案污染 AI 正常回答内容，用户误以为模型输出异常文本。
- 触发范围：`HelperBot` 辅助生成链路（`/api/core/chat/helperBot/completions`）。

## 2. 复现与定位结论

### 2.1 运行态复现结论

已通过最小时序复现确认：当 `catch` 先写入错误文本后，迟到的流式 token 会继续追加到该错误文本末尾，最终出现 `Error: ...您好！...` 串接结果。

### 2.2 代码定位（关键锚点）

1. 前端正文注入错误文本（旧坑）
- 文件：`projects/app/src/components/core/chat/HelperBot/index.tsx`
- 代码：`content: \`Error: ${getErrText(error)}\``
- 行锚点：`index.tsx:334`

2. SSE 打开阶段严格校验并触发兜底文案（新触发器）
- 文件：`projects/app/src/web/common/api/fetch.ts`
- 代码：`if (!res.ok || !contentType?.startsWith(EventStreamContentType) || res.status !== 200)`
- 行锚点：`fetch.ts:328`
- 兜底文案：`getErrText(err, error ?? '响应过程出现异常~')`
- 行锚点：`fetch.ts:258`

3. HelperBot 后端路由未显式设置 SSE 头/统一 SSE 异常回写
- 文件：`projects/app/src/pages/api/core/chat/helperBot/completions.ts`
- 当前实现：仅创建 `workflowResponseWrite`，但路由层无显式 SSE 响应头与 `sseErrRes` 异常收口。

## 3. 引入版本与 PR 溯源

1. 旧坑引入点（前端正文写 Error）
- Commit: `76d6234de664b21366b74c579483734ce10d71a1`
- PR: `#6406`（`V4.14.7 features`）
- 结论：在 `HelperBot` 首次接入阶段引入了 `Error:` 正文拼接行为。

2. 问题显性化引入点（更易触发兜底异常）
- Commit: `7506a147e6d2598dd49c2442c5db7bc733e424d1`
- PR: `#6751`（`V4.14.x`，含 stream resume 系列改动）
- 结论：`fetch.ts` 的 SSE `content-type` 校验变严格后，HelperBot 链路更容易进入异常分支，从而高频触发上述旧坑。

> 判断：该问题与“流恢复相关改动”强相关，但不是单点根因，而是“旧坑 + 新触发器”叠加。

## 4. 根因分析（Root Cause）

根因拆分为两个层面：

1. 协议层：HelperBot SSE 响应规范不够稳定
- 当前路由没有在入口显式设置标准 SSE 响应头；
- 异常路径没有统一走 SSE `event:error` 回写；
- 导致前端在 `onopen` 阶段可能走入默认异常兜底。

2. 展示层：前端将错误写入聊天正文
- `catch` 分支把 `Error:` 作为一条 AI 文本插入；
- 增量流式渲染继续写入“最后一段 text”，导致正常文本拼接到错误文本后面。

## 5. 修复目标

1. 不再出现 `Error: 响应过程出现异常~` 污染正文。
2. 异常可见性保留（toast + 日志），但错误与正文分离。
3. 已成功流出的正文片段在异常时保留。

## 6. 修复方案

### 6.1 后端修复（必须）

文件：`projects/app/src/pages/api/core/chat/helperBot/completions.ts`

改动点：
- 显式设置 SSE 响应头：
  - `Content-Type: text/event-stream;charset=utf-8`
  - `Cache-Control: no-cache, no-transform`
  - `Connection: keep-alive`
  - `X-Accel-Buffering: no`
- 主流程增加 `try/catch`；
- 异常统一走 `sseErrRes(res, err)`，确保前端收到 `event:error`；
- 结束时 `res.end()` 收口；
- 增加结构化日志（`chatId`、`chatItemId`、`metadata.type`、`requestId`）。

### 6.2 前端修复（必须）

文件：`projects/app/src/components/core/chat/HelperBot/index.tsx`

改动点：
- 删除 `catch` 中向正文写入 `Error: ...` 的逻辑；
- 改为 `toast` 展示错误；
- 若 AI 最后一条消息已存在可见内容（`text` 或 `reasoning`），保留现有正文；
- 若无可见内容且仅空占位，清理空占位消息。

补充说明（审查修复）：
- 失败清理逻辑不能只判断 `text`，还需判断 `reasoning`；
- 否则在“先流出推理内容、正文尚未产出就失败”的场景会误删推理内容（在 `qwen-max` 等推理型模型中更常见）。

### 6.3 渲染稳健性修复（建议）

文件：`projects/app/src/components/core/chat/HelperBot/index.tsx`

改动点：
- `answer/fastAnswer` 渲染时不再盲写 `item.value[item.value.length - 1]`；
- 改为定位“最后一个可写的 text 响应段”。

## 7. 测试与验收

### 7.1 自动化测试建议

1. 后端 API
- 源文件：`projects/app/src/pages/api/core/chat/helperBot/completions.ts`
- 测试文件：`projects/app/test/api/core/chat/helperBot/completions.test.ts`
- 覆盖点：
  - SSE 响应头正确；
  - dispatch 抛错时回写 `event:error`；
  - 不回落为普通 JSON/text 错误体。

2. 前端 HelperBot
- 源文件：`projects/app/src/components/core/chat/HelperBot/index.tsx`
- 测试文件：`projects/app/test/components/core/chat/HelperBot/index.test.tsx`
- 覆盖点：
  - 异常只 toast，不写正文；
  - 已生成正文（`text` 或 `reasoning`）在异常后保留；
  - 迟到 token 不与错误文本拼接。

### 7.2 手工验收清单

1. `qwen-max` 辅助生成首轮提问，不出现 `Error:` 前缀。
2. 模拟异常（接口抛错）时，仅出现错误提示，不污染正文。
3. 异常前已流出的文本或推理内容仍完整可见。

## 8. 风险与回滚

### 8.1 风险

- SSE 异常收口调整可能影响少量历史前端容错分支行为；
- 前端渲染目标调整可能影响推理块/文本块顺序。

### 8.2 回滚策略

1. 若出现大面积异常显示丢失：
- 回滚 `HelperBot/index.tsx` 的渲染目标调整；
- 保留“错误不写正文”的策略。

2. 若 SSE 连接异常率上升：
- 回滚 `completions.ts` 的 header/异常收口改动；
- 对比网关与浏览器行为后再灰度发布。

## 9. 文档更新提醒

- 状态：`N/A`
- 理由：本次为内部异常链路修复，不改变外部用户功能契约、公开 API 使用方式和产品操作路径。
