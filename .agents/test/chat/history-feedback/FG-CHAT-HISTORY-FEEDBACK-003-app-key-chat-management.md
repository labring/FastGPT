---
case_version: 1
id: "FG-CHAT-HISTORY-FEEDBACK-003"
title: "应用调用身份与会话管理隔离"
business: "chat/history-feedback"
types: [api, e2e, integration]
category: basic
scenario: success
priority: P0
status: ready
automation:
  - runner: node
    script: .agents/test/chat/history-feedback/FG-CHAT-HISTORY-FEEDBACK-003.mjs
    items: [D1, D2, D3, D4, D5, D6, D7, D8, D9, D10, D11, D12, D13, D14, D15, D16]
tags: [phase3, app-api-key, customuid-publishsource, 对话管理, 文件隔离, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, database, storage]
sources:
  - ".agents/design/api/app-api-key.md"
  - "packages/global/openapi/core/chat/api.ts"
  - "packages/service/core/chat/publishSource/service.ts"
  - "projects/app/src/service/support/permission/auth/chatCompletion.ts"
  - "packages/global/openapi/core/chat/identity.ts"
  - "packages/global/support/permission/chat.ts"
  - "packages/service/core/chat/identity.ts"
  - "packages/service/core/chat/auth.ts"
  - "projects/app/src/service/core/chat/history.ts"
  - "packages/global/openapi/core/chat/history/api.ts"
  - "packages/global/openapi/core/chat/history/index.ts"
  - "packages/global/openapi/core/chat/record/api.ts"
  - "packages/global/openapi/core/chat/record/index.ts"
  - "packages/global/openapi/core/chat/feedback/api.ts"
  - "projects/app/src/pages/api/core/chat/history/updateHistory.ts"
  - "projects/app/src/pages/api/core/chat/history/delHistory.ts"
  - "projects/app/src/pages/api/core/chat/history/batchDelete.ts"
  - "projects/app/src/pages/api/core/chat/record/delete.ts"
  - "projects/app/src/pages/api/core/chat/feedback/adminUpdate.ts"
  - "projects/app/src/pages/api/core/chat/feedback/closeCustom.ts"
  - "projects/app/src/pages/api/core/chat/record/getRecords_v2.ts"
  - "projects/app/src/pages/api/core/chat/record/getQuote.ts"
  - "projects/app/src/pages/api/core/chat/record/getCollectionQuote.ts"
  - "projects/app/src/pages/api/core/chat/record/getSpeech.ts"
  - "projects/app/src/pages/api/v1/audio/transcriptions.ts"
  - "projects/app/src/pages/api/core/chat/feedback/getFeedbackRecordIds.ts"
  - "projects/app/src/pages/api/core/chat/feedback/updateFeedbackReadStatus.ts"
  - "projects/app/src/pages/api/core/chat/inputGuide/query.ts"
  - "projects/app/src/pages/api/core/chat/init.ts"
  - "projects/app/src/pages/api/core/chat/resume.ts"
  - "projects/app/src/pages/api/v2/chat/stop.ts"
  - "packages/global/openapi/core/app/log/api.ts"
  - "packages/global/openapi/core/app/log/index.ts"
  - "projects/app/src/pages/api/core/app/logs/list.ts"
  - "projects/app/src/pages/api/core/app/logs/exportLogs.ts"
  - "pro/admin/src/pages/api/core/app/logs/getChartData.ts"
  - "packages/global/openapi/core/chat/file/api.ts"
  - "projects/app/src/pages/api/core/chat/file/presignChatFilePostUrl.ts"
  - "projects/app/src/pages/api/core/chat/file/presignChatFileGetUrl.ts"
  - "projects/app/src/pages/api/core/chat/file/presignDraftChatFilePostUrl.ts"
  - "projects/app/src/service/core/sandbox/auth.ts"
  - "projects/app/src/service/core/sandbox/access.ts"
  - "packages/global/openapi/core/ai/sandbox/api.ts"
  - "projects/app/src/pages/api/core/ai/sandbox/upload.ts"
  - "projects/app/src/pages/api/core/ai/sandbox/download.ts"
routes:
  - "POST /api/core/ai/agent/v2/createQuestionGuide"
  - "POST /api/core/dataset/data/getQuoteData"
  - "POST /api/core/dataset/collection/read"
  - "POST /api/core/dataset/collection/export"
  - "POST /api/v1/chat/completions"
  - "POST /api/v2/chat/completions"
  - "GET /api/core/chat/init"
  - "GET /api/core/chat/resume"
  - "POST /api/v2/chat/stop"
  - "POST /api/core/chat/history/getHistories"
  - "PUT /api/core/chat/history/updateHistory"
  - "POST /api/core/chat/history/markRead"
  - "DELETE /api/core/chat/history/delHistory"
  - "DELETE /api/core/chat/history/clearHistories"
  - "POST /api/core/chat/history/batchDelete"
  - "POST /api/core/chat/record/getPaginationRecords"
  - "GET /api/core/chat/record/getResData"
  - "DELETE /api/core/chat/record/delete"
  - "POST /api/core/chat/feedback/updateUserFeedback"
  - "POST /api/core/chat/feedback/adminUpdate"
  - "POST /api/core/chat/feedback/closeCustom"
  - "POST /api/core/app/logs/list"
  - "POST /api/core/app/logs/getUsers"
  - "POST /api/core/app/logs/exportLogs"
  - "POST /api/proApi/core/app/logs/getChartData"
  - "POST /api/core/chat/file/presignChatFilePostUrl"
  - "POST /api/core/chat/file/presignChatFileGetUrl"
  - "POST /api/core/chat/file/presignDraftChatFilePostUrl"
  - "POST /api/core/ai/sandbox/checkExist"
  - "POST /api/core/ai/sandbox/getTicket"
  - "POST /api/core/ai/sandbox/getHtmlPreviewLink"
  - "POST /api/core/ai/sandbox/upload"
  - "POST /api/core/ai/sandbox/download"
  - "POST /api/core/chat/history/getHistoryStatus"
  - "POST /api/core/chat/record/getRecords_v2"
  - "POST /api/core/chat/record/getQuote"
  - "POST /api/core/chat/record/getCollectionQuote"
  - "POST /api/core/chat/record/getSpeech"
  - "POST /api/core/chat/feedback/getFeedbackRecordIds"
  - "POST /api/core/chat/feedback/updateFeedbackReadStatus"
  - "POST /api/core/chat/inputGuide/query"
  - "POST /api/v1/audio/transcriptions"
related:
  - "FG-PERMISSION-RESOURCE-002"
  - "FG-CHAT-HISTORY-FEEDBACK-002"
  - "FG-CHAT-CONVERSATION-003"
  - "FG-CHAT-CONVERSATION-004"
  - "FG-PERMISSION-TEAM-001"
baseline: "feed8765429044a2f630358441e584d50f068a20"
---

# 应用调用身份与会话管理隔离

## 用例简介

业务后端以默认身份、customUid 或代理团队成员调用应用，并使用同一身份查询和管理会话、反馈及文件。本例验证应用 Key 独立授权、使用者范围与代理权限不会串用；批量物理删除按实际凭证鉴日志权限，其他用户的数据和运行不能被误操作。

## 前置准备

- 自动执行约定见 [应用 Key 脚本配置](../../../skills/system/fastgpt-integration-test-runner/references/app-key-cases.md)。脚本复用本地 dev 及已有 Mongo/Redis/S3，按本轮新建团队与资源 ID 准备和回收数据，每个子场景重新建立基线；固定回显模板和登录材料由显式夹具提供，沿用本例所有响应、持久化与清理断言。

- D0 复用 RESOURCE-002 的 T/W/Ka/Pa，A 为 active 普通成员、对 W 无应用/日志/写 ACL，Ka 有效；另备有日志权限的 owner O 作观测者。W 是独立普通应用，含 C1(A/Ka/u1)、C2(B/Kb/u2)、C3(B/online)、C4(share) 四份完成对话，各带 RUN 和两条消息，另备 Cfile、Crun。所有对话属于 W，使用者、作者、publishSource.id 有意不同。历史列表仅列 API 来源，按会话 ID 管理仍覆盖在线与分享会话。
- 对照应用 X（同 T）和 Y（异团队），各有独立 CX/CY、消息和文件，记录真实 ID/数据摘要。历史和日志查询给完整时间范围与合法分页，预期 ID 集合来自本例 manifest；getUsers/Pro 图表的真值从实际日志库 app_chat_logs 的桶计算，不用 Chat 数量硬凑统计值。
- 请求构造：应用 Key 的历史 body/query 可省略 appId；改名 body 使用 chatId/customTitle；消息详情 query 使用 chatId/dataId；消息删除为 DELETE + JSON body 的 contentId/contentIds。adminUpdate 的 datasetId/feedbackDataId/q/a 只记录管理反馈引用，不把它当成知识库写入接口。所有额外字段按实际 Zod 和真实 UI 请求样本填充，不臆造消息 ID。
- 文件行需真实 S3 上传/下载和已发布、实际可用的 App 沙盒，具有测试目录写入/清理能力；若基础设施未配置，只将该行阻塞，不伪造成功。保存上传字节及 SHA-256、返回的真实 key，沙盒使用 RUN 命名文件；不得把凭证或下载签名 URL 放入公开证据。关闭的产品态不因应用 Key 被绕过。
- 运行控制行复用 CONVERSATION-003/004 的单会话流式准备、终态与实际事件判断，只测更换鉴权为 Ka，不复制断线/竞争全矩阵。轮询每 1 秒、最长 60 秒，超时保存状态并停止重放写请求。
- 数据快照：主库 chats 按 `{teamId:ObjectId(T),appId:ObjectId(W),chatId:{$in:manifest}}`，chatitems 按 appId/chatId/dataId 白名单；保留 tmbId/outLinkUid/publishSource、标题、反馈、删除字段。日志库独立连接；允许保存延迟 1 秒轮询、最长 30 秒。只读操作可能更新已读状态，不要求所有字段绝对不变。
- 共享 dev 的 App 删除队列可能被其他分支 Worker 消费。沙盒清理显式执行当前代码的真实 deleteAppsImmediate/deleteAppDataProcessor 并核对远端 getInfo=null；不覆盖共享队列跨节点分发的端到端验收。
- 每个独立行恢复其 D0 副本；删除/清空只能针对本例独立应用副本，X/Y 为负对照且始终保留。清理本例应用、存储对象、沙盒目录、运行租约及 Key，核对本例白名单无残留。

- 应用 Key 的所有合法对话管理、日志和配套文件请求默认省略 appId（旧 sourceId 请求也可省略），由鉴权返回绑定的 sourceId 与固定 app 来源；显式传相同 appId 为兼容对照，传其他应用 ID 仍按 Key 绑定的 W 执行。个人密钥与登录态缺失目标仍拒绝；错误外链、Skill、Builder 来源不得回退成绑定应用。

- D8–D11 补充逐接口参数验收。引用夹具在本轮 Mongo 写入最小 dataset/collection/data 和 ChatItem.citeCollectionIds，不调用向量生成；接口仍执行真实引用权限、分页与时间快照逻辑。D8 的 HTTP barrier 仅接受本轮问题标识，不改 dev 租约配置。
- D10 每个标准管理接口验证 6 组成功参数：省略目标、同应用、同团队其他应用、跨团队应用、冲突 Key 后缀、显式 sourceType=app；兼容旧 sourceId 的 resume 额外验证旧协议。4 组非法格式/非 App 来源、个人密钥/登录态的省略与显式目标，以及无效 Key 共 9 组必须拒绝。每个写接口均检查真实落库；删除类各自新建会话。X/Y 保留负对照，不因显式冲突 ID 被读取或修改。
- D11 使用 dev 已配置且启用的真实 TTS/STT 模型，不改系统模型与渠道配置。TTS 经正常发布配置授权，首次生成的真实音频用于 multipart 识别；后续 TTS 矩阵复用本轮唯一文本的真实缓存，并按精确缓存键回收。识别只断言非空有效文本，不把模型自由转写逐字相等作为接口契约。
- 覆盖清单：24 个标准管理入口在 D10 逐一执行；v1/v2 completions 的参数组合由 RESOURCE-002/A1–A2 执行；TTS 与 multipart STT 在 D11 执行，合计 28 个入口。6 个旧 chat 别名只做真实 HTTP 冒烟。日志与 Sandbox 沿用 D2/D5，不重复公共鉴权组合；编辑器配置接口不属于应用 Key 开放范围。

- D12–D14 补充第三方使用者范围：仅普通 App 的 API Key 请求支持 `customUid`，精确匹配 `chats.outLinkUid`，不匹配 tmbId，也不改变凭证成员/应用授权。管理接口省略字段保留上述整应用兼容行为；续聊以首次对话绑定的使用者为准，已有 customUid 时漏传、null、空字符串或更换均拒绝，默认身份会话也不能中途改绑外部 UID；管理接口显式空字符串、null、非字符串和超 1024 字符拒绝，空白和特殊字符按原值匹配。登录态、Skill/Builder/Helper 和外链不得接受该参数后忽略。
- 使用同一应用下 U1/U2 的真实 API 会话及默认成员会话；增加“tmbId=U1 但没有 outLinkUid”的对照，证明不会回退为成员匹配。U1 的不同 Key 及不同来源对话用于区分使用者和渠道。应用 Key 的列表/清空始终仅 API 来源；按 ID 操作保持现有来源规则。单会话错误 UID 拒绝，列表/状态批量只返回授权子集，批量物理删除属于日志管理接口，不解析 customUid/authProxy，只按实际凭证鉴日志权限。
- D12–D14 使用真实本地 dev HTTP、Mongo、Redis 和 S3；音频复用 D11 的真实已启用模型。各行独立建立并回收夹具。拒绝用已知权限错误或对应字段 Zod 错误判定，不接受任意 500。不需要 UI 验收，不包含迁移。
- 草稿文件签名仍是成员写权限接口，不向应用 Key 开放。D12 验证个人密钥的默认/自定义使用者上传下载及撤权拒绝；D15 验证代理成员的 ID/username 两种输入，实际文件路径必须属于使用者而非凭证创建人。

- D15/D16 复用三种互斥身份的统一 union：Body 中 authProxy 为对象，Query 中为 JSON 字符串（使用 URLSearchParams 编码），内部均解析为同一成员对象。只支持开启代理的个人密钥，应用 Key、登录态、Skill/辅助来源及分享身份拒绝；customUid 与 authProxy 同传拒绝。ID 优先，ID 无效不回退 username，跨团队、离职及无应用权限成员拒绝。
- 代理夹具：仅在本轮临时团队将 A 暂设 owner，经正常接口创建开启代理的个人密钥后立即恢复 A 原角色；实际验收时 A 没有 W 权限，B 有应用管理权限。新会话由该 Key 代理 B 真实创建，tmbId/userId 为 B。Key 凭证仍归 A，不要求 A 有应用 ACL；列表、清空按 B 的历史范围；按 ID 读写沿用 B 实际具备的会话/日志权限；批量物理删除不读取代理身份，按实际凭证检查日志权限，不能借用创建人权限或由 API 清空兼容逻辑扩大范围。成员、角色及 Key 全部属于本轮清单并清理。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| D1 | 基础；D0 全部完成对话 | Ka 省略 appId/sourceType 调历史列表；隐式传 source=api/online，再显式传冲突 appId/source 作对照。按 ID 逐一调用 C1～C4 的 init、分页消息与消息详情。 |
| D2 | 日志管理；D0，桶已完成保存 | Ka 查询 logs/list、getUsers、导出和匹配 Pro 图表；用 Pa 做日志读取拒绝对照。保留调用渠道/渠道名/使用者及鉴权者的既有展示口径。 |
| D3 | 管理写入；独立 D0 的 C2 | Ka 改 customTitle、标记已读，提交用户反馈和管理反馈引用，再关闭预置 customFeedback；每一步重新查询记录。检查 closeCustom 与 init 的二次鉴权路径。 |
| D4 | 运行控制；Crun 使用既有可控流式基线 | Ka 对当前 W/Crun 做 resume 读取与 stop，再检查终态。只改变凭证，不再执行已被既有用例覆盖的停止竞争/断线全流程。 |
| D5 | 文件；独立 Cfile，A 无写 ACL | Ka 请求上传参数并按返回协议上传固定文件，再通过实际 key 下载校验内容；在该 App 会话沙盒上传/下载 RUN 文件。用同 A 的 Pa 做拒绝对照；关闭沙盒产品态后再次请求。 |
| D6 | 隔离；恢复 D0 与外域快照 | Ka 显式指定 X/Y 读取/改名/删除/导出；另保留 appId=W，混入 CX/CY、外域 dataId 或外域/其他会话 S3 key；批量请求混合合法与外域 ID。 |
| D7 | 删除；四个互相独立的 W 副本 | 分别做单消息软删除、单会话软删除、批量会话资源删除；另一个副本做清空历史，预置不同 tmbId/UID/来源/Key 的会话。所有删除均先存待处理 ID 集合，完成后用 owner 与只读查询复核。 |
| D8 | 查询与筛选；真实 3 轮会话、已读/未读反馈与运行中会话 | 查询状态、链式消息分页，切换 includeDeleted、反馈类型和 unreadOnly；更新反馈已读，再查统计标记；输入引导使用含正则字符搜索词；验证空/超限/错误类型。 |
| D9 | 引用；真实会话引用 5 段文档 | 读取指定引用和文档前后分页；改写文档保留历史后读取会话时点版本；混入其他会话、错误消息与分页超限。 |
| D10 | 公共鉴权参数；各接口的有效业务入参 | 按上述矩阵逐一调用 24 个标准入口，校验响应内容/落库和 X/Y 零差集；6 个旧别名执行真实 HTTP 冒烟。 |
| D11 | 音频；真实已启用模型和已发布 TTS 配置 | 真实 TTS 生成、缓存回读与 multipart STT 转写；验证公共目标/凭证矩阵、旧 model/sourceId 协议、非法 voice/speed 和缺失 duration。 |
| D12 | 使用者列表与续聊；U1/U2/默认成员及同值 tmbId 对照 | U1 查询列表/批量状态和分页；未传、不存在、特殊字符和 1024 边界对照；个人密钥显式 appId 同样筛选。v1/v2 各续聊同 UID；分别漏传、传 null/空字符串/错误 UID，并尝试将默认会话改绑外部 UID，比较拒绝前后记录。验证非法参数及不适用身份/来源；先上传/预览文件，再创建同 UID 会话并下载。 |
| D13 | 逐接口范围；复用 D10 有效业务参数及真实文件/引用夹具 | 对 23 个会话接口补充同 UID 成功及错误 UID 拒绝/过滤；3 个知识库引用跳转/原文件/CSV 接口验证同 UID、错 UID 及缺少会话上下文不可降级访问。删除类单独建记录；批量物理删除不纳入使用者范围矩阵，在 D7/D15 按日志权限验证；清空只清该 UID 的 API 会话，其他 UID 和在线来源保留。 |
| D14 | 运行及配套接口；真实 barrier 会话、音频与沙盒入口 | U1 运行中尝试 U2 resume/stop，再 U1 恢复/停止并等待终态。TTS/STT 使用真实音频验证传入 UID；对带 chatId 的音频、沙盒入口校验错误 UID 在下游调用前拒绝，沙盒关闭态继续受产品配置约束；再在本轮应用开启真实沙盒，按 U1 上传下载并核对实例 userId=U1。 |
| D15 | 代理成员管理；复用 D10 的 24 个入口和文件/引用夹具 | 除批量物理删除外，每个入口分别用成员 ID、username 成功调用，补充 3 个引用跳转路由的真实正文/URL/CSV 与拒绝对照；以未开启代理的个人密钥和应用 Key 拒绝对照。降低 B 为只读后混入其他成员 chatId 验证拒绝，再恢复权限；批量物理删除忽略 customUid/authProxy，实际调用者 A 无日志权限时拒绝且零写入，授予 A 日志权限后即使 authProxy 指向无权限成员也成功物理删除，清空仅影响 B/API；B 完全失去应用权限时，init 拒绝且 A 的 app_records 不变；集中验证 JSON Query、错误 JSON、对象/字符串混用、互斥、跨团队、离职、ID 优先及无权限成员。 |
| D16 | 代理运行及配套服务；B 的真实 barrier 会话和音频 | Key 创建人 A 无应用权限，代理 B 恢复/停止并等待租约释放；读取 B 会话文件。问题引导使用已配置默认 LLM 真实执行并核对用量归属 B；真实 TTS/STT 以代理身份成功执行；沙盒会话鉴权不退回 A，错误代理成员在连接服务前拒绝；开启本轮应用沙盒后代理 B 上传下载，实例 userId 必须为 B 而非 Key 创建人 A。 |

## 预期结果

公共断言：Ka 的授权范围是团队+绑定应用；可选 customUid 进一步缩小到精确使用者，不能扩大授权，也不是独立凭证。不传时不按创建人或 publishSource.id 限制。读取不改变最新调用渠道，修改只产生对应业务字段变化；仅真正运行的轮次产生运行消耗，不能要求全部操作一律“用量不变”。API 成功须有数据/文件/状态变化证据，错误或空成功不能证明管理能力可用。

| 子场景 | 特有预期 | 证据获取方式 |
| --- | --- | --- |
| D1 | getHistories 固定只返回 C1/C2 两个 API 来源；省略 appId 时不接受 source，显式冲突 appId/source 也不能覆盖绑定及 API 来源。按 ID 仍可访问 C1～C4，不向 A 补 ACL；消息内容与真实集合一致。 | 列表及拒绝响应、分页合并去重、消息详情与 DB。 |
| D2 | 无成员日志权限的 Ka 仍能读取绑定应用全部授权日志/导出/统计，Pa 仍受成员权限限制。CSV 与列表同筛选 ID 集合，图表等于日志桶的既有聚合口径；不要求 CSV 行数等于桶数。渠道名兼容与列行为复用 HISTORY-FEEDBACK-002，不重复完整展示矩阵。 | 实际 JSON、解析 CSV、日志桶真值及 Pro 提交记录。 |
| D3 | 每步落在 C2 目标记录；标题/已读/反馈按接口职责变化，closeCustom 能完成事务及反馈计数更新，不因仅登录态二次鉴权失败。管理反馈只保存引用，不产生未授权知识库修改；身份/来源不因管理请求改成 A/Ka。 | 每步字段差集、反馈计数、事务后重读；失败时精确定位到步骤。 |
| D4 | Ka 可读取或停止绑定应用的运行；终态和重复读取遵循既有运行控制契约，stop 返回 accepted/success 不等于后台已收尾。不得因 A 缺成员 ACL 拒绝或停错另一个应用会话。 | SSE、stop 响应、实际生成状态与消息终态。 |
| D5 | 上传/下载真实完成，字节数和 SHA-256 一致；App 沙盒写入不因 A 缺应用写权限拒绝。Pa 按原成员权限拒绝；关闭的沙盒仍被产品可用性层拒绝。文件使用会话 uid，交接场景复用 TEAM-001，不重做 UID 全矩阵。 | S3 返回协议/内容摘要、沙盒文件响应、权限对照与关闭态响应。 |
| D6 | 显式 X/Y 不覆盖 Key 的绑定，仍只作用于 W；只混入外域 chatId/dataId 的查询不返回外域数据，修改/批量操作仅能影响 W 内匹配集合。未命中是拒绝还是空结果按实现后的单接口契约核对；不能只因成功 envelope 就断言发生越权。文件 key 不属于目标应用/会话时拒绝签名，不签发外域 URL。 | X/Y 与非目标会话零差集、W 合法差集、无外域正文/签名 URL。 |
| D7 | 消息/单会话按当前软删除规则处理；batchDelete 按既有资源清理流程完成，可管理 W 内不同来源的明确目标。clearHistories 只清 API 来源的目标集合，不因成员/UID/Key 不同漏项，不越过 W/team；getHistories 只列仍可见的 API 来源，owner 日志保留软删除记录；删除 ID 差集精确等于目标集合，X/Y 不变。 | 删除前清单、可见列表与主库状态；资源清理 1 秒轮询、最长 60 秒，超时失败或环境阻塞。 |
| D8 | 状态 0→1 由真实租约决定；游标返回精确消息集合，includeDeleted 改变可见数量；good/bad/has_feedback 与 unreadOnly、已读更新及统计标记一致；A+B 按字面搜索，非法类型/分页上限拒绝。 | HTTP、Mongo、Redis、真实 barrier 与 SSE。 |
| D9 | 返回指定引用及正确前后邻段，会话时点仍读取历史正文；没有当前会话引用关系、错误消息和超限分页拒绝，不泄漏其他文档。 | 真实引用响应、ID/正文对照、历史版本和拒绝结果。 |
| D10 | 每个入口均从 Key 推导绑定 W；显式 X/Y 或 Key 后缀不能改变目标，非法来源、无效 Key，以及省略或显式目标但无应用权限的个人/登录凭证拒绝。写入具有实际效果，X/Y 无差集。旧别名真实 HTTP 与共用 handler 口径一致。 | 按 route/method/variant 记录通过点、请求响应与字段/集合差集。 |
| D11 | TTS 返回真实二进制并与后续缓存回读摘要相同；真实 multipart STT 返回非空文本；目标绑定不被显式冲突覆盖；缺失目标的个人/登录身份和非法来源拒绝；兼容字段及音色/速度/duration 边界按契约处理。 | 音频长度/SHA-256、转写、请求参数与错误，不公开音频签名或凭证。 |
| D12 | 列表 total/分页与状态集合只含 U1 的 API 会话；不存在 UID 返回空，不回退 tmbId。省略保持原集合。v1/v2 同 UID 续聊成功，漏传、空值或错误 UID 均不读历史、不改归属/来源、不新增消息或运行，默认身份会话不能改绑外部 UID；非法参数和不适用组合拒绝；首次上传采用 U1，建会话后真实下载摘要一致。 | HTTP 精确集合、完整主表/消息快照，Redis 租约及响应。 |
| D13 | 23 个会话入口都真正传递并执行 customUid（含个人密钥关闭自定义反馈，不得额外要求 Cookie）：同 UID 返回实数据或落库，错误 UID 不泄露正文/文件 URL、不修改他人记录；批量物理删除由 D7/D15 按实际凭证日志权限验证。清空只改变 U1/API 集合。已有会话上传下载采用该使用者路径，真实文件摘要一致。 | 按 route/method/variant 保存实际结果、Mongo 精确差集和 S3 SHA-256。 |
| D14 | 错误 UID 无法恢复/停止运行，原租约仍在；正确 UID 完成恢复停止与 lease 释放。音频正常完成，带 chatId 时错 UID 拒绝；沙盒所有会话入口均校验用户，不能以关闭产品态掩盖越权鉴权；开启后真实上传下载摘要一致且实例 userId 为 U1。 | SSE、真实租约与终态、音频摘要/转写和沙盒拒绝响应。 |
| D15 | 23 个使用者入口按 B 权限执行且有实数据/落库；批量物理删除不读取代理身份，Query JSON 与 Body 对象解析一致；A 无 ACL 不导致失败。不同身份模式及无效成员不能降级；列表只含 B，实际调用者无日志权限时批删零写入，传有权限成员的代理字段不能提权；实际调用者有日志权限时按选中 ID 物理删除；有日志权限时保留其他入口的跨成员按 ID 管理能力，清空保留其他成员及 B 的在线会话。 | route/method/身份参数矩阵、主表及子表精确差集、S3 摘要与角色恢复记录。 |
| D16 | B 的有效代理可恢复、停止真实运行并释放租约；音频和文件走 B 身份，沙盒权限检查不改回创建人 A；错误成员拒绝且不影响运行/数据；真实沙盒文件摘要一致且实例 userId 为 B。 | SSE、Redis 租约终态、音频字节摘要/转写、文件和沙盒响应。 |
