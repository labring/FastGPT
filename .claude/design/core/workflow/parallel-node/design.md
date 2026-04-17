# 并行执行节点（ParallelRun）设计文档

> 需求：在工作流中新增一个"并行执行"节点，和现有"批量执行（Loop）"节点并列。  
> 原则：**完全不改动旧的批量执行节点功能**，新增独立的节点类型与 dispatch。  
> 参考：[PR #6675](https://github.com/labring/FastGPT/pull/6675)（仅作参考，不直接复用其改动）

---

## 1. 背景与需求

### 1.1 现状
FastGPT 工作流目前已有 `loop` / `loopStart` / `loopEnd` 三个节点，构成"批量执行"功能：
- **执行方式**：`for await` 串行遍历输入数组，逐项执行循环体子工作流
- **核心实现**：`packages/service/core/workflow/dispatch/loop/runLoop.ts`
- **变量作用域**：后一轮能继承前一轮产生的 `newVariables`（有状态累积）

### 1.2 新需求
新增一个**并行执行**节点，使数组中各元素对应的子工作流可以**并发执行**，提升吞吐（例如并行调用多个 LLM、并行抓取多个 URL 等场景）。

### 1.3 约束
1. 旧的 `loop` 节点行为 0 改动（包括变量累积语义、交互响应断点等）
2. 新节点必须是独立的 `flowNodeType`，独立的 dispatch，独立的 i18n key
3. UI 在概念上与 Loop 相同（父容器 + Start + End），但允许用户直观看到两者是不同的能力

---

## 2. 关键问题：NodeLoop 组件是否可复用？

### 结论
**部分可复用，但不建议直接共享组件实例，建议"复制-适配"策略。**

### 详细分析

| 维度 | 现状（NodeLoop） | Parallel 需求 | 可复用性 |
|------|-----------------|--------------|---------|
| **容器与子节点维护** | `getNodeList().filter(n => n.parentNodeId === nodeId)` | 完全一样 | ✅ 可复用，但代码内联 |
| **尺寸/偏移同步** | `useSize` + `resetParentNodeSizeAndPosition` | 完全一样 | ✅ 可复用 |
| **数组类型推导** | 读 `loopInputArray.value[0]` → 推导 valueType | 完全一样 | ✅ 可复用 |
| **输入字段 key** | `NodeInputKeyEnum.loopInputArray` | 可以共用（或新建 parallelInputArray）| ⚠️ 需决策 |
| **输出字段 key** | `NodeOutputKeyEnum.loopArray` | 语义一样，可共用 key | ⚠️ 需决策 |
| **并发限制输入** | 无 | 需要新增（可选输入）| ❌ 需要扩展 |
| **parentNodeId 关系** | ReactFlow 层级管理 | 完全一样 | ✅ 可复用 |
| **connection handle 限制** | `ConnectionHandle.tsx` 里限制子节点间连接 | 完全一样 | ✅ 可复用 |

### 方案权衡

**方案 A：直接复用 NodeLoop 组件（不推荐）**
- 方式：让 `FlowNodeTypeEnum.parallel` 也映射到 `NodeLoop` 组件
- 问题：
  1. NodeLoop 内部硬编码了 `t('workflow:loop_body')` 文案
  2. 类型推导 hooks 硬依赖 `loopInputArray` / `loopArray` key
  3. 后续要给并行节点加"并发数"输入，会污染 Loop 节点

**方案 B：抽取公共 Hook + 共享 shell 组件（中等复杂度）**
- 方式：抽取 `useParentContainerNode(nodeId)` 和 `useArrayInputType()` 两个 hook，NodeLoop / NodeParallel 共享
- 问题：抽取需要触碰 NodeLoop 源码，违反"旧功能完全不变"的承诺（虽然只是重构，但引入回归风险）

**方案 C：复制 NodeLoop 为 NodeParallel（推荐 ✅）**
- 方式：完整复制 `NodeLoop.tsx` → `NodeParallel.tsx`，并做以下调整：
  1. 更换 i18n key（`parallel_body` 替代 `loop_body`）
  2. 读取 `parallelInputArray` / `parallelArray` 等独立 key（或继续用 loop key，见下文决策）
  3. 新增"并发数上限"输入字段渲染逻辑（读 `parallelMaxConcurrency`）
  4. 其余 90% 逻辑不变
- 优点：
  1. 0 风险污染旧 NodeLoop
  2. 代码清晰独立，后续两节点演进互不影响
  3. 符合项目"保持简单、避免过早抽象"的原则
- 缺点：存在 ~60 行代码重复（可接受）

**最终决策：采用方案 C**。如果未来出现第三个同类节点（比如带条件的 loop），再考虑抽取 hook。

---

## 3. 关键设计决策

### 3.1 节点命名

| 项目 | 值 | 说明 |
|------|-----|------|
| FlowNodeType | `parallelRun` / `parallelRunStart` / `parallelRunEnd` | 避免与业务上"parallel"概念混淆 |
| 中文名 | 并行执行 / 并行开始 / 并行结束 | - |
| 英文名 | Parallel Run / Parallel Start / Parallel End | - |
| avatar | `core/workflow/template/parallelRun` 等 | 需要 UI 同学提供或先复用 loop 图标 |
| colorSchema | `blue`（与 violet 的 Loop 区分）| 让用户一眼区分两种节点 |

### 3.2 输入/输出 Key 策略

**决策：新建独立的 key（不复用 loop 的 key）**

原因：
1. 语义独立，便于后续演进（例如并行版的输出可能要带 index 映射、错误信息等）
2. 避免在运行时用 `flowNodeType` 二次判断后读不同 key 的复杂性
3. 方便 i18n、前端渲染定位

新增的 key：

```typescript
// packages/global/core/workflow/constants.ts  NodeInputKeyEnum
parallelRunInputArray = 'parallelRunInputArray',
parallelRunStartInput = 'parallelRunStartInput',
parallelRunStartIndex = 'parallelRunStartIndex',
parallelRunEndInput = 'parallelRunEndInput',
parallelRunMaxConcurrency = 'parallelRunMaxConcurrency',  // 并发上限（可选配置）

// NodeOutputKeyEnum
parallelRunArray = 'parallelRunArray',
parallelRunStartIndex = '...',  // 可复用 enum 中同名值
```

> 注：`childrenNodeIdList` / `nodeWidth` / `nodeHeight` / `loopNodeInputHeight` 这四个结构性 key 是容器节点通用的，**可以复用**，但为了保持一致，也可以改用中立名 `containerXxx`。本次保持现状复用，避免触及 `Input_Template_*` 模板常量。

### 3.3 并发执行语义

| 行为 | 决策 | 理由 |
|------|-----|------|
| **并发策略** | `Promise.allSettled` + 可配置并发上限（默认 5） | 单个失败不应影响其他；上限防止资源爆炸 |
| **并发上限** | 环境变量 `WORKFLOW_PARALLEL_MAX_CONCURRENCY`（默认 5），节点级可覆盖但不超过环境上限 | 兼顾运维控制和业务灵活性 |
| **最大迭代数** | 复用环境变量 `WORKFLOW_MAX_LOOP_TIMES`（默认 50） | 避免重复定义 |
| **变量作用域** | 各迭代**互相隔离**，不做变量累积 | 并行语义下无法定义"顺序"；本地新变量丢弃或合并（见 3.4） |
| **错误处理** | `allSettled`：单个失败在结果数组对应位置填 `null`（或错误对象），整体继续；最后汇总失败数 | 提升并行价值；用户可通过输出数组自行判错 |
| **交互响应** | **不支持** workflowInteractive 类型子节点（检测到直接 reject） | 交互需要顺序性，与并行矛盾 |
| **输出顺序** | 严格按输入数组下标顺序（通过 `Promise.all` 在固定位置写入） | 用户期望 `output[i]` 对应 `input[i]` |
| **cost 汇总** | 累加所有并行任务的 totalPoints | 与 Loop 一致 |

### 3.4 变量作用域与累积

```
串行 Loop 的语义：
  轮0 -> 产生 newVar_A
  轮1 -> 可读 newVar_A，产生 newVar_B
  轮2 -> 可读 newVar_A + newVar_B
  最终返回: newVar_A + newVar_B + ...

并行 Parallel 的语义：
  轮0 \
  轮1  | 同时执行，各自读取初始 variables，不互相影响
  轮2 /
  最终返回: 初始 variables（不把各任务的 newVariables 合并回去）
```

**原因**：并行任务之间没有时序关系，如果都写入同一变量 `counter`，合并结果无法预期（last-write-wins 不符合用户心智模型）。

**妥协方案**：如果用户需要累积结果，应使用**节点输出数组**（`parallelRunArray`）而非全局变量。这与函数式并行编程的最佳实践一致。

**实现**：`dispatchParallelRun` 返回的 `newVariables` 保持 `props.variables` 不动。

### 3.5 runtimeNodes / runtimeEdges 克隆问题 ⚠️

**最关键的实现难点**：

串行 Loop 的做法是修改共享的 `runtimeNodes`（设置 `isEntry`、改 `loopStartInput.value`），然后 cloneDeep edges。这在串行下是对的，因为每轮结束后状态自然会被下一轮覆盖。

**并行下不能共享 `runtimeNodes`**：
1. 多个迭代同时进入同一个 `loopStart` 节点，`input.value` 互相覆盖
2. `runtimeEdges` 的 `status`（waiting/active/skipped）会被并发写冲突
3. 节点的 outputs 会被并发写

**解决方案**：对每一个并行任务**深拷贝一份 runtimeNodes + runtimeEdges 子图**，在独立的副本上运行 `runWorkflow`。

```typescript
await Promise.all(
  loopInputArray.map(async (item, index) => {
    // 每个任务独立克隆子图
    const clonedNodes = cloneDeep(runtimeNodes);
    const clonedEdges = cloneDeep(storeEdges2RuntimeEdges(runtimeEdges));

    // 在克隆副本上设置 entry 和 parallelRunStartInput
    clonedNodes.forEach((node) => {
      if (!childrenNodeIdList.includes(node.nodeId)) return;
      if (node.flowNodeType === FlowNodeTypeEnum.parallelRunStart) {
        node.isEntry = true;
        node.inputs.forEach((input) => {
          if (input.key === NodeInputKeyEnum.parallelRunStartInput) input.value = item;
          if (input.key === NodeInputKeyEnum.parallelRunStartIndex) input.value = index + 1;
        });
      }
    });

    return runWorkflow({
      ...props,
      variables: { ...props.variables },  // 浅拷贝变量快照
      runtimeNodes: clonedNodes,
      runtimeEdges: clonedEdges
    });
  })
);
```

**性能注意**：cloneDeep 在 50 次迭代、每次几十个节点的规模下是可接受的；超大规模场景下可以考虑后续优化为结构化共享。

### 3.6 并发上限实现

使用 `p-limit` 模式（或自己实现轻量队列），避免一次性 `Promise.all` 50 个任务：

```typescript
import { batchRun } from '@fastgpt/global/common/fn/utils';  // 如果已存在
// 或
const limit = Math.min(
  params.parallelRunMaxConcurrency || 5,
  Number(process.env.WORKFLOW_PARALLEL_MAX_CONCURRENCY) || 5
);
// 使用 chunked Promise.all 或现成工具
```

---

## 4. 详细实现清单

### 4.1 新增文件（全新代码）

#### 4.1.1 类型定义
```
packages/global/core/workflow/template/system/parallelRun/
├── parallelRun.ts       # 主容器节点模板（仿 loop.ts）
├── parallelRunStart.ts  # 开始节点模板（仿 loopStart.ts）
└── parallelRunEnd.ts    # 结束节点模板（仿 loopEnd.ts）
```

#### 4.1.2 后端 Dispatch
```
packages/service/core/workflow/dispatch/parallelRun/
├── runParallelRun.ts       # 主调度，使用 Promise.all + 并发限制
├── runParallelRunStart.ts  # 透传 start 输入（与 loopStart 几乎一致）
└── runParallelRunEnd.ts    # 透传 end 输入（与 loopEnd 一致）
```

#### 4.1.3 前端 UI
```
projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/ParallelRun/
├── NodeParallelRun.tsx       # 复制 NodeLoop.tsx 并改 i18n/key
├── NodeParallelRunStart.tsx  # 复制 NodeLoopStart.tsx
└── NodeParallelRunEnd.tsx    # 复制 NodeLoopEnd.tsx
```

### 4.2 修改已有文件

#### 4.2.1 枚举与常量

**文件**：`packages/global/core/workflow/node/constant.ts`（约 127-170 行）
```typescript
export enum FlowNodeTypeEnum {
  // ... 已有项
  loop = 'loop',
  loopStart = 'loopStart',
  loopEnd = 'loopEnd',
  // 新增
  parallelRun = 'parallelRun',
  parallelRunStart = 'parallelRunStart',
  parallelRunEnd = 'parallelRunEnd'
}
```

**文件**：`packages/global/core/workflow/constants.ts`
```typescript
// NodeInputKeyEnum
parallelRunInputArray = 'parallelRunInputArray',
parallelRunStartInput = 'parallelRunStartInput',
parallelRunStartIndex = 'parallelRunStartIndex',
parallelRunEndInput = 'parallelRunEndInput',
parallelRunMaxConcurrency = 'parallelRunMaxConcurrency',

// NodeOutputKeyEnum
parallelRunArray = 'parallelRunArray',
parallelRunStartIndex 复用 loopStartIndex 还是新建？→ 新建，保持独立
```

#### 4.2.2 模板注册

**文件**：`packages/global/core/workflow/template/constants.ts`（约 30-32、41-61、80-94 行）
```typescript
import { ParallelRunNode } from './system/parallelRun/parallelRun';
import { ParallelRunStartNode } from './system/parallelRun/parallelRunStart';
import { ParallelRunEndNode } from './system/parallelRun/parallelRunEnd';

// 加入 systemNodes 和 moduleTemplatesFlat
```

#### 4.2.3 Dispatch 映射

**文件**：`packages/service/core/workflow/dispatch/constants.ts`（约 16-18、67-69 行）
```typescript
import { dispatchParallelRun } from './parallelRun/runParallelRun';
import { dispatchParallelRunStart } from './parallelRun/runParallelRunStart';
import { dispatchParallelRunEnd } from './parallelRun/runParallelRunEnd';

[FlowNodeTypeEnum.parallelRun]: dispatchParallelRun,
[FlowNodeTypeEnum.parallelRunStart]: dispatchParallelRunStart,
[FlowNodeTypeEnum.parallelRunEnd]: dispatchParallelRunEnd,
```

#### 4.2.4 前端节点类型注册

**文件**：`projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/index.tsx`（约 30-68 行）
```typescript
const nodeTypes: Record<FlowNodeTypeEnum, any> = {
  // ...
  [FlowNodeTypeEnum.parallelRun]: dynamic(() => import('./nodes/ParallelRun/NodeParallelRun')),
  [FlowNodeTypeEnum.parallelRunStart]: dynamic(() => import('./nodes/ParallelRun/NodeParallelRunStart')),
  [FlowNodeTypeEnum.parallelRunEnd]: dynamic(() => import('./nodes/ParallelRun/NodeParallelRunEnd'))
};
```

#### 4.2.5 父容器节点类型判断（如有）

搜索并更新所有 `=== FlowNodeTypeEnum.loop`（主要在以下位置）：

| 文件 | 行号 | 改动 |
|-----|------|-----|
| `projects/app/src/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext.tsx` | 读 parentNodeId 处 | 检查是否需要识别 parallelRun 作为父节点（应该是通用的，不用改） |
| `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/ConnectionHandle.tsx` | 子节点连接限制 | 同上，应为通用逻辑 |
| `resetParentNodeSizeAndPosition` 等 layout 方法 | - | 基于 parentNodeId，通用，不用改 |
| `Flow` 中新节点创建时若有特殊处理 | - | 若 Loop 创建时带了默认 loopStart/loopEnd 子节点，ParallelRun 也要照葫芦画瓢 |

> **关键**：查找 `FlowNodeTypeEnum.loop` 是否在"创建新节点时自动生成 loopStart + loopEnd 子节点"的逻辑里被硬编码。如果是，并行节点也需要同样的配套创建 parallelRunStart + parallelRunEnd。这是待确认项（见 5.2）。

#### 4.2.6 国际化

**文件**：`packages/web/i18n/{zh-CN,en,zh-Hant}/workflow.json`
```json
{
  "parallel_run": "并行执行",
  "intro_parallel_run": "输入一个数组，并行执行工作流处理每个元素，提升吞吐。注意：各并行任务之间变量互相隔离。",
  "parallel_run_body": "并行体",
  "parallel_run_start": "并行开始",
  "parallel_run_end": "并行结束",
  "parallel_run_input_array": "数组",
  "parallel_run_result": "并行执行结果",
  "parallel_run_max_concurrency": "最大并发数",
  "parallel_run_max_concurrency_tip": "同时执行的任务数量上限（默认 5，最大受环境变量约束）"
}
```

---

## 5. 待确认项（开始编码前需回答）

### 5.1 是否沿用 Loop 的子节点关系机制？
当前 Loop 的 parentNodeId 机制是通用的，新节点直接用即可。此项默认 ✅。

### 5.2 创建 ParallelRun 节点时是否自动生成 Start/End 子节点？
Loop 节点被拖入画布时，编辑器会自动创建一对 loopStart + loopEnd 子节点。ParallelRun 应该同样处理。需要在**节点创建逻辑**中识别 `parallelRun` 类型并生成对应子节点。

**需要查找的位置**：搜索 `FlowNodeTypeEnum.loop` 在 `projects/app/src/pageComponents/app/detail/WorkflowComponents/` 下的节点创建相关代码（useWorkflow.tsx 或类似的 hook）。

### 5.3 并发上限的默认值与上限？
建议：
- 节点级默认：5
- 环境变量：`WORKFLOW_PARALLEL_MAX_CONCURRENCY=10`
- UI 上允许用户配置 1~env 上限

请确认该默认是否合理。

### 5.4 错误处理策略？
`Promise.allSettled` 后：
- **方案 A（推荐）**：失败位置填 `null`，在节点响应详情中汇总失败数和错误信息
- **方案 B**：遇到任一失败整个节点失败（抛出）

建议采用 A，与"并行独立"的语义一致。

### 5.5 交互响应（workflowInteractive）？
建议直接 **不支持**。在 dispatch 中检测到子节点产生 interactive response 时：
- 方案 A：直接 reject 并提示"并行执行不支持交互节点"
- 方案 B：吞掉 interactive 并继续

建议采用 A（快速失败，用户明确收到错误）。

### 5.6 avatar 图标？
是否需要 UI 提供新图标？临时方案可以先用 Loop 的图标，后续替换。

---

## 6. 测试计划

遵循项目的"测试示例先行"规范，实现前先编写以下测试用例：

### 6.1 单元测试（`test/` 目录）

**文件**：`test/cases/service/core/workflow/dispatch/parallelRun/runParallelRun.test.ts`

测试用例：
1. **基础并行**：输入 `[1, 2, 3]`，子工作流返回 `item * 2`，期望输出 `[2, 4, 6]`，且执行时间接近最慢的那一次而不是总和
2. **空数组**：输入 `[]`，返回 `[]`
3. **非数组输入**：reject
4. **超出最大迭代数**：输入 100 项，`WORKFLOW_MAX_LOOP_TIMES=50` → reject
5. **并发限制生效**：设 concurrency=2，验证同一时刻最多 2 个任务运行
6. **顺序保证**：子任务执行时间随机，输出数组顺序仍按输入下标
7. **单任务失败**（allSettled 策略）：某一项抛错，其他项仍完成，失败位置为 null
8. **变量隔离**：两个并行任务各自设置同名变量，返回的 newVariables 不合并到主 variables
9. **交互响应拒绝**：子节点产生 interactive → reject
10. **runtimeNodes 不被污染**：执行后原始 runtimeNodes 的 isEntry 等状态未被修改

### 6.2 前端组件测试（可选）

- NodeParallelRun 渲染时正确显示并发数输入
- childrenNodeIdList 自动同步
- 数组类型推导正确

### 6.3 端到端测试（手动验证清单）

1. 画布上拖入"并行执行"节点 → 自动生成 parallelRunStart + parallelRunEnd
2. 在并行体内拖入一个 HTTP 节点
3. 配置输入数组为某个全局变量
4. 运行工作流，观察日志确认并发（时间戳）
5. 验证旧的"批量执行"节点同时存在且功能正常

---

## 7. 不在本次范围内的事项

以下特性**不做**，避免 scope 蔓延：
- ❌ 动态在并行任务之间通信（channel / event）
- ❌ 并行任务的优先级调度
- ❌ 基于结果的 map-reduce 聚合
- ❌ 并行节点嵌套限制（允许嵌套，但文档提醒用户小心笛卡尔积）
- ❌ 重构 NodeLoop（保持现有代码不动）
- ❌ 抽取父容器节点通用 hook（见 2.1 方案 C）

---

## 8. 实施 TODO

待用户确认上述设计后按顺序执行：

- [ ] **T0**：用户确认设计文档（特别是 5.x 的待确认项）
- [ ] **T1**：查找 `FlowNodeTypeEnum.loop` 在节点创建逻辑中的硬编码位置（回答 5.2），更新设计
- [ ] **T2**：编写测试用例骨架（`runParallelRun.test.ts`），先让测试失败
- [ ] **T3**：新增 enum 与 key 常量（`node/constant.ts`、`constants.ts`）
- [ ] **T4**：新增节点模板定义（`template/system/parallelRun/*.ts`）
- [ ] **T5**：新增 dispatch 实现（`dispatch/parallelRun/*.ts`）
- [ ] **T6**：注册到 `template/constants.ts` 和 `dispatch/constants.ts`
- [ ] **T7**：新增 i18n 文案（zh-CN、en、zh-Hant）
- [ ] **T8**：运行 T2 的单元测试，验证后端逻辑 ✅
- [ ] **T9**：复制 NodeLoop → NodeParallelRun 三个前端组件并适配
- [ ] **T10**：注册到 `Flow/index.tsx` 的 nodeTypes
- [ ] **T11**：修改节点创建逻辑（如果 T1 确认需要），使拖入 parallelRun 时自动生成子节点
- [ ] **T12**：手动端到端验证（见 6.3）
- [ ] **T13**：运行 `pnpm lint` + `pnpm test` 确保无回归
- [ ] **T14**：同步必要的中英文文档（`document/` 下的工作流章节）— 可选
