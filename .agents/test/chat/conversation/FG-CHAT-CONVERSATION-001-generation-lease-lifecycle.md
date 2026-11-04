---
case_version: 1
id: "FG-CHAT-CONVERSATION-001"
title: "持久化对话的生成互斥与租约生命周期"
business: "chat/conversation"
types: [api, e2e, integration]
category: basic
scenario: success
priority: P0
status: ready
tags: [pr-8044, generation-lease, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, database, cache]
sources:
  - .agents/design/bug/stream-resume-stale-reset.md
  - packages/service/core/chat/utils/prepare.ts
  - packages/service/core/chat/generationLease.ts
  - packages/dal/redis/lease/chat/chatGenerationLease.ts
  - packages/service/core/chat/saveChat.ts
  - packages/service/core/chat/chatItemSchema.ts
  - packages/service/core/chat/source.ts
  - projects/app/src/pages/api/v1/chat/completions.ts
  - projects/app/src/pages/api/v2/chat/completions.ts
  - projects/app/src/pages/api/core/chat/chatTest.ts
  - packages/service/core/ai/skill/debugChat/handler.ts
  - projects/app/src/service/support/mcp/utils.ts
  - projects/app/src/service/core/app/utils.ts
  - pro/admin/src/pages/api/core/chat/chatHome.ts
  - pro/admin/src/pages/api/core/chat/chatAgentHelper/completions.ts
  - pro/admin/src/service/core/ai/workflowBuilder/handler.ts
routes:
  - "POST /api/v1/chat/completions"
  - "POST /api/v2/chat/completions"
  - "POST /api/core/chat/chatTest"
  - "POST /api/core/ai/skill/debugChat"
  - "POST /api/core/chat/chatHome"
  - "POST /api/core/chat/chatAgentHelper/completions"
related: [FG-CHAT-CONVERSATION-002, FG-CHAT-CONVERSATION-003, FG-INFRA-RUNTIME-001]
baseline: "5a5211f70998f5311cd40b0e5362a1414be6fbdf"
---

# 持久化对话的生成互斥与租约生命周期

## 用例简介

同一会话正在生成时，另一条发送应在写入消息前被拦截；不同会话可以独立运行。生成租约在执行期间独立续期，保存与流缓存收尾后释放，不能依赖浏览器在线或工具持续输出。

## 前置准备

- 版本：记录 `BASE_URL`、主仓 commit、Pro commit 和部署类型；本基线 Pro 为 `31a941cec82fc27b0568236f1575ea3a9be37e7b`。每个子场景使用 `RUN=pr8044-日期-随机串` 下独立的 chatId，不复用历史验收数据。
- 权限：测试团队内有应用编辑、调试、对话和删除权限的成员；API Key、外链身份、Pro 和 MCP 权限按入口分别准备，凭证只通过环境变量或已登录浏览器提供。
- D0：独立工作流通过一个可控 HTTP 工具等待，再输出带 RUN 的固定答案。测试自建 gate 服务记录进入和放行时间，并能按 RUN 放行/报错；最长等待 120 秒，不能用不确定的模型输出代替执行屏障。准备同团队第二个应用、第二个 chatId 以及一个 Skill 调试资源。
- 公共取证：浏览器 Network 或 HTTP 客户端保存请求/响应；Mongo 读取 `chats`、`chatitems`。资源物理字段为 `appId`，按 teamId、资源、sourceType、chatId 限定；App 兼容缺失 sourceType 的旧记录，其他来源必须精确匹配。每次保存消息的 `_id/dataId/obj/value/errorMsg` 快照，而不只看数量。
- Redis：记录本实例物理前缀；通过 DAL key helper 对照得到精确物理 key，只读取本轮 key 的 `GET/PTTL`。租约 logical key 为 `chat:generation:lease:{sourceType}:{sourceId}:{chatId}`；ObjectId sourceId 使用小写，chatId 保持原值。不能假设 logical key 等于物理 key。
- 复位：除明确承接的操作外，从 D0 的新 chatId 开始；先确认无租约和无本轮消息。每条生成最长 120 秒；以最终持久化结果和租约消失为收尾判据。
- 清理：放行所有 gate，等待测试任务结束，通过应用/会话管理入口删除本轮资源；确认对应租约消失。不删除其他人的 Redis key，不停止共享数据库。

只读 Mongo 查询模板（替换占位符；App 来源条件见上文）：

```js
const q = {
  teamId: ObjectId("<TEAM_ID>"), appId: ObjectId("<SOURCE_ID>"), chatId: "<CHAT_ID>",
  $or: [{sourceType: "app"}, {sourceType: {$exists: false}}]
};
db.chats.find(q, {chatId: 1, variables: 1, updateTime: 1, hasBeenRead: 1, chatGenerateStatus: 1});
db.chatitems.find(q, {_id: 1, dataId: 1, obj: 1, value: 1, errorMsg: 1}).sort({_id: 1});
```

入口矩阵复用 C1/C2 的验证方法；每行单独记录结果，未具备授权或组件的行记阻塞，不能把主站结果视为 Pro 通过：

| 入口 | 触发方式与差异 |
| --- | --- |
| v2 普通对话、外链 | 从已登录聊天页或独立分享页发送，保存实际 `/api/v2/chat/completions` 请求；外链携带页面真实鉴权字段。 |
| v1 API | 用测试应用 API Key 调用 `/api/v1/chat/completions`；保留连接至收尾，v1 不提供恢复镜像。 |
| 工作流调试 | 从应用调试面板发送，确认实际 `/api/core/chat/chatTest` 请求中的 chatId 为持久化值。 |
| Skill 调试 | 从 Skill 调试面板发送 `/api/core/ai/skill/debugChat`，确认来源为 `skillEdit`，不是伪装的 App 会话。 |
| MCP、定时触发 | 分别调用已发布测试应用的 MCP 工具、创建仅运行一次的临时定时任务；从响应或限定查询取得实际 chatId，完成后删除任务。只断言持久化执行，不能臆造 HTTP completion 路由。 |
| Pro ChatHome | 通过 ChatHome 产品入口发送，保存实际 `/api/core/chat/chatHome` 请求及解析后的会话来源。 |
| Pro Helper、Builder | 分别从应用的辅助生成入口触发；Helper 使用 `/api/core/chat/chatAgentHelper/completions`，Builder 保存页面实际请求，来源分别为 `chatAgentHelper`、`workflowBuilder`。 |

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础场景；D0 | 启动 A，等待 gate 确认已进入；在 0、11、22、65 秒采集 lease 值和 PTTL。放行，等最终结果落库与 lease 消失；再发送下一轮。入口矩阵逐行复用这条主链路。 |
| C2 | 异常场景；新 D0，A 停在 gate | 从第二连接对同 sourceType/sourceId/chatId 发送带独立 dataId 的 B；再用两个服务实例并发竞争一个全新 chatId。 |
| C3 | 边界场景；新 D0 | A 等待期间分别向同应用不同 chatId、不同应用同 chatId、同资源 ID 不同 sourceType 发起有效请求；每个请求使用独立消息 ID。另以大小写不同的同一 ObjectId sourceId 竞争同一会话。 |
| C4 | 异常场景；新 D0 | 分别在准备阶段让消息事务失败、执行阶段让 gate 返回错误、最终保存时让 Mongo 写入失败；最后一个变体再区分错误标记补写成功/也失败。只在私有库故障注入，保存失败阶段及前后快照，独立恢复依赖后再发送下一轮。 |
| C5 | 边界场景；新 chatId | 发送不带 chatId 的合法请求并记录最终分配值；另用 `NO_RECORD_HISTORIES` 标记运行一轮，保持同样 gate。 |

## 预期结果

公共断言：Redis 健康时，一个完整会话标识只有一个确认的持有者。普通持久化新轮在执行前创建同 dataId 的 Human/AI 两条记录；最终更新原 AI，不额外追加占位。新记录不写 Mongo `chatGenerateStatus`。历史旧值是否保留由兼容用例验证。响应成功须同时满足协议、固定输出及落库断言。

| 子场景 | 验证方式 | 特有预期与证据 |
| --- | --- | --- |
| C1 | API、数据库、缓存 | lease 初始 TTL 60 秒，每 10 秒续租；采样能看到 TTL 回升、同一值持续有效，65 秒仍占用。无业务输出也续租。保存和 mirror 收尾后才释放；下一轮成功，消息集合精确新增一对 Human/AI。保留时间序列、gate 记录和消息快照。 |
| C2 | API、数据库、缓存 | 明确占用返回 `chatIsGenerating`（业务 code `504001`）；B 的 dataId 没有任何 Mongo 消息，owner lease 值不变。跨实例竞争只有一个执行进入 gate；另一个被拒绝。JSON/SSE 和 UI 回填在 FG-CHAT-CONVERSATION-002 验证。 |
| C3 | API、数据库、缓存 | 三种不同完整标识可独立持有租约，消息和结果各归所属资源；ObjectId 大小写等价不能绕过同一租约，chatId 不被额外归一化。 |
| C4 | API、数据库、缓存 | 准备事务失败不留下半对消息，已取得 lease 被释放；执行失败允许保留该轮消息、错误及实际用量。最终保存失败即使错误标记也无法补写，finally 仍释放 lease，不能按已保存成功验收；保留占位与错误可见性的实际快照。各变体依赖恢复后下一轮可发送，不把“所有费用不变”当作通用预期。 |
| C5 | API、数据库、缓存 | 自动分配 chatId 后，lease 与记录均使用该最终值。不保存记录的标记不创建该轮 chats/chatitems 或生成租约；不能据此要求执行期间无其他缓存或无计费。 |
