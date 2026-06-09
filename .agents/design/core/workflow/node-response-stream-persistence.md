# Workflow NodeResponse 流式持久化与平铺存储

日期：2026-05-30
基线：`/Volumes/code/FastGPT-worktrees/upstream-main`

## 最终摘要

本轮工作将 workflow 运行期的 `nodeResponses/responseData` 从“内存累计，结束后一次保存”调整为“节点完成后通过请求级 writer 分批写入数据库”。workflow 子流程、loop、parallel、toolcall 等大子树默认在 `chat_item_responses` 中平铺保存，通过 `data.id/data.parentId` 还原父子关系；少数可控、小规模且语义上绑定当前节点的 child 详情允许继续内联保留。

客户端详情结构保持稳定：接口返回和流式展示仍是嵌套结构，正式 child 字段继续使用既有 `childrenResponses`；旧 detail 字段 `pluginDetail/toolDetail/loopDetail/loopRunDetail/parallelDetail` 仅作为历史读取来源，不再作为新链路的通用写入结构。

## 已确认设计

- 复用 `chat_item_responses` 表，不新增版本字段。
- 每条 row 的 `data` 就是完整的当前节点 `nodeResponse` 数据；父子识别只使用 `data.id`、`data.parentId`。
- 不新增 `sequence/depth/rootResponseId/runId/childRuntime`；展示顺序依赖同一个 writer 串行写入后的数据库插入顺序。
- 父节点记录 `childTotalPoints` 和 `childResponseCount`，统计完整 child 树；节点自身只保留当前节点运行时间。
- SSE `flowNodeResponse` 透出 `id/parentId`，客户端可在流式过程中合并父子节点。
- 新数据不再写入 `chat_items.responseData`；`saveChat` 只保存 AI 消息主体，引用、错误数和积分日志来自 writer 的 `nodeResponseSummary`。
- 旧数据兼容保留：如果 `chat_items.responseData` 已存在，说明该条 AI 消息仍是历史内联详情，读取时优先使用它，不用 `chat_item_responses` 覆盖。

## 数据结构

row 核心字段：

```ts
type ChatItemResponseSchema = {
  teamId: ObjectId;
  appId: ObjectId;
  chatId: string;
  chatItemDataId: string;

  // 完整的当前节点 nodeResponse 数据。
  // data.id 是节点响应实例 ID；data.parentId 指向父节点 data.id。
  // data.nodeId/moduleType/childTotalPoints/childResponseCount 都只保存在 data 内。
  // 大子流程通过 parentId 平铺落库，读取时再拼回 childrenResponses。
  // 少数可控、小规模的节点内联 child 可保留在 data 内。
  data: ChatHistoryItemResType;
  time: Date;
};
```

新增索引：

- `{ appId, chatId, chatItemDataId, _id }`，用于详情读取并按写入顺序排序
- `{ appId, chatId, chatItemDataId, data.id }`，unique
- `{ teamId, time: -1 }`

## 写入流程

实现位置：

- [nodeResponseStorage.ts](/Volumes/code/FastGPT-worktrees/upstream-main/packages/service/core/chat/nodeResponseStorage.ts)
- [dispatch/index.ts](/Volumes/code/FastGPT-worktrees/upstream-main/packages/service/core/workflow/dispatch/index.ts)

关键行为：

1. root chat v2 workflow 创建一个 `WorkflowNodeResponseWriter`，子 workflow、loop、parallel、plugin、runApp、toolcall 复用同一个 writer。
2. 节点执行前生成节点响应实例 ID 并写入 `data.id`；子 workflow 的 `nodeResponseParentId` 指向父节点或虚拟 wrapper 的 `data.id`，落库和 SSE 时表现为 `parentId`。
3. 节点完成后调用 `record()` 写入轻量化后的 rows；大子流程 child 通过独立 row 平铺保存，父节点只保留统计信息。
4. 模块返回的内部 `nodeResponses` 如果没有显式 `parentId`，会默认挂到当前节点响应下；父节点缺少 child 统计时按这些 child 自动补 `childTotalPoints/childResponseCount`。
5. writer 默认 `batchSize = 5`，buffer 满或 root close 时 flush。这里按 row 计数，大子流程会展开成多条 row；可控小 child 可能作为当前节点的内联详情随同一 row 写入。
6. flush 使用同一 Mongo transaction，先删除本批同 `data.id` 旧 row，再一次性 `create(rows[])`；`create` 设置 `ordered: true`，同一 flush 内全部成功或全部回滚。写入前不再用 `JSON.stringify` 预估体积，BSON 大小和不可序列化字段统一交给 Mongo 写入校验。
7. 普通写入失败重试 3 次；仍失败则将 rows 瘦身为节点名、类型、头像、运行时间、消耗统计、父子统计等关键字段后再写 1 次。
8. 瘦身写仍失败时丢弃本批 rows，记录日志并继续 workflow；失败 rows 不回退到内存，也不交给 `saveChat` 兜底。
9. 详情 rows 被丢弃时，writer 已累计的 summary 仍保留，`saveChat` 仍可保存引用、错误数和积分日志。
10. `record()` 返回规范化后的响应。大子流程 child 已经通过独立 row 交给 writer，调用链可释放原始完整 `nodeResponse`；可控小 child 仍可作为当前节点内联详情保留。
11. parallel retry 通过 `deleteResponses()` 清理失败 attempt 及其 descendants。
12. 新回合使用 replace；interactive resume 使用 append。replace 的旧详情删除延迟到第一次 flush transaction 中执行，避免新写失败先清空旧详情。

## 读取规则

实现位置：

- [controller.ts](/Volumes/code/FastGPT-worktrees/upstream-main/packages/service/core/chat/controller.ts)
- [getResData.ts](/Volumes/code/FastGPT-worktrees/upstream-main/projects/app/src/pages/api/core/chat/record/getResData.ts)
- [utils.ts](/Volumes/code/FastGPT-worktrees/upstream-main/packages/global/core/chat/utils.ts)

读取规则：

- 对旧 AI 消息，如果 `chat_items.responseData` 已存在，直接返回内联详情，避免被独立表空结果覆盖。
- 对新 AI 消息，`chat_items.responseData` 不存在，详情接口和 chat history 从 `chat_item_responses` 读取 node response rows。
- rows 按 `_id: 1` 读取，通过 `data.parentId` 拼回 `childrenResponses`。
- child row 早于 parent row 写入也能还原。
- ResponseTags、WholeResponseModal、SSE resume 都递归读取 `childrenResponses`，同时读取旧 detail 字段。

## 已完成改动

- 新增 `nodeResponseStorage.ts`，封装 flat row 生成、详情拼接、writer、summary、失败降级与 retry 清理。
- `MongoChatItemResponse` schema 收敛为所有节点详情都在 `data` 内，唯一性由同一 chat item 下的 `data.id` 保证。
- workflow dispatch 接入请求级 writer，root runtime 不再累计完整 `nodeResponses`。
- loop/parallel/runApp/plugin/toolcall/agent 子流程复用 writer，并补齐父节点 child 统计。
- 修正子流程返回语义：持久化和 SSE 使用完整轻量响应，workflow 队列内部避免同一节点同时从 `responseData/nodeResponses` 重复进入 `flowResponses`。
- `saveChat` 改为只使用 `nodeResponseSummary`，并显式丢弃误传的内联 `responseData`。
- `pushChatLog` 只从持久化 rows 读取详情计算 `responseTime`。
- `MongoChatItem` 的 deprecated `responseData` schema path 改为 `default: undefined`，避免新 chat item 自动带空数组。
- 前端流式合并支持 child 先到、parent 后到、重复 `id` 更新，以及详情弹窗递归展示。

## 验证覆盖

重点覆盖：

- rows 写入、child stats、受控 child/detail 字段保留、quote q/a 裁剪。
- 详情读取、旧 `responseData` 字段存在时优先保留、child 先到、append 合并。
- writer 串行顺序、批量 ordered create、session 复用、重复 `data.id` 覆盖、3 次重试、瘦身写入、最终失败丢弃。
- 写入失败丢弃 rows 后 summary 仍保留，`saveChat` 不依赖失败 rows。
- root workflow writer close、loop/parallel/toolcall 子响应写入、parallel retry 清理。
- 真实 `runWorkflow` 集成测试覆盖 loop 子 workflow 平铺落库、模块内部 child 自动挂当前节点、中途 batch flush 后的 `childrenResponses` 拼接、SSE `id/parentId`。
- 前端 SSE parent/child 合并、child 先到、重复更新、ResponseTags/WholeResponseModal 递归读取。

最近验证命令：

- `pnpm --filter @fastgpt/service test test/core/chat/nodeResponseStorage.test.ts test/core/workflow/dispatch/loopRun/runLoopRun.test.ts`：2 个文件、39 个测试通过。
- `pnpm --filter @fastgpt/service test test/core/chat/controller.test.ts`：1 个文件、56 个测试通过。
- `pnpm --filter @fastgpt/app test test/api/core/chat/record/getResData.test.ts`：1 个文件、4 个测试通过。
- `pnpm --filter @fastgpt/app test test/components/core/chat/ChatContainer/ChatBox/resume.test.ts test/components/core/chat/ChatContainer/ChatBox/utils.test.ts test/global/core/chat/utils.test.ts`：3 个文件、36 个测试通过。
- `pnpm --filter @fastgpt/global test test/core/chat/chatUtils.test.ts`：1 个文件、53 个测试通过。
- `pnpm --filter @fastgpt/service test`：170 个文件通过、2 个文件跳过；2554 个测试通过、29 个跳过。
- `pnpm --filter @fastgpt/global test`：72 个文件、1626 个测试通过。
- `pnpm --filter @fastgpt/app test`：103 个文件、796 个测试通过。
- `pnpm --filter @fastgpt/app run typecheck`：通过。
- `pnpm exec eslint <changed ts/tsx files>`：通过。
- `git diff --check`

## 生产检查结论

- 当前实现已满足本轮确认的核心约束：单 writer 保序、大子流程平铺落库、允许部分可控节点保留小规模内联 child、按批次批量写入、失败重试与瘦身降级、失败后释放详情 rows、`saveChat` 仅依赖 summary、新数据不再落 `chat_items.responseData`、接口和前端继续返回 `childrenResponses` 嵌套结构。
- 仍建议上线后对真实大工作流采集 heap/rss、Mongo 写入耗时、接口耗时和 fallback 日志数量，用于确认生产数据分布下的默认 `batchSize` 是否需要调优。
