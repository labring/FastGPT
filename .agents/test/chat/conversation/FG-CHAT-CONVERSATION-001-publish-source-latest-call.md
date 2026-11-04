---
case_version: 1
id: "FG-CHAT-CONVERSATION-001"
title: "对话保存最新 publishSource 并贯通运行链路"
business: "chat/conversation"
types:
  - "api"
  - "e2e"
  - "integration"
category: "basic"
scenario: "success"
priority: "P1"
status: "draft"
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
  - "packages/global/core/chat/type.ts"
  - "packages/global/core/chat/constants.ts"
  - "packages/global/core/chat/utils.ts"
  - "packages/service/core/chat/chatSchema.ts"
  - "packages/service/core/chat/chatGenerateStatus.ts"
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
routes:
  - "POST /api/v1/chat/completions"
  - "POST /api/v2/chat/completions"
  - "GET /api/support/mcp/server/toolList"
  - "POST /api/support/mcp/server/toolCall"
related:
  - "FG-INTEGRATION-OPENAPI-001"
  - "FG-PERMISSION-RESOURCE-001"
  - "FG-CHAT-HISTORY-FEEDBACK-002"
  - "FG-ADMIN-MAINTENANCE-001"
baseline: "dd3cc357757bfb7c11a607c279a69a5f73a48c74"
---

# 对话保存最新 publishSource 并贯通运行链路

## 用例简介

同一个对话后续从其他有权限的入口运行时，publishSource 应更新为本次真实来源，而非固定为最初创建来源。本例覆盖 API、分享、MCP 及内部入口的写入，并检查失败保存、交互续跑与并发请求不会遗留或覆盖错误来源。

## 前置准备

- 依据：2026-11-04 本聊天最终确认的第二阶段 publishSource 规则；辅助阅读稿 `/Volumes/code/FastGPT/local/tmp/chat-publish-source.html`。不包含应用 Key 分类、离职交接方案。
- 阻塞项：基线尚无 publishSource 持久化/响应，预期以已确认需求为准；实现合入并补齐写入契约后再执行。基线源码仅用于定位真实入口与原有权限，不能拿当前缺字段当通过证据。
- 公共 D2：独立 T/W，A 有 W 全部必要权限，Ka/Kb 为 A 的两个有效现有 Key；分享 S1/S2 及 MCP M1/M2 均指向 W。从真实创建响应/限定查询记录各渠道真实数据库 _id，绝不将 Key 明文或 shareId 当 ID。引用 OPENAPI-001 的 RUN、请求和响应判断方法。
- W0 输出固定 RUN；W1 为可复现的交互工作流，W2 在已预创建本轮记录后触发确定性节点错误。均导出真实配置，不依靠模型随机决定错误/暂停。请求未显式说明时新 chatId；连续行使用指定前一步 ID。
- 来源映射：api→MongoOpenApi._id；share（含 iframe）→MongoOutLink._id；mcp→MongoMcpKey._id；第三方 feishu/wecom/wechat/official_account/dingtalk→已验证 OutLink._id；online/test/cronJob 无渠道 ID。其他第三方来源可在真实 provider 配置已准备时，通过其既有消息入口或 runOutlinkRuntime 的真实服务集成执行；没有凭证/回调样例则记录该变体阻塞，不伪造 HTTP route。
- 只读快照：`db.chats.find({teamId:ObjectId(T),appId:ObjectId(W),chatId:{$in:manifest}},{publishSource:1,source:1,sourceName:1,shareId:1,tmbId:1,outLinkUid:1,chatGenerateStatus:1,updateTime:1})`；同 app/chatId 查询 chatitems 并比较 obj/dataId 精确集合。
- 完成判据：每秒读取主数据，最长 30 秒，成功/失败终态以响应和本轮记录共同确定；并发/交互在服务端实际生成状态可见后再发下一请求。无控制时序能力则阻塞并发子场景，不用固定 sleep 代替。
- 清理：删除本例独立应用及各临时渠道；夹具与并发痕迹按 manifest 精确清理，避免整库/共享应用操作。

## 测试步骤

| 子场景 | 类型与起始状态 | 操作 |
| --- | --- | --- |
| C1 | 基础；D2 独立新会话 | 依次从 Ka、S1、M1 运行 W0；覆盖 v1 JSON、v2 SSE 两条 completions 代表路径。MCP 先 toolList 取真实 toolName，再按 `{key,toolName,inputs}` 调用 toolCall，按 W+RUN 查询其新建 chatId。 |
| C2 | 连续；承接 Ka 会话 | 换 Kb 续聊相同 chatId，保持资源权限有效；随后用登录 A 的网页入口再续聊一次。 |
| C3 | 连续；承接 S1 会话 | 使用有原有访问权限的 Ka 续聊，再由网页登录 A 续聊；查看每次保存后的来源。 |
| C4 | 参数篡改；新会话 | Ka 请求中 body/metadata/variables 加伪造 publishSource（S2 的 type/id/name）及额外伪造 tmbId；实际仍由 Ka 鉴权。 |
| C5 | 内部/第三方；各变体新会话 | 网页正式对话、工作流调试、可用的 cronJob 各运行一次；有真实 provider 夹具时运行上表所列来源，特别检查钉钉不回落 online。 |
| C6 | 生命周期；D2 的 W1/W2 | 用 Ka 运行 W1 至交互暂停，再以 Kb 提交合法交互续跑；单独用 Kb 运行 W2 至可持久化错误，检查对应 chat/item 来源。 |
| C7 | 并发；同一 W/chatId | 用可控慢运行的 Ka 占用生成槽，期间 Kb 请求同 chatId；等待 Ka 完成后 Kb 再正常运行。若可控制旧轮次保存延迟，再验证迟到旧保存不覆盖新轮次。 |
| C8 | 管理动作；承接 C2 | 只查看日志、修改标题、修改 Key 名称后刷新；不再次运行。 |

## 预期结果

公共断言：DB publishSource 为服务端当前来源的 `{type,id?}`；业务字段名为 id，子文档不自动生成 `_id`，不保存 name、Key/token 明文。API/外链/MCP 的 id 是真实渠道 _id；内部入口整体替换为仅有 type 的对象。每轮 tmbId/outLinkUid 仍遵循第一阶段，发布来源不改写源资源 sourceType/appId。

| 子场景 | 特有预期 | 证据 |
| --- | --- | --- |
| C1 | 分别保存 `{api,Ka.id}`、`{share,S1.id}`、`{mcp,M1.id}`；MCP 每次调用仍生成新 chatId，不虚构多轮参数。保存 ID 与鉴权记录一致，不等于外链 shareId。 | 真实请求、响应、配置记录安全投影及 chats。 |
| C2 | Ka→Kb 不新增跨 Key 拒绝，来源先变 Kb，网页保存后变 online 且无 id；前一渠道 id/name/shareId 不残留或参与回退。 | 连续前后快照、消息增长。 |
| C3 | 当前 API/网页请求通过原有权限即可续聊；来源按每次实际调用更新，不能因旧来源为 share 增加拒绝。 | 连续来源和消息快照。 |
| C4 | 不采信伪造数据；若 schema 拒绝额外字段则无写入，若忽略则来源仍是 Ka，不能存成 S2。 | 请求、校验/成功响应、DB；按最终明确的未知字段策略验收。 |
| C5 | 精确映射实际入口；调试为 test，网页为 online，定时为 cronJob；provider 使用对应配置的真实 ID。 | 调用入口证据与来源对照。 |
| C6 | 交互续跑来源更新为 Kb；保存的失败轮次也归实际 Kb，不回写成 Ka、online 或前一轮来源。 | 交互请求与 AI dataId、错误响应/记录。 |
| C7 | 被拒绝的生成竞争请求不改变 Ka 来源、不创建额外轮次；后续 Kb 正常保存则来源变 Kb。旧轮次迟到保存不得覆盖 Kb。允许鉴权最近使用时间/审计变化。 | 运行时间线、精确 item 差集与每阶段快照。 |
| C8 | 仅查看/改标题/改渠道配置不把来源改成操作者或其他渠道；渠道 id/type 保持，展示名可动态变化。 | 动作前后 type/id。 |
