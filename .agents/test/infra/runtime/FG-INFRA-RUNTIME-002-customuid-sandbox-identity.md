---
case_version: 1
id: "FG-INFRA-RUNTIME-002"
title: "customUid 在工作流与沙箱中保持使用者归属"
business: "infra/runtime"
types:
  - "api"
  - "integration"
category: "boundary"
scenario: "special"
priority: "P0"
status: "ready"
automation:
  - runner: node
    script: .agents/test/infra/runtime/FG-INFRA-RUNTIME-002.mjs
    items: [C1, C2, C3, C4, C5]
tags:
  - "customuid-publishsource"
  - "phase1"
  - "customUid"
  - "sandbox"
  - "覆盖基础场景"
  - "覆盖边界场景"
evidence:
  - "response"
  - "database"
  - "storage"
sources:
  - "projects/app/src/pages/api/v1/chat/completions.ts"
  - "packages/service/core/workflow/dispatch/index.ts"
  - "packages/service/core/workflow/dispatch/utils/variables.ts"
  - "packages/service/core/workflow/dispatch/ai/agent/index.ts"
  - "packages/service/core/ai/sandbox/application/runtime/index.ts"
  - "packages/service/core/ai/sandbox/utils/id.ts"
  - "packages/service/core/ai/sandbox/infrastructure/instance/schema.ts"
  - "projects/app/src/service/core/sandbox/auth.ts"
  - "projects/app/src/service/core/sandbox/access.ts"
  - "packages/service/core/chat/auth.ts"
  - "projects/app/src/pages/api/core/ai/sandbox/checkExist.ts"
  - "projects/app/src/pages/api/core/ai/sandbox/fs/list.ts"
  - "projects/app/src/pages/api/core/ai/sandbox/upload.ts"
  - "projects/app/src/pages/api/core/ai/sandbox/download.ts"
  - "packages/global/openapi/core/ai/sandbox/api.ts"
routes:
  - "POST /api/v1/chat/completions"
  - "POST /api/core/ai/sandbox/checkExist"
  - "POST /api/core/ai/sandbox/fs/list"
  - "POST /api/core/ai/sandbox/upload"
  - "POST /api/core/ai/sandbox/download"
related:
  - "FG-INTEGRATION-OPENAPI-001"
baseline: "116dda3bc40b712a866899037ca3c74da3587091"
---

# customUid 在工作流与沙箱中保持使用者归属

## 用例简介

接入方为不同外部用户调用带 Agent 沙箱的工作流时，运行 userId 和沙箱归属应使用 customUid；权限成员仍来自 Key。本例还检查后续直连沙箱文件系统 API（`checkExist`、`fs/list`、`upload`、`download`）能从已存对话恢复相同身份，避免工作流与文件界面连接到不同用户的沙箱。

## 前置准备

- 复用 OPENAPI-001 的身份准备，在独立应用 Ws 中启用 Agent 沙箱能力，通过会话调用或沙箱文件接口在当前 session 目录写入 `RUN-marker.txt`，内容含系统 userId，随后通过直连文件接口原样读取。
- 使用真实可用的 OpenSandbox provider、Volume-Manager、Redis、Mongo，启用 App 沙箱功能；仅引用已配置的环境变量。
- 每 2 秒轮询本例实例记录及运行状态，最长 120 秒；运行报错或超时保留真实状态。直连沙箱接口使用 `{sourceType:"app",sourceId:Ws,chatId,...}`，验证旧版 `/api/core/ai/sandbox/getHtmlPreviewLink` 已下线（404），且内部代理接口 `verifyTicket`/`keepalive` 在无代理密钥时返回 401、终端 `getTicket` 拒绝普通 `app` 会话。
- 保存 appId、chatId、uid、sandboxId、文件列表及实际文件内容。Mongo 只读查询：`db.agent_sandbox_instances_v3.find({sourceType:"app",sourceId:Ws,userId:{$in:[u1,u2,A]}},{sandboxId:1,userId:1,sourceId:1,status:1,storage:1})`，同时查询本次 chats。
- 复位/清理：每行按指定创建 chat；所有实例仅属于临时 Ws。完成后通过环境现有沙箱生命周期清理与应用删除流程撤销测试资源，核对容器、持久卷和 Mongo 记录无残留。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；无本例沙箱 | Ka / customUid=RUN-u1 调用 Ws 并写入会话文件；随后调用 checkExist、fs/list 与 download，并校验旧版 getHtmlPreviewLink 返回 404、内部代理路由无密钥返回 401、普通 app 会话调用 getTicket 被拒绝。 |
| C2 | 隔离；承接 C1 | Ka / RUN-u2 新建会话并写入各自文件；分别通过各自 customUid 调用 fs/list 和 download 读取 session 文件，以及交叉 UID 拒绝校验。 |
| C3 | 复用；承接 C1 | 同 Ws、RUN-u1 新 chatId 再运行并写文件，检查逻辑 sandboxId、持久化卷 claimName 复用与每个 chat 的 `/workspace/sessions/<chatId>` 目录隔离。 |
| C4 | 默认；独立新会话 | 省略 customUid（及登录态传入伪造 customUid 被忽略），以 A 调用，检查运行及沙箱 API 身份回退为 A.tmbId。 |
| C5 | 权限；承接 C1 | 用无 Ws 读取权限的成员/Key 请求 C1 的 checkExist/fs/list/download，以及免密分享链接只读允许与写接口拦截；另用有权限管理员查看 C1 会话的沙箱 API 并比较从 chat.outLinkUid 恢复的 RUN-u1 身份。 |

## 预期结果

公共断言：工作流、实例记录（`agent_sandbox_instances_v3`）与直连沙箱文件 API 所指资源的 uid 一致。用户级复用由 `(sourceType,sourceId,userId)` 确定，chatId 决定会话子目录 `/workspace/sessions/<chatId>`；不要求“每个 chat 一个物理沙箱”。

| 子场景 | 特有预期 | 证据 |
| --- | --- | --- |
| C1 | 系统 userId、实例 userId、实际文件内容均为 RUN-u1；chats.tmbId=A。checkExist 返回 exists=true，fs/list 与 download 能读取本轮目录，旧版 getHtmlPreviewLink 返回 404，无代理密钥访问 verifyTicket/keepalive 返回 401，普通 app 会话调用 getTicket 被拒绝。 | DB、真实文件列表/内容返回、路由边界响应。 |
| C2 | u2 与 u1 的 sandboxId 及持久化卷 claimName 不同，文件分别对应各自 UID；交叉 customUid 访问被拒绝且没有写入对方实例。 | 两条实例映射与实际文件内容。 |
| C3 | 同用户同应用复用逻辑 sandboxId 与同一持久化卷 claimName，sessionWorkDirectory 随 chatId 区分，两次文件互不覆盖且都可定位。 | ID/claimName/目录/文件四者对应。 |
| C4 | 省略 customUid（或登录态传入 customUid）时 userId 回退 A.tmbId，与 customUid 用户实例区别明确。 | 默认调用和后续 API 的实际资源归属。 |
| C5 | 无资源权限请求及分享链接写请求被拒绝；有权限成员通过会话恢复 `chat.outLinkUid`（RUN-u1）读取到 C1 的沙箱文件，不回退到当前查看成员。 | 权限拒绝响应、恢复身份及文件读取结果。 |
