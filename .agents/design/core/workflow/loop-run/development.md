# loopRun 节点开发文档（文件级改动清单 + TODO）

> 设计稿：[Notion - 工作流循环批量](https://www.notion.so/dighuang/341ded3f8cd88187be61fb442c7fbe8b)
> 蓝本：parallelRun 节点（commit `0855cc6e06c56f8fa2ea9aaab491d43bb4413be8`）
> 本文档只覆盖"**实现侧**"内容。节点语义、交互细节以 Notion 设计稿为准。

## 1. 与 parallelRun 的核心差异速览

| 维度 | parallelRun | loopRun |
|---|---|---|
| 并发模型 | `batchRun` 并行 | 串行 `for` + `await` |
| 输入模式 | 只 array | array / conditional 二选一 |
| 终止条件 | 数组取尽 | 数组取尽（array 模式）/ `loopRunBreak` 命中 / 系统兜底 |
| 重试 | 有（0-5 次，默认 3） | 无 |
| 并发数配置 | 有（env 上限） | 无 |
| 输出 | 固定 3 个（success/full/status） | 用户自定义字段 + `errorText`（`loopRunIterations` / `loopRunHistory` 仅在调试 nodeResponse 中） |
| 子节点 | 子流程，无独立 Start 节点 | `loopRunStart`（unique，自动生成）+ `loopRunBreak`（信号节点，可多个） |
| interactive | 不支持 | 支持（对齐旧 loop） |
| runtimeNodes 隔离 | 每任务 cloneDeep | 进入 loopRun 时 cloneDeep 一次；迭代间共享 |
| 变量 `newVariables` | 每任务独立 | 跨迭代累加，结束回写 parent |

---

## 2. 文件级改动清单

### 2.1 Global 枚举 & 类型

**`packages/global/core/workflow/node/constant.ts`**
- `FlowNodeTypeEnum` 新增 3 个成员：
  - `loopRun = 'loopRun'`
  - `loopRunStart = 'loopRunStart'`
  - `loopRunBreak = 'loopRunBreak'`
- `isNestedParentNodeType()` 增加 `FlowNodeTypeEnum.loopRun` 判断

**`packages/global/core/workflow/constants.ts`**
- `NodeInputKeyEnum` 新增：
  - `loopRunMode`（`'array' | 'conditional'`）
  - `loopRunInputArray`（不复用 `nestedInputArray`，避免与旧 loop/parallelRun 的 `loopInputArray` 字符串值冲突）
  - `loopCustomOutputs`（自定义输出字段声明区）
- `NodeOutputKeyEnum` 新增：
  - `errorText`（若已存在则复用）
  - `currentIndex` / `currentItem` / `currentIteration`（loopRunStart 动态输出）
- 不需要新增 status enum（loopRun 无 parallelStatus 这种状态输出）

**`packages/global/core/workflow/runtime/type.ts`**
- `DispatchNodeResponseType` 增加：`loopRunInput?`、`loopRunIterations?`、`loopRunHistory?`、`loopRunDetail?`
- `WorkflowInteractiveResponseType` 已有 `loopInteractive` 类型，loopRun 复用现有结构（`currentIndex` → 改名对齐 `iteration` 可选，或直接用复用字段）

**`packages/global/core/workflow/template/input.ts`**
- 复用现有 `Input_Template_Children_Node_List` / `Input_Template_Node_Width` / `Input_Template_Node_Height` / `Input_Template_NESTED_NODE_OFFSET`
- 新增 `Input_Template_LoopCustomOutputs`（参考代码节点的 `Output_Template_AddOutput` 做一个声明区输入）

**`packages/global/core/workflow/template/constants.ts`**
- 导入 `LoopRunNode` / `LoopRunStartNode` / `LoopRunBreakNode`
- 添加到 `systemNodes` 数组

**`packages/global/core/workflow/template/system/loopRun/`**（新建目录）
- `loopRun.ts` - `LoopRunNode` 模板（参考 `parallelRun.ts`，去掉并发/重试输入，加 `loopRunMode` / `loopRunInputArray` / `loopCustomOutputs`；outputs 只保留 `errorText`，用户自定义字段由 dynamic output 声明；迭代数与历史仅在 nodeResponse 调试信息中返回）
- `loopRunStart.ts` - `LoopRunStartNode` 模板，`unique: true, forbidDelete: true`，outputs 按 mode 动态暴露（array 模式：currentIndex + currentItem；conditional 模式：currentIteration）
- `loopRunBreak.ts` - `LoopRunBreakNode` 模板，`inputs: []`、`outputs: []`，只有 target handle

### 2.2 后端 Dispatcher

**`packages/service/core/workflow/dispatch/index.ts`**
- 导入 `dispatchLoopRun` / `dispatchLoopRunStart` / `dispatchLoopRunBreak`
- `callbackMap` 注册 3 个回调

**`packages/service/core/workflow/dispatch/loopRun/`**（新建目录，对齐 `parallelRun/`）
- `runLoopRun.ts` - 主 dispatcher，结构参考 `runParallelRun.ts`：
  - 入口：`cloneDeep(runtimeNodes / runtimeEdges)` 做循环级隔离
  - `for` 循环：mode 分支（array 取数组元素；conditional 只计次）
  - 每轮 `injectLoopRunStart`（新工具，向 loopRunStart 注入 iteration/index/item）
  - `runWorkflow` 跑子流程
  - 出错 catch → 读快照（过滤未跑节点）→ push loopHistory → break
  - 正常结束 → 读快照（全字段）→ push loopHistory → 判断 flowResponses 含 loopRunBreak → break or 继续
  - interactive 响应 → 立即 break 并返回 `loopInteractive` 状态
  - 结束聚合：最后一项 `loopHistory.customOutputs` → 动态 outputs
- `runLoopRunStart.ts` - 简单透传（参考 `runLoopStart.ts`）
- `runLoopRunBreak.ts` - 纯信号，返回空 data，仅在 flowResponses 中留下 moduleType 标记
- `service.ts` - loopRun 专属工具：
  - `injectLoopRunStart({ nodes, mode, iteration, index?, item? })` - 向 loopRunStart 注入输入
  - `readCustomOutputSnapshot({ runtimeNodes, loopCustomOutputs, finishedNodeIds?, childrenNodeIdList? })` - 读 ref 写快照（传 finishedNodeIds 时按集合过滤；childrenNodeIdList 用于放行循环体外 ref）
  - `extractFinishedNodeIds(flowResponses)` - 从 runWorkflow 响应提取已完成节点集合
  - `pickCustomOutputInputs(inputs)` - 筛选 `canEdit: true` 的动态输入声明
  - `hasLoopRunBreakChild(runtimeNodes, childrenNodeIdList)` / `isLoopBreakHit(flowResponses)` - conditional 模式 break 预检 + 运行时判定
- `pushSubWorkflowUsage` / `collectResponseFeedbacks` - **不放在 service.ts**，统一在 `dispatch/utils.ts` 里实现并由 loop/loopRun 共用（见下条）

**`packages/service/core/workflow/dispatch/utils.ts`**
- 新增跨 dispatcher 共用工具：`pushSubWorkflowUsage({ usagePush, response, name, iteration })`、`collectResponseFeedbacks(response, target)`。原 `loop/service.ts` 中的同名实现已下沉到这里；`loop/runLoop.ts` 调用处由 `index` → `iteration` 更名（语义等价：两者都传 1-based 迭代计数）
- parallelRun 不共用这套工具——它在 retry 循环里做了带累加器的就地聚合，抽出去反而复杂
- 沿用 `safePoints`、`injectNestedStartInputs` 不变

**`packages/service/env.ts`**
- 无需新增 env；复用 `WORKFLOW_MAX_LOOP_TIMES`

### 2.3 前端画板节点组件

**`projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/Loop/`**（目录复用，新增文件）
- `NodeLoopRun.tsx` - 容器节点组件。基本参考 `NodeParallelRun.tsx`：
  - 用 `useNestedNode` hook 处理大小/子节点列表
  - 注意：conditional 模式下 **没有 `nestedInputArray`**，`useNestedNode` 要么加开关、要么条件循环模式下不读这个 input
  - 需要新增：`loopRunMode` select 切换；切换时清理 loopRunStart 的 ref 并给 toast 提醒
  - 需要新增：`loopCustomOutputs` 的自定义输出声明 UI（参考代码节点的 `RenderOutput` 模式）
- `NodeLoopRunStart.tsx` - start 节点 UI。参考 `NodeLoopStart.tsx`，但输出字段按父节点 `loopRunMode` 动态显示（array: currentIndex+currentItem; conditional: currentIteration）
- `NodeLoopRunBreak.tsx` - break 信号节点 UI，极简卡片，只有 target handle 和图标文字

**`projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/index.tsx`**
- 节点类型映射新增 3 条 dynamic import

**`projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useNestedNode.ts`**
- 适配：`nestedInputArray` 读取改为可选（conditional 模式无该 input 时跳过 valueType 推断）
- 或者：新增参数 `arrayInputKey?: NodeInputKeyEnum`，允许 loopRun 传 `loopRunInputArray`；parallelRun 走默认 `nestedInputArray`

**`projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useWorkflow.tsx`**
- 若有节点复制/删除禁用白名单，加入 loopRun / loopRunStart / loopRunBreak

**`projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useKeyboard.tsx`**
- 禁止跨容器 copy/paste 的规则补 loopRun

**`projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/components/NodeTemplates/list.tsx`**
- loopRun 子流程内禁止添加：loop / loopRun / parallelRun（**允许 interactive**，区别于 parallelRun）
- 拖入 loopRun 时自动创建 `loopRunStart` 子节点

**`projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/NodeTemplatesPopover.tsx`**
- 无需改动（模板列表从 systemNodes 派生）

**`projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/NodeCard.tsx`**
- loopRun 容器节点 `menuForbid={{ copy: true }}`（与 parallelRun 一致）

**`projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/Reference.tsx`**
- 确认 loopRunStart 的动态 outputs（currentIndex/currentItem/currentIteration）可以被子流程内其他节点正常引用

**`projects/app/src/pageComponents/app/detail/WorkflowComponents/context/workflowComputeContext.tsx`**
- 无需改动（嵌套容器大小计算通用）

**`projects/app/src/pageComponents/core/chat/components/WholeResponseModal.tsx`**
- 若需展示 loopRun 每轮详情（`loopRunDetail`），参考 parallelRun 的展示逻辑追加

**`projects/app/src/web/core/workflow/utils.ts`**
- 类型检查/图标映射工具函数补 loopRun

### 2.4 图标 & i18n

**`packages/web/components/common/Icon/`**
- `constants.ts` 注册 3 个图标：`core/workflow/template/loopRun` / `loopRunStart` / `loopRunBreak`
- `icons/core/workflow/template/loopRun.svg` / `loopRunLinear.tsx`（新建；linear 可先拷贝 parallelRunLinear 做 placeholder，后续设计出图再替换）
- 其他两个小节点如果视觉上复用现有 loop start/break 图标可跳过

**`packages/web/i18n/{zh-CN,en,zh-Hant}/workflow.json`**
- 新增 key：
  - `loop_run` / `intro_loop_run` / `loop_run_execution_logic`
  - `loop_run_mode` / `loop_run_mode_array` / `loop_run_mode_conditional`
  - `loop_run_input_array`
  - `loop_custom_outputs` / `loop_custom_outputs_tip`
  - `loop_iterations` / `loop_history`
  - `loop_run_break` / `loop_run_break_tip`
  - `loop_run_start` / `current_index` / `current_item` / `current_iteration`
  - `loop_run_mode_switch_warning`（模式切换警告）
  - `loop_run_interactive_not_supported_in_xxx`（如有错误文案需要）
- `common.json` 若 parallelRun 在 common 里加了什么（如 limit 提示），loopRun 酌情加

### 2.5 配置 & 系统

**`packages/global/common/system/types/index.ts`** 和 **`projects/app/src/service/common/system/index.ts`**
- 若 loopRun 无需前端限制（比如没有 concurrency max），**无需改动**
- 否则参考 parallelRun 在 `FastGPTFeConfigsType.limit` 增加字段

**`projects/app/.env.template`**
- 无需新增

### 2.6 测试

**`test/cases/packages/service/core/workflow/dispatch/loopRun/service.test.ts`**（新建）
- `readCustomOutputSnapshot`：
  - finishedNodeIds 为 undefined（成功轮）→ 全字段有值
  - finishedNodeIds 只包含部分节点 → 未包含节点的 ref 返回 undefined
  - ref 目标节点不存在 → undefined
- `extractFinishedNodeIds`：从 flowResponses 正确推导 nodeId 集合
- `injectLoopRunStart`：array 模式注入 index+item，conditional 模式注入 iteration

**`test/cases/packages/service/core/workflow/dispatch/loopRun/runLoopRun.test.ts`**（新建）
- array 模式数组取尽正常返回
- array 模式中途节点出错 → loopHistory 最后一项 success:false，快照按已完成节点过滤
- conditional 模式 loopRunBreak 命中 → 正常返回
- conditional 模式超过 `WORKFLOW_MAX_LOOP_TIMES` → 系统兜底报错
- interactive 响应 → 返回 loopInteractive，下次进入从中断轮次续跑
- catchError=true 出错 → 走 errorText
- catchError=false 出错 → 直接抛

---

## 3. TODO（按依赖排序）

### Phase 1 - 类型 & 枚举（无依赖）
- [ ] T1.1 `FlowNodeTypeEnum` 新增 3 个成员 + `isNestedParentNodeType` 更新
- [ ] T1.2 `NodeInputKeyEnum` / `NodeOutputKeyEnum` 新增所需 key
- [ ] T1.3 `DispatchNodeResponseType` 扩展 loopRun 相关字段
- [ ] T1.4 新增 `Input_Template_LoopCustomOutputs`（若需要）

### Phase 2 - 节点模板（依赖 Phase 1）
- [ ] T2.1 `template/system/loopRun/loopRun.ts`
- [ ] T2.2 `template/system/loopRun/loopRunStart.ts`
- [ ] T2.3 `template/system/loopRun/loopRunBreak.ts`
- [ ] T2.4 `template/constants.ts` 注册 3 个模板到 `systemNodes`

### Phase 3 - 后端 Dispatcher（依赖 Phase 2）
- [ ] T3.1 `dispatch/loopRun/service.ts` - `injectLoopRunStart` / `readCustomOutputSnapshot` / `extractFinishedNodeIds`
- [ ] T3.2 `dispatch/loopRun/runLoopRunStart.ts`
- [ ] T3.3 `dispatch/loopRun/runLoopRunBreak.ts`
- [ ] T3.4 `dispatch/loopRun/runLoopRun.ts` - 主循环（array 模式）
- [ ] T3.5 `dispatch/loopRun/runLoopRun.ts` - 补 conditional 模式 + loopRunBreak 判定
- [ ] T3.6 `dispatch/loopRun/runLoopRun.ts` - 补 interactive 暂停恢复
- [ ] T3.7 `dispatch/loopRun/runLoopRun.ts` - 补 catchError
- [ ] T3.8 `dispatch/index.ts` 注册 3 个回调
- [ ] T3.9 局部测试：`test/cases/packages/service/core/workflow/dispatch/loopRun/service.test.ts`
- [ ] T3.10 局部测试：`test/cases/packages/service/core/workflow/dispatch/loopRun/runLoopRun.test.ts`

### Phase 4 - 前端节点组件（可与 Phase 3 并行）
- [ ] T4.1 图标资源（SVG + Linear TSX）+ `Icon/constants.ts` 注册
- [ ] T4.2 i18n key 三语言
- [ ] T4.3 `NodeLoopRunBreak.tsx`（最简单）
- [ ] T4.4 `NodeLoopRunStart.tsx`（按 mode 动态 outputs）
- [ ] T4.5 `useNestedNode` hook 适配（支持 conditional 模式无 nestedInputArray）
- [ ] T4.6 `NodeLoopRun.tsx`（含 mode select、custom outputs 声明 UI）
- [ ] T4.7 `Flow/index.tsx` 节点类型映射
- [ ] T4.8 `NodeTemplates/list.tsx` 拖入时自动创建 loopRunStart；子流程内禁止添加循环/并行容器（允许 interactive）
- [ ] T4.9 `useKeyboard.tsx` / `useWorkflow.tsx` 复制/删除规则
- [ ] T4.10 `WholeResponseModal.tsx` 每轮详情展示

### Phase 5 - 校验 & 集成
- [ ] T5.1 保存时校验：conditional 模式至少 1 个 loopRunBreak（编辑器层）
- [ ] T5.2 运行时 dispatch 预检查：数组长度上限、嵌套规则兜底
- [ ] T5.3 模式切换 UI 提示（ref 失效 toast）

### Phase 6 - 全量验证
- [ ] T6.1 `pnpm test` 全量跑
- [ ] T6.2 `pnpm lint`
- [ ] T6.3 前端手工验证：拖节点/切模式/数组模式跑通/条件模式跑通/break 生效/interactive 暂停恢复/catchError=true/false

---

## 4. 开放问题（开发中可能需要与用户对齐）

1. **`useNestedNode` 是否重构为支持可选 arrayInputKey？** 当前只读 `nestedInputArray`，loopRun 用独立 key `loopRunInputArray`。两种方案：
   - A：hook 增加 `arrayInputKey` 参数
   - B：在 loopRun 组件里不用 hook，单独写大小同步逻辑
   - 建议 A（复用度高）

2. **自定义输出声明 UI 复用策略**：代码节点（`sandbox`）的 `Output_Template_AddOutput` 实现在 `RenderOutput` 里。loopRun 的 custom outputs 语义是"引用子流程内节点输出，声明为 parent 节点的 output"，跟代码节点不完全一样（代码节点是由代码产出）。需确认：
   - 是否直接复用现有组件？还是需要新写一个"ref-based custom output" 声明器？

3. **interactive 暂停恢复的 `customOutputs` 快照**：interactive 响应本身不是"失败"，是中断。恢复时：
   - 中断时的快照要不要同步记录？（若恢复后正常跑完，该轮会重新读快照覆盖）
   - 建议：不在 interactive 时写 loopHistory，恢复后按正常轮处理

4. **`loopRunBreak` 是否放在 loop/parallelRun 外部但误连到 loopRun 子流程内**：静态校验层面需要严格卡住父容器归属

5. **`FlowNodeTypeEnum.nestedEnd`（旧 loopEnd）与 loopRun**：loopRun 不使用 nestedEnd，runtime 也不应匹配到。

---

## 5. 实现期间引入的跨模块改动（区分于设计清单）

这几处在 loopRun 开发过程中顺手改到了，不是 loopRun 本身的功能需求，但**对其他节点也有影响**，单独列出来避免回顾时误判是 loopRun 独占的修改。

### 5.1 dispatch/index.ts 错误归一化

**位置**：`packages/service/core/workflow/dispatch/index.ts` 在 "dispatcher 返回 `{error}` + `catchError=false`" 分支里补了一段：

```ts
const nodeResponseBase = result[DispatchNodeResponseKeyEnum.nodeResponse];
const errText = nodeResponseBase?.errorText ?? getErrText(result.error as any);
return {
  ...result,
  [DispatchNodeResponseKeyEnum.nodeResponse]: {
    ...nodeResponseBase,
    error: errText
  },
  ...
};
```

**动机**：loopRun / parallelRun 需要一种稳定方式识别失败轮。`dispatch/index.ts` 里 dispatcher throw 的 catch 兜底分支本来就在写 `nodeResponse.error`，OTel span status 也读 `nodeResponse.error`。唯独 dispatcher 返回 `{error}` + `catchError=false` 的非 throw 路径不写 `error`，导致失败检测链路断裂。

**方案**：给非 throw 路径补齐 `nodeResponse.error`，和 catch 兜底 + OTel 统一到同一个字段。`errorText` 保留给 UI 展示（schema 注释 `// Just show`）。

**顺带修复**：`parallelRun/service.ts` 早就在用 `flowResponses.find((r) => r.error)`，但同样因为这条链路没写 `error` 而始终落到 fallback 文案 `parallel_task_not_reach_end`。归一化后 parallelRun 也能拿到真实错误。OTel span error status 也终于会在这条路径上正确触发。

**安全性**：`DispatchNodeResponseSchema` 里 `error` 本来就是可选字段；grep 过所有消费方，没有代码因为 `.error` 现在会被填充而出问题。

### 5.2 WholeResponseModal 里 `updateVarResult` 单元素数组解包

**位置**：`projects/app/src/components/core/chat/components/WholeResponseModal.tsx` L512-L527。

**动机**：loopRun 调试时常见一类工作流是"loopRun 内用变量更新节点改写循环体外的代码节点输出 → 在 WholeResponseModal 里看累计结果"。`updateVarResult` 本来是 `updateList.map(...)` 的数组，单行配置时展示为 `[{...}]`，当内部 value 又是数组时会出现 `[[...]]` 的视觉双层嵌套，调试极差。

**行为**：长度为 1 且 `r[0] !== null && r[0] !== undefined` 时解包外层。保留两种 signal：
- 多行配置仍按数组展示（未做破坏）
- `[null]`（无效引用）仍保留外层 → 用户能看到"这里是无效引用"

**风险面**：全体 Row 渲染规则未变，`val === undefined | '' | 'undefined'` 仍会隐藏。对非 loopRun 用户是展示改善，不是功能改动。

### 5.3 `useNestedNode` 子节点尺寸订阅 (`childDimensionsSignal`)

**位置**：`projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useNestedNode.ts` L55-L65。

**动机**：loopRun 体积计算沿用了 loop / parallelRun 的老逻辑——`setTimeout(() => resetParentNodeSizeAndPosition(nodeId), 50)`，在快速拖入子节点时定时器会抢跑在 ReactFlow 测量宽高之前，算出的 bounds 偏小。

**方案**：订阅 `WorkflowInitContext.nodes` 里所有 parent 匹配的子节点 `${id}:${width}x${height}`，拼成字符串 signal。signal 变化触发重新计算 bounds。

**影响面**：loop / parallelRun 也在用 `useNestedNode`——同时吃到这个修复。没有看到对 loopRun 之外的回归，但建议在人工验证清单里对 loop / parallelRun 的拖拽体验回归一次。

### 5.4 `pushSubWorkflowUsage` / `collectResponseFeedbacks` 下沉到 `dispatch/utils.ts`

见 `2.2 后端 Dispatcher` 一节。原本 `loop/service.ts` 里的实现被挪到 `dispatch/utils.ts`，loop / loopRun 共用。参数名 `index` → `iteration`（两者语义等价，都是 1-based 迭代计数）。这是 loopRun feature PR 的一部分去重改动，不是 bug 修复。
