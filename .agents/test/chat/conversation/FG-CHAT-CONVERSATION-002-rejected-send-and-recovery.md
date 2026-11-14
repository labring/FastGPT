---
case_version: 1
id: "FG-CHAT-CONVERSATION-002"
title: "被占用拦截的发送回填草稿并恢复原轮次"
business: "chat/conversation"
types: [api, ui, e2e, integration]
category: abnormal
scenario: failure
priority: P0
status: ready
tags: [pr-8044, generation-conflict, draft, stream-resume, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, ui, database, cache, storage]
sources:
  - .agents/design/bug/stream-resume-stale-reset.md
  - packages/dal/redis/lease/chat/chatGenerationLease.ts
  - packages/service/core/chat/generationLease.ts
  - packages/service/core/chat/utils/prepare.ts
  - packages/global/core/chat/error.ts
  - packages/global/common/error/code/chat.ts
  - packages/service/common/response/index.ts
  - projects/app/src/web/common/api/fetch.ts
  - projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useChatGenerate.ts
  - projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useChatResume.ts
  - projects/app/src/components/core/chat/ChatContainer/ChatBox/utils/resume.ts
  - projects/app/src/pages/api/core/chat/resume.ts
routes:
  - "POST /api/v2/chat/completions"
  - "GET /api/core/chat/resume"
related: [FG-CHAT-CONVERSATION-001, FG-CHAT-CONVERSATION-003, FG-INFRA-RUNTIME-001]
baseline: "5a5211f70998f5311cd40b0e5362a1414be6fbdf"
---

# 被占用拦截的发送回填草稿并恢复原轮次

## 用例简介

另一端正在生成 A，但当前页面允许输入时，发送 B 会被服务端拒绝。B 应像发送失败一样撤销消息占位，将文字与附件回填为草稿，再恢复 A 的内容；不能等待一条从未写入数据库的 B。

## 前置准备

- 复用 FG-CHAT-CONVERSATION-001 的 D0、限定查询和清理方式；每行使用新 chatId。两个窗口登录同一测试身份，当前页面启用产品自带自动恢复。
- B 为带 RUN 的独特文本，附一个通过真实上传入口成功上传的小文件；记录其 file key、名称及大小，不把文件本体或真实凭证写入用例。B 的请求消息 ID 与 A 不同。
- 在测试专用 HTTP 代理中只延迟 B 的冲突响应、历史读取或恢复连接；能按请求放行及返回一次 HTTP 503。它是测试夹具，不是产品新增接口。需要主动制造本地空闲时，只在测试页面临时模拟状态响应，不修改服务端 A 的 lease；保存被替代的响应与操作记录。
- D1：A 已有持久化占位并在 gate 等待，页面可能加载过 A。D2：A 的 lease 已取得，但通过暂停 Mongo 事务提交让占位尚不可见；只对独立测试数据库制造该时序。
- 交互变体：工作流依次包含表单输入、gate、选项交互、固定答案；记录原 AI dataId。旧协议变体仅在独立 Redis 中放置短 TTL 纯 token，不能将没有元数据的历史响应当作新协议。
- 恢复默认最多刷新 10 次、间隔 100ms；检查“恢复成功”须看到目标 A 或完整终态。gate 最长 120 秒；测试网络故障撤除后重新进入会话完成补证，不能将草稿保留等同于恢复成功。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 异常场景；D1，A 正在生成 | 当前页面发送 B；分别记录 JSON 错误路径与已建立 SSE 后的 error 路径，再以产品 UI 验证一次文字和附件回填。 |
| C2 | 边界场景；D1，A 已加载且本地标为完成 | 发送 B，保持服务端 A lease 有效；放行冲突响应，观察首次历史刷新是否接受同一 A ID，再放行 A。 |
| C3 | 边界场景；D1 | 暂存 B 的明确占用响应；先放行 A，等 A 落库、lease 释放，再交付已产生的冲突响应。 |
| C4 | 边界场景；D2 | 发送 B，被拒后先让历史刷新看不到 A；在刷新预算内提交 A 占位。另一个新 chatId 超过刷新预算仍不提交，保存失败现场后恢复数据库。 |
| C5 | 边界场景；D1 | 暂存 B 响应，在输入框编辑新草稿 C 后放行。独立变体在恢复请求期间切至另一会话并输入 D，再交付旧会话的成功或失败响应，最后切回。 |
| C6 | 异常场景；D1 | B 被拒后，仅将恢复请求返回一次 HTTP 503；确认草稿后撤除故障，重新进入原会话，待 A 完成再手动重发 B 一次。 |
| C7 | 边界场景；交互变体 | 提交表单进入 gate，此次请求携带的新 ID 与原 AI ID 不同；另一窗口发送 B。放行后继续选项交互至最终答案，检查恢复的表单值。 |
| C8 | 边界场景；旧协议变体 | 使用有效的旧纯 token lease 触发无恢复元数据的占用错误；分别检查普通新轮与复用 AI 的兼容分支，不将响应手工补成新协议。 |

## 预期结果

公共断言：每次明确占用后，B 的 dataId 在 `chatitems` 中无 Human/AI 记录，UI 撤销 B 的乐观占位；未被更新草稿覆盖时，B 的文字和附件按原内容回填。文件已上传不等于消息已发送，不要求此时删除已上传对象。按 sourceType/sourceId/chatId 限定取证，不将另一会话的结果当作 A。

| 子场景 | 验证方式 | 特有预期与证据 |
| --- | --- | --- |
| C1 | API、UI、数据库 | JSON 路径为 HTTP 409、`statusText=chatIsGenerating`、`code=504001`，`data.responseChatItemId` 指向 A；SSE 已建立时以 error 事件承载同一业务错误及 data，不能要求已发送的 HTTP 200 改为 409。客户端解析后恢复 A。保存原始响应、回填截图、消息差集和附件 key。 |
| C2 | UI、API | 同 A ID 在首次有效刷新即可接受，不重复等待 B 或强求 AI ID 变化；恢复期间 A 的内容更新，B 仍是草稿。 |
| C3 | UI、数据库 | 恢复接口直接返回已经落库的 A；既不丢最终答案，也不将 B 当成已发送或自动重发。 |
| C4 | API、UI、数据库 | 占位可见后按服务端给出的 A ID 恢复，不接受无关旧 AI；预算耗尽时不伪造 A、不插入 B，草稿仍保留，结果记恢复未完成。原任务收尾后重新进入能读取持久化 A。 |
| C5 | UI、API | 版本保护不以旧 B 覆盖新 C；旧会话迟到响应不改当前会话的内容、草稿 D 或状态。切回时各自草稿和消息归属正确，取证含切换前后页面及请求时间。 |
| C6 | UI、API、数据库 | 恢复失败时 B 仍未发送且草稿可见；依赖恢复后能读取最终 A。只有手动重发才新增 B 的一对 Human/AI，B Human 正好一条。 |
| C7 | API、UI、数据库 | 占用元数据使用 `reusePreviousAi=true`，不误用客户端新 ID；恢复复用原 AI，拒绝 B 不增加记录；已提交表单不被空重放覆盖，选项可继续且最终结果完整。 |
| C8 | API、UI | 不存在或无效元数据不被透传成目标 ID；普通兼容路径仍等待不同于 previousAiDataId 的 AI，交互兼容路径允许复用。旧协议不保证新协议的同 ID 修复，须如实记录其恢复限制，草稿不能丢。 |
