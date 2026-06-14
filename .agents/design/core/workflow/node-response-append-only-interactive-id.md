# Workflow NodeResponse 持久化、Append-Only 与交互恢复 ID 设计

日期：2026-06-14
状态：当前权威文档

## 文档关系

本文合并并替代以下两份历史文档：

- `node-response-stream-persistence.md`：最初的流式持久化和平铺存储设计。该文档中的 `data.id` unique 索引、运行期 delete 后 create、replace/append 模式、parallel retry 删除旧 rows 等内容已经过时。
- `node-response-append-only-interactive-id.md` 旧版草案：append-only 和交互恢复 ID 的讨论稿。本文保留已确认结论，并按当前实现重新整理边界、索引和测试要求。

## 背景

workflow 运行详情通过 `chat_item_responses` 平铺保存。每条 row 的 `data` 是一个 nodeResponse：

- `data.id`：展示节点 ID。
- `data.parentId`：父展示节点 ID，用于读取时还原 `childrenResponses`。
- `chatItemDataId`：所属 AI chat item 的 `dataId`，也就是本轮响应消息 ID。

早期设计依赖 `{ appId, chatId, chatItemDataId, 'data.id' }` unique 索引，并在运行期先删除同 `data.id` 旧 row 再写新 row，或用 replace 模式清空旧详情。这个方案在大表上创建唯一索引成本高，也不符合运行期只追加的性能目标。

当前方案把 nodeResponse 表调整为 append-only：workflow 运行过程中只 `create` rows，不更新、不删除。重复展示节点通过读取时按 `(data.id, data.parentId)` fold 合并。

## 核心结论

- `chat_item_responses` 运行期只追加 rows。对话删除、应用删除、过期清理等外部清理流程可以批量删除。
- `data.id` 不再是数据库唯一键，只表示前端展示节点身份。
- 同一个 `data.id` 且 `parentId` 相同的多条 rows 表示同一个展示节点的多次增量，读取时合并成一个节点。两条 row 都没有 `parentId` 时也视为同一个 parent。
- `mergeSignId` 已废弃：不再写入、不再读取、不再兼容旧合并语义。旧数据如果依赖 `mergeSignId`，展示异常可接受，迁移或回放另行处理。
- `dispatchWorkFlow.responseChatItemId` 是必填运行参数。dispatch 不生成兜底 ID，也不查询 `MongoChatItem` 或 `MongoChatItemResponse` 判断是否重复。
- 保存对话记录的新运行必须先走 `preChatRound`，由业务入口完成最终 `chatId/responseChatItemId`、生成锁、AI dataId 冲突检查和 Human/AI placeholder 预创建。
- 普通新运行中 Human 和 AI 使用同一个 `roundDataId = responseChatItemId`。Human/AI 同 dataId 是预期行为；同一个 `obj` 下重复 dataId 才是不合法语义。本轮运行前只阻塞 AI dataId 冲突。

## 数据模型与索引

`chat_item_responses` row 核心字段：

```ts
type ChatItemResponseSchema = {
  teamId: ObjectId;
  appId: ObjectId;
  chatId: string;
  chatItemDataId: string;
  data: ChatHistoryItemResType;
  time: Date;
};
```

当前保留的 `chat_item_responses` 索引：

```ts
ChatItemResponseSchema.index({ appId: 1, chatId: 1, chatItemDataId: 1, _id: 1 });
ChatItemResponseSchema.index({ teamId: 1, time: -1 });
```

索引用途：

- `{ appId, chatId, chatItemDataId, _id }`：按 AI chat item 拉取完整 nodeResponse rows，并按 `_id: 1` 保持写入顺序。
- `{ teamId, time: -1 }`：过期或团队维度清理。

明确不再创建：

```ts
ChatItemResponseSchema.index(
  { appId: 1, chatId: 1, chatItemDataId: 1, 'data.id': 1 },
  { unique: true }
);
```

`chat_items` 当前保留普通索引：

```ts
ChatItemSchema.index({ appId: 1, chatId: 1, dataId: 1 });
ChatItemSchema.index({ appId: 1, chatId: 1, deleteTime: 1 });
ChatItemSchema.index({ appId: 1, chatId: 1, _id: -1 });
ChatItemSchema.index({ appId: 1, chatId: 1, obj: 1, _id: -1 });
```

`{ appId, chatId, dataId }` 不能改成 unique，因为普通新运行中 Human 和 AI 会共享同一个 `dataId`。如果后续 AI dataId 冲突检查需要进一步优化，可以考虑补普通索引 `{ appId, chatId, dataId, obj }`，但不加 `unique`。

## 写入路径

写入封装在 `WorkflowNodeResponseWriter`：

1. 一个 workflow 请求复用一个 writer；子 workflow、loop、parallel、toolcall 等共享该 writer。
2. `record()` 接收本次要保存的 nodeResponses，补齐 `id/parentId`、裁剪 dataset quote、计算 `childResponseCount`，转成 flat rows。
3. `recordWithParent()` 只给没有 `parentId` 的 root child 补外层 parent；已有 `parentId` 的响应保持内部层级。
4. writer 通过 promise queue 串行化并发 `record`，保证 Mongo `_id` 顺序接近运行期写入顺序。
5. 默认 `batchSize = 5`，达到阈值或 close 时 flush。
6. flush 只执行 `create(rowsWithTime, { ordered: true, session, ...writePrimary })`。
7. 普通写入失败重试 3 次；仍失败则写 slim rows；slim 仍失败时丢弃本批详情 rows 并记录日志，不阻断主 workflow。
8. `saveChat` 需要的引用、错误数和根节点积分由 writer 在运行期维护 summary；详情 rows 写库失败不影响这些摘要。

运行期明确删除的行为：

- 不按 `data.id` delete 旧 rows。
- 不做 `updateOne + upsert`。
- 不做 replace 模式。
- 不在持久化 buffer 中按 `data.id` 去重。
- 不依赖 `data.id` unique 索引。
- 不为 retry 预生成 row `_id` 做幂等；极低概率重复 create 产生的冗余 rows 由读取 fold 吸收。

`persistToDb = false` 的 writer 不写 Mongo，只保留 summary 和可选内存详情，适用于 debug、eval、临时运行等不保存历史的入口。这类入口仍必须给 dispatch 传随机 `responseChatItemId`，只是该 ID 不参与数据库查重。

## 读取与合并

读取时先按 chat item 拉 rows：

```ts
MongoChatItemResponse.find(
  { appId, chatId, chatItemDataId },
  { data: 1 }
).sort({ _id: 1 });
```

然后 `composeNodeResponseDetail()` 调用 `mergeNodeResponseDataByIdAndParent()` fold：

1. 只处理存在 `data.id` 的 rows。
2. 合并 identity 是 `(data.id, data.parentId)`；`parentId` 不存在时归一为同一个空值。
3. 同 identity 的多条 rows 合并为一个展示节点。
4. 数值字段按增量累加，包括 `runningTime`、`totalPoints`、`childResponseCount`、tokens 等。
5. `llmRequestIds` 去重合并。
6. `compressTextAgent`、`deepSearchResult` 这类结构化用量字段按现有规则累加。
7. 普通标量字段以后到的 incoming 为准。
8. `childrenResponses` 递归按同一规则合并。
9. child row 早于 parent row 到达时先作为临时 root，parent 到达后回收挂到 `childrenResponses`。

历史兼容边界：

- 新数据统一使用 `childrenResponses`。
- `pluginDetail/toolDetail/loopDetail/parallelDetail/loopRunDetail` 只作为历史 detail 字段读取和递归统计来源，不再作为新链路的通用写入结构。
- `chat_items.responseData` 已废弃。读取时如果独立表没有 rows，才回退旧内联详情，避免历史数据被空结果覆盖。
- `childTotalPoints` 不再对外保留；子节点积分展示由客户端基于 `childrenResponses` 现场计算。

## NodeResponse ID 语义

普通节点首次运行时生成随机 `data.id`。这类 ID 不需要可预测，也不需要数据库唯一约束。

交互恢复时需要复用暂停前记录的 nodeResponse ID，避免同一个展示节点在恢复后拆成两个节点：

```ts
const nodeResponseId =
  lastInteractive?.nodeResponseId && lastInteractive.entryNodeIds?.includes(node.nodeId)
    ? lastInteractive.nodeResponseId
    : getNanoid();
```

`WorkflowInteractiveResponseType` 增加通用字段：

```ts
nodeResponseId?: string;
```

该字段与 `entryNodeIds` 平级，表示触发本次暂停的当前 workflow 节点对应的 nodeResponse `data.id`。同一时间只允许一个暂停模式，因此一个字符串即可表示当前恢复入口。

嵌套交互继续沿用 `childrenResponse`：每一层 interactive 都可以携带自己的 `nodeResponseId`。例如 ToolCall 包装的子 workflow 暂停时：

```ts
{
  type: 'toolChildrenInteractive',
  entryNodeIds: ['toolCallNodeId'],
  nodeResponseId: 'tool-call-node-response-id',
  params: {
    childrenResponse: {
      type: 'userInput',
      entryNodeIds: ['formNodeId'],
      nodeResponseId: 'form-node-response-id'
    },
    toolParams: {
      toolCallId: 'call_xxx'
    }
  }
}
```

恢复时：

- ToolCall 节点复用 `toolChildrenInteractive.nodeResponseId`。
- 子 workflow 复用 `childrenResponse.nodeResponseId`。
- 新增 rows 继续写到同一条 AI chat item 的 `chatItemDataId` 下。
- 读取时父 ToolCall 和子节点都按 `(data.id, parentId)` 合并，页面只展示一个 ToolCall 节点，用量和运行时间按增量累加。

## LoopRun 恢复

LoopRun 的 iteration wrapper 是虚拟展示节点，ID 由 loopRun 父 nodeResponse ID 派生：

```ts
id = `${loopRunNodeResponseId}:iter:${iteration}`;
```

这样同一个 loop 节点在不同父作用域下运行不会因为 `node.nodeId + iteration` 冲突。交互恢复时，只要 loopRun 父节点复用 `interactive.nodeResponseId`，同一轮 iteration wrapper 也会自然复用同一个 `data.id`。

LoopRun 暂停时会写一次当前 iteration wrapper，作为暂停前 child nodeResponses 的 parent，并把 `pendingIterationSummary` 存到 interactive params。恢复后同一个 wrapper ID 再写本次 resume 的增量统计。由于读取会累加数值字段，恢复后的 wrapper 必须只写本次 resume 片段的增量值，不能写暂停前后合并后的累计值。

## 运行前 `preChatRound`

保存历史的新运行进入 workflow 前只调用 `preChatRound`。它负责：

- 解析最终 `chatId`。空 `chatId` 自动生成随机 chatId；`NO_RECORD_HISTORIES` 表示不保存历史。
- 解析最终 `responseChatItemId`。请求未传时生成随机 ID。
- 判断是否持久化 chat items 和 nodeResponse rows。
- 持久化运行占用 `MongoChat.chatGenerateStatus = generating`。
- 普通新运行检查 AI `dataId` 冲突。
- 普通新运行严格创建本轮 Human + AI placeholder。
- 交互继续复用上一条 AI 的 `dataId`，不创建新的 Human/AI placeholder。
- 失败时如果已经占用生成状态，立刻置为 `error`。

返回值：

```ts
type PreChatRoundResult = {
  chatId: string;
  responseChatItemId: string;
  shouldPersistChatRound: boolean;
  shouldFinalizePreparedRound: boolean;
};
```

持久化判断统一为：

```ts
const finalChatId = chatId === NO_RECORD_CHAT_ID ? chatId : chatId || getNanoid(24);
const shouldPersistChatRound = finalChatId !== NO_RECORD_CHAT_ID;
```

入口后续必须使用 `preparedRound.chatId` 和 `preparedRound.responseChatItemId`，不能继续使用请求里的原始值。`nodeResponseWriteConfig.persistToDb` 应等于 `preparedRound.shouldPersistChatRound`。

普通新运行顺序：

1. 解析最终 `chatId/responseChatItemId`。
2. `NO_RECORD_HISTORIES` 直接返回不持久化结果，不占用生成锁。
3. 调用 `tryStartGenerateChat` 占用生成锁；已有 generating 时抛 `ChatErrEnum.chatIsGenerating`。
4. 校验已有 AI chat item 中不存在同 `responseChatItemId`。
5. 严格 create 本轮 Human + AI placeholder，二者使用同一个 `dataId = responseChatItemId`。
6. 检查或创建失败时写生成状态 `error` 并抛错。
7. 创建成功后才进入 workflow。

AI dataId 冲突检查口径：

```ts
MongoChatItem.findOne(
  { appId, chatId, obj: ChatRoleEnum.AI, dataId: responseChatItemId },
  'dataId'
);
```

只检查 AI 的原因：

- Human/AI 同 `dataId` 是新运行的正常结构。
- 本轮 nodeResponse rows 归属于 AI `chatItemDataId`。
- Human 历史重复不影响 nodeResponse append-only 的安全性，可以离线审计，不作为运行前阻塞条件。

`preChatRound` 保持在业务入口，不下沉到 `dispatchWorkFlow`。dispatch 被 debug、skill debug、MCP、outLink、定时触发等入口复用，不应该感知 `source/sourceName/shareId/outLinkUid/userContent` 等 chat 保存字段。

## 删除与清理

运行期 writer 不删除 nodeResponse rows。

外部删除规则：

- 删除整条对话或批量日志时，可以按 `chatId` 删除 `MongoChatItemResponse`。
- 局部消息删除继续保持 `MongoChatItem` 软删除语义。
- 新数据 Human/AI 同 `dataId`，删除一轮消息时前端可以继续收集 Human 和 AI 的 dataId，但发请求前应去重。
- 删除接口支持 body `contentIds`，body 优先；body 为空时兼容 query `contentId`。OpenAPI 默认声明 body。

## 客户端约束

- 普通新运行一轮只生成一个 `roundDataId`，Human/AI 共用该值。
- 交互继续复用上一条 AI `dataId`，不是新一轮 Human/AI。
- React list key 不能只用 `dataId`，因为 Human/AI 可能相同；应包含 `obj` 或 `_id/id`。
- 前端按 `dataId` 更新 AI 记录时需要带 AI 语义，避免命中同 ID Human。
- nodeResponse SSE 合并和详情弹窗都应使用 `(id, parentId)` 合并语义，不再依赖 `mergeSignId`。

## 测试要求

`preChatRound`：

- 普通新运行成功：创建 `MongoChat`、Human、AI placeholder；Human/AI 同 `dataId = responseChatItemId`。
- 初始 `responseChatItemId` 命中已有 AI：直接抛错，不进入 workflow，不随机兜底。
- 初始 `responseChatItemId` 只命中 Human：不按重复 ID 报错。
- 生成锁冲突：抛 `ChatErrEnum.chatIsGenerating`，不创建 placeholder。
- placeholder 创建失败或重复校验失败：生成状态置为 `error`。
- 空 `chatId`：自动生成随机 chatId 并保存记录。
- `NO_RECORD_HISTORIES`：不写 chat、不写 chat item、不占用生成锁，仍返回 dispatch 可用的随机 `responseChatItemId`。
- 非 query 交互继续：复用上一条 AI `dataId`，不创建新 placeholder；找不到上一条 AI 时抛错。
- interactive query：按新一轮创建 Human/AI placeholder。
- `finalizeChatRound` 能在 Human/AI 同 dataId 时按 `obj` 更新两条记录。

nodeResponse append-only：

- writer 写入只调用 create，不执行运行期 delete/update/replace。
- buffer 中同 `data.id` 多条 rows 全部写入，不预去重。
- retry 保留 3 次普通重试和 slim fallback，不依赖预生成 `_id`。
- 读取按 `_id` 顺序 fold，同 `(data.id, parentId)` 合并为一个展示节点。
- 相同 `data.id` 但不同 `parentId` 不合并。
- `parentId` 都不存在时视为同 parent 并合并。
- 数值字段按增量累加，标量以后到为准，`llmRequestIds` 去重。
- child 先于 parent 到达时最终能挂回 parent。
- `mergeSignId` 不参与合并。

交互恢复：

- 暂停时 `interactive.nodeResponseId` 写入当前节点 `data.id`。
- 交互继续时恢复入口复用 `interactive.nodeResponseId`，页面只展示一个节点。
- ToolCall 子 workflow 暂停后继续：父 ToolCall 和子 workflow 分别复用对应层级 `nodeResponseId`。
- LoopRun 暂停后继续：父 loopRun 复用 `interactive.nodeResponseId`，iteration wrapper 使用 `${loopRunNodeResponseId}:iter:${iteration}`，恢复后只写本次片段增量，避免数值双算。

索引回归：

- `ChatItemResponseSchema` 不声明 `{ appId, chatId, chatItemDataId, 'data.id' }` unique 索引。
- 保留 `{ appId, chatId, chatItemDataId, _id }` 读取索引。
- `ChatItemSchema.index({ appId, chatId, dataId })` 保持普通索引，不改 unique。
- 如新增 `{ appId, chatId, dataId, obj }`，也只能是普通索引。

## 后续关注

- append-only 会增加 rows 数量，需要依赖对话删除、应用删除和过期清理控制表规模。
- 历史 `mergeSignId` 数据不迁移，异常展示风险已接受。
- 如果线上 AI dataId 冲突检查成为热点，再评估普通索引 `{ appId, chatId, dataId, obj }`。
- LoopRun、ToolCall 等恢复场景必须持续保证写入的是本次运行片段增量，而不是累计值。
