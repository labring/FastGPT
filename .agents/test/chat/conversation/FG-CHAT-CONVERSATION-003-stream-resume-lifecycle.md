---
case_version: 1
id: "FG-CHAT-CONVERSATION-003"
title: "流镜像按需启用与断线后的完整恢复"
business: "chat/conversation"
types: [api, ui, e2e, integration]
category: basic
scenario: success
priority: P1
status: ready
tags: [pr-8044, stream-resume, opt-in, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, ui, database, cache]
sources:
  - packages/service/core/chat/resume.ts
  - packages/dal/redis/lease/chat/streamResume.ts
  - packages/global/openapi/core/ai/api.ts
  - packages/global/openapi/core/ai/index.ts
  - packages/global/core/workflow/runtime/constants.ts
  - projects/app/src/pages/api/core/chat/resume.ts
  - projects/app/src/pages/api/v1/chat/completions.ts
  - projects/app/src/pages/api/v2/chat/completions.ts
  - projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useChatResume.ts
  - projects/app/src/components/core/chat/ChatContainer/ChatBox/utils/resume.ts
routes:
  - "POST /api/v1/chat/completions"
  - "POST /api/v2/chat/completions"
  - "GET /api/core/chat/resume"
related: [FG-CHAT-CONVERSATION-001, FG-CHAT-CONVERSATION-002, FG-INFRA-RUNTIME-001]
baseline: "5a5211f70998f5311cd40b0e5362a1414be6fbdf"
---

# 流镜像按需启用与断线后的完整恢复

## 用例简介

需要恢复的流回复主动开启镜像，浏览器断开后后台执行和租约继续运行。重连应从缓存补齐已有内容并跟随后续输出；没有镜像或镜像不可用时，也应正确等待、读取持久化结果并结束连接。

## 前置准备

- 复用 FG-CHAT-CONVERSATION-001 的数据隔离、鉴权、查询和清理；D0 增加两个 gate：先输出 RUN 的第一段，再等待，再输出第二段。需要 replay 分页时用受控输出产生至少 51 条实际缓存事件。
- 记录 `STREAM_RESUME_TTL_SECONDS`、`STREAM_RESUME_POST_COMPLETE_TTL_SECONDS`、内存阈值和检查缓存间隔；不把 mirror TTL 写成 lease 的 60 秒。使用 `getStreamResumeRedisKeys`/adapter 确认物理 key，读取 `XRANGE/XLEN/TTL` 和 active/unavailable 状态。
- App 请求使用实际 appId，Skill 使用 skillId，辅助生成使用 appId 加实际 sourceType；分享恢复 GET 的 `outLinkAuthData` 按真实页面请求 JSON 序列化。凭证不写进证据正文。
- 恢复请求带 `Accept: text/event-stream`；独立变体不带该 Accept。浏览器优先使用无扩展干扰的干净会话，保存原始 SSE 与页面截图。
- 只在私有 Redis/专用实例模拟内存压力或缓存缺失；先保存本轮 key 和配置快照，测试后还原。进程退出与 Redis 读取故障的时序集中在 FG-INFRA-RUNTIME-001，不在本例重复注入。
- 正常流程最长 120 秒；无镜像等待最长按已记录 stream TTL 加 10 秒；正常收尾后的空 XREAD 状态检查允许一个 30 秒阻塞周期加 5 秒网络余量。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 边界场景；每变体新 D0 | v2 分别带 `x-fastgpt-stream-resume: 1`、不带、带 `0`；补一个 trim/大小写的有效值 ` TRUE `。v1 即使带 `1` 也单独验证。到达 gate 时读取 lease 和 mirror。 |
| C2 | 基础场景；启用镜像的 v2 | 收到第一段后断开浏览器流，保留后台进程；重新进入会话建立恢复流，放行第二段至结束。 |
| C3 | 边界场景；至少 51 条缓存事件 | 同时打开两个恢复连接，一个完成 catchup 后再次刷新；放行后续输出，比较各自回放与最终 UI。 |
| C4 | 边界场景；A 已保存并释放 lease | 在镜像尚未过期、已经过期两种状态分别恢复；另在生成中及结束后分别用无 SSE Accept 的 GET 请求恢复。 |
| C5 | 边界场景；lease 有效、未创建 mirror | 从 C1 的未启用 v2 发起 SSE 恢复，先保持 gate 再放行；另在私有 Redis 达到配置的内存阈值时启动新镜像请求，记录 unavailable reason，恢复后放行。 |
| C6 | 异常场景；新 D0、mirror 已建立 | gate 返回可控错误使生成正常走错误收尾；分别查看原流、恢复流和刷新后的消息错误信息，再开启正常下一轮。 |

## 预期结果

公共断言：流回复、mirror 和 lease 是三种独立能力。每条恢复连接按自身游标读取；恢复不能新增用户消息或启动第二次生成。以固定段落、实际事件 ID、最终持久化 AI 和页面展示比对，不能只检查连接返回 200。

| 子场景 | 验证方式 | 特有预期与证据 |
| --- | --- | --- |
| C1 | API、缓存 | 所有持久化变体都有 lease；只有支持镜像的 v2 且有效 opt-in 才写镜像，`0`/缺失不创建；v1 明确禁用镜像。键存在性和实际流内容均留证，不把无输出时的空 stream 判错。 |
| C2 | API、UI、缓存、数据库 | 浏览器断开不停止 v2 执行；lease 和 mirror 在独立周期保活。重连经历 `resumePhase: catchup` 后 `live`，既有内容与新内容完整且 UI 无重复。终态与 Mongo 一致，lease 消失，mirror 转入配置的完成后 TTL。 |
| C3 | API、UI | 超过单页的事件完整按序回放；两个连接互不消耗对方历史，刷新不会因共享游标丢内容。各自最终内容一致，数据库仍只有原轮次。 |
| C4 | API、数据库 | 已空闲时直接返回持久化 records，SSE 发送 `resumeCompleted` 和 `event: done / data: [DONE]`，不依赖缓存存活。普通 JSON GET 在空闲时返回记录；生成中不带 SSE Accept 为 HTTP 406，不启动实时等待。 |
| C5 | API、缓存、数据库 | 未启用镜像时可为空 catchup 后等待，不能把没有 stream 当作 lease 已空闲；结束后补持久化结果。内存保护不阻止生成/lease，只拒绝新镜像并发送实际 `resumeUnavailable`，等待期间有 ping，最终返回完成 records；保留阈值、reason 和完成事件。 |
| C6 | API、UI、数据库 | 错误消息/SSE 错误仍可展示，已有有效内容不被无意义空占位替换；收尾后会话状态空闲，不产生会话 error 状态或 Builder 状态错误红点。下一轮可执行，实际错误和用量允许保存。 |
