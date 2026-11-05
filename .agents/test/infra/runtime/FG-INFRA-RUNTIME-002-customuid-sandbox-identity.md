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
  - "packages/service/core/ai/sandbox/interface/runtime.ts"
  - "packages/service/core/ai/sandbox/utils/id.ts"
  - "packages/service/core/ai/sandbox/infrastructure/instance/schema.ts"
  - "projects/app/src/service/core/sandbox/auth.ts"
  - "packages/service/core/chat/auth.ts"
  - "projects/app/src/pages/api/core/ai/sandbox/checkExist.ts"
  - "projects/app/src/pages/api/core/ai/sandbox/getTicket.ts"
  - "packages/global/openapi/core/ai/sandbox/api.ts"
routes:
  - "POST /api/v1/chat/completions"
  - "POST /api/core/ai/sandbox/checkExist"
  - "POST /api/core/ai/sandbox/getTicket"
related:
  - "FG-INTEGRATION-OPENAPI-001"
baseline: "dd3cc357757bfb7c11a607c279a69a5f73a48c74"
---

# customUid 在工作流与沙箱中保持使用者归属

## 用例简介

接入方为不同外部用户调用带 Agent 沙箱的工作流时，运行 userId 和沙箱归属应使用 customUid；权限成员仍来自 Key。本例还检查后续沙箱 API 能从已存对话恢复相同身份，避免工作流与文件界面连接到不同用户的沙箱。

## 前置准备

- 复用 OPENAPI-001 的身份准备，在独立应用 Ws 中启用 Agent 沙箱，节点调用一次固定的文件写入/读取工具：写当前 session 目录的 `RUN-marker.txt`，内容取系统 userId，随后原样读取。不得仅检查模型声称“写入成功”。记录实际导出的工作流及工具调用证据。
- 使用真实可用的 provider、Redis、Mongo 与 sandbox proxy，启用 App 沙箱功能；仅引用已配置的环境变量，不在文档保存 URL 中的 ticket 或共享密钥。若环境仅有无状态“代码运行”服务而没有 Agent 沙箱，本例阻塞，不误判为代码沙箱失败。
- 每 2 秒轮询本例实例记录及运行状态，最长 120 秒；运行报错或超时保留真实状态。getTicket 使用 `{sourceType:"app",sourceId:Ws,chatId,channel:"fs",permission:"read"}`，不尝试 App 不支持的 terminal 通道。
- 保存 appId、chatId、uid、sandboxId、工具返回及实际文件内容。Mongo 只读查询：`db.agent_sandbox_instances_v2.find({sourceType:"app",sourceId:Ws,userId:{$in:[u1,u2,A]}},{sandboxId:1,userId:1,sourceId:1,status:1})`，同时用 OPENAPI-001 查询本次 chats。
- 复位/清理：每行按指定创建 chat；所有实例仅属于临时 Ws。完成后通过环境现有沙箱生命周期清理与应用删除流程撤销测试资源，核对实例和文件无残留；环境无 provider 清理能力时记录资源 ID 并将清理项阻塞，不能只删 Mongo 映射假装已清理。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；无本例沙箱 | Ka / customUid=RUN-u1 调用 Ws，等待实际文件产生；随后 checkExist 和 getTicket。 |
| C2 | 隔离；承接 C1 | Ka / RUN-u2 新建会话，再运行一次；分别通过各自 ticket 读取 session 文件。 |
| C3 | 复用；承接 C1 | 同 Ws、RUN-u1 新 chatId 再运行，检查逻辑 sandboxId 与每个 chat 的 session 目录。 |
| C4 | 默认；独立新会话 | 省略 customUid，以 A 调用，检查运行及沙箱 API 身份。 |
| C5 | 权限；承接 C1 | 用无 Ws 读取权限的成员/Key 请求 C1 的 checkExist/getTicket；另用有权限成员读取 C1 的沙箱 API 并比较恢复的 uid。 |

## 预期结果

公共断言：工作流、实例记录与 ticket 所指资源的 uid 一致；ticket 只在当前测试进程内解析和使用，归档必须脱敏。用户级复用由 `(sourceType,sourceId,userId)` 确定，chatId 决定会话目录；不要求“每个 chat 一个物理沙箱”。

| 子场景 | 特有预期 | 证据 |
| --- | --- | --- |
| C1 | 系统 userId、实例 userId、实际文件内容均为 RUN-u1；chats.tmbId=A。checkExist 返回 exists=true，getTicket 能读取本轮目录。 | DB、真实工具/文件返回、ticket 脱敏后的身份字段。 |
| C2 | u2 与 u1 的 sandboxId 不同，文件分别对应各自 UID；没有写入对方实例。 | 两条实例映射与实际文件内容。 |
| C3 | 同用户同应用复用逻辑 sandboxId，sessionWorkDirectory 随 chatId 区分，两次文件都可定位。 | ID/目录/文件三者对应。 |
| C4 | userId 回退 A.tmbId，与 customUid 用户实例区别明确。 | 默认调用和后续 API 的实际资源归属。 |
| C5 | 无资源权限的请求被拒绝；已有权限请求从 chat.outLinkUid 恢复 RUN-u1，不回退到当前查看成员。不得由本例推导 customUid 本身能授予/限制会话权限。 | 原有权限响应、查询恢复身份。 |
