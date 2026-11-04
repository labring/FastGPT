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
status: "draft"
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
  - "packages/service/core/chat/chatGenerateStatus.ts"
routes:
  - "POST /api/v1/chat/completions"
  - "POST /api/v2/chat/completions"
  - "POST /api/core/chat/record/getPaginationRecords"
  - "GET /api/core/chat/resume"
  - "POST /api/core/app/logs/list"
  - "POST /api/support/mcp/server/toolCall"
related:
  - "FG-CHAT-CONVERSATION-001"
  - "FG-INTEGRATION-OPENAPI-001"
baseline: "dd3cc357757bfb7c11a607c279a69a5f73a48c74"
---

# MCP 与分享按最新来源校验，其他入口沿用原有权限

## 用例简介

当前请求来自 MCP 或分享链接时，只有已保存对话的 type/id 均存在，才要求它们与当前可信来源一致。其他请求不增加该来源限制；本例同时验证缺失字段兼容和后台日志管理权限，避免把展示来源变成全渠道的永久绑定。

## 前置准备

- 复用 CONVERSATION-001 的 D2 身份/渠道清单；每个独立场景从新的副本会话恢复 G0，不能让前一场景的最新来源影响后续独立场景。
- G0：S1 下已完成的对话 Cs，publishSource=`{type:share,id:S1.id}`、outLinkUid=u1。G1：Ka 下已完成对话 Ca，来源 api/Ka。G2：隔离库夹具克隆 G0，只改 publishSource 为缺失、`{type:share}`、`{id:S1.id}`，旧 shareId/outLinkUid 和原有权限仍满足；不得用“缺新字段”顺便移除旧校验。
- 分享请求使用真实 `outLinkAuthData:{shareId,outLinkUid}`，受保护分享还需有效登录身份；不得把 customUid 代替 outLinkUid。记录 body 中伪造来源不影响服务端通道判断。
- 先存 chats 的来源、uid、状态与本例 chatitems/dataId 集合；拒绝时同时验证不返回历史内容/文件信息且不改来源。原有 Key 使用时间、请求日志、分享鉴权前置检查可能更新，不断言所有用量/日志绝对不变。
- 阻塞：基线未实现新来源守卫；先补实际共享守卫/入口后执行。MCP toolCall 当前不接收 chatId，每次新建；C7 的“已有会话”服务集成需在实现后指定真实可调用的守卫及真实 Mongo/鉴权上下文，当前阻塞。不得给现有 toolCall 发臆造 chatId 并声称覆盖了已有会话，也不为测试扩展产品能力。
- 操作历史/恢复/文件时复用页面产生的真实请求；resume 仅对已有运行/已完成会话使用其既有 query schema。后台用有 AppReadChatLogPer 权限的 L；反例用没有该权限的 N。
- 证据、超时与清理沿用 CONVERSATION-001，所有数据库快照限定 appId+精确 chatId。

## 测试步骤

| 子场景 | 类型与起始状态 | 操作 |
| --- | --- | --- |
| C1 | 允许；G0 | S1/u1 续聊；同链接以 u2 访问另一个恢复的 G0。 |
| C2 | 拒绝；恢复 G0 | S2/u1 请求 Cs；分别验证 completions 与分享端已有的历史/恢复/文件请求。 |
| C3 | 连续状态；恢复 G0 | Ka 续聊 Cs 并保存后，再用原 S1/u1 续聊。 |
| C4 | 缺字段；G2 各变体独立 | S1/u1 请求；再在旧来源 type=api 但无 id 的变体上执行原有分享校验可通过的请求。 |
| C5 | 请求通道；恢复 G1/G0 | Ca 由 Kb 或有权限网页登录续聊；Cs 的分享请求携带伪造 type=api/scene=admin，再以 S2/u1 请求。 |
| C6 | 原权限拒绝；G2/完整来源 | 使用失效分享、受保护分享缺登录或无应用权限；使用无权 API Key 或其他团队成员；缺 type/id 也重复一个权限拒绝代表。 |
| C7 | MCP；真实服务集成，当前阻塞 | 对真实守卫提供已通过 MCP 鉴权的 M1：旧记录分别为 mcp/M1、mcp/M2、api/Ka、缺 type、缺 id；再验证 M1 当前可信来源缺必需 ID 不能绕过完整旧来源。 |
| C8 | 后台管理；G0/G1 | L 从网页后台读取两种来源的日志及详情；N 请求同管理入口。 |

## 预期结果

公共断言：检查范围由当前已验证的鉴权入口确定。MCP/分享且旧 type/id 齐全时，比较两个值；旧任一缺失时跳过新增来源检查，原有成员/访客/资源权限仍生效。不接受客户端 type/id/name 改写或降低鉴权要求。

| 子场景 | 特有预期 | 证据 |
| --- | --- | --- |
| C1 | S1/u1 允许；换 u2 仍由原有访客身份规则拒绝，不因同来源放宽 UID。 | 响应、Cs 的新增轮次或无变化差集。 |
| C2 | S2 被拒绝，type 相同也不能忽略 id。拒绝发生在返回受保护内容和改写来源之前；不能先改 S2 再比较。 | 请求/业务错误、历史正文不泄漏、来源/items 快照。 |
| C3 | Ka 通过原权限可写入最新 api/Ka；之后 S1 因与“最新来源”不同拒绝，不按最初创建来源放行。 | 两次响应及中间/最终快照。 |
| C4 | 所有旧字段缺失变体跳过新增检查，不单独强制 type；通过原有校验后，来源更新为本次 share/S1。 | 各初态/终态 BSON 与业务结果。 |
| C5 | Kb/网页不新增跨来源拒绝，保存后更新来源；伪造 scene/type 不把真实分享请求变成普通 API，S2 仍被拒绝。 | 当前凭证入口与落库、拒绝差集。 |
| C6 | 缺来源不授予权限；原有拒绝保持，不能靠 source 兼容、customUid 或伪造发布者绕过。 | 真实业务错误及无消息写入。 |
| C7 | 完整且相同允许；完整但 Key/type 不同拒绝；旧任一缺失跳过；当前可信字段缺失不能绕过完整旧来源。只在有真实入口/守卫后记录结果。 | 真实服务+Mongo 快照；当前无可执行入口则明确阻塞。 |
| C8 | L 按管理权限可查跨渠道日志，查看不更新来源；N 不可查。 | UI/API、来源前后相等。 |
