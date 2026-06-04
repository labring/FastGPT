# Chat dataId 前置去重校验设计

## 背景

流恢复依赖 `appId + chatId + obj + dataId` 定位和合并对话记录。历史上入口没有统一校验 `dataId` 唯一性，调用方如果重复传入 `dataId`，可能导致对话项、响应项或恢复合并时定位错误。

本 PR 目标是在工作流执行前发现重复 `dataId`，直接抛业务错误，避免脏数据继续进入工作流和持久化链路。

## 约束

本 PR 不采用 human 和 AI 共用同一个 `dataId` 的方案。

当前选择是保持 human/AI 各自拥有独立 `dataId`，但要求同一 `appId + chatId` 下新一轮要写入的 `dataId` 不与请求内或库内已有记录重复。

## 问题分析

1. v1、v2、chatTest 三个入口都可以创建新一轮对话，但此前没有统一的 dataId 前置校验。
2. 如果用户请求里 `userContent.dataId` 和 `responseChatItemId` 相同，会在同一轮内产生重复。
3. 如果用户传入的 `dataId` 已存在于当前会话历史中，会导致后续查找、恢复、合并逻辑产生歧义。
4. 校验必须发生在工作流执行前，否则即使后续发现重复，也可能已经触发模型调用或工作流副作用。

## 最终方案

### 1. 抽象统一校验模块

新增 `packages/service/core/chat/dataIdValidation.ts`，提供：

- `assertNoDuplicateChatDataIdsInRequest`
- `assertNoExistingChatDataIds`
- `validateChatRoundDataIds`

统一错误信息为 `Chat dataId already exists: {dataId}`，并通过 `UserError` 抛出业务错误。

### 2. 校验请求内重复

每一轮新写入的 dataId 集合包括：

- `userContent.dataId`
- `responseChatItemId`

先过滤空值，再检查集合内是否重复。重复时直接抛错，不进入数据库查询和工作流执行。

### 3. 校验库内重复

对有效 dataId 查询 `MongoChatItem`：

- `appId`
- `chatId`
- `dataId: { $in: validDataIds }`

只要命中已有记录，就抛业务错误。

### 4. 三个入口在工作流前调用

接入点：

- `/api/v1/chat/completions`
- `/api/v2/chat/completions`
- `/api/core/chat/chatTest`

校验发生在 `saveChatId`、`responseChatItemId` 已确定之后，且早于 workflow dispatch。

## 涉及文件

- `packages/service/core/chat/dataIdValidation.ts`
  - 新增 dataId 校验工具。
- `projects/app/src/pages/api/v1/chat/completions.ts`
  - 在 v1 对话入口工作流执行前校验当前轮 dataId。
- `projects/app/src/pages/api/v2/chat/completions.ts`
  - 在 v2 对话入口工作流执行前校验当前轮 dataId。
- `projects/app/src/pages/api/core/chat/chatTest.ts`
  - 在 chatTest 入口工作流执行前校验当前轮 dataId。
- `packages/service/test/core/chat/dataIdValidation.test.ts`
  - 覆盖请求内重复、库内重复和非重复场景。

## 验证点

1. 请求内 `userContent.dataId === responseChatItemId` 时抛业务错误。
2. 请求 dataId 已存在于 `MongoChatItem` 时抛业务错误。
3. 空 dataId 不参与重复校验。
4. 非重复 dataId 可以继续进入后续流程。
5. v1、v2、chatTest 三个入口都在工作流执行前完成校验。

## 后续迁移

本 PR 只阻止新重复数据继续产生，不处理既有历史重复。

既有数据需要通过独立迁移 PR 处理：

- dry-run 扫描重复 `chat_items.dataId`
- apply 改写重复 dataId
- 同步修复 `chat_item_response.chatItemDataId`
- 重复数归零后再考虑唯一索引

## TODO

- [x] 新增 chat dataId 校验模块
- [x] 校验请求内 human/AI dataId 重复
- [x] 校验当前会话库内已有 dataId
- [x] v1 入口接入前置校验
- [x] v2 入口接入前置校验
- [x] chatTest 入口接入前置校验
- [x] 增加 dataId 校验单元测试
