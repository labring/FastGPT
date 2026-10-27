# 工作流与工具节点统一记忆状态（WorkflowMemoryState）设计方案

## 1. 背景

工作流中的部分 AI 节点需要跨轮次持久化内部状态到 `ChatItem.memories`（运行时字段为 `DispatchNodeResponseKeyEnum.memories` / `system_memories`），当前主要包括三类节点：

1. **内容提取（`contentExtract`）**：保存上一轮提取结果与函数返回状态。
2. **问题分类（`classifyQuestion`）**：保存上一轮问题分类对话上下文。
3. **Agent（`agent` / `piAgent`）**：保存暂停态的 `providerState` 及恢复信息。

此前实现存在以下痛点：

- **键名格式不统一**：`extract` 与 `classifyQuestion` 使用 `${sourceType}:${sourceId}:${nodeId}`，而 `agent` 使用 `agentLoopMemory-${nodeId}`，缺少调用路径作用域前缀。
- **同应用/同插件被多次调用时发生键冲突**：当父工作流中存在两个插件节点或两个子应用节点指向同一个目标应用/插件时，其内部节点的 `${sourceType}:${sourceId}:${nodeId}` 完全一致，后执行的实例会覆盖先执行实例的记忆。
- **嵌套容器与工具调用链丢失子流程记忆**：`loopRun`、`parallelRun`、`agent` 子应用/工作流工具（`sub/app`）以及 `toolCall` 工具调用子工作流未向上归集 `system_memories`。
- **并行多子节点回写存在 Lost-Update 风险**：若子流程直接返回合并了历史基线的全量 `memories`，并发完成的兄弟子流程（如 `parallelRun` 并发任务、Agent 并行工具调用 `batchToolSize: 5`、`toolCall` 多路 `dataset_search`）会用各自的旧基线相互覆盖对方刚刚写入的新键。
- **同轮先写后读与末尾非 AI 消息误读**：节点各自散落从 `histories` 切片读取 `memories`，既无法读到同一轮上游或前序循环迭代刚产出的记忆，又容易在 `histories` 末尾为 `Human` 时误读更早轮次的残留状态。

## 2. 设计目标与非目标

### 2.1 目标

1. **统一键格式**：所有工作流节点记忆统一采用 `${scopePath}/${sourceType}:${sourceId}:${nodeId}`（根工作流无前缀时为 `${sourceType}:${sourceId}:${nodeId}`）。
2. **隔离 Legacy 兼容**：将旧版无前缀子流程键（`${sourceType}:${sourceId}:${nodeId}`）与旧版 Agent 键（`agentLoopMemory-${nodeId}`）的兼容读取和覆盖清理全部收拢到单一模块 `utils/memories.ts`，业务节点零感知。
3. **Baseline（只读快照）+ Delta（局部增量）分离**：
   - 根工作流从上一轮末尾 `AI` 历史消息初始化 `baseline`；
   - 子工作流、容器节点、工具调用通过 `fork()` 派生独立子状态（继承当前可读视图为 `baseline`，自身 `delta` 为空）；
   - 子工作流结束时只向父级返回 `getDelta()`（自身新增/修改/显式置 `undefined` 的增量），根工作流结束时返回 `toRecord()`（`baseline + delta`），彻底消除并行子节点回写时的旧基线覆盖问题。
4. **完整覆盖五类并行/嵌套多子节点场景**：
   - 主工作流 DAG 并发兄弟节点（`WorkflowQueue`）
   - Agent 节点并发工具调用（`batchToolSize: 5`）
   - ToolCall 节点多工具调用与多路并发 `dataset_search`
   - ParallelRun 并发任务与失败重试（按任务索引 `0..N-1` 确定性合并）
   - LoopRun 多轮迭代与循环体并发节点（跨成功迭代传递，失败迭代丢弃）
5. **最小侵入**：保持 `agentLoopCore` 通用运行时零改动，在 workflow adapter 层完成记忆派生与归集。

### 2.2 非目标

1. 不修改 MongoDB `ChatItem` schema（仍存储在 `ChatItem.memories` 字典中）。
2. 不对存量历史会话做离线数据迁移，通过运行时读取兼容与写入自动替换完成平滑过渡。

## 3. 核心模型：`WorkflowMemoryState`

`packages/service/core/workflow/dispatch/utils/memories.ts` 提供工作流记忆状态容器 `WorkflowMemoryState`。

```ts
export class WorkflowMemoryState {
  readonly isForked: boolean;

  static fromRecord(
    baseline?: Record<string, any>,
    scopePath?: readonly string[]
  ): WorkflowMemoryState;

  static fromHistories(
    histories?: ChatItemMiniType[],
    parentMemoryState?: WorkflowMemoryState
  ): WorkflowMemoryState;

  fork(scopeSegment?: string, options?: ForkWorkflowMemoryOptions): WorkflowMemoryState;

  getNodeMemoryKey(params: {
    runningAppInfo?: Pick<ChatDispatchProps['runningAppInfo'], 'sourceType' | 'sourceId'>;
    nodeId: string;
  }): string;

  readNodeMemory(params: {
    runningAppInfo?: Pick<ChatDispatchProps['runningAppInfo'], 'sourceType' | 'sourceId'>;
    nodeId: string;
  }): any;

  merge(entries?: Record<string, any>): void;
  getDelta(): Record<string, any>;
  toRecord(): Record<string, any>;
}
```

### 3.1 统一键格式与作用域规则

- **根工作流节点**：`${sourceType}:${sourceId}:${nodeId}`
  - 示例：`app:65f001:extract_1`、`app:65f001:agent_1`
- **跨工作流嵌套节点**（`child/runApp`、`plugin/run`、`abandoned/runApp`、`agent`、`toolCall`）：进入子应用或工具前调用 `memoryState.fork('node:${nodeId}')`，子流程内部节点键自动带上调用路径前缀：
  - 示例：`node:pluginNodeA/app:plugin_1:extract_1`、`node:agent_1/app:subApp_1:extract_1`
- **同工作流内部容器**（`loopRun`、`parallelRun`）：内部节点本身属于当前工作流画布，`nodeId` 在画布内天然唯一，直接调用 `memoryState.fork()`（保持当前 `scopePath`，隔离并发读写与失败回滚）。

### 3.2 读取优先级与 `history` 参数语义

通过统一辅助函数 `readWorkflowNodeMemory` 读取节点记忆：

1. `history === 0`：显式禁用历史上下文，直接返回 `undefined`。
2. `Array.isArray(history)`：上游传入了自定义聊天历史数组，通过 `WorkflowMemoryState.fromHistories(history, memoryState)` 从自定义历史末尾 `AI` 消息读取（同时保留当前 `scopePath`）。
3. `typeof history === 'number'` 或未传：从当前工作流 `memoryState` 读取，优先级为：
   - **当前作用域 `delta`**：支持同轮次先写后读（如 `loopRun` 下一轮读取上一轮更新）；
   - **当前作用域 `baseline`**：精确匹配 `${scopePath}/${sourceType}:${sourceId}:${nodeId}`；
   - **Legacy 基线回退（`readLegacyBaselineMemory`）**：
     1. 若当前处于子作用域且 `baseline` 中尚不存在任何 `/${baseKey}` 结尾的带作用域键，回退读取旧版无前缀键 `${sourceType}:${sourceId}:${nodeId}`；
     2. 回退读取旧版 Agent 键 `agentLoopMemory-${nodeId}`。

### 3.3 写入、删除与 Legacy 键自动清理

- **写入**：节点返回 `{ [DispatchNodeResponseKeyEnum.memories]: { [key]: value } }`，`WorkflowQueue.pushStore` 调用 `this.memoryState.merge(memories)` 写入当前 `delta`。
- **删除/清空**：当节点（如 `piAgent` 完成态）返回 `{ [key]: undefined }` 时，`delta` 显式记录 `key: undefined`；子工作流通过 `getDelta()` 向上传递该 `undefined` 墓碑，最终在根工作流落库（`Mongo` / `JSON` 序列化或对象合并）时清除旧值。
- **Legacy 清理（`cleanupSupersededLegacyKeys`）**：当节点以新统一键写入 `delta` 后，`toRecord()` 自动从合并结果中剔除其对应的旧版无前缀键和 `agentLoopMemory-${nodeId}` 键，防止旧暂停态残留在数据库中。

## 4. 五类并行与嵌套多子节点场景设计

```mermaid
flowchart TD
  Root["Root runWorkflow\nmemoryState (isForked=false)"]
  Queue["WorkflowQueue.pushStore\nmemoryState.merge(node.memories)"]
  Root --> Queue

  subgraph S1["场景 1：工作流级并行子节点 (ChildApp / Plugin)"]
    ChildA["Plugin Node A\nfork('node:pluginA')"]
    ChildB["Plugin Node B\nfork('node:pluginB')"]
  end

  subgraph S2["场景 2 & 3：Agent / ToolCall 并行工具调用"]
    AgentFork["Agent / ToolCall\nfork('node:agentId')"]
    Tool1["Tool Call 1\nfork() -> merge(delta)"]
    Tool2["Tool Call 2\nfork() -> merge(delta)"]
    AgentFork --> Tool1
    AgentFork --> Tool2
  end

  subgraph S4["场景 4：ParallelRun 并发任务与重试"]
    Par["dispatchParallelRun"]
    Task0["Task 0 Attempt\nfork()"]
    Task1["Task 1 Attempt\nfork()"]
    Par --> Task0
    Par --> Task1
  end

  subgraph S5["场景 5：LoopRun 迭代链"]
    Loop["loopMemoryState = fork()"]
    Iter["Iteration i\niterState = loopMemoryState.fork()"]
    Loop --> Iter
  end

  Queue --> S1
  Queue --> S2
  Queue --> S4
  Queue --> S5
```

### 4.1 场景 1：主工作流 DAG 并发兄弟节点（`WorkflowQueue`）

- `WorkflowQueue.checkNodeCanRun` 通过 `Promise.all` 并发调度就绪节点。
- 普通子应用（`child/runApp`）、插件节点（`plugin/run`）、旧版子应用（`abandoned/runApp`）各自调用 `memoryState.fork('node:${nodeId}')` 传入子 `runWorkflow`。
- 子 `runWorkflow` 因 `memoryState.isForked === true` 仅返回 `memoryState.getDelta()`，由父 `WorkflowQueue.pushStore` 合并入父 `memoryState`，兄弟节点互不覆盖。

### 4.2 场景 2：Agent 节点并发调用多个工具（`batchToolSize: 5`）

- `dispatchRunAgent` 在入口创建 `agentMemoryState = memoryState.fork('node:${nodeId}')` 并注入 `createWorkflowAgentLoopRuntime`。
- 当单轮并发执行最多 5 个子应用/工作流工具时，`dispatchApp` 与 `dispatchPlugin` 内部各自调用 `data.memoryState?.fork()` 传入子 `runWorkflow`，执行完毕后调用 `data.memoryState?.merge(system_memories)` 将各自 `delta` 归集到 `agentMemoryState`。
- `dispatchRunAgent` 结束（完成、暂停或异常）时，通过 `buildAgentMemories` 将 `agentMemoryState.getDelta()` 与 Agent 自身的 `providerState` 记忆合并返回。

### 4.3 场景 3：ToolCall 节点多工具调用与并行 `dataset_search`

- `dispatchRunTools` 在入口创建 `toolCallMemoryState = memoryState.fork('node:${nodeId}')` 并传入 `createToolCallToolProvider`。
- `createToolCallToolProvider` 的 `runWorkflowTool` 在每次执行用户工具或通过 `Promise.all` 并发执行多个关联 `datasetSearchNode` 子流程时，为每个子流程调用 `workflowProps.memoryState?.fork()`，并在子流程返回后执行 `workflowProps.memoryState?.merge(result.system_memories)`。
- `dispatchRunTools` 结束时返回 `toolCallMemoryState.getDelta()`。

### 4.4 场景 4：ParallelRun 并发任务与失败重试

- `dispatchParallelRun` 通过 `batchRun` 并发执行最多 `WORKFLOW_PARALLEL_MAX_CONCURRENCY` 个任务，且单个任务支持多次重试（`attempt`）。
- 每次 `attempt` 独立调用 `taskMemoryState = parentMemoryState.fork()`：
  - 若当前 `attempt` 失败并触发重试，或任务最终失败，该次 `attempt` 产出的 `system_memories` 直接丢弃；
  - 若任务成功，将其 `response.system_memories` 记录到 `successfulTaskMemories[index]`。
- 所有并发任务结束后，严格按任务索引 `0..N-1` 顺序合并 `successfulTaskMemories`，确保即使并发完成先后顺序不确定，最终记忆合并结果也完全确定（Deterministic）。

### 4.5 场景 5：LoopRun 顺序迭代与循环体内并发节点

- `dispatchLoopRun` 初始化 `loopMemoryState = parentMemoryState.fork()`。
- 第 `i` 轮迭代创建 `iterationMemoryState = loopMemoryState.fork()` 传入子 `runWorkflow`：
  - **迭代成功**：执行 `loopMemoryState.merge(response.system_memories)`，下一轮迭代 `i + 1` 创建的 `iterationMemoryState` 自动通过 `baseline` 读到第 `i` 轮更新的记忆；
  - **交互暂停（Interactive Pause）**：同样合并已完成节点的记忆增量并随暂停结果返回，保证断点恢复前后的记忆连续；
  - **迭代失败**：不合并本轮 `iterationMemoryState`，确保失败轮次的脏状态不泄漏。
- 循环结束时向上返回 `loopMemoryState.getDelta()`。

## 5. 修改文件清单

| 文件 | 职责与改动说明 |
| --- | --- |
| `packages/service/core/workflow/dispatch/utils/memories.ts` | 新增 `WorkflowMemoryState`、`getWorkflowNodeMemoryKey`、`readWorkflowNodeMemory`、`mergePersistedWorkflowMemories` 及隔离的 Legacy 兼容读写清理逻辑 |
| `packages/service/core/chat/saveChat.ts` | `updateInteractiveChat` 合并 `chatItem.memories` 时通过 `mergePersistedWorkflowMemories` 自动清理已被新统一键替代的旧版 legacy key |
| `packages/service/core/workflow/types/runtime.ts` | `ChatDispatchProps` 新增可选 `memoryState?: WorkflowMemoryState` |
| `packages/service/core/workflow/dispatch/index.ts` | `WorkflowQueue` 初始化并透传 `memoryState`，在 `pushStore` 中实时合并节点 `memories`，`runWorkflow` 按 `isForked` 返回 `getDelta()` 或 `toRecord()` |
| `packages/service/core/workflow/dispatch/ai/extract.ts` | 改用 `readWorkflowNodeMemory` 与 `getWorkflowNodeMemoryKey`，移除内联历史切片查找 |
| `packages/service/core/workflow/dispatch/ai/classifyQuestion.ts` | 改用 `readWorkflowNodeMemory` 与 `getWorkflowNodeMemoryKey`，移除内联历史切片查找 |
| `packages/service/core/workflow/dispatch/ai/agentLoopCore/adapter/memory/providerState.ts` | 统一使用 `getWorkflowNodeMemoryKey` 与 `WorkflowMemoryState` 读写 `piAgent` 的 `providerState` |
| `packages/service/core/workflow/dispatch/ai/agent/index.ts` | 派生 `agentMemoryState = memoryState.fork('node:${nodeId}')`，合并子工具记忆增量与 Agent 自身状态 |
| `packages/service/core/workflow/dispatch/ai/agent/sub/utils.ts` | 将 `memoryState` 透传给 `dispatchApp` / `dispatchPlugin` |
| `packages/service/core/workflow/dispatch/ai/agent/sub/app/index.ts` | `dispatchApp` / `dispatchPlugin` 为子工作流 `fork()` 并将返回的 `system_memories` 合并回父 `memoryState` |
| `packages/service/core/workflow/dispatch/ai/toolcall/index.ts` | 派生 `toolCallMemoryState = memoryState.fork('node:${nodeId}')` 并透出工具子流程记忆增量 |
| `packages/service/core/workflow/dispatch/ai/toolcall/toolProvider/createToolCallToolProvider.ts` | `runWorkflowTool` 为每次工具调用及并发 `dataset_search` 子流程 `fork()` 并合并 `system_memories` |
| `packages/service/core/workflow/dispatch/child/runApp.ts` | 子应用通过 `fork('node:${nodeId}')` 隔离调用路径作用域 |
| `packages/service/core/workflow/dispatch/plugin/run.ts` | 插件工作流通过 `fork('node:${nodeId}')` 隔离调用路径作用域 |
| `packages/service/core/workflow/dispatch/abandoned/runApp.ts` | 旧版子应用通过 `fork('node:${nodeId}')` 隔离调用路径作用域并透传 `system_memories` |
| `packages/service/core/workflow/dispatch/loopRun/runLoopRun.ts` | 循环体每轮 `fork()`，成功/暂停轮次累积合并 `system_memories`，失败轮次丢弃 |
| `packages/service/core/workflow/dispatch/parallelRun/runParallelRun.ts` | 并发任务每轮 `attempt` 独立 `fork()`，按索引 `0..N-1` 确定性合并成功任务的 `system_memories` |

## 6. 测试矩阵

| 测试文件 | 覆盖场景 |
| --- | --- |
| `packages/service/test/core/workflow/dispatch/utils/memories.test.ts` | 根/嵌套作用域键生成、`baseline` 与 `delta` 隔离、并发 `fork()` 不互相覆盖、旧版无前缀子流程键与 `agentLoopMemory-${nodeId}` 兼容读取及新键写入后自动清理、`history=0` / `history=ChatItemMiniType[]` / 末尾 `Human` 边界 |
| `packages/service/test/core/workflow/dispatch/ai/agentLoopCore/memory/providerState.test.ts` | 统一键名格式下 `piAgent` `providerState` 的读取、暂停保存、完成清理、作用域前缀生成与旧版 `agentLoopMemory-${nodeId}` 兼容恢复 |
| `packages/service/test/core/workflow/dispatch/ai/agent/index.test.ts` | Agent 节点暂停与完成时的统一键名记忆输出 |
| `packages/service/test/core/workflow/dispatch/ai/agent/sub/app.test.ts` | Agent 子应用工具调用 `fork()` 作用域生成与 `system_memories` 回写父 `memoryState` |
| `packages/service/test/core/workflow/dispatch/ai/toolcall/toolProvider/createToolCallToolProvider.test.ts` | ToolCall 多路并发 `dataset_search` 与用户工具调用的 `memoryState` 隔离派生与增量归集 |
| `packages/service/test/core/workflow/dispatch/loopRun/runLoopRun.test.ts` | LoopRun 跨成功迭代记忆累积传递、失败迭代回滚丢弃与最終增量透出 |
| `packages/service/test/core/workflow/dispatch/parallelRun/runParallelRun.test.ts` | ParallelRun 并发任务隔离、失败 `attempt` 丢弃、重试恢复以及按任务索引 `0..N-1` 确定性合并 |

## 7. TODO

- [x] Revert `a230fd9c29a98ec91588de3d19ec2fb36a1a8b61`，清理此前耦合实现。
- [x] 实现 `packages/service/core/workflow/dispatch/utils/memories.ts`（`WorkflowMemoryState`、统一键生成、读取辅助函数与 Legacy 兼容层）。
- [x] 改造 `WorkflowQueue` 与 `runWorkflow` 主链路，支持 `memoryState` 实时合并与 `isForked` 增量/全量返回切换。
- [x] 改造 `extract`、`classifyQuestion`、`agentLoopCore/adapter/memory/providerState.ts` 与 `agent/index.ts` 统一使用新记忆接口。
- [x] 改造 `child/runApp`、`plugin/run`、`abandoned/runApp`、`loopRun`、`parallelRun`、`agent/sub/app`、`toolcall` 支持作用域派生与并行子节点记忆归集。
- [x] 补充并通过 `memories.test.ts`、`providerState.test.ts`、`runParallelRun.test.ts`、`runLoopRun.test.ts`、`createToolCallToolProvider.test.ts`、`agent/sub/app.test.ts` 等单元测试与类型检查。
