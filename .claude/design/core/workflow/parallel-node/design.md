# 并行执行节点（ParallelRun）设计文档 v3

> 需求：在工作流中新增"并行执行"节点，和现有的串行"批量执行（Loop）"并列。  
> 原则：**完全不改动旧 Loop 节点的行为与文件**；parallelRun 作为新容器节点，**直接复用现有的 loopStart / loopEnd 作为其 Start/End 子节点**；通过 enum 改名（value 保持）统一语义。  
> 参考：[PR #6675](https://github.com/labring/FastGPT/pull/6675)

## 版本变迁
- v1：独立 parallelRunStart/End + 复制 NodeLoop
- v2：独立类型 + 抽 hook + 迁移 nested 目录
- **v3（当前）**：复用 loopStart/loopEnd 作为通用"嵌套容器起/终点"，通过 enum 改名但保持 value 兼容，最小化改动

---

## 1. 需求与约束

### 1.1 需求
新增并行执行节点，使输入数组中各元素对应的子工作流可以并发执行，典型场景：批量 LLM 调用、并行抓取 URL、并行数据处理。

### 1.2 关键约束（来自 user）
1. **旧 Loop 节点 0 改动**（不破坏变量累积语义、交互响应断点等）
2. **能复用就复用**：Start / End 节点、组件 UI、Hook 都应尽量抽取共享
3. **env 上限要反映到前端**：作为并发数输入的 max 校验与提示
4. **单个任务失败处理**：结果输出（`parallelRunArray`）中**过滤掉失败项**；完整节点响应中带完整状态数组 `[{success, data}, ...]`
5. **交互节点禁止**：前端阻塞用户把交互节点拖入并行体；极端情况下（API 导入绕过前端），后端**忽略**该任务输出而不 reject
6. **抽 hook**：UI 通用逻辑抽成共享 hook

---

## 2. 核心策略：复用 loopStart/loopEnd + Enum 改名

### 2.1 关键事实（v3 新发现）

原先 v2 认为 `unique: true` 是全局唯一，会阻止 loopStart 在多个容器下共存。**深入调查后发现这是误解**：

| 检查点 | 文件 | 实际作用 |
|-------|-----|---------|
| `useNodeTemplates.tsx:42-48` | `getNodeList().some(...)` + 模板列表过滤 | **仅隐藏模板面板里的可见项**，防止用户手动拖第二个 |
| `useKeyboard.tsx:52,71` | 复制时过滤 | 复制粘贴时去掉 unique 节点 + 整个 loop 禁止复制 |
| `list.tsx:325-340` 自动创建 | `newNodes.push(startNode, endNode)` | **完全不经过 unique 检查** |

**现状**：`loop` 节点本身**没有** `unique: true`。用户可以在同一工作流里拖 N 个 Loop，每个 Loop 自动生成自己的 loopStart + loopEnd。**多个 loopStart 节点并存早已是现状**。

**推论**：parallelRun 节点**可以直接把 loopStart / loopEnd 作为自己的 Start/End 子节点**，unique 检查完全不干扰。

### 2.2 loopStart/loopEnd 前端组件的硬编码：不是障碍

- `NodeLoopStart.tsx:41` 读父节点的 `NodeInputKeyEnum.loopInputArray`
- `NodeLoopEnd.tsx:63-66` 写父节点的 `NodeOutputKeyEnum.loopArray`

**只要 parallelRun 节点的输入/输出也用这两个 key，这两个组件 0 改动就能工作**。

### 2.3 Enum 改名策略（user 指定）

**原则**：**enum 键名改为语义通用的 `nested*`，TypeScript 值保持原字符串不变**。

这样做：
- ✅ 代码里写 `NodeInputKeyEnum.nestedInputArray` 语义清晰
- ✅ 运行时序列化数据仍是 `"loopInputArray"`，数据库/JSON 导出完全兼容
- ✅ 不需要数据迁移
- ✅ 复用 NodeLoopStart/End 组件 0 改动

### 2.4 完整改名清单

#### `FlowNodeTypeEnum`
```typescript
export enum FlowNodeTypeEnum {
  loop = 'loop',                    // 保持（旧 Loop 节点）
  nestedStart = 'loopStart',        // 改名（原 loopStart），作为所有嵌套容器的起点
  nestedEnd = 'loopEnd',            // 改名（原 loopEnd），作为所有嵌套容器的终点
  parallelRun = 'parallelRun',      // 新增
  // ...
}
```

#### `NodeInputKeyEnum`
```typescript
nestedInputArray = 'loopInputArray',        // 改名
nestedStartInput = 'loopStartInput',        // 改名
nestedStartIndex = 'loopStartIndex',        // 改名
nestedEndInput = 'loopEndInput',            // 改名
nestedNodeInputHeight = 'loopNodeInputHeight', // 改名
parallelRunMaxConcurrency = 'parallelRunMaxConcurrency', // 新增
```

#### `NodeOutputKeyEnum`
```typescript
nestedArrayResult = 'loopArray',            // 改名
nestedStartInput = 'loopStartInput',        // 改名
nestedStartIndex = 'loopStartIndex',        // 改名
```

#### 常量
```typescript
// packages/global/core/workflow/template/input.ts
Input_Template_NESTED_NODE_OFFSET  // 原 Input_Template_LOOP_NODE_OFFSET
// 内部的 key 字段引用也相应改为 NodeInputKeyEnum.nestedNodeInputHeight
```

### 2.5 改名影响范围（已 grep 统计）

| 改名项 | 影响源文件数 |
|-------|------------|
| `NodeInputKeyEnum.loop*` | 12 个源文件 |
| `NodeOutputKeyEnum.loop*` | 6 个源文件 |
| `FlowNodeTypeEnum.loopStart/End` | 7 个源文件 |
| `Input_Template_LOOP_NODE_OFFSET` | 3 个源文件 |

**总计约 15-18 个源文件**（有重叠），全部是**机械式替换**（IDE rename symbol），0 运行时行为变更。

### 2.6 决策总结

**方案 A 完整版**：
1. 改名现有 loop 相关 enum 键为 `nested*`，value 保持
2. `FlowNodeTypeEnum.loopStart` / `loopEnd` 改名为 `nestedStart` / `nestedEnd`（值保持）
3. **新增** `FlowNodeTypeEnum.parallelRun`
4. **新增** 1 个后端 dispatch（`runParallelRun.ts`）
5. **新增** 1 个前端节点组件（`NodeParallelRun.tsx`）
6. parallelRun 节点的输入数组复用 `nestedInputArray`（即原 loopInputArray），输出数组复用 `nestedArrayResult`
7. parallelRun 节点的 Start/End 直接复用 `nestedStart` / `nestedEnd`，0 新组件、0 新 dispatch、0 新 i18n Start/End 文案
8. **0 改动** `NodeLoop.tsx` / `NodeLoopStart.tsx` / `NodeLoopEnd.tsx` / `runLoop.ts` / `runLoopStart.ts` / `runLoopEnd.ts` 的运行时逻辑（只有 enum 键名的引用替换）

**不需要做的事**（相对 v2）：
- ❌ 不抽 `useContainerNode` / `useContainerChildIO` hook
- ❌ 不建 `ContainerNodeShell.tsx`
- ❌ 不迁移 `Loop/` 目录到 `nested/`
- ❌ 不新增 parallelRunStart / parallelRunEnd flowNodeType
- ❌ 不重构 NodeLoop 系列组件
- ❌ 不新增 Start/End 的 i18n 文案和图标

---

## 3. 详细设计决策

### 3.1 节点命名

| 项目 | 值 |
|------|-----|
| FlowNodeType | `parallelRun` / `parallelRunStart` / `parallelRunEnd` |
| 中文名 | 并行执行 / 并行开始 / 并行结束 |
| 英文名 | Parallel Run / Parallel Start / Parallel End |
| colorSchema | `blue`（与 Loop 的 `violetDeep` 区分）|
| 图标 | 复用 PR #6675 的 `loopPro*.svg`，重命名为 `parallelRun*.svg` |

### 3.2 输入/输出 Key

parallelRun 节点**完全复用**现有 enum（改名后）：

| 位置 | Key | 说明 |
|-----|-----|-----|
| parallelRun 输入：数组 | `nestedInputArray` (value `'loopInputArray'`) | 和 loop 共享 |
| parallelRun 输入：子节点列表 | `childrenNodeIdList` | 原本就通用 |
| parallelRun 输入：容器宽高 | `nodeWidth` / `nodeHeight` | 原本就通用 |
| parallelRun 输入：输入框高度 | `nestedNodeInputHeight` | 和 loop 共享 |
| parallelRun 输入：**新增** | `parallelRunMaxConcurrency` | parallelRun 独有 |
| parallelRun 输出：结果数组 | `nestedArrayResult` (value `'loopArray'`) | 和 loop 共享 |
| nestedStart（= loopStart）输入 | `nestedStartInput` / `nestedStartIndex` | 由 parallelRun 的 dispatch 注入 |
| nestedEnd（= loopEnd）输入 | `nestedEndInput` | 由用户连线 |

**唯一新增的 key**：`parallelRunMaxConcurrency`（用于前端配置并发上限输入）。

### 3.3 并发执行语义

| 行为 | 决策 | 理由 |
|------|-----|------|
| 并发调度 | **`batchRun`**（`packages/global/common/system/utils.ts:22`）| 项目已有的 worker-pool 工具：固定 N 个 worker 循环抢任务，结果按原 index 写回数组，顺序保证 |
| 并发上限 | 节点输入 `parallelRunMaxConcurrency`（默认 5），非整数向下取整；在 dispatch 里 clamp 到 env `WORKFLOW_PARALLEL_MAX_CONCURRENCY`（默认 10）；env 本身 clamp 到 `[5, 100]` | 运维约束 + 用户灵活 |
| 最大迭代数 | 复用 `WORKFLOW_MAX_LOOP_TIMES`（默认 100，与生产部署对齐）| 避免重复 |
| 变量作用域 | 各迭代间**隔离**，不合并 `newVariables` 回主 variables | 并行无时序，合并不可预期 |
| 错误处理 | 任务 fn 内部用 try/catch 包裹 `runWorkflow`，返回 `{success, index, data/error}` 结构体；不抛出，避免中断 worker pool | 见 §3.4 |
| 交互响应 | 后端**忽略**该任务输出（视为失败项，静默过滤）；前端**阻塞**交互节点拖入 | 见 §3.5 |
| 输出顺序 | `batchRun` 天然按 index 回填，保证 `output[i]` 对应 `input[i]` | 符合用户直觉 |
| cost 汇总 | 累加所有任务的 totalPoints | 与 Loop 一致 |

**`batchRun` 签名**：
```typescript
batchRun<T, R>(
  arr: T[],
  fn: (item: T, index: number) => Promise<R>,
  batchSize = 10
): Promise<R[]>
```

**使用方式**：
```typescript
import { batchRun } from '@fastgpt/global/common/system/utils';

const concurrency = Math.min(
  Number(params.parallelRunMaxConcurrency) || 5,
  Number(process.env.WORKFLOW_PARALLEL_MAX_CONCURRENCY) || 10
);

const taskResults = await batchRun(
  loopInputArray,
  async (item, index) => {
    // 见 §3.6 的 per-task 克隆逻辑
  },
  concurrency
);
```

### 3.4 错误处理与输出结构 ⚠️（user 指定）

**两种输出**：

1. **`parallelRunArray`（节点输出，供下游引用）**：**只包含成功项**
   ```typescript
   // 示例
   [result_0, result_2]  // 过滤掉 index 1 的失败项
   ```

2. **`nodeResponse.parallelRunDetail`（完整执行详情，仅在运行详情里展示）**：
   ```typescript
   [
     { success: true,  index: 0, data: result_0 },
     { success: false, index: 1, error: 'xxx error message' },
     { success: true,  index: 2, data: result_2 }
   ]
   ```

**实现**：
```typescript
const settled = await Promise.allSettled(/* ... */);
const fullStatus = settled.map((r, idx) => {
  if (r.status === 'fulfilled' && r.value?.isSuccess) {
    return { success: true, index: idx, data: r.value.output };
  }
  return { success: false, index: idx, error: extractError(r) };
});

const outputArray = fullStatus.filter((s) => s.success).map((s) => s.data);
```

### 3.5 交互节点处理（user 指定）

**前端阻塞**（第一道防线）：  
扩展 `useWorkflow.tsx:431-455` 的 `checkNodeOverLoopNode`（或新增 `checkNodeOverParallelNode`），使之对 `FlowNodeTypeEnum.parallelRun` 生效，并在 `unSupportedTypes` 里追加交互类节点：

```typescript
const unSupportedInParallel = [
  // 旧 loop 也有的限制
  FlowNodeTypeEnum.workflowStart,
  FlowNodeTypeEnum.loop,
  FlowNodeTypeEnum.parallelRun,   // 禁止嵌套 parallelRun
  FlowNodeTypeEnum.pluginInput,
  FlowNodeTypeEnum.pluginOutput,
  FlowNodeTypeEnum.systemConfig,
  // parallelRun 额外禁止的交互节点
  FlowNodeTypeEnum.formInput,
  FlowNodeTypeEnum.userSelect,
  // 如果有其他交互相关类型（tool 的 interactive），也加上
];
```

> 需要在实现时 grep 所有 interactive/表单类 FlowNodeType 枚举项，确保覆盖。

用户拖放时若节点类型在禁止列表 → toast 提示 "该节点不支持并行执行"（新增 i18n key `workflow:can_not_parallel`）。

**后端兜底**（第二道防线）：  
在 `dispatchParallelRun` 中，若某个子任务的 `runWorkflow` 返回 `workflowInteractiveResponse`，视为该任务失败：
```typescript
if (response.workflowInteractiveResponse) {
  // 忽略该任务输出，标记为失败
  return { isSuccess: false, error: 'Interactive node is not supported in parallel run' };
}
```

不 reject，不中断整个并行节点。

### 3.5a 后端 service 抽离（为单测隔离）

**原则**：`runParallelRun.ts` 的 dispatch 入口只做**编排**，核心逻辑拆成**纯函数 service**，可独立单测，不依赖 `runWorkflow`、MongoDB、I/O。

**目录结构**：
```
packages/service/core/workflow/dispatch/parallelRun/
├── runParallelRun.ts        # dispatch 入口，仅编排流程
└── service.ts               # 所有纯函数 service 集中在一个文件，通过 export 暴露
```

**`service.ts` 导出的纯函数**（全部无 I/O）：
- `clampParallelConcurrency` — 并发数 clamp
- `buildTaskRuntimeContext` — per-task 克隆 + 注入 entry
- `parseTaskResponse` / `parseTaskError` — 单任务响应解析（成功/失败/交互）
- `aggregateParallelResults` — 聚合所有任务结果

**service 函数契约**：

```typescript
// service/concurrency.ts
export const clampParallelConcurrency = (
  userInput: number | undefined,
  envMax: number | undefined
): number;

// service/taskContext.ts
export const buildTaskRuntimeContext = (params: {
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: StoreEdgeItemType[];  // 原始边，内部做 storeEdges2RuntimeEdges
  childrenNodeIdList: string[];
  item: any;
  index: number;
}): {
  taskRuntimeNodes: RuntimeNodeItemType[];
  taskRuntimeEdges: RuntimeEdgeItemType[];
};

// service/taskResult.ts
export type ParallelTaskResult =
  | { success: true;  index: number; data: any; response: DispatchFlowResponse }
  | { success: false; index: number; error?: string };

export const parseTaskResponse = (params: {
  index: number;
  response: DispatchFlowResponse;
}): ParallelTaskResult;
// 逻辑：workflowInteractiveResponse 存在 → 静默失败；否则从 flowResponses 找 nestedEnd.loopOutputValue

export const parseTaskError = (index: number, err: unknown): ParallelTaskResult;

// service/aggregate.ts
export const aggregateParallelResults = (
  taskResults: ParallelTaskResult[]
): {
  filteredArray: any[];                // parallelRunArray 输出（过滤失败项）
  fullDetail: Array<{                  // nodeResponse.parallelRunDetail
    success: boolean;
    index: number;
    data?: any;
    error?: string;
  }>;
  totalPoints: number;
  responseDetails: ChatHistoryItemResType[];
  assistantResponses: AIChatItemValueItemType[];
  customFeedbacks: string[];
};
```

**dispatch 编排骨架**：
```typescript
export const dispatchParallelRun = async (props): Promise<Response> => {
  const { loopInputArray = [], childrenNodeIdList = [] } = props.params;

  // 前置校验（保留在入口）
  if (!Array.isArray(loopInputArray)) return Promise.reject('Input value is not an array');
  if (loopInputArray.length > maxLoopTimes) return Promise.reject(`... > ${maxLoopTimes}`);

  const concurrency = clampParallelConcurrency(
    props.params.parallelRunMaxConcurrency,
    process.env.WORKFLOW_PARALLEL_MAX_CONCURRENCY
  );

  const taskResults = await batchRun(
    loopInputArray,
    async (item, index) => {
      const { taskRuntimeNodes, taskRuntimeEdges } = buildTaskRuntimeContext({
        runtimeNodes: props.runtimeNodes,
        runtimeEdges: props.runtimeEdges,
        childrenNodeIdList,
        item,
        index
      });
      try {
        const response = await runWorkflow({
          ...props,
          variables: { ...props.variables },
          runtimeNodes: taskRuntimeNodes,
          runtimeEdges: taskRuntimeEdges
        });
        return parseTaskResponse({ index, response });
      } catch (err) {
        return parseTaskError(index, err);
      }
    },
    concurrency
  );

  const aggregated = aggregateParallelResults(taskResults);
  // ... 返回 DispatchNodeResultType
};
```

**测试分层**：
- **单测（无 runWorkflow）**：
  - `concurrency.test.ts` — clampParallelConcurrency 纯数学
  - `taskContext.test.ts` — 断言克隆后修改 taskRuntimeNodes 不影响原 runtimeNodes
  - `taskResult.test.ts` — mock 各种 DispatchFlowResponse 输入
  - `aggregate.test.ts` — mock ParallelTaskResult 数组，测过滤/聚合
- **Integration 测试**（跑真实 runWorkflow，少而精）：
  - 1 个 happy path：输入数组 → 并发执行 → 输出符合预期
  - 1 个 error case：某任务抛错 → 结果数组过滤 + 详情完整
  - 1 个 interactive case：子节点产生 interactive → 静默失败

### 3.6 runtimeNodes / runtimeEdges 克隆（per-task lazy clone）⚠️

**核心问题**：并行下多个迭代**同时**进入 `nestedStart`，会并发写 `input.value`、并发修改 `runtimeEdges.status`，必须为每个任务独立的子图副本。

**优化策略**：克隆**放在 `batchRun` 的 fn 内部**，每次 worker 实际开始执行任务时才克隆，执行完 fn 立即释放。

**效果**：
- 同一时刻活跃的克隆数 **= 并发数（5~10）**，不是数组长度（最多 50）
- 峰值内存从 `O(arrayLength × subgraphSize)` 降到 `O(concurrency × subgraphSize)`
- 克隆对象在 fn 返回后立即 GC

**实现骨架**：
```typescript
const taskResults = await batchRun(
  loopInputArray,
  async (item, index) => {
    // ✅ 这里执行时才克隆。整个 fn 生命周期 = 一份克隆的生命周期
    const taskRuntimeNodes = cloneDeep(runtimeNodes);
    const taskRuntimeEdges = cloneDeep(storeEdges2RuntimeEdges(runtimeEdges));

    // 注入 entry 与当前迭代项
    taskRuntimeNodes.forEach((node) => {
      if (!childrenNodeIdList.includes(node.nodeId)) return;
      if (node.flowNodeType === FlowNodeTypeEnum.nestedStart) {
        node.isEntry = true;
        node.inputs.forEach((input) => {
          if (input.key === NodeInputKeyEnum.nestedStartInput) input.value = item;
          if (input.key === NodeInputKeyEnum.nestedStartIndex) input.value = index + 1;
        });
      }
    });

    try {
      const response = await runWorkflow({
        ...props,
        variables: { ...props.variables },
        runtimeNodes: taskRuntimeNodes,
        runtimeEdges: taskRuntimeEdges
      });

      // 交互节点：静默忽略（user 指定）
      if (response.workflowInteractiveResponse) {
        return { success: false, index, error: undefined };
      }

      const output = response.flowResponses.find(
        (r) => r.moduleType === FlowNodeTypeEnum.nestedEnd
      )?.loopOutputValue;

      return { success: true, index, data: output, response };
    } catch (err: any) {
      return { success: false, index, error: err?.message || String(err) };
    }
    // fn 返回 → taskRuntimeNodes / taskRuntimeEdges 出作用域 → GC
  },
  concurrency
);
```

**与 v2 方案的差别**：v2 是预先 `cloneDeep × N` 再 `Promise.all`，峰值 N 份；v3 是 worker-pool 抢任务后才 clone，峰值 = concurrency 份。

### 3.7 feConfigs 前端暴露 env 上限

扩展 `packages/global/common/system/types/index.ts` 的 `limit` 对象（约 109-114 行）：

```typescript
limit?: {
  exportDatasetLimitMinutes?: number;
  websiteSyncLimitMinuted?: number;
  agentSandboxMaxEditDebug?: number;
  agentSandboxMaxSessionRuntime?: number;
  workflowParallelRunMaxConcurrency?: number;  // 新增
};
```

**注入**：在全局配置初始化时（`projects/app/src/service/common/system/index.ts` 或类似 `initSystemConfig`）读取 `process.env.WORKFLOW_PARALLEL_MAX_CONCURRENCY`，写入 `global.feConfigs.limit`。

**前端消费**：在 `NodeParallelRun` 的并发数输入字段中：
```typescript
const { feConfigs } = useSystemStore();
const maxConcurrency = feConfigs?.limit?.workflowParallelRunMaxConcurrency ?? 10;
// 输入框 max={maxConcurrency}，提示 "最大不超过 ${maxConcurrency}"
```

**后端二次校验**：`dispatchParallelRun` 里通过 `clampParallelConcurrency` service 做 clamp（见 §3.5a）。

### 3.8 前端逻辑层 / 渲染层分离（为单测隔离）

**原则**：NodeParallelRun 组件只负责 JSX 渲染和 React 副作用的"壳"，**纯逻辑**（计算、类型推导、输入合法性校验等）抽到 utils 文件，通过 `projects/app/test/pageComponents/app/detail/WorkflowComponents/` 下的单测覆盖。

**参考范式**：项目已有 `projects/app/test/pageComponents/app/detail/WorkflowComponents/utils.test.ts`，证明这种模式在 codebase 中成熟。

**NodeParallelRun 的可测逻辑**（抽离到 utils）：

```
projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/Loop/
├── NodeParallelRun.tsx                   # 壳：JSX + hooks 调用
└── parallelRun.utils.ts                  # 纯函数：可测
```

**`parallelRun.utils.ts` 契约**：

```typescript
// 从 inputs 数组读取并发数，并 clamp 到 env 上限
export const resolveParallelConcurrency = (
  inputs: FlowNodeInputItemType[],
  envMax: number | undefined
): number;

// 从数组输入的 reference 推导元素 valueType
export const resolveArrayItemValueType = (params: {
  arrayReferenceValue: ReferenceArrayValueType | undefined;
  nodeIds: string[];
  globalVariables: Array<{ key: string; valueType: WorkflowIOValueTypeEnum }>;
  getNodeById: (id: string) => RuntimeNodeItemType | undefined;
}): WorkflowIOValueTypeEnum;

// 校验用户输入的并发数是否合法
export const validateConcurrencyInput = (
  value: unknown,
  envMax: number
): { valid: boolean; error?: string; clamped?: number };
```

**组件内的使用**（保持薄）：
```tsx
const NodeParallelRun = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { nodeId, inputs, outputs } = data;
  const { feConfigs } = useSystemStore();
  const envMax = feConfigs?.limit?.workflowParallelRunMaxConcurrency ?? 10;

  // 使用纯函数获取派生状态（可测）
  const concurrency = useMemo(
    () => resolveParallelConcurrency(inputs, envMax),
    [inputs, envMax]
  );

  // React 专属副作用（不测）
  useEffect(() => {
    // 同步 childrenNodeIdList / 尺寸（这些副作用和 NodeLoop 的模式一致）
  }, [...]);

  return (
    <NodeCard selected={selected} {...data}>
      {/* JSX */}
    </NodeCard>
  );
};
```

**测试位置与范围**：
```
projects/app/test/pageComponents/app/detail/WorkflowComponents/
└── nodes/Loop/
    └── parallelRun.utils.test.ts        # 新增
```

**测试覆盖**（见 §8.2）：
- `resolveParallelConcurrency` — 默认值/用户输入/env clamp/无效输入
- `resolveArrayItemValueType` — 字符串数组/对象数组/空引用/无效节点
- `validateConcurrencyInput` — 正常值/负数/超限/非数字

**不测的部分**：
- React 组件的渲染结果（依赖 ReactFlow context，搭建环境成本高）
- useEffect 的副作用（集成到 end-to-end 手动验证 §8.3）
- NodeLoop **完全不动**（保持 v3 决策：旧功能 0 改动）

---

## 4. 详细文件清单（v3 精简版）

### 4.1 新增文件（仅 3 个）

#### 4.1.1 parallelRun 节点模板
```
packages/global/core/workflow/template/system/parallelRun/
└── parallelRun.ts        # 主容器节点模板，复用 nestedInputArray/nestedArrayResult 等 key
```

#### 4.1.2 后端 dispatch
```
packages/service/core/workflow/dispatch/parallelRun/
└── runParallelRun.ts     # 并行主调度，参考 runLoop.ts 但用 Promise.allSettled + 并发限制
```

> `dispatchLoopStart` / `dispatchLoopEnd` 完全复用（重命名为 `dispatchNestedStart` / `dispatchNestedEnd` 作为机械式 rename）。

#### 4.1.3 前端 parallelRun 节点组件
```
projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/Loop/
└── NodeParallelRun.tsx   # 参考 NodeLoop.tsx 但 i18n 显示"并行执行"，并多一个并发数输入框
```

> **不需要新建** NodeParallelRunStart / NodeParallelRunEnd：parallelRun 的 Start/End 子节点直接用 `FlowNodeTypeEnum.nestedStart` / `nestedEnd`，渲染时走 `Flow/index.tsx` 的 `nodeTypes` 映射到原 `NodeLoopStart` / `NodeLoopEnd` 组件。

#### 4.1.4 图标（2 个 SVG，可选）
```
packages/web/components/common/Icon/icons/core/workflow/template/
├── parallelRun.svg          # 复用 PR #6675 的 loopPro.svg
└── parallelRunLinear.svg    # 对应线条图标
```

> Start/End 图标**复用现有的 loopStart/loopEnd 图标**（语义上是通用"嵌套容器起点/终点"）。

### 4.2 修改文件

#### 4.2.1 Enum 机械改名（0 行为变更）

所有 `loop*` 键名改为 `nested*`，value 保持原字符串不变。

**源枚举改动**：

| 文件 | 改动 |
|------|-----|
| `packages/global/core/workflow/constants.ts` | `NodeInputKeyEnum`: `loopInputArray→nestedInputArray` / `loopStartInput→nestedStartInput` / `loopStartIndex→nestedStartIndex` / `loopEndInput→nestedEndInput` / `loopNodeInputHeight→nestedNodeInputHeight`（值保持）；新增 `parallelRunMaxConcurrency`、`parallelRunArray` |
| `packages/global/core/workflow/constants.ts` | `NodeOutputKeyEnum`: `loopArray→nestedArrayResult` / `loopStartInput→nestedStartInput` / `loopStartIndex→nestedStartIndex`（值保持）|
| `packages/global/core/workflow/node/constant.ts` | `FlowNodeTypeEnum`: `loopStart→nestedStart` / `loopEnd→nestedEnd`（值保持）；新增 `parallelRun = 'parallelRun'`；`loop` 保持不变 |
| `packages/global/core/workflow/template/input.ts` | `Input_Template_LOOP_NODE_OFFSET` → `Input_Template_NESTED_NODE_OFFSET`；内部 `key` 字段引用改为 `nestedNodeInputHeight` |

**引用改名的源文件清单**（约 15-18 个，IDE rename symbol 可一次性完成）：
- `packages/global/core/workflow/template/system/loop/{loop,loopStart,loopEnd}.ts`
- `packages/service/core/workflow/dispatch/loop/{runLoop,runLoopStart,runLoopEnd}.ts`
- `packages/service/core/workflow/dispatch/constants.ts`
- `projects/app/src/web/core/workflow/utils.ts`
- `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/index.tsx`
- `.../Flow/NodeTemplatesPopover.tsx`
- `.../Flow/nodes/Loop/{NodeLoop,NodeLoopStart,NodeLoopEnd}.tsx`
- `.../Flow/hooks/useWorkflow.tsx`（`PARENT_NODE_TYPES` / `checkNodeOverLoopNode` 引用点）
- `.../Flow/hooks/useKeyboard.tsx`
- `.../Flow/nodes/render/NodeCard.tsx`
- `.../Flow/nodes/render/RenderInput/templates/Reference.tsx`
- `.../context/workflowComputeContext.tsx`

#### 4.2.2 parallelRun 接入点

| 文件 | 改动要点 |
|------|---------|
| `packages/global/core/workflow/template/constants.ts` | 导入 `ParallelRunNode`，注册到 `systemNodes`（放在 `LoopNode` 之后）|
| `packages/service/core/workflow/dispatch/constants.ts` | 注册 `[FlowNodeTypeEnum.parallelRun]: dispatchParallelRun` |
| `packages/global/common/system/types/index.ts` | `limit` 对象新增 `workflowParallelRunMaxConcurrency?: number` |
| `projects/app/src/service/common/system/index.ts` (行 125-128) | `defaultFeConfigs.limit` 注入 `workflowParallelRunMaxConcurrency: Number(process.env.WORKFLOW_PARALLEL_MAX_CONCURRENCY) \|\| 10` |
| `.../Flow/index.tsx` | `nodeTypes` 新增 `[FlowNodeTypeEnum.parallelRun]: dynamic(() => import('./nodes/Loop/NodeParallelRun'))` |
| `.../Flow/components/NodeTemplates/list.tsx` (325-340) | 把 `=== FlowNodeTypeEnum.loop` 改为 `[loop, parallelRun].includes(...)`，两类节点都自动创建 `nestedStart` + `nestedEnd` 子节点 |
| `.../Flow/hooks/useWorkflow.tsx:395` | `PARENT_NODE_TYPES` 集合：`new Set([loop, parallelRun])` |
| `.../Flow/hooks/useWorkflow.tsx:431-468` | `checkNodeOverLoopNode`：父节点识别改为 `[loop, parallelRun].includes(item.type)`；根据父节点类型应用不同的 `unSupportedTypes` 列表（parallelRun 额外禁止 `formInput` / `userSelect` / 嵌套 `parallelRun`）|
| `.../Flow/hooks/useKeyboard.tsx:71` | 复制黑名单扩展：`item.type !== FlowNodeTypeEnum.loop && item.type !== FlowNodeTypeEnum.parallelRun` |
| `.../Flow/nodes/render/NodeCard.tsx:221` | `isLoopNode` 扩展为 `[loop, parallelRun].includes(flowNodeType)`（或重命名为 `isNestedContainerNode`）|
| `.../Flow/nodes/render/RenderInput/templates/Reference.tsx:155` | handle 位置判断同上扩展 |
| `packages/web/i18n/{zh-CN,en,zh-Hant}/workflow.json` | 新增 `parallel_run` / `intro_parallel_run` / `parallel_run_body` / `can_not_parallel` / `parallel_run_max_concurrency` / `parallel_run_max_concurrency_tip`。**不新增** Start/End 文案（复用现有 `loop_start` / `loop_end`）|

### 4.3 不改动的文件 ✅

以下文件**运行时逻辑完全不变**，只有 IDE rename 带来的 enum 引用替换：
- `NodeLoop.tsx` / `NodeLoopStart.tsx` / `NodeLoopEnd.tsx`
- `runLoop.ts` / `runLoopStart.ts` / `runLoopEnd.ts`
- `loop.ts` / `loopStart.ts` / `loopEnd.ts` 模板定义

> 这些文件的 diff 将全部是 `loopXxx` → `nestedXxx` 的机械替换，无任何逻辑改动。

---

## 5. 已确认的决策（user 2026-04-08 确认）

- [x] **5.1** `parallelRunMaxConcurrency` 默认 **5**；env 上限默认 **10** ✅
- [x] **5.2** 抽 `ContainerNodeShell.tsx` 共享 JSX 外壳 ✅
- [x] **5.3** 允许重构 NodeLoop.tsx / NodeLoopStart.tsx / NodeLoopEnd.tsx（纯重构，行为等价）✅
- [x] **5.4** 错误处理：`parallelRunArray` 过滤失败项，`nodeResponse.parallelRunDetail` 带完整 `[{success, index, data/error}, ...]` 状态 ✅
- [x] **5.5** 交互节点后端**静默忽略**该任务输出（无日志、无告警），节点整体成功返回 ✅

---

## 6. 前置查缺补漏（已完成）

### P1：并行体内禁入节点清单 ✅
`packages/global/core/workflow/node/constant.ts` 中交互相关 FlowNodeType 只有两个：
- `formInput`（行 162）
- `userSelect`（行 158）

> `toolParams`（行 150）是工具参数节点，不是交互节点，不加入禁入。  
> `workflowInteractive` 不是 enum 值，是 dispatch 返回的响应类型（见 3.5 后端兜底）。

**`unSupportedInParallel` 最终列表**：
```typescript
const unSupportedInParallel = [
  FlowNodeTypeEnum.workflowStart,
  FlowNodeTypeEnum.loop,
  FlowNodeTypeEnum.parallelRun,     // 禁止嵌套
  FlowNodeTypeEnum.pluginInput,
  FlowNodeTypeEnum.pluginOutput,
  FlowNodeTypeEnum.systemConfig,
  FlowNodeTypeEnum.formInput,       // 交互
  FlowNodeTypeEnum.userSelect       // 交互
];
```

### P2：feConfigs env 注入点 ✅
**文件**：`projects/app/src/service/common/system/index.ts`  
**注入位置**：`defaultFeConfigs`（行 114-134），`initSystemConfig` 会和 DB/文件配置合并。

**改动**：
```typescript
const defaultFeConfigs: FastGPTFeConfigsType = {
  // ...
  limit: {
    exportDatasetLimitMinutes: 0,
    websiteSyncLimitMinuted: 0,
    workflowParallelRunMaxConcurrency:
      Number(process.env.WORKFLOW_PARALLEL_MAX_CONCURRENCY) || 10
  },
  // ...
};
```

### P3：图标资源（实现时处理）
从 PR #6675 的分支下载 `loopPro{,Start,End}.svg` 并重命名到 `parallelRun{,Start,End}.svg`，放到 `packages/web/components/common/Icon/icons/core/workflow/template/`。

### P4：`nodeTypes` 穷举约束 ✅
`projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/index.tsx:30`：
```typescript
const nodeTypes: Record<FlowNodeTypeEnum, any> = { ... };
```
**确实使用穷举 Record**。新增 3 个 enum 值后 TS 编译会强制报错直到全部映射。同时需要检查是否还有其他 `Record<FlowNodeTypeEnum, ...>` 的地方（运行时会通过 lint 暴露）。

---

## 7. 不在本次范围

- ❌ 重构 `unique` 检查为 per-parent 作用域
- ❌ 动态任务间通信 / 优先级调度
- ❌ 基于结果的 map-reduce 聚合
- ❌ 并行节点嵌套（明确禁止）
- ❌ 重新实现 `dispatchLoopStart` / `dispatchLoopEnd`（直接复用）

---

## 8. 测试计划（v3）

> **分层原则**：逻辑层（service/utils）做纯单测（快、稳、覆盖率高）；Integration 层做少量 happy path 验证编排；手动验证兜底 UI。

### 8.1 后端 service 单测（纯函数，无 I/O）

**单文件** + 多个 `describe` 分组：

**文件**：`test/cases/service/core/workflow/dispatch/parallelRun/service.test.ts`

```typescript
describe('parallelRun/service', () => {
  describe('clampParallelConcurrency', () => {
    // - 用户未指定 → 默认 5
    // - 用户 3，env 10 → 3
    // - 用户 100，env 10 → 10（clamp）
    // - 用户 0 / 负数 → 1
    // - env 缺省 → 10
    // - 两者都缺省 → 5
  });

  describe('buildTaskRuntimeContext', () => {
    // - 克隆后修改 taskRuntimeNodes 不影响原 runtimeNodes（深拷贝验证）
    // - nestedStart 子节点被正确设为 entry
    // - nestedStart.nestedStartInput 被设为当前 item
    // - nestedStart.nestedStartIndex 被设为 index+1
    // - 非 childrenNodeIdList 里的节点不受影响
    // - runtimeEdges 经 storeEdges2RuntimeEdges 转换并独立克隆
  });

  describe('parseTaskResponse', () => {
    // - 无 interactive、有 nestedEnd → success=true + data
    // - 有 workflowInteractiveResponse → success=false（静默忽略）
    // - 无 nestedEnd 响应 → success=true, data=undefined
  });

  describe('parseTaskError', () => {
    // - 包装 Error 对象 → success=false, error=message
    // - 包装字符串 → success=false, error=string
  });

  describe('aggregateParallelResults', () => {
    // - 全部成功 → filteredArray 全部 + fullDetail 全 success
    // - 混合成功/失败 → filteredArray 只含成功项（按顺序）+ fullDetail 保留全部
    // - 全部失败 → filteredArray=[] + fullDetail 全 failed
    // - totalPoints 累加正确
    // - customFeedbacks 合并（按现有 Loop 行为对齐）
    // - responseDetails / assistantResponses 按原顺序累加
  });
});
```

### 8.2 后端 integration 测试（少而精）

**文件**：`test/cases/service/core/workflow/dispatch/parallelRun/runParallelRun.test.ts`

只测 dispatch 编排，即各 service 正确串联 + runWorkflow 集成：

1. **Happy path**：输入 `[1,2,3]`，子流程 `item*2` → `parallelRunArray = [2,4,6]`
2. **单任务失败**：index=1 抛错 → `parallelRunArray` 只有 2 项（过滤），`parallelRunDetail` 3 项完整
3. **交互响应静默**：子节点产生 interactive → 该任务从数组过滤，节点整体成功
4. **空数组 / 非数组 / 超上限** → 边界行为验证
5. **变量隔离**：子任务修改同名变量 → 主流程 `newVariables` 不变
6. **runtimeNodes 不污染**：执行后原 runtimeNodes 未被改（回归保护）

### 8.3 前端 utils 单测

**单文件** + 多个 `describe` 分组，依照项目已有范式（参考 `projects/app/test/pageComponents/app/detail/WorkflowComponents/utils.test.ts`）：

**文件**：`projects/app/test/pageComponents/app/detail/WorkflowComponents/nodes/Loop/parallelRun.utils.test.ts`

```typescript
describe('parallelRun.utils', () => {
  describe('resolveParallelConcurrency', () => {
    // - inputs 里没有 parallelRunMaxConcurrency → 默认 5
    // - 有合法值 → 返回该值
    // - 值 > envMax → clamp 到 envMax
    // - 值 < 1 → 返回 1
  });

  describe('resolveArrayItemValueType', () => {
    // - 引用到 string[] 输出 → 返回 string
    // - 引用到 object[] → 返回 object
    // - 空引用 → 返回 any
    // - 引用到不存在的节点 → 返回 any
  });

  describe('validateConcurrencyInput', () => {
    // - 正数 ≤ envMax → valid
    // - 超限 → invalid, clamped=envMax
    // - 负数 / 非数字 → invalid
  });
});
```

### 8.4 不做的测试

- ❌ NodeParallelRun 组件渲染测试（需要 ReactFlow context，ROI 低）
- ❌ NodeLoop 的回归测试（v3 决策：NodeLoop 运行时逻辑完全不变，只有 IDE rename，lint + TS 编译即是回归保护）

### 8.5 手动端到端清单

1. 拖入"并行执行"节点 → 自动生成 parallelRunStart + parallelRunEnd 子节点
2. 在并行体内拖入 HTTP 节点 → 允许
3. 在并行体内尝试拖入 formInput 节点 → 被阻塞并 toast
4. 在并行体内尝试拖入另一个 parallelRun → 被阻塞
5. 配置输入数组为 `[url1, url2, url3]`，运行工作流 → 各 HTTP 并发执行（观察时间戳/响应时序）
6. 让其中一个 URL 404 → 结果数组只含 2 项，详情里 3 项带 success 状态
7. 同一工作流同时存在 Loop 和 ParallelRun，各自工作 → 旧功能零回归
8. 配置 env `WORKFLOW_PARALLEL_MAX_CONCURRENCY=3` 重启 → 前端输入框 max 显示 3，后端强制限 3
9. 导入一个包含交互节点的并行体 JSON（绕过前端） → 后端执行时忽略该任务输出

---

## 9. 实施 TODO

### 阶段 1：Enum 改名（纯重构，可独立验证）
- [ ] **T1**：IDE rename `NodeInputKeyEnum.loop* → nested*`（值保持）
- [ ] **T2**：IDE rename `NodeOutputKeyEnum.loop* → nested*`（值保持）
- [ ] **T3**：IDE rename `FlowNodeTypeEnum.loopStart → nestedStart` / `loopEnd → nestedEnd`（值保持；`loop` 保持不变）
- [ ] **T4**：IDE rename `Input_Template_LOOP_NODE_OFFSET → Input_Template_NESTED_NODE_OFFSET`
- [ ] **T5**：`pnpm lint && pnpm test` 验证零回归

### 阶段 2：后端实现（TDD：先写 service 测试 → 实现 service → 编排）
- [ ] **T6**：`constants.ts` 新增 `parallelRunMaxConcurrency` / `parallelRunArray`，`node/constant.ts` 新增 `FlowNodeTypeEnum.parallelRun`
- [ ] **T7**：`feConfigs.limit.workflowParallelRunMaxConcurrency` 类型 + `initSystemConfig` env 注入
- [ ] **T8**：先写 service 单测（红灯）：单文件 `test/cases/service/core/workflow/dispatch/parallelRun/service.test.ts`，用 5 个 `describe` 分组（clampParallelConcurrency / buildTaskRuntimeContext / parseTaskResponse / parseTaskError / aggregateParallelResults）
- [ ] **T9**：实现 service 纯函数，集中在单文件 `packages/service/core/workflow/dispatch/parallelRun/service.ts`，导出 5 个函数（clampParallelConcurrency / buildTaskRuntimeContext / parseTaskResponse / parseTaskError / aggregateParallelResults）
- [ ] **T10**：运行 T8 测试，绿灯 ✅
- [ ] **T11**：新增 `template/system/parallelRun/parallelRun.ts`（节点模板）
- [ ] **T12**：新增 `dispatch/parallelRun/runParallelRun.ts`（编排层：`batchRun` + 4 个 service 串联）
- [ ] **T13**：注册到 `template/constants.ts` 和 `dispatch/constants.ts`
- [ ] **T14**：编写 `runParallelRun.test.ts` integration 测试（§8.2 的 6 个 case），验证编排
- [ ] **T15**：运行 T14 测试，绿灯 ✅

### 阶段 3：前端实现（逻辑层 utils 先行）
- [ ] **T16**：先写前端 utils 单测（红灯）：单文件 `projects/app/test/pageComponents/app/detail/WorkflowComponents/nodes/Loop/parallelRun.utils.test.ts`，用 3 个 `describe` 分组（resolveParallelConcurrency / resolveArrayItemValueType / validateConcurrencyInput）
- [ ] **T17**：实现 `Flow/nodes/Loop/parallelRun.utils.ts`（3 个纯函数：`resolveParallelConcurrency` / `resolveArrayItemValueType` / `validateConcurrencyInput`）
- [ ] **T18**：运行 T16 测试，绿灯 ✅
- [ ] **T19**：新增 `Flow/nodes/Loop/NodeParallelRun.tsx`（渲染壳，调用 utils）
- [ ] **T20**：`Flow/index.tsx` `nodeTypes` 注册 `parallelRun`
- [ ] **T21**：`list.tsx:325-340` 扩展 `[loop, parallelRun].includes(...)`
- [ ] **T22**：`useWorkflow.tsx` `PARENT_NODE_TYPES` + `checkNodeOverLoopNode` 扩展；parallelRun 应用更严格的 `unSupportedInParallel`（加 `formInput` / `userSelect` / 嵌套 `parallelRun`）
- [ ] **T23**：`useKeyboard.tsx:71` / `NodeCard.tsx:221` / `Reference.tsx:155` 的 loop 判断扩展
- [ ] **T24**：i18n 新增 parallel_run 相关文案（zh-CN/en/zh-Hant）
- [ ] **T25**：SVG 图标（从 PR #6675 复制 `loopPro.svg` → `parallelRun.svg`）

### 阶段 4：收尾
- [ ] **T26**：完成 §8.5 手动端到端清单
- [ ] **T27**：`pnpm lint && pnpm test` 全量通过
- [ ] **T28**（可选）：更新 `document/` 下的工作流文档
