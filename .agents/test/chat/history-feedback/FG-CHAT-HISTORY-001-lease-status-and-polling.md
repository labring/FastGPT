---
case_version: 1
id: "FG-CHAT-HISTORY-001"
title: "会话列表的批量状态、权限过滤与轮询失败恢复"
business: "chat/history-feedback"
types: [api, ui, integration]
category: boundary
scenario: special
priority: P0
status: ready
automation:
  - runner: node
    script: .agents/test/chat/history-feedback/FG-CHAT-HISTORY-001.mjs
    items: [C2, C3, C4, C5, C7]
tags: [pr-8044, history-status, polling, permission, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, ui, database, cache]
sources:
  - projects/app/src/pages/api/core/chat/history/getHistoryStatus.ts
  - projects/app/src/pages/api/core/chat/history/getHistories.ts
  - projects/app/src/service/core/chat/history.ts
  - packages/global/openapi/core/chat/history/api.ts
  - packages/global/openapi/core/chat/api.ts
  - packages/service/core/chat/generationLease.ts
  - packages/dal/redis/lease/chat/chatGenerationLease.ts
  - projects/app/src/web/core/chat/history/api.ts
  - projects/app/src/web/core/chat/context/chatContext.tsx
  - packages/service/core/ai/skill/debugChat.ts
  - pro/admin/src/pages/api/core/chat/chatAgentHelper/completions.ts
  - pro/admin/src/service/core/ai/workflowBuilder/handler.ts
  - projects/app/src/pageComponents/dashboard/skill/detail/preview/SkillPreview.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/ChatPanel.tsx
  - projects/app/src/pageComponents/app/detail/Edit/ChatAgent/ChatTest.tsx
routes:
  - "POST /api/core/chat/history/getHistories"
  - "POST /api/core/chat/history/getHistoryStatus"
  - "POST /api/proApi/core/ai/skill/debugChat"
  - "POST /api/proApi/core/chat/chatAgentHelper/completions"
  - "POST /api/proApi/core/workflow/builder/chat"
related: [FG-CHAT-CONVERSATION-001, FG-INFRA-RUNTIME-001, FG-INFRA-DATABASE-001]
baseline: "5a5211f70998f5311cd40b0e5362a1414be6fbdf"
---

# 会话列表的批量状态、权限过滤与轮询失败恢复

## 用例简介

会话列表通过批量读取 lease 显示运行中或空闲，同时保留 Mongo 提供的标题、已读和时间。轮询失败时整个旧快照应保持，依赖恢复后继续更新；批量接口不能泄露当前身份无权查看的会话。

## 前置准备

- 执行方式：C2–C5、C7 使用脚本；**C1、C6 由 AI 按真实入口执行**。C1 使用本地 dev + Pro 的普通 App、Skill 调试、ChatAgentHelper 和 WorkflowBuilder；C6 使用真实桌面浏览器，包含在途不叠加、切换到其他标签页/最小化后的真实隐藏及恢复刷新。记录实际 `document.visibilityState`、Network 时间线和截图，不覆盖可见性属性或冻结计时器。

- 脚本配置见 [流、列表与数据库测试配置](../../../skills/system/fastgpt-integration-test-runner/references/stream-history-database.md)。环境准备器为脚本通过正常接口创建 201 条历史。C1 由 AI 在本地 dev + Pro 创建独立测试资源并选择实际可用模型；Skill 调试另需 sandbox ready，不将普通工作流 gate 当作辅助生成入口的准备条件。

- C2 复用 FG-CHAT-CONVERSATION-001 的查询和清理；准备当前成员两个会话（A busy、B idle）、同应用其他成员会话、其他团队/资源会话、已软删除会话和不存在的 chatId。保存各自访问范围，不因账号有应用读权限就认定能看他人成员历史。
- C3、C5 另建 201 个当前成员可见的独立测试会话，通过正常分页滚动加载；记录 chatId、title、top、updateTime、hasBeenRead、chatGenerateStatus 原快照。测试长列表不能只向单个 HTTP 请求塞 201 项代替客户端分批。
- 状态请求 App 用 `{appId, chatIds}`；Skill 用 `{skillId, chatIds}`；Helper/Builder 用 `{appId, sourceType, chatIds}`。外链使用真实 shareId/outLinkUid 身份构造，不在请求体虚构内部 sourceId 字段。
- 网络代理能按状态请求返回一次 503、阻断为网络错误或延迟超过 5 秒；第二批失败只故障第二个 HTTP 请求。Redis MGET 故障使用私有实例命令代理，不影响无关业务。
- 取证：Network 保存每批去重后的 IDs、起止时间和响应；Redis 命令代理只记录本轮 key 与命令数，认证内容脱敏。监测组件状态可在测试浏览器调试器中读取既有 React/Zustand 状态，不新增产品调试接口。
- 每次故障移除后最多观察 15 秒（含一次 5 秒重试及网络余量）；隐藏页场景观察两个轮询周期。每行独立恢复原列表快照与可见标签页。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础场景；A busy、B idle | 打开列表并调用状态 API；结束 A，观察侧栏变为空闲。普通 App 在会话列表验证；Skill 调试、ChatAgentHelper、WorkflowBuilder 分别通过真实生成入口建立会话，用各自 target 请求列表/状态 API，核对各自面板实际运行状态。辅助生成面板没有统一会话侧栏，不要求不存在的 UI 列表或轮询。 |
| C2 | 边界场景；限定可见与不可见数据 | 同一合法资源请求混合可见、其他成员、已删除、不存在 chatId；再用无权身份请求其他资源。外链另切换 outLinkUid 对照。 |
| C3 | 边界场景；201 条已加载历史 | 调用页面实际状态读取，包含重复 ID；独立发送 200、201、空数组和空字符串 ID 的真实 HTTP 请求，区分客户端空集合优化与 API 入参约束。 |
| C4 | 异常场景；busy/idle 两种快照独立执行 | 首次状态请求分别注入 HTTP 503、网络错误和 Redis MGET 失败；恢复依赖并改变 A 的真实 lease 状态，等待自动重试。 |
| C5 | 异常场景；201 条旧快照 | 第一批返回与旧值不同的合法状态/元数据，第二批失败；截图并对比整轮快照，再恢复第二批让下一轮完整成功。 |
| C6 | 边界场景；A busy | 将一轮请求延迟超过 10 秒；期间观察定时器和在途请求。再隐藏标签页至少 10 秒，恢复可见，观察刷新。 |
| C7 | 边界场景；旧请求被代理暂存 | 切换应用/会话来源或卸载列表后，分别交付旧成功响应、旧错误响应；观察当前列表及重试。 |

## 预期结果

公共断言：状态范围只有 `0=generating`、`1=done`，不是消息成功/失败判据。Mongo 先过滤可见会话，再一次 MGET 对应 lease；单批不逐个 GET。空的内部 ID 列表不访问 Redis。按实际身份范围判断“不返回”，不以 UI 隐藏代替 API 权限验证。

| 子场景 | 验证方式 | 特有预期与证据 |
| --- | --- | --- |
| C1 | API、UI、缓存 | 各来源均有 lease 为 0、无 lease 为 1。普通 App 的侧栏约每 5 秒同步，busy 时已读展示为 false，全部空闲后停止轮询且标题/置顶保留；辅助入口用真实 API 核对来源隔离与状态，并核对面板实际运行/完成状态，不将没有侧栏视为失败。 |
| C2 | API、数据库、缓存 | 返回集合精确等于授权且未删除的请求会话集合；不可见 chatId 不进入 MGET。资源无权按实际鉴权响应拒绝，外链 UID 之间不泄露状态和元数据。保存 IDs 差集及命令记录。 |
| C3 | API、缓存 | 客户端先去重，最多 200 项一批，201 个不同 ID 分两批顺序读取并合并；结果各 ID 对应正确。直调 API 的 201 项、空数组、空 ID 校验失败，合法 200 项可读取；客户端空输入不发 HTTP 请求。 |
| C4 | UI、API | 每类失败都静默保留整个原快照，不把 busy 改 idle，也不覆盖 hasBeenRead/updateTime。初始全 idle 时首轮失败也启动重试；健康结果到达后更新为真实状态，确认全 idle 才停止重试。Redis 读取失败由严格接口上抛，不能返回成功的假 idle 列表。 |
| C5 | UI、API | 第二批失败时第一批的状态、已读和时间均不提交；整轮旧快照完全一致。下次两批成功后才统一更新，不混入失败轮次的局部结果。 |
| C6 | UI、API | 前一轮未完成不叠加新轮询；隐藏页暂停定时请求（已经在途者可结束），可见时触发一次刷新，不产生多套定时器。 |
| C7 | UI、API | 旧成功与旧错误都不能污染新资源列表或其重试状态；卸载后不再发起旧轮询。当前资源仍按自己的状态正常刷新。 |
