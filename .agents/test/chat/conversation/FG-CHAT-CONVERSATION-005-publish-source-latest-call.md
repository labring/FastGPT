---
case_version: 1
id: "FG-CHAT-CONVERSATION-005"
title: "preChat 记录最新 publishSource 并贯通运行链路"
business: "chat/conversation"
types:
  - "api"
  - "e2e"
  - "integration"
category: "basic"
scenario: "success"
priority: "P1"
status: "ready"
tags:
  - "customuid-publishsource"
  - "phase2"
  - "publishSource"
  - "覆盖基础场景"
  - "覆盖异常场景"
  - "覆盖边界场景"
evidence:
  - "response"
  - "database"
sources:
  - "packages/service/core/chat/publishSource/utils.ts"
  - "packages/service/core/chat/publishSource/service.ts"
  - "packages/global/core/chat/publishSource/type.ts"
  - "packages/global/core/chat/type.ts"
  - "packages/global/core/chat/constants.ts"
  - "packages/global/core/chat/utils.ts"
  - "packages/service/core/chat/chatSchema.ts"
  - "packages/service/core/chat/generationLease.ts"
  - "packages/service/core/chat/utils/prepare.ts"
  - "packages/service/core/chat/saveChat.ts"
  - "projects/app/src/pages/api/v1/chat/completions.ts"
  - "projects/app/src/pages/api/v2/chat/completions.ts"
  - "packages/service/support/openapi/auth.ts"
  - "packages/service/support/outLink/runtime/service.ts"
  - "packages/service/support/outLink/schema.ts"
  - "packages/service/support/mcp/schema.ts"
  - "projects/app/src/service/support/mcp/utils.ts"
  - "packages/global/openapi/support/mcpServer/api.ts"
  - "packages/global/openapi/core/chat/completion/api.ts"
  - "projects/app/src/service/middleware/entry.ts"
  - "packages/service/common/http/entry.ts"
routes:
  - "POST /api/v1/chat/completions"
  - "POST /api/v2/chat/completions"
  - "GET /api/support/mcp/server/toolList"
  - "POST /api/support/mcp/server/toolCall"
related:
  - "FG-INTEGRATION-OPENAPI-001"
  - "FG-PERMISSION-RESOURCE-001"
  - "FG-CHAT-HISTORY-FEEDBACK-002"
baseline: "528b3ad09c909d7fabe1f19210ce2673cdc093e3"
---

# preChat 记录最新 publishSource 并贯通运行链路

## 用例简介

同一个对话后续从其他有权限的入口运行时，publishSource 应更新为本次真实来源，而非固定为最初创建来源。本例覆盖 API、分享、MCP 及内部入口的写入，并检查失败保存、交互续跑与并发请求不会遗留或覆盖错误来源。

## 前置准备

- 环境：部署 4.18.0 及以上版本，并记录实际主仓库与 Pro 提交。依据 `.agents/design/api/chat-publish-source.md`。来源只在 preChat 取得运行权时更新；prepare/finalize/fail 不再重写 Chat 来源或旧兼容字段。应用 Key 分类、绑定和离职交接不在本例范围。
- 实施入口：preChatRound 获取 Redis 租约后调用 updateChatPublishSource；数据写入及响应已实现。受控暂停能力按下面场景前置逐项确认。preChat 使用 Redis generationLease，不要求恢复旧字段，也不能宣称 Redis 租约与 Mongo 写入构成同一事务。验收目标仍是 preChat 的来源条件更新、拒绝不改来源；租约故障降级的跨轮互斥不作为本例已保证的前提。
- 公共 D2：独立 T/W，A 有 W 全部必要权限，Ka/Kb 为 A 的两个有效现有 Key；分享 S1/S2 及 MCP M1/M2 均指向 W。从真实创建响应/限定查询记录各渠道真实数据库 _id，绝不将 Key 明文或 shareId 当 ID。引用 OPENAPI-001 的 RUN、请求和响应判断方法。
- W0 输出固定 RUN；W1 为可复现的交互工作流，W2 在 preChat 之后、最终保存之前能受控暂停并触发确定性节点错误，Ws 能暂停正常执行。先在该环境导出实际配置和 nodeId，不依靠模型随机输出或固定 sleep。缺暂停/故障注入能力时，仅对应时序子场景阻塞。每个独立场景新 chatId，连续行承接前一步。
- 来源映射：api→MongoOpenApi._id；share（含 iframe）→MongoOutLink._id；mcp→MongoMcpKey._id；第三方 feishu/wecom/wechat/official_account/dingtalk→已验证 OutLink._id；online/test/cronJob 无渠道 ID。其他第三方来源可在真实 provider 配置已准备时，通过其既有消息入口或 runOutlinkRuntime 的真实服务集成执行；没有凭证/回调样例则记录该变体阻塞，不伪造 HTTP route。
- 只读快照：`db.chats.find({teamId:ObjectId(T),appId:ObjectId(W),chatId:{$in:manifest}},{publishSource:1,source:1,sourceName:1,shareId:1,tmbId:1,outLinkUid:1,updateTime:1})`；同 app/chatId 查询 chatitems 并比较 obj/dataId 精确集合。
- 请求沿用 OPENAPI-001 的实际 v1/v2 body、鉴权与 JSON/SSE 判断：completions 成功为根对象，普通 NextAPI 接口读取 code/data；HTTP 200 内的业务错误或 SSE error 不算成功。保存 x-request-id（响应提供时）、实际 chatId/responseChatItemId、脱敏请求和主数据快照。每秒轮询，最长 30 秒；终态须同时符合响应与本轮消息保存结果。并发用健康 Redis，使用真实 getChatGenerationStatuses（fallbackOnError=false）或页面产生的状态请求确认租约已占用，不以 Mongo 旧字段作为运行证据。
- 清理：删除本例独立应用及各临时渠道；夹具与并发痕迹按 manifest 精确清理，避免整库/共享应用操作。

## 测试步骤

| 子场景 | 类型与起始状态 | 操作 |
| --- | --- | --- |
| C1 | 基础；D2 独立新会话 | 依次从 Ka、S1、M1 运行 W0；覆盖 v1 JSON、v2 SSE 两条 completions 代表路径。MCP 先 toolList 取真实 toolName，再按 `{key,toolName,inputs}` 调用 toolCall，按 W+RUN 查询其新建 chatId。 |
| C2 | 连续；承接 Ka 会话 | 换 Kb 续聊相同 chatId，保持资源权限有效；随后用登录 A 的网页入口再续聊一次。 |
| C3 | 连续；承接 S1 会话 | 使用有原有访问权限的 Ka 续聊，再由网页登录 A 续聊；查看每次保存后的来源。 |
| C4 | 参数篡改；新会话 | Ka 请求的 metadata、variables 中分别放伪造 publishSource（S2 的 type/id/name）；另发一次携带顶层 publishSource/tmbId 的请求，保持其余已声明字段合法。W0 不消费这些附加业务变量。 |
| C5 | 内部/第三方；各变体新会话 | 网页正式对话、工作流调试、可用的 cronJob 各运行一次；有真实 provider 夹具时运行上表所列来源，特别检查钉钉不回落 online。 |
| C6 | 生命周期；W1/W2 各用独立会话 | Ka 运行 W1 至交互暂停，再以 Kb 续跑；在受控暂停点查看来源，再等保存完成。另从已有 Ka 会话用 Kb 运行 W2，在 preChat 已完成、结果未保存时取快照，随后触发节点错误并等待失败记录保存。 |
| C7 | 并发与尾部保存；Ws，独立隔离副本 | Ka 运行至租约已占用，期间 Kb 请求同 chatId；待 Ka 正常结束后再以 Kb 运行。另用真实 Mongo 的服务集成夹具保留已预创建旧轮次的保存参数，将 Chat 的最新来源及兼容字段设置为 B 快照，再分别调用真实 finalize/fail/交互兼容保存入口；每个变体独立复位，验证它们不回写参数中的旧来源。服务夹具不冒充正常 HTTP 并发，也不强制释放共享 Redis 租约。 |
| C8 | 管理动作；承接 C2 的已保存会话 | 只查看日志、修改标题、修改临时 Key 名称后刷新；不再次运行。 |
| C9 | 不保存历史；新请求 | Ka 使用既有 chatId 哨兵 NO_RECORD_HISTORIES 运行 W0；比较本例 W 下 chats/chatitems 的精确前后集合。 |

## 预期结果

公共断言：DB publishSource 为服务端当前来源的 `{type,id?}`；业务字段名为 id，子文档不自动生成 `_id`，不保存 name、Key/token 明文。API/外链/MCP 的 id 是真实渠道 _id；内部入口整体替换为仅有 type 的对象。每轮 tmbId/outLinkUid 仍遵循第一阶段，发布来源不改写源资源 sourceType/appId。

| 子场景 | 特有预期 | 证据 |
| --- | --- | --- |
| C1 | 分别保存 `{api,Ka.id}`、`{share,S1.id}`、`{mcp,M1.id}`；MCP 每次调用仍生成新 chatId，不虚构多轮参数。保存 ID 与鉴权记录一致，不等于外链 shareId。 | 真实请求、响应、配置记录安全投影及 chats。 |
| C2 | Ka→Kb 不新增跨 Key 拒绝，来源先变 Kb，网页保存后变 online 且无 id；前一渠道 id/name/shareId 不残留或参与回退。 | 连续前后快照、消息增长。 |
| C3 | 当前 API/网页请求通过原有权限即可续聊；来源按每次实际调用更新，不能因旧来源为 share 增加拒绝。 | 连续来源和消息快照。 |
| C4 | metadata/variables 中的伪造值不改变可信来源。当前 Zod 合约忽略未知顶层字段，若该策略保持则请求正常执行且来源仍是 Ka；若实现调整未知字段策略，先补定稿合约再验顶层变体，不能将任意拒绝当作整行通过。 | 脱敏请求、按实际合约判断的响应、DB type/id。 |
| C5 | 精确映射实际入口；调试为 test，网页为 online，定时为 cronJob；provider 使用对应配置的真实 ID。 | 调用入口证据与来源对照。 |
| C6 | 交互续跑复用原 AI，preChat 后已是 Kb 来源；W2 也须在最终成功/失败保存之前变为 Kb，失败保存后仍为 Kb。不能只在 finalize/fail 补写，也不能沿用 Ka 或回落 online。 | 暂停点/终态 BSON、交互复用 AI dataId、错误响应及记录。 |
| C7 | 明确租约占用时 Kb 被拒绝，不改 Ka 来源、不新增本轮消息；后续 Kb 正常运行后来源变 B。隔离服务夹具中，各尾部保存均不得改变最新 publishSource 及 source/sourceName 的 B 快照，且不再写入 shareId；本行不扩展断言其他生命周期字段。Key 最近使用时间、审计等鉴权变化允许发生。 | 正常 HTTP 时序与 item 差集；另存服务实际调用参数、前后来源字段快照。 |
| C8 | 仅查看/改标题/改渠道配置不把来源改成操作者或其他渠道；渠道 id/type 保持，展示名可动态变化。 | 动作前后 type/id。 |
| C9 | 请求按既有不保存历史语义完成；不创建或改写哨兵的 Chat 来源，不新增 chats/chatitems。 | 根响应/SSE、限定 W 的 BSON 精确差集。 |
