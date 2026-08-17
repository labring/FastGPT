# Workflow Builder「再次应用」后画布被还原 —— 问题审计报告

> 状态：已按方案 A 修复（2026-08-14），本报告保留审计过程与证据
> 日期：2026-08-14
> 涉及分支：`yyh/workflow-core-cli`

## 1. 问题描述

在 Workflow Builder（AI 工作流自动生成）中，工作流生成完成后点击版本卡片「再次应用」：

1. 点击瞬间画布短暂显示新版本内容（本次修改的节点已更新）；
2. 约 1 秒后（「已应用到画布」toast 出现时）画布还原到点击前的状态；
3. 每次点击都会重复出现。

## 2. 复现方式

- 前置：AI 生成的工作流中包含一个**带自定义输出（collected results）的 Loop 节点**（本次复现为 `examLoop`，类型 `loopRun`，array 模式）；
- 操作：点击版本卡片「再次应用」；
- 现象：画布先显示新内容，约 1 秒后还原。

## 3. 根因结论

**根因：AI 生成端输出的 loopRun 节点文档中，自定义输出 `collectedResults` 只有 outputs 声明，没有配套的 `canEdit: true` 输入声明；画布挂载 Loop 节点时，`NodeLoopRun` 组件的 useEffect 将 `collectedResults` 判定为「未声明的动态输出」，自动执行 `delOutput` 删除该输出并同步 `onDelEdge` 删除其连线，把刚应用的内容改回去。**

由于 S3 归档的始终是 AI 原始文档（含 `collectedResults` 但缺声明），每次重新应用都会重复触发同样的修正，与「每次点击都还原」完全吻合。

## 4. 证据链

### 4.1 一次完整 apply 的日志时序（05:14:28，带埋点复现）

| 时间 | 事件 | 说明 |
|---|---|---|
| 28.492 | `apply start version=AI 生成版本 3` | 点击「再次应用」 |
| 28.656 | `apply loaded document` | 从 S3 加载 AI 归档文档 |
| 28.660 | `apply document loop` | **AI 文档中 examLoop 结构**（见下） |
| 28.697 | `apply before initData nodes=31` | 目标文档 31 个节点 |
| 28.704 | `apply after initData` | 画布已显示新版本（此时用户能看到改动） |
| 29.327 | `examLoop:delOutput:collectedResults` at **NodeLoopRun.useEffect** | **修正触发点** |
| 29.503 | `onDelEdge nodeId=examLoop sh=examLoop-source-collectedResults` | 删除 `examLoop → aggResults` 连线 |
| 30.802 | `apply after autoLayout=applied` | 布局只改位置 |
| 30.868 | `apply before push nodes=31` | 已是修正后的残缺画布 |
| 30.870 | `push SAVED title=AI 生成版本 3 nodes=31` | **残缺画布被存为快照** |
| 30.871 | `apply toast success` | toast 出现，用户感知「还原」 |

### 4.2 AI 文档中 loop 节点原始结构（埋点输出原文）

```json
apply document loop: [
  {
    "id": "examLoop",
    "type": "loopRun",
    "mode": "array",
    "inputs": ["loopRunMode", "loopRunInputArray", "loopCustomOutputs", "childrenNodeIdList", "nodeWidth", "nodeHeight", "loopNodeInputHeight"],
    "outputs": ["system_error_text", "collectedResults"]
  },
  {
    "id": "examLoop__start",
    "type": "loopRunStart",
    "mode": "array",
    "inputs": ["loopRunMode", "loopStartInput", "loopStartIndex"],
    "outputs": ["currentIndex", "currentItem"]
  }
]
apply document loopEdges: ["examLoop:undefined->aggResults:undefined", "examLoop__start:undefined->readCurrent:undefined"]
```

关键点：
- `examLoop.outputs` 含自定义输出 `collectedResults`，但 `inputs` 中**没有** `collectedResults` 对应的 `canEdit: true` 声明（只有 7 个固定 key）；
- 连线 `examLoop → aggResults` 在文档中存在，应用后被删。

### 4.3 代码逻辑

**动态输出的声明机制**：loop 节点的自定义输出由 `loopCustomOutputs`（`addInputParam` 渲染类型）驱动的 `canEdit: true` 输入声明，动态输出与 canEdit 输入**成对出现**（见 `DynamicInputs/index.tsx`：`inputs.filter((item) => item.canEdit)` 才是用户可见的动态字段）。

**转换链路**：`applyVersion` → `parseCompatibleWorkflowDocument` → `compileStoreWorkflow` → `parseWorkflowImportConfig` → `initData` → `storeNode2FlowNode`（`projects/app/src/web/core/workflow/utils.ts:163`）：
- 模板 `loopRun.ts` 的 outputs 只有 `errorText`；
- store 中多出的 `collectedResults` 走 `.concat()` 分支补为 dynamic 输出（`type: dynamic`），inputs 无对应 canEdit 声明。

**修正触发点**：`Flow/nodes/Loop/NodeLoopRun.tsx`（86-233 行）挂载时两个 useEffect：
- Effect 1（mode sync，86-190 行）：`mode=array` 时 `delOutput currentIteration`、`addOutput currentIndex/currentItem` —— 对应 `examLoop__start:delOutput:currentIteration`，属**良性修正**（文档缺 currentIteration，模板补全后按 array 模式删除）；
- Effect 2（192-233 行，**根因所在**）：
  ```ts
  const declared = inputs.filter((i) => i.canEdit === true);
  const currentDynamic = outputs.filter((o) => o.type === FlowNodeOutputTypeEnum.dynamic);
  const declaredKeys = new Set(declared.map((i) => i.key));
  currentDynamic.forEach((o) => {
    if (!declaredKeys.has(o.key)) {
      onChangeNode({ nodeId, type: 'delOutput', key: o.key });
    }
  });
  ```
  `collectedResults` 不在 `declaredKeys` 中 → `delOutput`，`onChangeNode` 内部对删除的输出同步执行 `onDelEdge`（日志 29.503 证实）。

**生成端规范缺失**：`pro/admin/src/service/core/ai/skill/builtin/workflow-builder/SKILL.md` 只写了 "Custom collected outputs are manual dynamic outputs. Add their exact keys and types before downstream references."，**没有要求**在 inputs 中声明对应的 canEdit 输入，导致生成端输出不合规文档。

### 4.4 为什么「先显示后还原」

`initData` 同步覆盖画布（用户看到新版本）→ React 挂载 Loop 节点 → `NodeLoopRun` useEffect 异步修正（delOutput/onDelEdge，约 1 秒后）→ toast 出现。修正发生在 applyVersion 的 await 链返回之后，视觉上表现为「toast 出现时还原」。

## 5. 已排除的假设

| 假设 | 排除依据 |
|---|---|
| 组件重挂载触发 `initData(isInit)` RESTORE past[0] | 画布先显示新版本（日志 28.704 后无 restore 行为），且 Workflow/index.tsx mount 埋点无重复挂载 |
| undo/redo 自动触发 | 日志无 `undo called` / `redo called` |
| 版本切换（onSwitchTmpVersion/onSwitchCloudVersion） | 日志无调用 |
| 自动布局覆盖 | `autoLayout=applied`，只改 position 不改结构；且还原含节点输出与连线，非位置 |
| push 快照回写画布 | push 只记录快照，不回写画布（workflowSnapshotContext） |
| workflowInitContext 监听 appDetail 触发 replaceWorkflowData | replaceWorkflowData 调用栈日志均来自正常编辑流程，无 apply 后的额外覆盖 |

## 6. 衍生问题

1. **快照与 AI 版本不一致**：push SAVED 保存的是被修正后的残缺画布（31 节点、少一条 `examLoop→aggResults` 连线），与 AI 版本卡片内容不一致。用户在「我的编辑」里看到的版本是残缺的。
2. **历史数据无法自愈**：S3 中已归档的 AI 文档均缺 canEdit 声明，仅修复生成端只能保证新生成的文档合规，旧文档重新应用仍会触发修正。

## 7. 修复方向建议（未实施，供讨论）

### 方案 A（推荐，生成端修复 + 前端兜底）
1. **生成端**：`pro/admin/.../workflow-builder/SKILL.md` 补充规范——loop 自定义输出必须在 `inputs` 中声明同名 `canEdit: true` 输入（valueType 与输出一致），与 `loopCustomOutputs` 的 addInputParam 机制对齐；同时要求已生成的节点 `loopCustomOutputs` 值与 inputs 声明保持同步。
2. **前端兜底（兼容历史数据）**：在 `storeNode2FlowNode` 或 `parseWorkflowImportConfig` 阶段，对 loop 节点「有 dynamic 输出但无对应 canEdit 输入」的情况自动补齐 canEdit 输入声明（key/valueType 从输出推导），避免 NodeLoopRun Effect 2 误判。注意与 `loopCustomOutputs` 的 value 存储结构对齐（需确认 addInputParam 的存储格式）。

### 方案 B（仅前端，覆盖历史数据）
同上 2，不修改生成端。可最快止血（新老版本均不再被修正），但生成文档本身仍不合规，Loop 节点的自定义输出在子工作流引用语义上依赖声明存在，属数据层兜底而非根治。

### 方案 C（不推荐，防御性）
`NodeLoopRun` Effect 2 删除动态输出前检查该输出是否存在连线，有连线则跳过删除。会掩盖生成端问题，且删除/保留逻辑不一致（动态输出依赖声明才能正确渲染），仅作临时止血考虑。

## 8. 结论

- 根因明确：**AI 生成文档 loop 节点缺 canEdit 输入声明 → NodeLoopRun 挂载时 useEffect 误删动态输出及连线 → 每次 apply 重复修正**；
- 建议按「方案 A：生成端规范 + 前端兼容补齐」修复，其中前端补齐是覆盖已归档历史数据所必需的。

## 9. 修复记录（2026-08-14 已实施，方案 A）

1. **前端兜底（覆盖历史数据）**：`projects/app/src/web/core/workflow/utils.ts` `storeNode2FlowNode` 中，对 `loopRun` 节点按动态输出自动补齐缺失的 canEdit 输入声明（key/valueType 从输出推导，`renderTypeList: [reference]`、`canEdit: true`、`required: false`）。所有文档加载路径（initData、版本应用、快照切换、表单预览）均经过该转换，已归档的旧 AI 文档重新应用也会被修正。
2. **生成端规范（根治新文档）**：`pro/admin/src/service/core/ai/skill/builtin/workflow-builder/references/container-nodes.md` Loop run 章节，明确自定义收集输出必须 `input.add`（canEdit 输入）与 `output.add`（动态输出）成对声明、key/valueType 一致。
3. **测试**：`projects/app/test/web/core/app/workflow/utils.test.ts` 新增 3 个用例（自动补齐 / 已有声明不重复 / 非 loopRun 不受影响），全部通过；`utils.test.ts` 108 例、`store2flow.version/deprecated`、`workflowCorePr2/Pr3Adapter`、`localDraft` 共 133 例无回归，`tsc --noEmit` 通过。
4. 未改动项：`NodeLoopRun` 挂载 Effect 的删除逻辑本身保持原样（用户主动删除声明仍会同步删除输出，属正常编辑行为）。
