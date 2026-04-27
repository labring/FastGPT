# 循环节点交互恢复修复

## 背景

循环节点（`loopRun`，条件/数组两种模式）的循环体内若放置交互节点（如 `formInput`、`userSelect`），用户提交交互内容后继续执行时出现：

1. **表单循环被重置**：用户提交表单后又弹出同一个表单、`指定回复` 从未执行、`循环历史` 永远是 `[]`。（实际上是 workflow 被当成新请求从头跑）
2. **循环变量丢失**（若 resume 真的触发）：下游节点引用 `循环开始 > 当前循环次数` / `当前循环值` 解析为 `undefined`。
3. **响应详情缺失**（若 resume 真的触发）：被中断那次迭代的详情树只包含 resume 之后的节点。

## 调用链与快照机制

**Interactive 冒泡与快照**

`WorkflowQueue.handleInteractiveResult`（`dispatch/index.ts:1438`）在一次 `runWorkflow` 返回前，会把 `this.data.runtimeNodes` 里每个 node 的 `outputs[i].value` 截图到 `nodeOutputs`，连同 `entryNodeIds / memoryEdges` 包进 `InteractiveBasicType`：

```ts
this.data.runtimeNodes.forEach((node) => {
  node.outputs.forEach((output) => {
    if (output.value) nodeOutputs.push({ nodeId, key, value });
  });
});
```

**Resume 时的 Top-level 还原**

`projects/app/src/pages/api/v2/chat/completions.ts:258`

```ts
runtimeNodes = rewriteNodeOutputByHistories(runtimeNodes, interactive);
```

`rewriteNodeOutputByHistories`（`runtime/utils.ts:546`）只会读 **当前这层 `interactive.nodeOutputs`**，不会递归进 `params.childrenResponse.nodeOutputs`。

**`runLoopRun` 的隔离**

`runLoopRun.ts:86`

```ts
const isolatedNodes = cloneDeep(runtimeNodes);
```

循环体用独立的 `isolatedNodes` 执行，避免污染父层。

## 为什么会出问题

### 问题 0（阻断性）：`isChildInteractive` 白名单漏了 `loopRunInteractive`

`packages/global/core/workflow/template/system/interactive/constants.ts`

```ts
export const isChildInteractive = (type) => {
  if (
    type === 'childrenInteractive' ||
    type === 'toolChildrenInteractive' ||
    type === 'loopInteractive'          // ← 只有旧 loop，没有 loopRun
  ) return true;
  return false;
};
```

`getLastInteractiveValue`（`runtime/utils.ts:163`）读取最后一条 AI 消息的 `interactive`，先判断 `isChildInteractive(type)` 做"直接返回"，否则挨个匹配 `userSelect / userInput / paymentPause / agentPlanCheck / agentPlanAskQuery`。`loopRunInteractive` 既不在白名单，也不匹配任何具体 type，**结果返回 `undefined`**。

连锁反应：

1. `chat/completions.ts` 拿到 `interactive === undefined`。
2. `getWorkflowEntryNodeIds(nodes, undefined)` 退化成取 `workflowStart / systemConfig` 等默认入口。
3. `rewriteNodeOutputByHistories(runtimeNodes, undefined)` 直接返回 runtimeNodes（无还原）。
4. `runWorkflow({ lastInteractive: undefined })` → 从 `workflowStart` 重新跑一轮。
5. 用户提交的表单 JSON 被当成新 query 的 message text，workflow 从头跑到 iter 1 表单再次中断。

所以用户看到的"提交表单 → 又弹同一个表单 → `指定回复` 从未执行 → 循环历史为 []"，**全是因为 resume 根本没触发**，跟后面 A/B 两个问题无关。A/B 是在 resume 真的触发之后才会暴露的问题。

### 问题 A：变量丢失

1. 内层 `runWorkflow` 命中交互时，`handleInteractiveResult` 截图的是 `isolatedNodes` 的 outputs（含 `loopRunStart.currentIteration = 1`），放到内层 `interactive.nodeOutputs`。
2. `runLoopRun.ts:250-258` 把内层 `interactiveResponse` 原样塞进 `LoopRunInteractive.params.childrenResponse`。
3. 外层 `handleInteractiveResult` 再截图一次，但截图对象是 **父层的 runtimeNodes**（loopRun 节点自己用的那层），这层没有循环体节点的 outputs。外层 `interactive.nodeOutputs` 里**没有 `loopRunStart.currentIteration`**。
4. Resume 时 `chat/completions.ts` 只用外层 `interactive.nodeOutputs` 还原 → `loopRunStart.currentIteration` 还是 undefined。
5. `runLoopRun.ts:127-132` 的 resume 分支只设 `isEntry`，**不调用 `rewriteNodeOutputByHistories(isolatedNodes, interactiveData.childrenResponse)`**，也没调用 `injectLoopRunStart`，于是 `isolatedNodes` 上 `loopRunStart` 的 outputs 全空。
6. 下游 `指定回复` / `判断器` 通过 `getReferenceVariableValue` 读 `loopRunStart` output → 得到 `undefined`。

### 问题 B：响应详情缺失

`runLoopRun.ts:173-176`

```ts
if (response.workflowInteractiveResponse) {
  interactiveResponse = response.workflowInteractiveResponse;
  break;  // ← 直接 break
}
```

中断时**跳过 `pushIterationDetail`**，注释声称「the resumed run will record it」——但：

- `response.flowResponses` 里此时已经包含 **中断前** 跑完的 `loopRunStart / 判断器` 等节点 detail，一并被丢弃。
- Resume 那一轮的 `response.flowResponses` 只有 **resume 之后** 的节点（`表单输入` 的提交回填 + `指定回复`）。
- Resume 结束后调用 `pushIterationDetail({})` 组装 wrapper，`childrenResponses` 只剩后半段。
- `saveChat.mergeChatResponseData` 按 `mergeSignId` 合并的是外层 `loopRun` 节点，`loopRunDetail` 两端是 concat（见 `chat/utils.ts:374-377`）。但**前后两轮对同一 `iteration` 都没有各自的 wrapper 互相合并**（中断那轮压根没 push），所以 iter1 只剩一条"半截 wrapper"。

注 1：**上一条已经完成的迭代 wrapper 不会丢**。它们在中断前已经 `pushIterationDetail` 进 `loopResponseDetail`，作为外层 `loopRunDetail` 的一部分写入中断响应；resume 后的新 `loopRunDetail` 经 `mergeChatResponseData` concat 合并回来。

注 2：`loopHistory`（customOutputs 等）通过 `LoopRunInteractive.params.loopHistory` 主动透传（`runLoopRun.ts:94-96`），不受此 bug 影响。

### 旧版 `runLoop.ts` 的差异（仅说明，不在本次修复范围）

`runLoop.ts` 不 clone `runtimeNodes`（`runLoop.ts:84` 直接透传），内外层共享同一份节点引用，所以外层截图也能带上循环体 outputs，问题 A 恰好被绕开。问题 B 方面，`runLoop.ts` 不做 per-iteration wrapper，中断前的 `response.flowResponses` 在 `runLoop.ts:98` 已 push 进 `loopResponseDetail`，通过外层合并链保留。不过这是"恰好能用"的脆弱依赖，后续也建议收敛。

## 修复方案

### 范围

`runLoopRun` 流程（用户 bug 命中的是条件循环 ifo 模式）。改动点集中在四处：

0. `packages/global/core/workflow/template/system/interactive/constants.ts` — 白名单补 `loopRunInteractive`（**阻断性，必改**）
1. `packages/global/core/workflow/template/system/interactive/type.ts` — `LoopRunInteractive` 加 `pendingIterationResponses`
2. `packages/service/core/workflow/dispatch/loopRun/runLoopRun.ts` — 接入 `rewriteNodeOutputByHistories` + pending 机制

`runLoop.ts`（旧数组循环）本次不动，保留作为 follow-up。

### 改动 0：`isChildInteractive` 白名单补 `loopRunInteractive`

```ts
// packages/global/core/workflow/template/system/interactive/constants.ts
export const isChildInteractive = (type: InteractiveNodeResponseType['type']) => {
  if (
    type === 'childrenInteractive' ||
    type === 'toolChildrenInteractive' ||
    type === 'loopInteractive' ||
    type === 'loopRunInteractive'   // 新增
  ) return true;
  return false;
};
```

### 改动 1：扩展 `LoopRunInteractive` schema

新增 `pendingIterationResponses` 字段，用来持久化"当前这次迭代、中断前已经跑过的子节点响应"。

```ts
// packages/global/core/workflow/template/system/interactive/type.ts
export const LoopRunInteractiveSchema = z.object({
  type: z.literal('loopRunInteractive'),
  params: z.object({
    loopHistory: z.array(z.any()),
    childrenResponse: z.any(),
    iteration: z.number(),
    pendingIterationResponses: z.array(z.any()).optional()  // 新增
  })
});

export type LoopRunInteractive = InteractiveNodeType & {
  type: 'loopRunInteractive';
  params: {
    loopHistory: any[];
    childrenResponse: WorkflowInteractiveResponseType;
    iteration: number;
    pendingIterationResponses?: ChatHistoryItemResType[];
  };
};
```

### 改动 2：Resume 前还原循环体 node outputs

`runLoopRun.ts` 在构造 `isolatedNodes` 之后，如果正在恢复，用 `rewriteNodeOutputByHistories` 把 `interactiveData.childrenResponse.nodeOutputs` 叠加回去。

```ts
import { rewriteNodeOutputByHistories } from '@fastgpt/global/core/workflow/runtime/utils';

// ...
let isolatedNodes = cloneDeep(runtimeNodes);
const isolatedEdges = cloneDeep(runtimeEdges);

if (interactiveData?.childrenResponse) {
  isolatedNodes = rewriteNodeOutputByHistories(
    isolatedNodes,
    interactiveData.childrenResponse
  );
}
```

**不**在 resume 分支调用 `injectLoopRunStart`，原因：它会把 `loopRunStart.isEntry = true`，导致 loopRunStart 重跑并可能把已恢复 outputs 的链条再走一遍（判断器也会再跑一次，造成 detail 重复）。现在通过 rewriteNodeOutputByHistories 单一来源恢复即可。

### 改动 3：中断时保留 in-flight iteration 的子节点响应

循环里积累一个局部变量，每次看到 interactive 就把当前 `iterationChildrenResponses` 接到 pending 里；每次成功完成一次迭代就清空。

```ts
let pendingIterationResponses: ChatHistoryItemResType[] =
  interactiveData?.pendingIterationResponses ?? [];

while (true) {
  // ...(iteration guard)

  const isResumeIteration = !!interactiveData && iteration === resumeIteration;

  // resume 分支只设 isEntry；非 resume 才走 injectLoopRunStart
  if (isResumeIteration) {
    isolatedNodes.forEach((n) => {
      if (interactiveData?.childrenResponse?.entryNodeIds.includes(n.nodeId)) {
        n.isEntry = true;
      }
    });
  } else {
    injectLoopRunStart({ /* 原样 */ });
  }

  const response = await runWorkflow({ /* 原样 */ });

  // 合并 pre-interrupt + 本轮 flowResponses（pending 只在进入同一 iteration 时有效）
  const iterationChildrenResponses = [
    ...(isResumeIteration ? pendingIterationResponses : []),
    ...response.flowResponses
  ];

  // 运行时间/usage/assistant/feedback 都算本轮新跑的
  const iterationRunningTime = response.flowResponses.reduce(
    (acc, r) => acc + (typeof r.runningTime === 'number' ? r.runningTime : 0),
    0
  );

  // ...(assistantResponses / usagePush / feedback 原样，注意 totalPoints/usage 只算新跑的，避免重复计费)

  if (response.workflowInteractiveResponse) {
    interactiveResponse = response.workflowInteractiveResponse;
    // 累积，支持多次中断
    pendingIterationResponses = iterationChildrenResponses;
    break;
  }

  // 迭代完整走完 → 使用合并后的 children 生成 wrapper
  // iteration 成功或失败都走 pushIterationDetail({ childrenResponses: iterationChildrenResponses })
  // ...

  // 迭代走完，清空 pending，进下一轮
  pendingIterationResponses = [];

  interactiveData = undefined;  // 原逻辑
  iteration++;
}

// 返回的 interactive payload 带上 pending
return {
  // ...
  [DispatchNodeResponseKeyEnum.interactive]: interactiveResponse
    ? {
        type: 'loopRunInteractive',
        params: {
          loopHistory,
          childrenResponse: interactiveResponse,
          iteration,
          pendingIterationResponses
        }
      }
    : undefined,
  // ...
};
```

**把 `pushIterationDetail` 接上 `iterationChildrenResponses`**（原本是直接闭包读外层变量，这里改成参数传入或直接 inline 使用合并结果）。

### 改动 4：`iterationRunningTime` 的归集

原实现是 `iterationChildrenResponses.reduce(...)`，现在要区分"本轮新跑的耗时"和"累积子响应"。耗时只算本轮（中断前的耗时已经挂在之前那次请求里），避免重复。`totalPoints / assistantResponses / usagePush` 同理只算 `response` 本轮。

### 风险点与兼容性

1. **多次中断同一迭代**：按方案 pending 在每轮 resume 时被读出 → 本轮再追加 → 再次中断时整包写回 interactive payload。验证：一个 iteration 里先 `formInput` → 再 `userSelect`，两次交互后应该看到完整 children。
2. **旧 chat 历史无 `pendingIterationResponses` 字段**：`?? []` 兜底，向前兼容。
3. **外层 `mergeChatResponseData`**：外层 `loopRun` 节点 `mergeSignId` 不变，合并逻辑不受影响；pending 只作用在 wrapper 内部 `childrenResponses`，不冲突。
4. **测试节点 `rewriteNodeOutputByHistories` 的落点是 clone 后的副本**：不会把循环体 outputs 泄漏给外层后续兄弟节点。

### 已知的次要 bug（本次不修）

- `handleInteractiveResult` 截图 outputs 时 `if (output.value)` 会丢掉 `0 / '' / false` 等合法值（`dispatch/index.ts:1449`）。对数组模式 `currentIndex = 0` 会有影响；条件模式 `iteration >= 1` 不受影响。留作后续专项修复。
- `runLoop.ts`（旧数组循环）依赖 `runtimeNodes` 共享引用偶然可用，建议后续同步迁移到显式 `rewriteNodeOutputByHistories`。

## TODO

- [x] `packages/global/core/workflow/template/system/interactive/constants.ts`：`isChildInteractive` 白名单补 `'loopRunInteractive'`
- [x] `packages/global/core/workflow/template/system/interactive/type.ts`：给 `LoopRunInteractiveSchema` / `LoopRunInteractive` 加 `pendingIterationResponses?: ChatHistoryItemResType[]` 字段
- [x] `packages/service/core/workflow/dispatch/loopRun/runLoopRun.ts`：
  - [x] 引入 `rewriteNodeOutputByHistories`
  - [x] `isolatedNodes = cloneDeep(...)` 后若有 `interactiveData` 就叠加还原循环体 outputs
  - [x] 循环内维护 `pendingIterationResponses`；`isResumeIteration` 分支合并 pending + 本轮 flowResponses
  - [x] 中断分支：写入 pending；走完一次迭代后清空
  - [x] `pushIterationDetail` 使用合并后的 `iterationChildrenResponses`；`iterationRunningTime` 按合并后统计，`totalPoints / usagePush` 只算本轮
  - [x] return 的 `loopRunInteractive.params` 带 `pendingIterationResponses`
- [ ] 本地手测 1：`条件循环 + formInput`（用户原场景），确认"当前循环次数"引用可读 + 响应详情包含中断前子节点
- [ ] 本地手测 2：同一迭代内先后两次交互（先 formInput 再 userSelect），确认 pending 累积
- [ ] 本地手测 3：第 2 次迭代触发交互，恢复后后续迭代继续跑，确认上一条完整迭代 wrapper 不丢
- [ ] 本地手测 4：数组模式循环 + 交互，确认没有回归
- [ ] （follow-up，不在本 PR）`runLoop.ts` 同步显式 `rewriteNodeOutputByHistories`
- [ ] （follow-up，不在本 PR）`handleInteractiveResult` 的 `if (output.value)` 改 `!== undefined`
