# 对话停止两层架构设计方案

## 1. 设计背景与第一性原理

用户点击“停止生成”时，本质诉求只有四点：

1. **立刻止损**：停掉当前正在等待的请求，绝不再开启新节点、新工具、自动续写或重试。
2. **保住已产出，守住安全线**：保留已经生成的部分正文/推理内容、已跑完节点输出与计费，但**内容审核阻断红线绝不能被“停止”绕过**。
3. **隔离不可取消任务**：面对不支持取消的第三方插件或长耗时 I/O，到点必须果断脱钩，且其迟到返回绝不能污染本轮或下一轮记录。
4. **前后端状态绝对一致**：后端未完成数据库落库与生成租约（Lease）释放前，绝不宣布本轮结束；前端确认结束或兜底超时后再恢复输入能力。

为兼顾**系统确定性**与**节点渐进优化**，停止能力拆分为**两层架构**：

- **第一层（外层 3s 硬兜底壳）**：不管内部是什么节点、是否支持取消，触发停止后最长在 **3 秒** 内强制脱钩、完成安全审核、落库、解锁并向前端发送结束信号，保证系统绝对不卡死。
- **第二层（节点层渐进合作）**：在第一层兜底之上，按收益优先级逐步让各类节点监听取消信号，争取在 3 秒内主动收敛并交回已有部分结果（通常几十毫秒内完成，不傻等满 3 秒）。

---

## 2. 总体时序与分层职责

```text
用户点击停止
  ↓
POST /api/v2/chat/stop
  ├─ 写入 Redis 停止标记（跨实例兜底，100ms 轮询）
  └─ 同进程 localStopEmitter 立即触发（毫秒级唤醒）
        ↓
  激活 RunScope（唯一 AbortSignal + 绝对截止点 stopDeadlineAt = now + 3000ms）
        ├──→ [第二层：节点协作] LLM / Agent / 子流程 / 工具监听 stopSignal，尽快带部分结果返回
        └──→ [第一层：外层兜底] 若节点未在 stopDeadlineAt 前返回 → 到点强制脱钩 + 封锁写入栅栏
        ↓
  唯一出口统一裁决（内容审核 > 用户停止 aborted > 交互暂停 paused > 错误/完成）
        ↓
  统一收尾事务（关闭旁路 → 落库 → 释放生成租约 Lease → 发 [DONE] → flushResume → res.end）
        ↓
  前端收到 [DONE]（或 4000ms 兜底超时）→ 同步状态并解锁输入
```

---

## 3. 第一层设计：3 秒强制兜底壳（必须满足的 4 条底线）

第一层不依赖任何具体节点的内部配合，但自身必须把**信号、时间、写入、裁决、收尾**完全闭环。

### 3.1 统一运行作用域 `RunScope`（信号 + 绝对截止时间）

禁止各模块分别维护静态减法超时（如外层 `3000ms`、子流程 `2800ms`、Agent `2500ms` 再叠加旁路超时）。入口创建统一的 `RunScope`：

- **单一不可逆信号**：`stopSignal: AbortSignal` 与 `isStopping(): boolean` 绑定同一状态源；状态只允许 `false -> true`。
  - 同进程：通过 `localStopEmitter`（`packages/service/core/chat/stop.ts`）立即唤醒。
  - 跨实例：Redis Key `agent_runtime_stopping:{sourceType}:{sourceId}:{chatId}`（TTL 60s）+ `100ms` 非重叠轮询兜底。
  - v1 协议兼容：结合 HTTP 连接断开 tracker（`clientAbortTracker`）。
- **绝对截止时间（Deadline）**：
  - 触发停止的瞬间记下 `stopDeadlineAt = Date.now() + 3000`。
  - 任何需要等待收尾的内层模块只计算 `remainingBudgetMs = Math.max(0, stopDeadlineAt - Date.now() - reserveMs)`，保证内层一定早于外层截止点收敛。
  - **非关键旁路预算归零**：如自动生成标题（`titleSender`），一旦检测到本轮已触发停止，**直接跳过等待并 `titleSender.close()`**，防止“3s 工作流宽限 + 3s 标题超时”击穿前端 `4000ms` 等待窗口。

### 3.2 单向写入栅栏 `WriteGate`（彻底隔离孤儿节点）

超时强制脱钩后，底层未完成的可怕之处在于**“迟到写入”**。外层到达 `stopDeadlineAt` 或主循环退出时，立即执行原子封锁 `seal()`：

- **工作流节点输出与边调度**：`WorkflowQueue` 标记 `detached` / `closed`，禁止再入队或激活下游节点。
- **工作流变量状态**：`WorkflowVariableState.close()` 封锁延迟写入。
- **节点响应写入**：`WorkflowNodeResponseSink.close()` 与 `WorkflowNodeResponseWriter.close()` 拒绝迟到写入。
- **SSE 与 Resume Stream**：`gatedWorkflowStreamResponse` 与 `streamResponseContext`（`resumeFlushed` 之后禁写），确保主流程收尾后不再往响应流或 Redis Stream 塞入孤儿事件。
- **孤儿 Promise 异常吞并**：通过 `raceToolWithStopGrace` 等脱钩器托管底层 Promise 的 `.catch(() => {})`，防止迟到拒绝演变为 `UnhandledPromiseRejection`。

### 3.3 唯一出口裁决（禁止中间层提前抹除错误）

为了解决“停止、内容审核、交互暂停、系统错误”互相踩脚的问题，确立硬性原则：**中间层保留原始异常与审核标记，只在唯一出口按固定优先级裁决**。

出口裁决优先级（从高到低）：

1. **内容审核阻断（最高红线）**：无论是否同时触发停止，只要命中输入/流式/推理/工具结果审核阻断或 `isModerationBlockErrorMessage`，必须先完成敏感内容脱敏与占位替换（`MODERATION_BLOCKED_REPLACE_TEXT`）。
2. **用户主动停止（`aborted`）**：在确认未命中审核阻断的前提下：
   - 将停止引发的中断错误静默为正常停止，不写入节点失败详情，不触发节点异常分支（`catchError`）；
   - 压过未决定的交互暂停（`pendingAsk` / `pendingToolChild` / `pendingToolStop`），避免写入悬空交互状态；
   - 在 Agent Loop 出口为同一 `assistant` 消息中尚未执行的 `tool_calls` 自动补齐成对 `Tool` 占位结果（`Tool execution was stopped by user.`），保证多轮消息历史合法；
   - 在停止期间如已产出部分内容（如 `assistantResponses`），保留该部分输出。
3. **交互暂停（`paused`）**。
4. **真实故障（`error`）或正常结束（`done`）**。

### 3.4 统一收尾事务顺序 `ChatRoundFinalizer`

所有流式对话与 Builder/Helper 接口（`v2/chat/completions`、`v1/chat/completions`、`chatTest`、`chatHome`、`workflowBuilder/handler`、`chatAgentHelper/completions`）必须严格遵守以下物理顺序，`finally` 只作幂等兜底：

```text
1. 封锁 WriteGate + 关闭旁路（如 titleSender.close()）
2. 写入数据库（保存部分输出 / 节点记录 / 计费 / 终态）
3. 幂等释放生成租约（releaseGenerationLease）+ 清理停止标记（cleanup）
4. 写入 SSE 收尾帧（answerStop + done / error）
5. await streamResponseContext.flushResume()
6. res.end()
```

> **不变量**：`[DONE]`（含 Redis Stream mirror）代表“数据已落库、生成锁已解开”。绝不允许在释放租约前发送 `[DONE]`，否则 `/api/core/chat/resume` 读到 `[DONE]` 后立即结束，会跳过最终记录同步并触发前端下一轮 `409 chatIsGenerating`。

---

## 4. 前端状态契约与恢复流（Resume）语义

### 4.1 停止操作流程

1. 用户点击停止按钮，禁用发送并保持“停止中”转圈状态，调用 `POST /api/v2/chat/stop` 确认服务端已写好停止标记（写入失败不可强行断流，防止前后端脱节）。
2. 客户端进入等待窗口（`STOP_STREAM_SETTLE_TIMEOUT_MS = 4000ms`），优先等待后端发来 `[DONE]` 自然结束流。
3. 收到 `[DONE]` 或到达 4s 兜底超时后，中止本地请求并刷新/对齐会话状态，恢复可发送状态。

### 4.2 明确中止原因（AbortReason），消除 Resume 死代码

`$resumefetch` 在请求建立后收到 `abort` 会走 `onAbort()` 正常 `resolve` 而不是抛异常进入 `catch`。因此 `useChatResume` 必须在 `try` 与 `catch` 两条路径上**共享同一套中止原因判断**：

- `aborted_by_lifecycle`（切换会话、页面卸载、被新恢复流替换）：直接静默退出，绝不改动当前 UI 记录或触发兜底结束。
- `aborted_by_user`（用户主动点击停止）：刷出缓冲区最后一段增量文本，调用 `finishResumeAiRecord` 收尾并置状态为 `done`。

---

## 5. 第二层设计：各类节点 3 秒内配合退出的演进策略

第一层已经兜底“必停 + 不污染 + 不死锁”；第二层的目标只是**缩短等待、带回更多部分成果**。所有节点遵循同一契约：**监听 `RunScope.stopSignal`，尽快带当前已产出内容 return**。

| 优先级 | 节点/能力类别 | 目标退出耗时 | 合作方式 | 不合作时的表现（由第一层兜底） |
| :--- | :--- | :--- | :--- | :--- |
| **P0（高收益）** | **LLM 流式节点、FastAgent / PiAgent** | **< 100ms** | `AbortSignal` 直接传入 HTTP/SDK 请求与流解析器；中断后立即返回已累计的 `answerText` / `reasoningText` / token 用量 | 极少卡住，仅在连接握手无响应时触发 3s 脱钩 |
| **P1（高收益）** | **WorkflowQueue、子工作流、ParallelRun、LoopRun** | **< 200ms** | 停止开启新节点/新循环/新分支；对已在运行的子任务按 `stopDeadlineAt - now - 预留缓冲` 等待收敛，带回已完成分支结果 | 到 `stopDeadlineAt` 强制封锁门禁，未完成分支丢弃 |
| **P2（按需接入）** | **HTTP、MCP、Sandbox、DatasetSearch、ReadFiles、QueryExtension、Compress** | **< 500ms** | 原生支持 `AbortSignal` 的 `fetch`/SDK 直接透传；有远程取消协议的可在 abort 时发取消指令 | 无取消接口的第三方阻塞调用不硬改，直接由第一层 3s 脱钩并丢弃迟到返回 |

---

## 6. 待修正清单与 TODO（对齐当前分支）

以下为当前 `yyh/fix-chat-tool-stop` 分支相对本设计仍需收口的核心项：

### P1：安全与状态一致性（必须修复）
- [x] **修正停止与内容审核的判断顺序**（不提前抹除审核错误）
  - `packages/service/core/ai/llm/agentLoop/provider/piAgent/tool/build.ts`
  - `packages/service/core/workflow/dispatch/index.ts`
  - `packages/service/core/ai/llm/agentLoop/provider/fastAgent/loop/index.ts`、`base.ts`
- [x] **统一所有流式接口为“落库 → 释放租约 → 写 `[DONE]`”**
  - `projects/app/src/pages/api/v2/chat/completions.ts`、`chatTest.ts`
  - `pro/admin/src/pages/api/core/chat/chatHome.ts`、`pro/admin/src/service/core/ai/workflowBuilder/handler.ts`
  - `packages/service/core/ai/auxiliaryGeneration/service.ts` 与 `pro/admin/src/pages/api/core/chat/chatAgentHelper/completions.ts`（将 `writeDone()` 移到落库与解锁之后）
- [x] **用 `stopDeadlineAt` 统一时间账本**，替代各层静态硬编码毫秒减法，并在停止时让 `titleSender` 零预算立即跳过等待。

### P2：行为准确与前端闭环
- [x] **调整 `piAgent/run.ts` 出口裁决顺序**，让 `isStopping()` 优先于 `pendingAsk` / `pendingToolChild` / `pendingToolStop`，保证补齐成对 `tool_calls`。
- [x] **补齐 `stopSignal?.aborted` 漏判点**：`piAgent/run.ts`（`recordContinuationMessage`）与 `fastAgent/loop/base.ts`（续跑消息追加前）。
- [x] **修复 `useChatResume.ts` 停止收尾逻辑**：将 `finishResumeAiRecord` 与生命周期中止保护统一移入 `try` 主返回路径，消除不可达的 `catch` 死代码。

### 第二层演进（后续迭代）
- [x] 排查并补齐暂未接入 `stopSignal` 的具体耗时节点（按 `P0 -> P1 -> P2` 顺序），验证均能在 3s 截止时间前返还已完成部分内容（已补齐知识库检索 Embedding/Rerank 与 Agent 沙盒工具链路；部分不支持 `AbortSignal` 的底层文件/向量库接口仍由外层 3s 兜底壳托管脱钩）。
- [x] 补充覆盖核心边界的局部单元测试（并发审核与停止、`[DONE]` 与 Lease 时序、`stopDeadlineAt` 超时跳过标题、Resume 中止路径）。
