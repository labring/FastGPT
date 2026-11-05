---
case_version: 1
id: "FG-PERMISSION-RESOURCE-002"
title: "应用 Key 独立授权、绑定应用与接口范围隔离"
business: "permission/resource"
types: [api, integration]
category: boundary
scenario: special
priority: P0
status: ready
automation:
  - runner: node
    script: .agents/test/permission/resource/FG-PERMISSION-RESOURCE-002.mjs
    items: [A1, A2, A3, A4, A5, A6]
tags: [phase3, app-api-key, customuid-publishsource, authAppApiKey, 应用独立授权, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, database]
sources:
  - ".agents/design/api/app-api-key.md"
  - "packages/service/support/openapi/auth.ts"
  - "packages/service/support/permission/auth/common.ts"
  - "packages/service/support/permission/type.ts"
  - "packages/service/support/permission/app/auth.ts"
  - "projects/app/src/service/support/permission/auth/chatCompletion.ts"
  - "packages/global/openapi/core/chat/completion/api.ts"
  - "projects/app/src/pages/api/v1/chat/completions.ts"
  - "projects/app/src/pages/api/v2/chat/completions.ts"
  - "packages/service/core/chat/auth.ts"
  - "packages/service/core/chat/utils/prepare.ts"
  - "packages/service/core/chat/publishSource/service.ts"
  - "projects/app/src/pages/api/core/dataset/detail.ts"
  - "projects/app/src/pages/api/core/app/update.ts"
  - "projects/app/src/pages/api/support/openapi/health.ts"
  - "packages/global/openapi/support/openapi/api.ts"
  - "packages/service/common/http/entry.ts"
  - "packages/service/common/response/index.ts"
routes:
  - "POST /api/v1/chat/completions"
  - "POST /api/v2/chat/completions"
  - "GET /api/core/dataset/detail"
  - "PUT /api/core/app/update"
  - "GET /api/support/openapi/health"
related:
  - "FG-INTEGRATION-OPENAPI-001"
  - "FG-INTEGRATION-OPENAPI-002"
  - "FG-CHAT-HISTORY-FEEDBACK-003"
baseline: "d09b4e8849d051182ef4011470945d2b71085807"
---

# 应用 Key 独立授权、绑定应用与接口范围隔离

## 用例简介

应用 Key 自身授权绑定应用的对话与对话管理，创建人被移除应用权限后仍应能调用。它不能借创建人、请求 appId 或兼容后缀访问其他应用，也不能进入未接受应用 Key 的管理接口；个人密钥继续受成员权限约束。

## 前置准备

- 自动执行约定见 [应用 Key 脚本配置](../../../skills/system/fastgpt-integration-test-runner/references/app-key-cases.md)。脚本仅在 marker 匹配的独立数据库准备资源，每个子场景重新建立基线；固定回显模板和登录材料由显式夹具提供，沿用本例所有响应、持久化与清理断言。

- D0 复用 OPENAPI-002 的独立 T/W 与 A，A 为普通 active 成员且不是应用/团队 owner，创建时拥有 W 管理权限及合法 Ka（type=app,appId=W）、个人 Pa。由 owner 撤销 A 对 W 的直接、组织/组及继承授权，确认 Pa 不能访问 W；A 仍在团队且 Ka 本身有效。另备 A 可访问的同团队 X、另一团队 Y，以及 A 可读取的临时知识库 D，避免“拒绝”仅由原成员权限不足造成。
- W 发布可控回显工作流：输出 RUN 与系统变量 userId，不依赖随机模型文案。每个独立输入用新 chatId，Ka 的自定义用户为 RUN-u1。复用 OPENAPI-001 的协议和 UID 观测方法，不重跑完整长度/类型矩阵。基线请求：`{chatId:'RUN-Ax',customUid:'RUN-u1',messages:[{role:'user',content:'probe'}],stream:false,detail:true}`。
- 保存真实 Key 值于环境变量。实际 body/suffix 中替换真实 ID；Authorization-only 请求无登录 Cookie。health 当前通过 query.apiKey 接收凭证，只在受控环境读取，原始 URL/日志/截图不对外留明文证据。
- 类型开关行使用隔离服务集成：在真实测试 Mongo 放置 Ka/Pa，直接调用实现后的 parseHeaderCert、传入真实 Node 请求及服务端鉴权参数，不 mock 凭证/数据库，不新增 HTTP 测试后门。此行只证明认证类型的接受/拒绝；绑定范围仍须真实 HTTP 验证。
- 证据：JSON completions 为根响应对象，SSE 检查完整事件、错误与终止；其他接口检查 NextAPI 的 HTTP 与 code/data。主库 chats/chatitems 按本次 teamId、appId 和 chatId 白名单读；日志库 app_chat_logs 允许 1 秒轮询、最长 30 秒等到实际保存。拒绝行不应新增业务会话/消息/本轮运行统计；Key 最近使用时间和请求日志允许变化。
- 有效性行使用独立 Ka 副本：不存在的凭证、已过期和用量已大于上限的商业版 Key；不要在未定义的“恰好等于上限”上自定预期。没有商业版限制环境时对应变体阻塞。清理临时资源、权限变更和服务夹具，绝不撤销共享成员授权。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| A1 | 核心边界；Ka 创建后撤销 A 的 W ACL | 用 Ka 对 W 发起 v1/v2 × JSON/SSE 四个代表请求，再用 Pa 发等价请求；由 owner 核对 A 的实际权限，读取 Ka 和新会话。 |
| A2 | 应用 ID 边界；恢复 D0，每变体新 chatId | 对 Ka 测：body=W；省略 body appId/无后缀；只带正确后缀 W；body=W+后缀=X；body=X+后缀=W；仅 body=X；body/后缀指定 Y。另对有 W/X 权限的个人密钥测 body=W+后缀=X。 |
| A3 | 类型接受边界；隔离服务夹具 | Ka/Pa 分别经过开关组合 `(authApiKey,authAppApiKey)=(false,false)/(true,false)/(false,true)/(true,true)`，每次新请求；未配置开关分别按默认值处理。再在 A4 的 HTTP 请求中伪造 `authAppApiKey:true`，验证客户端不能开启入口。 |
| A4 | 接口范围；A 对 X/D 有权限，Ka 仅绑定 W | 用 Ka 读取 D、修改 W 应用配置，并调用已支持的会话接口但指定真实 Skill 或 Builder/Helper target；操作前先由有权凭证/登录态验证输入合法。伪造 flags、换请求 appId 重试。Key 管理拒绝复用 OPENAPI-002 M3。 |
| A5 | 身份与来源；新会话，另备绑定 W 的 Kb | Ka 携带 RUN-u1 完成并续聊；再用 Kb 续聊同一 W/chatId/UID。另以 Ka 单独传 authProxy，以及 customUid+authProxy 同传。 |
| A6 | 凭证有效性；每变体独立 Ka 副本 | 无效/过期/超额 Key 分别调用 W 并查询 health；有效 Ka 对照。团队/应用删除即时失效由 TEAM-001 的删除行验证，不在此重复。 |

## 预期结果

公共断言：允许路径必须实际执行回显并存储预期结果，不能仅返回空成功。应用 Key 不依赖创建人的应用 ACL，但所有资源操作都保持团队/绑定应用范围；tmbId 的归属记录不能被请求伪造。错误码按发布契约核对，未定具体编码时只记录实际拒绝响应及无越权业务副作用，不以缺 error 日志证明未执行。

| 子场景 | 特有预期 | 证据获取方式 |
| --- | --- | --- |
| A1 | 四条 Ka 路径仍成功，Pa 因 A 无 W 权限拒绝。Ka.tmbId 仍为 A，不靠改成 owner/补 ACL 通过；新 chats.tmbId=A，outLinkUid/userId=RUN-u1，publishSource=api/Ka._id。 | 撤权前后 ACL/有效权限、两类响应、Ka/Chat/item/统计快照。 |
| A2 | Ka 省略 appId、指定相同或不同的 body/后缀均成功，实际只执行绑定的 W，不写入 X/Y。个人密钥保持 body 优先，矩阵对照执行 W。 | 输入矩阵、实际执行 appId、W/X/Y 每个新 chatId 的差集。 |
| A3 | Ka 仅在 authAppApiKey=true 时通过类型认证，Pa 仅在 authApiKey=true 时通过；均开启才接受两类。缺省不隐式接受。HTTP 客户端伪造开关不能改变服务端策略。 | 真实服务调用参数/返回和认证记录；A4 的拒绝 HTTP 证据。 |
| A4 | 即使创建人有 D 或其他应用权限，Ka 仍不能调用这些接口或辅助对话；不返回配置/知识库/外域会话内容，不修改其数据。日志/文件等已确认对话管理范围由 HISTORY-FEEDBACK-003 验证，不因“管理”二字一概拒绝。 | 有权输入对照、Ka 拒绝响应、目标白名单快照。 |
| A5 | 同绑定应用不要求同一 Key：续聊成功，最近来源更新到 Kb，UID 不变，tmbId 沿用现有 preChat 规则，不把 Kb._id 当使用者。应用 Key 的 authProxy 单传也拒绝；互斥参数按已发布 schema 拒绝；不代理成员执行。 | 连续响应、来源/身份快照；参数全矩阵复用 OPENAPI-001。 |
| A6 | 无效/过期/超额 Key 不执行工作流，health 不能仅因数据库有记录就返回 valid=true；有效 Ka 返回自身 type/appId 和既有字段，不泄露其他 Key。额度限制仅按实际支持版本验收。 | completions/health 的实际响应、业务零差集及限制快照。 |
