---
case_version: 1
id: "FG-INTEGRATION-OPENAPI-001"
title: "API customUid 透传与鉴权身份边界"
business: "integration/openapi"
types:
  - "api"
  - "integration"
category: "basic"
scenario: "success"
priority: "P0"
status: "ready"
automation:
  - runner: node
    script: .agents/test/integration/openapi/FG-INTEGRATION-OPENAPI-001.mjs
    items: [C1, C2, C3, C4, C5, C6, C7, C8]
tags:
  - "customuid-publishsource"
  - "phase1"
  - "customUid"
  - "authProxy"
  - "覆盖基础场景"
  - "覆盖异常场景"
  - "覆盖边界场景"
evidence:
  - "response"
  - "database"
sources:
  - "packages/global/openapi/core/chat/completion/api.ts"
  - "projects/app/src/pages/api/v1/chat/completions.ts"
  - "projects/app/src/pages/api/v2/chat/completions.ts"
  - "projects/app/src/service/support/permission/auth/chatCompletion.ts"
  - "packages/service/support/openapi/auth.ts"
  - "packages/service/core/workflow/dispatch/utils/variables.ts"
  - "packages/service/core/chat/utils/prepare.ts"
  - "packages/service/core/chat/saveChat.ts"
  - "packages/service/core/app/logs/chatLogsSchema.ts"
  - "packages/service/common/response/index.ts"
  - "document/content/guide/build/publish/openapi.mdx"
routes:
  - "POST /api/v1/chat/completions"
  - "POST /api/v2/chat/completions"
related:
  - "FG-CHAT-HISTORY-FEEDBACK-001"
  - "FG-INFRA-RUNTIME-002"
baseline: "dd3cc357757bfb7c11a607c279a69a5f73a48c74"
---

# API customUid 透传与鉴权身份边界

## 用例简介

接入方后端用同一个 API Key 为多个用户调用应用，通过 customUid 传递使用者身份。本例验证工作流和存档使用该值，同时应用权限仍取实际鉴权成员；authProxy 与 customUid 互斥，代理调用按被代理成员校验权限。

## 前置准备

- 脚本配置：按执行 skill 的 `references/api-cases.md` 提供仓库外 `FASTGPT_TEST_FIXTURE`，其中登记本例独立应用、A/B/owner/proxy 凭证引用、跨团队与离职成员、回显模板及主/日志库只读连接。脚本逐行执行所选完整场景，缺少该行必要配置时记录阻塞；写入应用必须登记在 `lifecycle.disposeApps` 且名称以 `FG-TEST-` 开头；结束后经正常会话与应用删除入口回收本轮独立应用、消息和统计。

- 环境 D0：FastGPT 4.18.0 及以上、真实 App/Redis/Mongo；记录 BASE_URL、部署版本和 RUN=`uid-日期-随机串`。代码沙箱如被回显工作流使用，须已连通；不需要真实模型生成自然语言。
- 团队 T：有效成员 A、B，B 可读取临时应用 W，但无全应用日志管理权限；另备应用 X（B 可读、A 不可读）和 Y（B 不可读、Kp 创建者可读）。使用团队 owner 创建且 authProxy 已开启的无旧 appId 绑定 Key Kp，以及 A 的普通 Key Ka。凭证仅保存在环境变量中，截图与证据脱敏。
- W：从工作流编辑器变量选择器将系统变量 userId 接到固定回复节点，输出 `RUN + userId`；若使用代码运行节点，仅将该变量映射为输入并原样返回，不读取代码沙箱进程身份。发布后导出配置，记录真实 nodeId/appId/teamId/tmbId。
- 基本请求：Authorization 为 Ka，body 为 `{"appId":"W","chatId":"RUN-Cx","customUid":"RUN-u1","messages":[{"role":"user","content":"probe"}],"detail":true,"stream":false}`。每个独立变体用新的 chatId，续聊行承接前一步。不要把业务别名 W 直接发送为 ID。
- 证据：保存请求脱敏副本、HTTP 状态、完整 JSON/SSE、x-request-id（响应提供时）以及下方数据库快照。JSON completions 为根对象，不套统一 data；HTTP 200 的业务 error 或 SSE error 不能算成功。
- 统计保存：主对话持久化后，每 1 秒查询一次本例 app_chat_logs，最长 30 秒；超时记录统计保存失败或环境阻塞，不仅凭响应判成功。
- 清理：仅在独立临时应用中执行；保存证据后删除该应用及本例 Key，使用现有应用清理流程核对 RUN 会话与统计已清理。不得对共享应用执行整应用“清空历史”。

只读查询（主库与日志库可能不是同一个连接，使用实际配置；变量均替换为本次记录值）：

```js
// appOid 取该子场景实际目标 W/X/Y 的 ObjectId，chatIds 为本例运行生成的精确 ID 白名单；拒绝场景同样查实际目标，不只查 W。
db.chats.find({ teamId: ObjectId(T), appId: appOid, chatId: { $in: chatIds } },
  { chatId: 1, tmbId: 1, outLinkUid: 1, source: 1, chatGenerateStatus: 1 });
db.chatitems.find({ appId: appOid, chatId: { $in: chatIds } }, { chatId: 1, obj: 1, value: 1 });
// 以下在配置的日志库执行。
db.app_chat_logs.find({ teamId: ObjectId(T), appId: appOid, chatId: { $in: chatIds } },
  { chatId: 1, userId: 1, source: 1, chatItemCount: 1 });
```

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；D0，每次新会话 | customUid=RUN-u1；仅本行覆盖 v1/v2 × JSON/SSE 四个代表入口，等待本轮终态及主数据保存。 |
| C2 | 基础；新会话；续聊承接 | 同 Ka，分别以 RUN-u1、RUN-u2 开新会话，再以相同 UID 各续聊一轮。 |
| C3 | 兼容；独立新会话 | customUid 分别省略、null、空字符串；均不传 authProxy。 |
| C4 | 边界；独立新会话 | 使用包含中文与两侧空格的 UID、1024 个 ASCII 字符、等于 B 的真实 tmbId 的字符串；逐一调用。 |
| C5 | 异常；各变体从 D0 新 chatId | customUid 为 1025 个 ASCII 字符、数字或对象；另测 customUid=RUN-u1 与合法 authProxy 同传，以及空字符串 customUid 与 authProxy 同传。 |
| C6 | 权限；D0 新 chatId | Ka 携带 customUid=B.tmbId 请求 X；另用无效 Key、有效 customUid 请求 W。 |
| C7 | 代理；使用 Kp，省略 customUid | authProxy 分别只传 B.tmbId、只传 B 的有效 username；两者同时存在时给有效 B.tmbId 和另一成员 username。 |
| C8 | 代理拒绝；独立新 chatId | Kp 代理一个合法格式但不属于 T/已离职的成员 ID；有效 B.tmbId 请求 B 无权访问的 Y；普通未启用代理 Key 请求合法 authProxy。 |

## 预期结果

公共断言：允许路径输出中 userId 与下表一致，chats.tmbId 始终为有效鉴权成员，外部 UID 不改成员权限。消息中的稳定 RUN 标记用于核验，忽略时间、随机 dataId 和自由文本。拒绝路径无该 chatId 的新 chat/chatitems、无本轮 workflow 统计；Key 最近使用时间、请求审计等鉴权副作用允许发生，不要求“所有数据库字段不变”。参数错误按真实 HTTP/业务响应断言，不要求错误一定有 error 等级日志。

| 子场景 | 特有预期 | 证据 |
| --- | --- | --- |
| C1 | 四条入口工作流 userId=RUN-u1，tmbId=A，outLinkUid=RUN-u1，统计 userId=RUN-u1；JSON 无运行错误，SSE 无 error 事件且正常结束。 | 回显输出、逐轮主库/日志库快照。 |
| C2 | u1、u2 各保留独立使用者值，续聊不回退到 A；鉴权者均为 A。 | 两个会话及各两轮 item 的精确集合。 |
| C3 | 工作流及统计 userId=A.tmbId；outLinkUid 不为有效非空外部 UID；仍能调用。 | 回显与快照；允许缺失/null/空串的兼容存储形态。 |
| C4 | UID 原值透传，不 trim、不转成 B 的成员身份；1024 字符合法。 | 逐字对比输出与 outLinkUid；B ID 字符串不改变 tmbId=A。 |
| C5 | 请求入参校验失败，HTTP 400 / code=400；不进入工作流，包括空字符串与 authProxy 同传。 | JSON 校验错误、主库/统计前后差集为空。 |
| C6 | 原有应用/凭证鉴权拒绝，不能凭 customUid 冒充 B 或绕过无效 Key；不产生新消息。 | 业务拒绝响应及该 chatId 的精确查无记录。 |
| C7 | 有效成员按 ID/username 解析为 B，工作流 userId=B.tmbId、chats.tmbId=B；ID 与 username 同传只使用 ID。 | 输出与 DB，不能仅凭 Ka/Kp 创建者身份断言。 |
| C8 | 成员不存在/离职/跨团队、代理成员无应用权限、Key 未开启代理均拒绝；不回退到 Key 创建者执行。 | 拒绝响应与新记录差集。 |
