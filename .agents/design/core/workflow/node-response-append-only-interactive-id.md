# Workflow NodeResponse Append-Only 与交互恢复 ID 方案

日期：2026-06-14

## 背景

`chat_item_responses` 用于平铺保存 workflow 节点运行详情。当前实现通过 `data.id` 表示 nodeResponse 实例 ID，通过 `data.parentId` 还原父子关系，并额外使用 `mergeSignId` 将多轮交互 append 产生的多个展示节点合并成一个。

现有方案存在两个主要问题：

- 需要在大表上创建 `{ appId, chatId, chatItemDataId, 'data.id' }` unique 索引，历史数据量较大时构建成本高，且重复脏数据会导致建索引失败。
- writer 在运行期会先删同 `data.id` 旧 row 再写新 row，或在 replace 模式下清空旧详情；这和“运行明细表只追加”的目标不一致。

本方案将 `chat_item_responses` 调整为运行期 append-only：运行过程中只插入 rows，不更新、不删除；只有删除对话、删除应用或过期清理时才批量删除。

## 目标

- 运行期写入只追加，避免 `deleteMany + create` 或 `updateOne + upsert`。
- 去掉 `data.id` unique 索引，降低大表索引构建和写入维护成本。
- 去掉 writer 的 replace/append 模式分支，普通新运行进入前保证 AI 消息 `chatItemDataId` 不重复。
- `dispatchWorkFlow` 不再生成 `responseChatItemId`，也不查询 `chatItemDataId` 是否重复；`responseChatItemId` 改为必填运行参数。
- `mergeSignId` 标记为废弃，不再写入、不再读取。展示合并统一使用 `data.id + parentId`。
- 删除原有 `mergeChatResponseData` 函数，避免继续保留两套合并语义。
- 交互恢复时复用暂停前的 nodeResponse `data.id`，并保持相同 `parentId`，让同一个展示节点在读取时自然合并。
- 保持 `data.parentId` 作为树结构归属字段，继续支持 child rows 平铺落库。

## 非目标

- 不兼容旧 `mergeSignId` 合并语义，不为旧 `mergeSignId` 保留读取兼容分支。
- 不引入 `runId`。前提是普通重新生成一定使用新的 AI 消息 `chatItemDataId`。
- 不把所有 `data.id` 改成确定性路径 ID。默认仍使用随机 ID，只在交互恢复时复用暂停前记录的 ID。

## 核心设计

### 1. `data.id` 的新语义

`data.id` 是 nodeResponse 展示节点 ID。

- 普通首次执行时由调度器生成随机 ID。
- 如果本次执行是交互恢复，并且当前恢复入口对应的 interactive 中记录了 `nodeResponseId`，则复用该 ID。
- 读取时同一个 `data.id` 且 `parentId` 相同的多条 rows 会合并为一个展示节点。`parentId` 都不存在时也视为相同。

`data.id` 不再承担数据库唯一约束。append-only 模式下，同一个 `data.id + parentId` 可以有多条 row，表示同一个展示节点在不同运行片段中的增量详情。

### 2. interactive 增加通用字段

在 `WorkflowInteractiveResponseType` 的基础字段上增加：

```ts
nodeResponseId?: string;
```

该字段与 `entryNodeIds` 平级，语义是：

> 触发本次暂停的当前 workflow 节点对应的 nodeResponse `data.id`。

因为当前同一时间只会有一个暂停模式，所以一个字符串即可表达当前恢复入口的展示节点 ID。

嵌套交互继续沿用现有 `childrenResponse` 结构：每一层 interactive 都可以有自己的 `nodeResponseId`。例如 ToolCall 包装的子 workflow 交互：

```ts
{
  type: 'toolChildrenInteractive',
  entryNodeIds: ['toolCallNodeId'],
  nodeResponseId: 'tool-call-parent-response-id',
  params: {
    childrenResponse: {
      type: 'userInput',
      entryNodeIds: ['formNodeId'],
      nodeResponseId: 'form-node-response-id',
      ...
    },
    toolParams: {
      toolCallId: 'call_xxx',
      ...
    }
  }
}
```

### 3. 调度器生成 nodeResponse ID

节点执行开始时生成当前节点 nodeResponse ID。规则：

```ts
const nodeResponseId =
  dispatchData.lastInteractive?.nodeResponseId && dispatchData.lastInteractive.entryNodeIds?.includes(node.nodeId)
    ? dispatchData.lastInteractive.nodeResponseId
    : getNanoid();
```

注意点：

- `lastInteractive` 仍然只传给当前恢复入口节点。
- 非恢复路径永远生成新的随机 ID。
- 恢复路径复用 interactive 中记录的 `nodeResponseId`，并沿用相同父级关系，确保同一个展示节点多次 append 后按 `(data.id, parentId)` 合并。

当前调度器已经在执行节点时统一生成 `nodeResponseId` 并赋给 `data.id`，因此普通节点不需要单独处理。

### 4. 暂停时写回 `interactive.nodeResponseId`

当节点返回 `[DispatchNodeResponseKeyEnum.interactive]` 时，调度器构造最终 `interactiveResult`，同时写入当前节点的 `nodeResponseId`：

```ts
const interactiveResult: WorkflowInteractiveResponseType = {
  ...interactiveResponse,
  entryNodeIds,
  nodeResponseId,
  memoryEdges,
  nodeOutputs,
  skipNodeQueue,
  usageId
};
```

嵌套 interactive 不需要额外 map。子 workflow 触发的 `childrenResponse` 已经由对应层级的 dispatch 生成并持久化，里面也会带自己的 `nodeResponseId`。

### 5. ToolCall 交互恢复

ToolCall 第一次运行时：

- 父 ToolCall 节点生成随机 `data.id`。
- 子工具 workflow 如果触发交互，ToolCall 返回 `toolChildrenInteractive`。
- 调度器将父 ToolCall 的 `data.id` 写入 `toolChildrenInteractive.nodeResponseId`。
- 子 workflow 的 interactive 写入 `params.childrenResponse.nodeResponseId`。

第二次继续时：

- ToolCall 节点是恢复入口，调度器复用 `toolChildrenInteractive.nodeResponseId`。
- ToolCall 父 nodeResponse 仍写入同一个 `data.id`。
- 子 workflow 使用 `childrenResponse` 继续运行，并复用对应层级的 `nodeResponseId`。
- 读取时 ToolCall 父节点按同一个 `data.id` 合并，页面只展示一个 ToolCall 节点，积分、运行时间和 child 统计按增量累加。

这替代了当前 `mergeSignId: nodeId` 的展示合并职责。新实现中 `mergeSignId` 应作为废弃字段移除，ToolCall 不再写该字段。

### 6. LoopRun 交互恢复

LoopRun iteration wrapper 统一基于 loopRun 父 nodeResponse ID 派生：

```ts
id = `${loopRunNodeResponseId}:iter:${iteration}`;
```

不再使用旧的 `${node.nodeId}_iter_${iteration}`。这样同一个 loop 节点在不同父作用域下运行时不会因为 `node.nodeId + iteration` 冲突；交互恢复时只要 loopRun 父节点复用 `interactive.nodeResponseId`，同一轮 iteration wrapper 也会自然复用同一个 `data.id`。

LoopRun 暂停时：

- loopRun 父节点记录自己的 `interactive.nodeResponseId`。
- 当前 iteration wrapper 使用 `${loopRunNodeResponseId}:iter:${iteration}` 作为 `data.id`，继续作为 child parent。

LoopRun 恢复后：

- loopRun 父节点复用 `interactive.nodeResponseId`。
- 当前 iteration wrapper 根据复用后的 loopRun 父节点 ID 计算，因此复用同一个 wrapper id。
- 恢复后新增 child 继续挂到同一个 iteration wrapper 下。
- 读取时同 `data.id` 的 loopRun 父节点和 iteration wrapper 都会合并。

需要特别注意：重复写入同一个 `data.id` 的 row 应表达本次运行片段的增量值。若某些字段写入的是累计值，读取合并时再累加会双算。

## 写入方案

writer 永远 append-only：

```ts
await model.create(rowsWithTime, {
  ordered: true,
  session,
  ...writePrimary
});
```

删除以下运行期写入行为：

- `deleteExistingRows`
- `deleteRowsById`
- `replaceBeforeFirstFlush`
- `mode: 'replace' | 'append'`
- `{ appId, chatId, chatItemDataId, 'data.id' }` unique 约束依赖

写入失败后的 retry、slim fallback、summary 保留策略继续沿用。区别是 retry 不再包含运行期删除旧 row，也不为每条 row 预生成 `_id` 做幂等；极低概率的 commit 结果不确定导致重复 `create` 可以接受为冗余写入。

持久化路径不再按 `data.id` 去重。buffer 中同 `data.id` 的多条 rows 都必须原样 append，读取时再按 `(data.id, parentId)` fold。

## 运行前 `preChatRound` 与 dispatch 契约

因为 replace 模式被移除，保存对话记录的新运行必须先确定可用的 AI 消息 `dataId`，并在进入 workflow 前创建本轮 `chat_items`。不能只做 `exists` 检查后稍后再创建，否则并发请求可能同时通过检查并写入同一个 `responseChatItemId`。

业务入口运行前只调用一个方法：

```ts
const preparedRound = await preChatRound({
  appId,
  chatId,
  teamId,
  tmbId,
  source,
  sourceName,
  shareId,
  outLinkUid,
  userContent,
  responseChatItemId,
  interactive
});
```

`preChatRound` 取代入口层分散调用的 `resolveResponseChatItemId`、`validateChatRoundDataIds`、`tryStartGenerateChat`、`prepareChatRound` 和 generating 状态更新。业务入口不再单独做这些运行前检查和预创建。

建议返回：

```ts
type PreChatRoundResult = {
  chatId: string;
  responseChatItemId: string;
  shouldPersistChatRound: boolean;
  shouldFinalizePreparedRound: boolean;
};
```

- `chatId`：本轮最终使用的 chatId。请求为空时由 `preChatRound` 自动生成随机 chatId；请求为 `NO_RECORD_HISTORIES` 时保持该哨兵值。
- `responseChatItemId`：进入 workflow 的最终 AI 消息 `dataId`。
- `shouldPersistChatRound`：是否保存 chat items 和 nodeResponse rows。
- `shouldFinalizePreparedRound`：本次是否已预创建 Human/AI placeholder；运行后据此选择 finalize 路径。

`preChatRound` 保持在业务入口调用，不下沉到 `dispatchWorkFlow`。原因是它需要 `source/sourceName/shareId/outLinkUid/userContent` 等业务入口上下文，而 `dispatchWorkFlow` 会被 debug、skill debug、MCP、outLink、定时触发等入口复用。把 `preChatRound` 放入 dispatch 会迫使 workflow engine 感知过多 chat 保存字段，也容易在交互恢复时重复预创建记录。

### 持久化判断

保存 `chat_items` 和写入 `chat_item_responses` 使用同一个判断：

```ts
const finalChatId = chatId === 'NO_RECORD_HISTORIES' ? chatId : chatId || getNanoid(24);
const shouldPersistChatRound = finalChatId !== 'NO_RECORD_HISTORIES';
```

空 `chatId` 不再表示不保存记录，而是自动生成新的随机 chatId。只有 `NO_RECORD_HISTORIES` 表示本轮不保存对话记录。入口层后续必须使用 `preparedRound.chatId`，不能继续使用请求里的原始 `chatId`。

入口层根据 `preChatRound` 返回值设置：

```ts
nodeResponseWriteConfig.persistToDb = preparedRound.shouldPersistChatRound;
```

因此：

- 有效 `chatId`：保存 Human/AI chat item，也保存 nodeResponse rows。
- 空 `chatId`：由 `preChatRound` 自动生成随机 chatId，并保存 Human/AI chat item 和 nodeResponse rows。
- `NO_RECORD_HISTORIES`：不保存 chat item，也不保存 nodeResponse rows，不占用生成锁。
- `dispatchWorkFlow` 不自己推断是否保存，只消费入口层传入的 `nodeResponseWriteConfig`。

### 普通新运行

普通新运行进入 workflow 前的顺序固定在 `preChatRound` 内部：

1. 解析本轮最终 `chatId` 和 `responseChatItemId`；空 `chatId` 自动生成随机 chatId。
2. 计算 `shouldPersistChatRound`。
3. 如果 `shouldPersistChatRound = true`，调用 `tryStartGenerateChat` 获取生成锁；已有 generating 时直接抛 `ChatErrEnum.chatIsGenerating`。
4. 如果 `shouldPersistChatRound = true`，检查初始 `responseChatItemId` 是否已被已有 AI 消息使用；重复则直接报错，不做随机 ID 兜底。
5. 如果 `shouldPersistChatRound = true`，严格创建本轮 Human + AI placeholder。
6. 如果检查或创建失败，立即将 MongoChat 生成状态置为 `error` 以释放生成锁，然后直接报错。
7. 创建成功后才允许进入 workflow。

这样可以避免未拿到生成锁时提前写入 chat items，也能保证进入 workflow 后 `chatItemDataId` 已经有效。

生成锁复用 `MongoChat.chatGenerateStatus` 实现，不新增 Redis 或单独 lock collection。入口通过 `tryStartGenerateChat` 对 `{ appId, chatId }` 执行 `findOneAndUpdate + upsert`，原子写入 `generating` 并读取旧状态；如果旧状态已经是 `generating`，本轮直接返回 false 并由入口抛 `ChatErrEnum.chatIsGenerating`。`MongoChat` 已有 `{ appId, chatId }` 唯一索引，保证并发创建同一 chat 时不会产生两条锁记录。正常完成写 `done`，失败或预创建异常写 `error`，定时 stale-generating 修复只作为进程崩溃后的兜底纠偏。

`preChatRound` 创建本轮记录时使用统一的 `roundDataId`：

```ts
const roundDataId = responseChatItemId;

MongoChatItem.create([
  { obj: ChatRoleEnum.Human, dataId: roundDataId, ... },
  { obj: ChatRoleEnum.AI, dataId: roundDataId, value: [], ... }
]);
```

处理规则：

- `dataId` 表示一轮对话消息。普通新运行中 Human 和 AI 使用同一个 `roundDataId = responseChatItemId`。
- 运行前重复检查只检查 AI 消息：`{ appId, chatId, obj: ChatRoleEnum.AI, dataId: responseChatItemId }`。Human 消息同 `dataId` 不作为阻塞条件，因为同一轮 Human/AI 预期共享 `roundDataId`。
- 逻辑唯一性口径仍是同一个 `obj` 下不应出现重复 `dataId`，但本轮 workflow 安全性只依赖 AI `dataId` 唯一。Human 历史重复可以通过离线审计处理，不作为普通运行前置错误。
- 不区分 `responseChatItemId` 来源。服务端生成或客户端传入的初始 ID 重复时，都直接报错。
- 创建失败后按异常结束本轮生成。调用方不能继续拿失败的 `responseChatItemId` 进入 workflow。
- 不额外查询 `MongoChatItemResponse`。没有 interactive 的新运行只要 `chat_items` 里该 AI 消息 `(obj, dataId)` 是新的，就间接认为 `chat_item_responses` 中不存在对应 `chatItemDataId`。

这会替换现有 `chatTest`、`v2/chat/completions`、`v1/chat/completions` 入口中的“先 `validateChatRoundDataIds` 查询，再 `tryStartGenerateChat`，再 `prepareChatRound` upsert”的分离流程：

- 保留请求内部重复校验时必须带 `obj` 语义。同一请求里 Human `dataId` 和 AI `responseChatItemId` 相同是允许且推荐的；运行前真正阻塞 workflow 的外部重复检查只查 AI。
- 移除普通新运行进入 workflow 前对 `MongoChatItem` 的单独 exists 查询，不再用这个查询作为新旧判断依据。
- 将预创建逻辑调整为严格 create：创建本轮 Human + AI placeholder。AI `responseChatItemId` 已存在时直接抛错。
- 不能继续使用当前 `updateOne + upsert + $setOnInsert` 的幂等语义，否则重复 `responseChatItemId` 会被静默复用，违背 append-only 前置约束。
- v1、v2、chatTest、MCP、定时触发等所有会保存对话记录的新运行都应该走同一套 `preChatRound` 逻辑。只有不保存对话记录的 debug、临时运行可以跳过预创建，但仍必须给 `dispatchWorkFlow` 传入随机 `responseChatItemId`。

### 交互继续

交互继续不是新一轮对话，不创建新的 Human/AI placeholder。`preChatRound` 应复用上一条待继续 AI 消息的 `dataId` 作为 `responseChatItemId`：

```ts
if (lastInteractive && interactiveStatus !== 'query') {
  responseChatItemId = previousAiItem.dataId;
}
```

如果找不到上一条待继续 AI chat item，直接抛错，不生成新的 `responseChatItemId` 兜底。否则会把恢复运行写到新消息上，破坏交互恢复语义。

交互继续仍需要占用生成锁，避免同一个 chat 同时继续运行。它只追加新的 nodeResponse rows。新的 rows 通过 `chatItemDataId = responseChatItemId` 归到同一条 AI 消息下，并通过 `interactive.nodeResponseId` 与 `data.parentId` 合并回旧展示树。

### 交互 query

`interactiveStatus === 'query'` 表示用户在交互中发起了一条新的 query，本质上是新一轮对话：

- 使用新的 `responseChatItemId`。
- 调用 `preChatRound` 预创建新的 Human + AI placeholder。
- 后续保存应走 prepared round 的 finalize 逻辑，而不是再次直接 `pushChatRecords` 插入一轮新记录。

### `dispatchWorkFlow` 入参约束

`dispatchWorkFlow` 的 `responseChatItemId` 从可选改为必填：

```ts
type DispatchWorkFlowProps = Omit<
  ChatDispatchProps,
  | 'checkIsStopping'
  | 'workflowDispatchDeep'
  | 'timezone'
  | 'externalProvider'
  | 'variableState'
> & {
  responseChatItemId: string;
  variables: Record<string, any>;
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: RuntimeEdgeItemType[];
  req?: IncomingMessage;
  defaultSkipNodeQueue?: WorkflowDebugResponse['skipNodeQueue'];
  nodeResponseWriteConfig: WorkflowNodeResponseWriteConfig;
};
```

不需要在运行开头增加额外 runtime guard；必填契约由 TypeScript 类型和业务入口调用保证。需要同步删除以下兜底逻辑：

```ts
const responseChatItemId = data.responseChatItemId || getNanoid(24);
data.responseChatItemId ||= getNanoid(24);
```

`dispatchWorkFlow` 不查询 `MongoChatItem` 或 `MongoChatItemResponse` 判断 `chatItemDataId` 是否重复。重复 ID 的处理边界只在业务入口的 `preChatRound`。所有调用方都必须传入 `responseChatItemId`：

- 保存对话记录的新运行：使用 `preChatRound` 成功后的最终 ID。
- 交互继续：使用待继续的上一条 AI 消息 `dataId`。
- 不保存对话记录的 debug、临时运行：调用方生成随机 ID，仅供 workflow 变量、SSE、nodeResponse 内存结果关联使用，不做数据库查重。

## 客户端 dataId 生成

客户端普通新运行也同步改为一轮只生成一个 `roundDataId`：

```ts
const roundDataId = resolveInteractiveResponseChatItemId({
  histories,
  interactive,
  interactiveVal,
  responseChatItemId: getNanoid(24)
});

const currentHumanChat = {
  id: roundDataId,
  dataId: roundDataId,
  obj: ChatRoleEnum.Human,
  ...
};

const currentAiChat = {
  id: roundDataId,
  dataId: roundDataId,
  obj: ChatRoleEnum.AI,
  ...
};
```

处理规则：

- 普通新运行：Human 和 AI 都使用同一个 `roundDataId`，请求里的 `responseChatItemId` 也使用该值。
- 交互继续：继续沿用 `resolveInteractiveResponseChatItemId`，非 query 交互仍复用上一条 AI 的 `dataId`，不新建一轮 Human/AI。
- 调试运行、插件运行等客户端临时记录也应顺手改为同一个 `roundDataId`，避免 UI 与服务端语义不一致。
- React list key 不能只依赖 `dataId`，因为同一轮 Human/AI 会相同；需要使用 `obj + dataId` 或 `_id/id + obj` 作为 key。

## 删除影响

删除整条对话不受 Human/AI 共用 `dataId` 影响：

- 单条历史删除 `/core/chat/history/delHistory` 按 `chatId` 软删 `MongoChat`。
- 批量日志删除 `/core/chat/history/batchDelete` 按 `chatId` 删除 `MongoChatItem` 和 `MongoChatItemResponse`。

局部消息删除需要调整：

- 前端仍保留把 Human 和 AI 的 `dataId` 都传给删除链路的行为，兼容旧数据中 Human/AI 使用不同 `dataId` 的记录。
- 新数据中 Human/AI 的 `dataId` 相同，前端应在发起请求前对 `dataId` 去重，并用一次请求提交 `contentIds`，避免同一轮消息触发两次删除请求。
- 当前 `/core/chat/record/delete` 只接收单个 `contentId`，且 `MongoChatItem.updateOne({ appId, chatId, dataId: contentId })` 只会软删一条。新方案下需要改为支持 `contentIds` 数组，并批量处理 `{ appId, chatId, dataId: { $in: contentIds } }`。
- 局部消息删除继续保持软删除语义，Mongo 操作使用 `updateMany(..., { $set: { deleteTime } })`，不使用 `deleteMany`。
- 为兼容旧客户端，接口可以继续接受单个 `contentId`，内部统一转成 `contentIds`。
- DELETE 接口默认从 body 读取 `contentIds`，OpenAPI 文档按 body 参数更新；为兼容旧调用，如果 body 为空，再兼容读取 query。
- 不建议在局部删除接口强制要求 `obj`，因为删除一轮消息时本来就需要同时删除 Human/AI；旧数据通过两个不同 `dataId` 覆盖，新数据通过一个相同 `dataId` 覆盖。

## 读取合并方案

读取仍按插入顺序：

```ts
MongoChatItemResponse.find({ appId, chatId, chatItemDataId }, { data: 1 })
  .sort({ _id: 1 })
```

然后按 `_id` 顺序 fold rows：

1. 取 `row.data.id` 和 `row.data.parentId` 作为合并 key。`parentId` 不存在时统一归一化为同一个空值。
2. 如果该 `(id, parentId)` 第一次出现，加入结果。
3. 如果该 `(id, parentId)` 已存在，将 incoming 合并到 existing：
   - 数值字段累加：`runningTime`、`totalPoints`、`childResponseCount`、`tokens`、`inputTokens`、`outputTokens`、`toolCallInputTokens`、`toolCallOutputTokens`、`embeddingTokens`、`reRankInputTokens`、`extensionTokens`。
   - `llmRequestIds` 去重合并。
   - `childrenResponses` 递归按 `(data.id, data.parentId)` 合并。
   - 普通标量字段以后到的 incoming 为准。
4. 最后再按 `parentId` 组装树。

读取合并不再读取 `mergeSignId`，也不调用旧的 `mergeChatResponseData`。新的合并逻辑应以 `composeNodeResponseDetail` 内部的 `(data.id, data.parentId)` fold 为唯一入口。

## 索引调整

删除 unique 索引定义：

```ts
ChatItemResponseSchema.index(
  {
    appId: 1,
    chatId: 1,
    chatItemDataId: 1,
    'data.id': 1
  },
  {
    unique: true
  }
);
```

保留读取索引：

```ts
ChatItemResponseSchema.index({ appId: 1, chatId: 1, chatItemDataId: 1, _id: 1 });
```

保留清理索引：

```ts
ChatItemResponseSchema.index({ teamId: 1, time: -1 });
```

如后续需要按 `data.id` 做离线排查，可考虑添加非 unique 的后台索引，但运行路径不依赖它。

`chat_items` 侧本轮暂不创建唯一索引。唯一性由 `preChatRound` 的 AI 重复检查和生成锁保证，不依赖数据库 unique constraint。

现有 `ChatItemSchema.index({ appId: 1, chatId: 1, dataId: 1 })` 继续保留为普通查询索引，不能改成 unique，因为普通新运行中 Human 和 AI 预期共享同一个 `dataId`。

本轮运行前检查只需要确认 AI `dataId` 没有重复，查询条件为：

```ts
MongoChatItem.findOne(
  { appId, chatId, obj: ChatRoleEnum.AI, dataId: responseChatItemId },
  'dataId'
);
```

该查询可以利用现有 `{ appId, chatId, dataId }` 索引先定位同一轮 `dataId`，再过滤 `obj`；也可以利用 `{ appId, chatId, obj, _id }` 先过滤 AI 后扫描。考虑到一次对话内同 `dataId` 通常只有 Human/AI 两条，现有 `{ appId, chatId, dataId }` 对该检查已经足够。

如果后续希望优化带 `obj` 的定位查询，可以补充普通复合索引：

```ts
ChatItemSchema.index(
  { appId: 1, chatId: 1, dataId: 1, obj: 1 }
);
```

该索引不加 `unique`。它只用于查询加速，不表达数据库唯一约束；否则会把历史数据清理、导入/回放路径和 Human/System 同角色重复问题一起绑定到本轮需求里。

## 数据一致性约束

- 普通新运行的 Human 和 AI 使用同一个 `roundDataId`，默认等于 `responseChatItemId`。
- 普通新运行最终进入 workflow 的 AI 消息 `dataId` 不能复用已有 AI 消息；初始 `responseChatItemId` 如重复，由 `preChatRound` 直接报错。
- 同一个 `obj` 下不应出现重复 `dataId`；不同 `obj` 可以共享同一个 `dataId`。运行前重复检查只以 AI 消息为阻塞条件。
- 交互继续允许复用上一条 AI 消息 `chatItemDataId`。
- 同一个展示节点的多次 append 必须复用同一个 `data.id` 和相同的 `parentId`。两条 row 的 `parentId` 都不存在时也视为相同。
- 同一个 `(data.id, parentId)` 的多条 row 必须表达每次运行片段的增量值，不能写累计值；读取合并会累加数值字段。
- `parentId` 必须指向目标展示节点的 `data.id`。
- `mergeSignId` 已废弃，不能再依赖它修正展示合并。

## 已确认决策

- 局部消息删除继续软删除，不改成物理删除。
- `chat_items` 本轮不创建 unique 索引；如需优化查询，可以补普通索引 `{ appId, chatId, dataId, obj }`，但不加 `unique`。
- 业务入口运行前只调用 `preChatRound`，不再分别调用生成锁检查、dataId exists 校验和 chat item 预创建。
- 空 `chatId` 由 `preChatRound` 自动生成随机 chatId 并保存记录；`NO_RECORD_HISTORIES` 才表示不保存记录，也不占用生成锁。
- 普通新运行先拿生成锁，再创建本轮 Human + AI placeholder；初始 `responseChatItemId` 重复或 placeholder 创建失败时，生成状态置为 `error` 并直接报错。
- `preChatRound` 保持在业务入口调用，不下沉到 `dispatchWorkFlow`。
- `dispatchWorkFlow` 的 `responseChatItemId` 改为必填；dispatch 内部不再生成随机 ID，也不再查询 `chatItemDataId` 是否重复。
- 保存对话记录和写入 `chat_item_responses` 使用同一个持久化判断；不保存历史的运行不写 chat items，也不写 nodeResponse rows。
- 旧 `mergeSignId` 数据不迁移，展示有异常可接受。
- 重复 `(data.id, parentId)` 的 nodeResponse row 必须是每次运行片段的增量值。
- writer 持久化 buffer 不按 `data.id` 去重；同 id 多 rows 全部 append，读取时 fold。
- writer 保留普通重试和 slim fallback，不预生成 row `_id`；重复创建冗余可接受。
- `/core/chat/record/delete` 继续兼容 DELETE，但默认使用 body；body 为空时再兼容 query。OpenAPI 文档要改成 body 入参。

## 风险与关注点

- 历史旧数据如果仍依赖 `mergeSignId`，本方案不做兼容、不迁移，展示可能变化；该风险已接受。
- LoopRun wrapper 当前部分字段可能是累计值，需要逐项确认是否会在读取合并时双算。
- ToolCall 交互恢复时，父 ToolCall nodeResponse 需要复用 `toolChildrenInteractive.nodeResponseId`，否则页面会出现两个 ToolCall 展示节点。
- 嵌套交互必须确保每层 `childrenResponse` 都携带对应层级的 `nodeResponseId`。
- append-only 会增加表数据量，且允许极低概率重复创建冗余 rows，需要依赖读取 fold、对话删除、应用删除和过期清理控制影响。

## 本轮测试需求

### 需求 1：运行前 `preChatRound`

服务层单测：

- `preChatRound` 普通新运行成功：创建 `MongoChat`、Human chat item、AI placeholder；Human/AI 使用同一个 `roundDataId = responseChatItemId`；返回最终 `chatId`、`shouldPersistChatRound = true`、`shouldFinalizePreparedRound = true`。
- `preChatRound` 初始 `responseChatItemId` 与已有 AI `dataId` 冲突：直接抛错，不进入 workflow，不生成新随机 ID。
- `preChatRound` 初始 `responseChatItemId` 与已有 AI `dataId` 冲突或 placeholder 创建失败：已占用的生成状态置为 `error`。
- `preChatRound` 初始 `responseChatItemId` 只与已有 Human `dataId` 相同、没有已有 AI 同 ID 时：不按重复 ID 报错。
- `preChatRound` 生成锁冲突：抛 `ChatErrEnum.chatIsGenerating`，不创建 Human/AI placeholder。
- `preChatRound` 非 query 交互继续：复用上一条 AI `dataId`，不创建新的 Human/AI placeholder，返回 `shouldFinalizePreparedRound = false`。
- `preChatRound` 非 query 交互继续找不到上一条 AI chat item：直接抛错，不生成新的 `responseChatItemId` 兜底。
- `preChatRound` interactive query：按新一轮处理，创建新的 Human/AI placeholder，返回 `shouldFinalizePreparedRound = true`。
- `preChatRound` 空 `chatId`：自动生成随机 chatId，创建 `MongoChat` 和 Human/AI placeholder，返回 `shouldPersistChatRound = true`。
- `preChatRound` `NO_RECORD_HISTORIES`：不写 `MongoChat`、不写 `MongoChatItem`、不占用生成锁，返回 `shouldPersistChatRound = false`，但仍返回可供 dispatch 使用的 `responseChatItemId`。
- `finalizeChatRound` 在 Human/AI 同 `dataId` 时能按不同 `obj` 更新两条记录，不误判为重复。
- `updateInteractiveChat` 的 interactive query 分支不会在已预创建后再次插入同一轮记录。
- `failChatRound` 使用最终 `responseChatItemId` 给对应 AI placeholder 写入错误信息。

入口集成测试：

- `v2/chat/completions` 普通新运行：入口只调用 `preChatRound`，dispatch 使用其返回的 `responseChatItemId`。
- `v1/chat/completions` 普通新运行：行为同 v2。
- `chatTest` 普通新运行：行为同 v2。
- interactive continue：入口跳过新一轮 placeholder，nodeResponse 写到上一条 AI `dataId`。
- interactive query：入口创建新一轮 placeholder，最终保存走 finalize 路径。
- 不保存历史的 debug/临时运行：`nodeResponseWriteConfig.persistToDb = false`，dispatch 仍有必填 `responseChatItemId`。

客户端测试：

- 普通新运行乐观记录只生成一个 `roundDataId`，Human/AI 共用。
- 交互继续复用上一条 AI `dataId`。
- 聊天列表渲染 key 不只依赖 `dataId`，Human/AI 同 ID 时没有 React key 冲突。
- 前端按 `dataId` 更新 responseData、反馈、播放状态等 AI 记录时，不会命中同 ID 的 Human 记录。
- 删除一轮消息时收集 Human/AI `dataId`，去重后一次提交 `contentIds`。

删除接口测试：

- `/core/chat/record/delete` 使用 DELETE body `contentIds` 时软删所有匹配 `dataId` 的 chat items。
- body 为空时兼容 query `contentId`。
- 新数据 Human/AI 同 `dataId` 时，一次请求能软删两条不同 `obj` 的 chat items。
- 旧数据 Human/AI 不同 `dataId` 时，`contentIds` 数组能同时软删两条记录。

### 需求 2：nodeResponse append-only

服务层单测：

- `WorkflowNodeResponseWriter` 写入时不执行运行期 delete/replace/update，只 append rows。
- `WorkflowNodeResponseWriter` buffer 中同 `data.id` 的多条 rows 不会在持久化前被去重，全部写入 MongoDB。
- `WorkflowNodeResponseWriter` 保留普通重试和 slim fallback；重试不预生成 `_id`，允许极低概率重复创建冗余 rows。
- 读取合并按 `_id` 顺序 fold，同 `(data.id, parentId)` 多 rows 合并成一个展示节点；`parentId` 都不存在时视为相同。
- 数值字段按增量累加，`llmRequestIds` 去重，普通标量以后到值为准。
- `mergeSignId` 不再参与读取合并；旧 `mergeSignId` 数据不会触发兼容分支。
- `dispatchWorkFlow` 的 `responseChatItemId` 在类型上必填，各入口调用 dispatch 前都已显式传入。

交互恢复测试：

- 普通暂停时 `interactive.nodeResponseId` 写入当前节点 `data.id`。
- 非 query 交互继续时恢复入口复用 `interactive.nodeResponseId`，最终展示只有一个节点。
- ToolCall 子 workflow 暂停后继续：父 ToolCall 复用同一 `data.id`，积分和运行时间按增量合并。
- 嵌套 interactive 的 `childrenResponse.nodeResponseId` 能向外透传并在恢复时复用。
- LoopRun 暂停后继续：父 loopRun 节点复用 `interactive.nodeResponseId`，iteration wrapper 使用 `${loopRunNodeResponseId}:iter:${iteration}` 并正确合并。
- LoopRun wrapper 写入值必须是本片段增量，测试覆盖避免累计值重复累加。

索引与迁移测试：

- `ChatItemResponseSchema` 不再声明 `{ appId, chatId, chatItemDataId, 'data.id' }` unique 索引。
- 保留 `{ appId, chatId, chatItemDataId, _id }` 读取索引。
- 本轮不新增 `chat_items` 唯一索引；如有索引审计脚本，应只输出报告，不自动建索引。
- 如后续需要优化查询，可以新增普通复合索引 `{ appId, chatId, dataId, obj }`，但不加 `unique`。

建议测试命令：

```bash
pnpm test packages/service/test/core/chat/saveChat.test.ts
pnpm test packages/service/test/core/chat/dataIdValidation.test.ts
pnpm test packages/service/test/core/workflow/dispatch/index.persistence.test.ts
pnpm test packages/service/test/core/workflow/dispatch/ai/toolcall/index.test.ts
```

如果实现涉及前端 hooks 或组件，应补充对应 project/app 测试；最后合并前再运行全量测试。

## TODO

### 需求 1：运行前 `preChatRound`

- [x] 新增或重命名运行前入口方法 `preChatRound`，内部统一处理 `resolveResponseChatItemId`、生成锁、重复 ID 检查、预创建 chat/chatItem 和生成状态更新。
- [x] 普通新运行入口改为只调用 `preChatRound`；Human/AI 统一使用 `roundDataId = responseChatItemId`；初始 ID 重复时直接报错。
- [x] `preChatRound` 对非 query 交互继续复用上一条 AI `dataId`，不预创建 Human/AI placeholder，但仍占用生成锁。
- [x] `preChatRound` 对 `interactiveStatus === 'query'` 按新一轮处理，预创建新的 Human/AI placeholder。
- [x] `preChatRound` 返回最终 `chatId`、`responseChatItemId`、`shouldPersistChatRound`、`shouldFinalizePreparedRound`，业务入口后续 dispatch/finalize/fail 全部使用返回值。
- [x] `preChatRound` 对空 `chatId` 自动生成随机 chatId 并保存记录；对 `NO_RECORD_HISTORIES` 不保存记录、不占用生成锁。
- [x] 业务入口删除分散调用：不再单独调用 `validateChatRoundDataIds`、`tryStartGenerateChat`、`prepareChatRound`。
- [x] 将 `dispatchWorkFlow` 的 `responseChatItemId` 改为必填，并删除内部 `getNanoid` 兜底生成逻辑。
- [x] 删除 `dispatchWorkFlow` 内对 `chatItemDataId` 重复的数据库校验；重复 ID 只由业务入口的 `preChatRound` 处理。
- [x] 统一入口层持久化判断：`nodeResponseWriteConfig.persistToDb = preChatRound.shouldPersistChatRound`。
- [x] 审计 `chat_items` 历史 AI 消息是否存在重复 `dataId`；本轮暂不创建唯一索引，后续如需优化查询可新增普通索引 `{ appId, chatId, dataId, obj }`。
- [x] 调整 `ensurePreparedHumanDataId`、`getPreparedRoundDataIds` 和 `validateChatRoundDataIds`，移除 human/AI `dataId` 必须不同的逻辑。
- [x] 调整 `finalizeChatRound`、`updateInteractiveChat` 的 `interactiveStatus === 'query'` 保存路径，避免预创建后再次 `pushChatRecords` 插入同一轮记录。
- [x] 调整客户端普通新运行、chatTest、插件运行的临时记录生成逻辑，一轮只生成一个 `roundDataId`，Human/AI 共用该值。
- [x] 检查聊天列表渲染 key，不能只依赖 `dataId`，需要包含 `obj` 或 `_id/id`，避免 Human/AI 同 `dataId` 后 React key 冲突。
- [x] 检查前端按 `dataId` 更新 AI 记录的逻辑，必要时增加 `obj === AI` 条件，避免 Human/AI 同 ID 后命中错误记录。
- [x] 调整 `/core/chat/record/delete` 支持 body `contentIds` 数组，body 优先、query 兼容；保留单个 `contentId` 兼容旧客户端；软删除语义使用 `updateMany`。
- [x] 保留前端删除一轮消息时同时收集 Human 和 AI dataId 的行为；发起请求前去重并一次提交，旧数据仍能删除两条不同 ID，新数据不会重复请求同一个 ID。
- [x] 更新 `/core/chat/record/delete` OpenAPI 文档，默认声明 DELETE body 入参。
- [x] 增加单元测试：普通新运行初始 `responseChatItemId` 重复时直接报错，并且 workflow 不会启动。
- [x] 增加单元测试：普通新运行初始 `responseChatItemId` 重复或 placeholder 创建失败时，已占用生成状态会置为 `error`。
- [x] 增加单元测试：空 `chatId` 会自动生成随机 chatId 并保存记录；`NO_RECORD_HISTORIES` 不保存记录也不占用生成锁。
- [x] 增加单元测试：普通新运行只命中已有 Human 同 `dataId`、未命中 AI 同 `dataId` 时，不触发重复 ID 错误。
- [x] 增加单元测试：Human/AI 使用同一个 `roundDataId` 时 finalize 能正确更新两条不同 `obj` 记录。
- [x] 增加单元测试：非 query 交互继续复用上一条 AI `dataId` 且不预创建新 chatItem；找不到上一条 AI 时直接抛错。
- [x] 增加单元测试：interactive query 走新一轮预创建，并最终 finalize 到预创建记录。

### 需求 2：nodeResponse append-only

- [x] 在 `WorkflowInteractiveResponseTypeSchema` 中增加 `nodeResponseId?: string`。
- [x] 调整调度器 nodeResponse ID 生成逻辑：恢复入口优先复用 `lastInteractive.nodeResponseId`。
- [x] 构造 `interactiveResult` 时写入当前节点 `nodeResponseId`。
- [x] 确认嵌套 interactive 的 `childrenResponse.nodeResponseId` 在子 workflow 暂停时已正确生成并向外透传。
- [x] 移除 `mergeSignId` 写入逻辑，ToolCall、LoopRun、ParallelRun 等节点不再设置 `mergeSignId`。
- [x] 删除 `mergeChatResponseData` 函数，并迁移所有调用点到新的 `(data.id, parentId)` fold 合并函数。
- [x] 将 `WorkflowNodeResponseWriter` 改为永久 append-only，删除 replace/delete-by-id 运行期逻辑。
- [x] 移除 writer 持久化 buffer 的同 `data.id` 去重逻辑，同 id 多 rows 全部 append。
- [x] 保留 writer 普通重试和 slim fallback，不预生成 row `_id` 做幂等。
- [x] 删除 `data.id` unique 索引定义，保留 `{ appId, chatId, chatItemDataId, _id }` 读取索引。
- [x] 重写 `composeNodeResponseDetail`：按 `_id` 顺序 fold，同 `(data.id, parentId)` 合并增量后再按 `parentId` 组树。
- [x] 检查 LoopRun wrapper 字段是否为增量值，避免读取合并时重复累加。
- [x] 增加单元测试：ToolCall 交互暂停后继续时父节点复用同一 `data.id` 并合并积分。
- [x] 增加单元测试：LoopRun 同一 iteration 暂停后继续时 wrapper 和 children 正确合并。
- [x] 增加回归测试：append-only 多 rows 同 `(data.id, parentId)` 时读取结果只有一个展示节点；相同 `data.id` 但不同 `parentId` 不应被合并。
