# 工作流全局变量与文件变量统一管理方案

## 1. 背景

工作流里的文件变量有两种天然形态：

- 运行时需要 `string[]`，也就是节点可直接消费的文件 URL。
- 存储和回显需要稳定对象，例如 `{ key, name, type }` 或 `{ url, name, type }`。

之前用 `variables + storeVariables + fileMetaMap` 三套数据一起传递，导致 child/parent、变量更新、最终保存之间需要反复同步。尤其是 file 变量从 store object 转成 runtime URL 后，再保存时反推 object，容易出现 `name/type` 丢失、preview URL 被错误落库、base64 混入数据库等问题。

最终方案是：工作流内部只保留一个全局变量管理入口，由 `packages/service/core/workflow/dispatch/context/variables.ts` 统一管理变量读取、写入、运行态转换和存储态输出。

这里的 `variables.ts` 是文件命名，不表示只处理 `userId/appId/chatId` 这类系统字段；它负责管理整个工作流的 `variables`。

## 2. 目标

1. root 构建 `WorkflowVariableState` 并注入必填的 `WorkflowContext.variableContext`；`WorkflowDispatchProps` / `RunWorkflowProps` 不再携带变量状态。
2. 变量读取统一返回 runtime value，节点仍然按现有方式消费 file URL。
3. 变量更新统一写入 store value，并同步刷新 runtime value。
4. 工作流最终返回和变量更新 SSE 都只输出 store record。
5. file/password 特殊逻辑集中在 `context/variables.ts`。
6. 前端 `FileSelector` 对外只输出可存储字段，不输出内部渲染字段。

## 3. 非目标

1. 不修改 MongoDB schema。
2. 不做历史数据迁移。
3. 不改变普通 ChatBox 消息文件的历史结构。
4. 不要求所有 workflow 节点都改成直接消费文件对象；运行时仍然消费 URL。

## 4. 核心类型

### 4.1 文件存储值

```ts
type ChatFileStoreValue =
  | {
      key: string;
      name: string;
      type: ChatFileTypeEnum;
    }
  | {
      url: string;
      name: string;
      type: ChatFileTypeEnum;
    };
```

规则：

- `key` 和 `url` 二选一。
- `key` 文件不保存 preview `url`。
- `url` 文件保存外链原始 URL。
- `name/type` 必须进入数据库。
- `id/rawFile/icon/status/process/error` 不进入数据库。
- `data:` URL 不允许落库。
- 未知外部 URL 的 `type` 推断失败时，兜底为 `ChatFileTypeEnum.file`。

### 4.2 文件运行值

```ts
type FileRuntimeValue = string[];
```

规则：

- `{ key, name, type }` 在运行前签发 preview URL。
- `{ url, name, type }` 在运行时直接使用 `url`。
- 运行时 URL 到 store file 的映射保存在 `WorkflowVariableState` 内部。

### 4.3 变量状态项

```ts
type WorkflowVariableStateItem = {
  key: string;
  config?: VariableItemType;
  storeValue: unknown;
  runtimeValue: unknown;
  runtimeOnly?: boolean;
};
```

规则：

- `storeValue` 是唯一可持久化事实源。
- `runtimeValue` 是运行缓存。
- `runtimeOnly` 变量可读取，但不会进入 `toStoreRecord()`。

## 5. variables.ts 设计

`packages/service/core/workflow/dispatch/context/variables.ts` 提供 `WorkflowVariableState`。

`WorkflowVariableState.create()` 完全取代原来的 `getWorkflowVariableState`。旧函数不再保留兼容层，运行入口创建并注入变量 Context，节点不再通过 props 传递实例，也不再返回或解构 `runtimeVariables/storeVariables/fileMetaMap`。

```ts
class WorkflowVariableState {
  static create(props: WorkflowVariableStateCreateProps): Promise<WorkflowVariableState>;

  get(key: string): unknown;
  set(key: string, value: unknown): Promise<unknown>;
  getStoreValue(key: string): unknown;
  toRuntimeRecord(): Record<string, unknown>;
  toStoreRecord(): Record<string, unknown>;
}
```

创建参数：

```ts
type WorkflowVariableStateCreateProps = {
  timezone: string;
  runningAppInfo: WorkflowDispatchProps['runningAppInfo'];
  uid: WorkflowDispatchProps['uid'];
  chatId: WorkflowDispatchProps['chatId'];
  responseChatItemId?: WorkflowDispatchProps['responseChatItemId'];
  histories?: WorkflowDispatchProps['histories'];
  variablesConfig?: VariableItemType[];
  inputVariables?: Record<string, unknown>;
  externalVariables?: Record<string, unknown>;
  runtimeOnlyVariables?: Record<string, unknown>;
  sourceVariableState?: WorkflowVariableStateLike;
};
```

职责：

- 根据变量配置读取 `inputVariables` 和默认值。
- 初始化 file/password/普通变量的 store/runtime 值。
- 根据 `timezone/runningAppInfo/uid/chatId/responseChatItemId/histories` 内部生成系统 runtime-only 变量，例如 `userId/appId/chatId/histories/cTime`。
- 注入 `externalVariables`，作为 runtime-only 变量。
- 注入额外 `runtimeOnlyVariables`，用于少量调用点补充特殊运行时变量。
- 维护 runtime URL 到 `ChatFileStoreValue` 的内部映射。
- 提供 child app 从 parent runtime URL 恢复 store file 的能力。

优先级：

```ts
变量配置默认值 < inputVariables < externalVariables < runtimeOnlyVariables
```

`externalVariables` 和 `runtimeOnlyVariables` 不进入 `toStoreRecord()`。

## 6. 转换规则

### 6.1 file

初始化或更新 store object：

```ts
ChatFileStoreValue[] -> normalize -> storeValue -> sign/return url -> runtimeValue
```

更新 runtime URL：

```ts
string[] -> current metadata -> source metadata -> infer external url -> storeValue
```

规则：

- 优先从当前 state 的 metadata 恢复 `{ key, name, type }`。
- 当前 state 没有时，从 `sourceVariableState` 恢复。
- 都没有时，按未知外链保存 `{ url, name, type }`。
- `data:` URL 过滤。
- 非数组 file 更新值直接抛错。

### 6.2 password

初始化：

```ts
storeValue: { value: '', secret } -> runtimeValue: plain string
```

更新：

```ts
plain string -> storeValue: { value: '', secret } + runtimeValue: plain string
```

### 6.3 普通变量

普通变量按 `valueType` 格式化：

```ts
storeValue === runtimeValue
```

## 7. 工作流链路

### 7.1 root workflow

`dispatchWorkFlow` 创建 root `WorkflowVariableState`：

```ts
const variableState = await WorkflowVariableState.create({
  timezone,
  runningAppInfo,
  uid: data.uid,
  chatId,
  responseChatItemId: data.responseChatItemId,
  histories,
  variablesConfig: data.chatConfig?.variables,
  inputVariables: data.variables,
  externalVariables: externalProvider.externalWorkflowVariables
});
```

创建完成后与文件、停止检查等依赖一起注入 `WorkflowContext`：

```ts
runWithContext({ ...context, variableContext: variableState }, () => runWorkflow(props));
```

节点通过 `getWorkflowContext().variableContext` 读取变量，`runWorkflow` / `WorkflowDispatchProps` 不再接收 `variableState`。Child App 构建独立实例，Loop/Parallel 通过 `WorkflowRunStateSnapshot` 创建变量副本后，通过 `workflowContext.getChildContext({ variableContext })` 构建分支 Context，再用 `runWithContext` 激活；返回或抛错后自动恢复父作用域。变量合并仍遵循原有成功/交互检查点规则。纯参数解析和快照实例保留显式变量依赖，不依赖 ALS。

`dispatch/utils/containerRunState.ts` 统一导出 `WorkflowRunStateSnapshot`，不再导出散装的快照创建和同步函数。实例构造时接收父 `variableContext`，内部完成 clone、基线保存和提交目标绑定；通过 `snapshot.variableContext` 注入运行副本，调用 `commit()` 立即提交差量，或 `discard()` 丢弃。每个实例只能结算一次，包括提交失败后也不能重试旧快照；不保证多字段原子性，也不回滚已经发生的响应、用量或部分变量写入。

节点 output 可通过可选的 `nodeOutputs: { sourceNodes, targetNodes, childrenNodeIdList }` 一并跟踪；图的克隆、入口注入和交互恢复仍由执行器负责，快照仅同步 output 差量。Loop/Parallel 按各自成功或 checkpoint 规则提交；Workflow Tool runner 只跟踪 output，并保留在 finally 中提交已完成输出的规则。ToolCall provider 只跟踪变量，不再为变量提交传空节点数组。

ToolCall 每次工具子运行使用独立变量副本；正常完成且未暂停、未停止时立即提交相对起点快照的变量差量，不按调用顺序排队等待。同名变量按实际写回顺序覆盖，无关变量不会被旧快照覆盖；异常或提交失败不阻塞其他调用，变量提交不保证多字段原子性。

统一派生接口 `getChildContext(overrides)` 可同时覆盖变量、文件、资源和响应等 Context 字段；未覆盖字段共享父级引用，可选字段显式 `undefined` 表示清空。派生只创建新对象，不激活 ALS，不修改父 Context，不自动深拷贝能力实例，也不负责结果回写。多级派生基于当前子 Context，文件准入仍先通过 `fileContext.derive()` 完成，不能用普通 Context 浅拷贝代替鉴权。

#### 7.1.1 响应 Context 与执行初始化

`WorkflowContext.nodeResponseSink` 是必填的完整 `WorkflowNodeResponseContext`：持有本次执行的 `workflowRuntimeSummary`、`publish()`、`hasOutput` 和 `getChildContext()`。没有 writer/SSE 时仍构建 summary-only Scope，不用 undefined 表示整个响应能力缺失。

- `createWorkflowEntryNodeResponseSink` 是唯一响应入口工厂，位于 `dispatch/context/nodeResponse.ts`。入口负责 writer 的构建、关闭和 flat rows 读取；底层 output 隐藏在实现内，派生 Scope 不提供关闭方法。
- 响应 `getChildContext(overrides)` 统一取代 Scope、输出策略和 activity 的外部包装函数。普通视图继承当前 summary；新 workflow 显式传入新 summary。`record/emit` 按父策略 AND 收紧，子流程不能重新开启父层已隐藏的详情。
- 所有执行边界在调用 `runWorkflow` 前准备变量和独立响应 Scope，再通过 `runWithContext` 激活一次完整执行 Context。Root、Child、Plugin、Agent 子应用、Loop 每轮、Parallel 每次尝试、ToolCall 每次调用均遵守这一约定；弃用 Loop 只隔离响应统计，保留共享变量兼容行为。
- `runWorkflow` 只消费已经准备的 Context，不再创建 summary/Scope 或额外派生 `executionContext`。深度超限和异常恢复仍使用本次执行的独立 summary。
- 共享 output 不经过父 Scope 转发，避免重复统计；变量差量回写、文件派生与鉴权规则不变。普通 Context 字段覆盖不自动重置 summary。

#### 7.1.2 运行控制 Context

`WorkflowContext.runtimeControl` 必填，包含 `mode`、`maxRunTimes`、`workflowDispatchDeep`、`isToolCall`。这四个字段不再属于 `WorkflowDispatchProps`、`ModuleDispatchProps` 或 `RunWorkflowProps`。

- `dispatchWorkFlow` 只接收入口运行模式；根预算统一取 `WORKFLOW_MAX_RUN_TIMES`，深度从 0 开始，工具标记固定为 false，不再由入口调用方传入预算或工具标记。
- 队列持有本流程的控制状态并统一扣减预算；节点 callback 在独立 Context 中执行，保留原来节点 props 展开时捕获的控制快照。Debug 节点快照模式转换为 test，因此其子流程不会意外进入逐步调试。
- `workflowContext.getChildContext({ runtimeControl: overrides })` 复制当前控制状态并合并局部覆盖，未覆盖时也不共享可变对象。子流程仍继承节点开始执行时的预算，不改为全局共享额度；Agent/ToolCall 工具运行仅覆盖 `isToolCall: true`。
- `runWorkflow` 从 Context 读取控制状态，进入时递增深度，完成、失败或深度超限时恢复。普通 Context 派生不自动递增深度，不重置预算，也不克隆变量或重置响应 summary。

### 7.2 变量读取

全局变量读取统一走：

```ts
variableState.get(key)
```

需要改造的读取入口：

- `getReferenceVariableValue`：只接收 runtime variables record，不直接依赖完整 `WorkflowVariableState`
- `replaceEditorVariable`：只接收 runtime variables record，不直接依赖完整 `WorkflowVariableState`
- `WorkflowQueue` 节点参数解析
- `runIfElse`
- `http468`
- `loopRun/service.ts`
- 其他所有工作流运行路径上的 `variables[key]`

### 7.3 变量更新

全局变量更新统一走：

```ts
await variableState.set(varKey, value)
```

`runUpdateVar` 不再手动维护：

```ts
variables[varKey] = value;
storeVariables[varKey] = value;
fileMetaMap.set(url, file);
```

非全局变量更新仍然写对应 node output。

### 7.4 child / plugin / agent 子应用

child workflow 创建自己的 `WorkflowVariableState`：

```ts
const childVariableState = await WorkflowVariableState.create({
  timezone: props.timezone,
  runningAppInfo: childRunningAppInfo,
  uid: props.uid,
  chatId: props.chatId,
  responseChatItemId: props.responseChatItemId,
  histories: childHistories,
  variablesConfig: childChatConfig.variables,
  inputVariables: childInputVariables,
  externalVariables,
  sourceVariableState: parentVariableState
});
```

如果 parent 传给 child 的 file 输入是 runtime URL，child 通过 `sourceVariableState` 恢复原始 store file。

### 7.5 工作流返回

工作流返回统一使用：

```ts
newVariables: variableState.toStoreRecord()
```

变量更新 SSE 也使用：

```ts
variableState.toStoreRecord()
```

节点内部 `DispatchNodeResultType` 不再透传 `newVariables`，避免 `nodeResponse` 或子运行结果里携带一份过期变量快照。变量更新后的事实源始终是同一个 `variableState`。

## 8. 前端与回显

`FileSelector` 内部可以保留渲染字段：

```ts
id
rawFile
icon
status
process
error
url // key 文件的临时 preview url
```

但 `onChange` 对外只输出：

```ts
{ key, name, type }
```

或：

```ts
{ url, name, type }
```

DB 读取返回前端时：

- `{ key, name, type }` 响应阶段补 preview `url`。
- `{ url, name, type }` 原样返回。
- 补出来的 preview `url` 只用于前端预览，不回写数据库。

## 9. 需要修改的文件

| 文件 | 修改点 |
|---|---|
| `packages/service/core/workflow/dispatch/context/variables.ts` | 新增 `WorkflowVariableState`，统一管理工作流全局变量，并内聚 file normalize、store/runtime 转换、URL 推断工具 |
| `packages/service/core/workflow/dispatch/utils/index.ts` | 删除 `getWorkflowVariableState` 和旧变量转换逻辑，保留无关通用工具 |
| `packages/service/core/workflow/dispatch/context/variables.ts`、`packages/service/core/workflow/types/runtime.ts` | 变量能力类型归属 Context 模块，移除 dispatch props 中的旧变量字段 |
| `packages/global/core/workflow/runtime/utils.ts` | `getReferenceVariableValue`、`replaceEditorVariable` 改成通过 runtime variables record 读取全局变量 |
| `packages/service/core/workflow/dispatch/index.ts` | root 初始化 `WorkflowVariableState`，`runWorkflow` 入参和返回改造 |
| `packages/service/core/workflow/dispatch/context/index.ts` | 必填 `variableContext`，提供变量分支作用域；`WorkflowDispatchProps` / `RunWorkflowProps` 移除变量注入 |
| `packages/service/core/workflow/dispatch/tools/runUpdateVar.ts` | 全局变量更新改成 `variableState.get/set` |
| `packages/service/core/workflow/dispatch/tools/runIfElse.ts` | 条件变量读取改成使用 `variableState.toRuntimeRecord()` |
| `packages/service/core/workflow/dispatch/tools/http468.ts` | HTTP 变量替换改成使用 runtime variables record |
| `packages/service/core/workflow/dispatch/loopRun/service.ts` | 循环变量引用改成使用 `variableState.toRuntimeRecord()` |
| `packages/service/core/workflow/dispatch/child/runApp.ts` | child workflow 创建自己的 `WorkflowVariableState` |
| `packages/service/core/workflow/dispatch/abandoned/runApp.ts` | 废弃 runApp 节点仍需创建独立 child `WorkflowVariableState`，不能复用 parent state |
| `packages/service/core/workflow/dispatch/plugin/run.ts` | 工具工作流创建自己的 `WorkflowVariableState` |
| `packages/service/core/workflow/dispatch/ai/agent/sub/app/index.ts` | agent 子应用创建自己的 `WorkflowVariableState` |
| `projects/app/src/components/core/app/FileSelector/*` | 对外值只输出 store value，内部渲染字段不外泄 |
| `packages/service/core/chat/utils.ts` | 返回前端时给 `{ key }` 文件补 preview `url` |
| `packages/service/core/chat/fileStoreValue.ts` | 统一文件存储值清洗，复用到工作流变量和交互表单保存 |
| `packages/service/core/chat/saveChat.ts` | TTL 续期从 store file object 提取 key；交互表单 `fileSelect` 保存前清洗为 store value |

## 10. TODO

### 10.1 基础实现

- [x] 实现 `WorkflowVariableStateLike` 类型。
- [x] 实现 `WorkflowVariableStateItem`、`WorkflowVariableStateCreateProps`，入参覆盖 `getWorkflowVariableState` 原本需要的 `timezone/runningAppInfo/uid/chatId/responseChatItemId/histories`。
- [x] 在 `context/variables.ts` 实现 `WorkflowVariableState.create()`。
- [x] 用 `WorkflowVariableState.create()` 完全替换 `getWorkflowVariableState`。
- [x] 实现 `get()`、`set()`、`getStoreValue()`、`toRuntimeRecord()`、`toStoreRecord()`。
- [x] 在 `WorkflowVariableState` 内部维护 runtime URL metadata。
- [x] 支持从 `sourceVariableState` 恢复 parent file metadata。

### 10.2 file/password 处理

- [x] 整理 file store value normalize 逻辑。
- [x] 整理 file store value 到 runtime URL 的转换逻辑。
- [x] 整理 runtime URL 到 store value 的转换逻辑。
- [x] file 更新非数组时抛错。
- [x] `data:` URL 不落库。
- [x] 未知外链 URL 推断 `name/type`。
- [x] password 初始化解密、更新加密。

### 10.3 工作流主链路

- [x] 从 `WorkflowDispatchProps` / `RunWorkflowProps` 移除 `variables`。
- [x] 从 `WorkflowDispatchProps` / `RunWorkflowProps` 移除 `storeVariables`。
- [x] 从 `WorkflowDispatchProps` / `RunWorkflowProps` 移除 `fileMetaMap`。
- [x] root 构建变量 Context；节点和子运行不再通过 props 传入变量状态。
- [x] root `dispatchWorkFlow` 创建 root `WorkflowVariableState`。
- [x] 上层准备完整变量/响应 Context，`runWorkflow` 不再补初始化或嵌套激活执行 Context。
- [x] `child/runApp.ts`、`ai/agent/sub/app/index.ts` 等旧 `getWorkflowVariableState` 调用点全部迁移为 `WorkflowVariableState.create()`。
- [x] `runWorkflow` 所有返回分支使用 `variableState.toStoreRecord()`。
- [x] `updateVariables` SSE 使用 `variableState.toStoreRecord()`。
- [x] 移除内部节点结果里的 `newVariables`，仅保留 `runWorkflow` 最终对外返回。

### 10.4 变量读取改造

- [x] 改造 `getReferenceVariableValue`。
- [x] 改造 `replaceEditorVariable`。
- [x] 改造 `WorkflowQueue` 节点参数解析。
- [x] 改造 `runIfElse`。
- [x] 改造 `http468`。
- [x] 改造 `loopRun/service.ts`。
- [x] 全仓搜索并清理工作流运行路径上的旧 `variables` 读取。

### 10.5 变量更新改造

- [x] `runUpdateVar` 旧值读取改成 `variableState.get(varKey)`。
- [x] `runUpdateVar` 全局变量写入改成 `await variableState.set(varKey, value)`。
- [x] 删除 `updateFileVariableValue`。
- [x] 删除或收敛 `getStoreVariableValue`。
- [x] 确认 array append/clear、number operator、boolean mode 行为不变。

### 10.6 子工作流

- [x] `child/runApp.ts` 创建 child `WorkflowVariableState`。
- [x] `abandoned/runApp.ts` 创建 child `WorkflowVariableState`，避免复用 parent state。
- [x] `plugin/run.ts` 创建子工作流 `WorkflowVariableState`。
- [x] `ai/agent/sub/app/index.ts` 创建 child `WorkflowVariableState`。
- [x] child 创建时传入 `sourceVariableState`。
- [x] 确认 child 返回值不混入 parent runtime record。

### 10.7 前端和回显

- [x] `FileSelector` 对外值移除 `id/rawFile/icon/status/process/error`。
- [x] 全局变量、PluginRunBox、工具输入 `fileSelect` 使用同一套输出协议。
- [x] DB file `{ key }` 返回前端时补 preview `url`。
- [x] 刷新历史对话后图片 icon 能正常渲染。
- [x] 交互表单 `fileSelect` 回填历史前再次清洗，避免 base64、preview url、UI 状态字段落库。

### 10.8 清理

- [x] 移除 `runtimeSystemVar2StoreType`。
- [x] 移除 `formatStoreVariables`。
- [x] 移除 `getWorkflowVariableState`。
- [x] 移除 `storeVariables`、`fileMetaMap` 在 dispatch props 中的所有传递。
- [x] 清理临时 `console.log`。
- [x] 清理迁移产生的无意义 `any`。
- [x] 合并重复函数到 `context/variables.ts`。

## 11. 测试计划

### 11.1 单元测试

| 测试文件 | 用例 |
|---|---|
| `packages/service/test/core/workflow/dispatch/variables.test.ts` | 初始化普通变量、password、file、runtime-only、external runtime-only |
| `packages/service/test/core/workflow/dispatch/variables.test.ts` | file `key -> runtime URL`、runtime URL 还原 key、未知外链推断、base64 过滤、非数组更新抛错 |
| `packages/service/test/core/workflow/dispatch/variables.test.ts` | 通过 `sourceVariableState` 恢复 parent file |
| `packages/global/test/core/workflow/runtime/utils.test.ts` | `getReferenceVariableValue`、`replaceEditorVariable` 通过 runtime variables record 获取全局变量 |
| `packages/service/test/core/workflow/dispatch/tools/runUpdateVar.test.ts` | 变量更新节点只写 `variableState.set()`，file/password/数组操作结果正确 |
| `projects/app/test/components/core/app/FileSelector/utils.test.ts` | FileSelector 清洗输出不含内部渲染字段 |
| `packages/service/test/core/chat/utils.test.ts` | DB file `{ key }` 返回前端时补 preview url |
| `packages/service/test/core/chat/saveChat.test.ts` | TTL 从 store file object 提取 key；交互表单 `fileSelect` 保存前过滤多余字段和 `data:` URL |

### 11.2 回归命令

```bash
cd packages/service && pnpm test test/core/workflow/dispatch/variables.test.ts
cd packages/service && pnpm test test/core/workflow/dispatch/tools/runUpdateVar.test.ts
cd packages/service && pnpm test test/core/workflow/dispatch/loopRun/runLoopRun.test.ts
cd projects/app && pnpm test test/components/core/app/FileSelector/utils.test.ts
```

最终合并前按实际改动范围补跑 workflow dispatch 相关测试。

### 11.3 本轮验证记录

已通过：

```bash
cd packages/global && pnpm test test/core/workflow/runtime/utils.test.ts
cd packages/service && pnpm test test/core/workflow/dispatch/variables.test.ts
cd packages/service && pnpm test test/core/workflow/dispatch/utils.test.ts
cd packages/service && pnpm test test/core/workflow/dispatch/tools/runUpdateVar.test.ts
cd packages/service && pnpm test test/core/workflow/dispatch/loopRun/runLoopRun.test.ts
cd projects/app && pnpm test test/components/core/app/FileSelector/utils.test.ts
```

补充检查：

- `packages/service` 的 `tsc --noEmit -p tsconfig.json` 已清掉本次工作流变量改造相关类型错误；该命令仍会命中仓库既有测试路径 alias 解析问题，例如 `@fastgpt/service/...` 测试导入无法解析。
- 已搜索确认 `runtimeSystemVar2StoreType`、`formatStoreVariables`、`getWorkflowVariableState`、`getStoreVariableValue`、`updateFileVariableValue` 不再存在。
