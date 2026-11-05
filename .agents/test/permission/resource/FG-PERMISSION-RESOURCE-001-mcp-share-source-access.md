---
case_version: 1
id: "FG-PERMISSION-RESOURCE-001"
title: "MCP 与分享按最新来源校验，其他入口沿用原有权限"
business: "permission/resource"
types:
  - "api"
  - "integration"
category: "boundary"
scenario: "special"
priority: "P0"
status: "ready"
tags:
  - "customuid-publishsource"
  - "phase2"
  - "publishSource"
  - "sharing"
  - "mcp"
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
  - "packages/service/core/chat/auth.ts"
  - "packages/service/support/permission/publish/authChat.ts"
  - "packages/service/support/permission/publish/authLink.ts"
  - "projects/app/src/service/support/permission/auth/chatCompletion.ts"
  - "projects/app/src/pages/api/v1/chat/completions.ts"
  - "projects/app/src/pages/api/v2/chat/completions.ts"
  - "projects/app/src/pages/api/core/chat/record/getPaginationRecords.ts"
  - "projects/app/src/pages/api/core/chat/file/presignChatFileGetUrl.ts"
  - "projects/app/src/pages/api/core/chat/resume.ts"
  - "projects/app/src/pages/api/core/app/logs/list.ts"
  - "projects/app/src/service/support/mcp/utils.ts"
  - "packages/global/openapi/support/mcpServer/api.ts"
  - "packages/service/core/chat/generationLease.ts"
  - "projects/app/src/service/core/chat/history.ts"
  - "projects/app/src/pages/api/core/chat/history/getHistories.ts"
  - "packages/global/openapi/core/chat/history/api.ts"
routes:
  - "POST /api/v1/chat/completions"
  - "POST /api/v2/chat/completions"
  - "POST /api/core/chat/history/getHistories"
  - "POST /api/core/chat/file/presignChatFileGetUrl"
  - "POST /api/core/chat/record/getPaginationRecords"
  - "GET /api/core/chat/resume"
  - "POST /api/core/app/logs/list"
  - "POST /api/support/mcp/server/toolCall"
related:
  - "FG-CHAT-CONVERSATION-005"
  - "FG-INTEGRATION-OPENAPI-001"
baseline: "528b3ad09c909d7fabe1f19210ce2673cdc093e3"
---

# MCP 与分享按最新来源校验，其他入口沿用原有权限

## 用例简介

当前请求来自 MCP 或分享链接时，只有已保存对话的 type/id 均存在，才要求它们与当前可信来源一致。其他请求不增加该来源限制；本例同时验证缺失字段兼容和后台日志管理权限，避免把展示来源变成全渠道的永久绑定。

## 前置准备

- 依据简版设计的“仅当前 MCP/分享检查、缺任一旧字段兼容、preChat 原子复核”规则。复用 CONVERSATION-005 的 D2 身份/渠道清单和请求/证据方法；每个独立场景恢复新副本 G0，连续场景明确承接前一步，不能复用已被其他行改变的最新来源。
- G0：S1 下已完成的对话 Cs，publishSource=`{type:share,id:S1.id}`、outLinkUid=u1。G1：Ka 下已完成对话 Ca，来源 api/Ka。G2：隔离库夹具克隆 G0，publishSource 分别为缺失、`{type:share}`、`{id:S2.id}`，旧 shareId 为空或指向 S2；保留 outLinkUid=u1 和合法资源权限。渠道检查只使用 publishSource，不因旧 shareId 不同拒绝；访客身份仍须匹配。
- 分享请求使用真实 `outLinkAuthData:{shareId,outLinkUid}`，受保护分享还需有效登录身份；不得把 customUid 代替 outLinkUid。记录 body 中伪造来源不影响服务端通道判断。
- 先存 chats 的来源、uid、状态与本例 chatitems/dataId 集合；拒绝时同时验证不返回历史内容/文件信息且不改来源。原有 Key 使用时间、请求日志、分享鉴权前置检查可能更新，不断言所有用量/日志绝对不变。
- 实施入口：assertChatPublishSource 用于历史读取前校验，updateChatPublishSource 在 preChat 以 Mongo 快照条件更新复核。MCP toolCall 不接收 chatId，每次新建。C7 先通过实际 toolCall 验证 M1 有效且绑定 W，再在同一隔离资源下用真实 Mongo 与 `updateChatPublishSource` 验证已有会话：固定 `sourceType=app, sourceId=W, teamId=T, tmbId=A, source=mcp`，publishSource 由已验证 M1 的数据库 ID 构造。该部分属于服务集成，不是 MCP 多轮 HTTP 测试。不得给现有 toolCall 发臆造 chatId 并声称覆盖了已有会话，也不为测试扩展产品能力。
- 操作历史/恢复/文件时，先以 S1/u1 记录一次可成功的真实分页请求、已上传文件的签名请求及 resume query，再替换渠道；resume 的 outLinkAuthData 按 schema JSON 序列化。不得以错误 key 或未就绪运行造成的失败代替来源拒绝。后台用有 AppReadChatLogPer 的 L，无该权限的 N 为反例。
- C9 单独复建一组 D2 资源，只保留 H 清单中的会话；列表夹具均在该 W/u1、最近一个月且未软删：H1 完整 share/S1；H2 完整 share/S2 但残留 shareId=S1；H3 完整 api/Ka 但残留 shareId=S1；H4 无 publishSource、shareId=S1；H5 type-only、shareId=S1；H6 id-only、shareId=S1；H7 为另一 UID 或另一应用的对照。保存各 chatId 清单。H2/H3 的残留值只用于隔离兼容验证，不通过真实续聊制造。
- C10 用确定性的两阶段服务集成复现来源变化：先调用真实 `authChatTargetCrud` 校验 S1/u1 并保留可信返回上下文，随后让授权 Ka 通过真实 HTTP 完成同会话续聊，最后将已保留的分享来源、身份和资源传入真实 `preChatRound`。使用实际 Mongo/Redis，独立 responseChatItemId；不得 mock 来源守卫或先手工改 Chat，再声称完成了 HTTP 并发。
- 证据、超时与清理沿用 CONVERSATION-005，所有数据库快照限定 appId+精确 chatId。

## 测试步骤

| 子场景 | 类型与起始状态 | 操作 |
| --- | --- | --- |
| C1 | 允许；G0 | S1/u1 续聊；同链接以 u2 访问另一个恢复的 G0。 |
| C2 | 拒绝；恢复 G0 | S2/u1 请求 Cs；分别验证 completions 与分享端已有的历史/恢复/文件请求。 |
| C3 | 连续状态；恢复 G0 | Ka 续聊 Cs 并保存后，再用原 S1/u1 续聊。 |
| C4 | 缺字段；G2 各变体独立 | S1/u1 请求；再在旧来源 type=api 但无 id 的变体上请求。复位后以 S1/u2 请求一个缺字段变体作身份反例。 |
| C5 | 请求通道；恢复 G0 | S2/u1 请求 Cs，在 metadata/variables 中伪造 type=api、scene=admin 和 S1 的 publishSource；实际仍由 S2 鉴权。普通 API/网页跨来源的正向流程引用 CONVERSATION-005 C2/C3，不重复执行矩阵。 |
| C6 | 原权限拒绝；G2/完整来源 | 使用失效分享、受保护分享缺登录或无应用权限；使用无权 API Key 或其他团队成员；缺 type/id 也重复一个权限拒绝代表。 |
| C7 | MCP；真实服务集成 | 沿用上述 M1 可信上下文，调用真实 updateChatPublishSource：旧记录分别为 mcp/M1、mcp/M2、api/Ka、缺 type、缺 id；再验证 M1 当前可信来源缺必需 ID 不能绕过完整旧来源。 |
| C8 | 后台管理；G0/G1 | L 从网页后台读取两种来源的日志及详情；N 请求同管理入口。 |
| C9 | 分享历史范围；H 初态 | S1/u1 调用页面真实 POST /api/core/chat/history/getHistories，分页收齐 list，与 H 精确比对；同样使用 S2/u1 作对照。 |
| C10 | 来源竞争；G0 和 G2 分别独立 | 通过真实 authChatTargetCrud 完成 S1/u1 鉴权并保留上下文；授权 Ka 通过 HTTP 在同 chatId 运行并完成，确认最新来源 api/Ka，再以保留的 S1 上下文调用 preChatRound。完整旧来源和初始缺 id 两种起点分别复位执行。 |

## 预期结果

公共断言：检查范围由当前已验证的鉴权入口确定。MCP/分享且旧 type/id 齐全时，比较两个值；旧任一缺失时跳过新增来源检查，原有成员/访客/资源权限仍生效。不接受客户端 type/id/name 改写或降低鉴权要求。

| 子场景 | 特有预期 | 证据 |
| --- | --- | --- |
| C1 | S1/u1 允许；换 u2 仍由原有访客身份规则拒绝，不因同来源放宽 UID。 | 响应、Cs 的新增轮次或无变化差集。 |
| C2 | S2 被拒绝，type 相同也不能忽略 id。拒绝发生在返回受保护内容和改写来源之前；不能先改 S2 再比较。 | 请求/业务错误、历史正文不泄漏、来源/items 快照。 |
| C3 | Ka 通过原权限可写入最新 api/Ka；之后 S1 因与“最新来源”不同拒绝，不按最初创建来源放行。 | 两次响应及中间/最终快照。 |
| C4 | 新来源缺 type 或 id 时跳过渠道检查，不回退旧 shareId；合法 S1/u1 可续聊并更新为 share/S1，即使旧 shareId 不同或缺失。u2 仍被身份校验拒绝，不改来源和消息。 | 各初态/终态 BSON 与业务结果。 |
| C5 | 伪造 scene/type 不把真实分享变成普通 API；S2 仍被拒绝，不能按客户端来源跳过校验。 | 当前凭证入口、响应、无本轮消息差集。 |
| C6 | 缺来源不授予权限；原有拒绝保持，不能靠 source 兼容、customUid 或伪造发布者绕过。 | 真实业务错误及无消息写入。 |
| C7 | 完整且相同允许；完整但 Key/type 不同拒绝；旧任一缺失跳过；当前可信字段缺失不能绕过完整旧来源。当前来源缺 ID 在进入数据写入前失败。 | 真实 MCP 鉴权响应、服务入参及 Mongo 前后快照。 |
| C8 | L 按管理权限可查跨渠道日志，查看不更新来源；N 不可查。 | UI/API、来源前后相等。 |
| C9 | S1 列表仅含 H1；H2/H3 和缺完整渠道来源的 H4/H5/H6 即使残留旧 shareId 也不可见，H7 不可见。列表不回退旧 shareId、不刷新来源。 | data.list 全分页 chatId 集合/total、各初始来源快照；S2 对照只包含 H2。 |
| C10 | S1 必须按最新 api/Ka 重新判定并拒绝，初始缺 id 也不能绕过并发写入后的完整来源；不创建消息、不覆盖 Ka 来源，不将条件未命中当新会话 upsert。 | 服务鉴权→HTTP Ka→服务 preChat 的时序、Ka 完成快照、S1 错误、最终来源和 item 精确差集。 |
