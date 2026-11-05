---
case_version: 1
id: "FG-CHAT-HISTORY-FEEDBACK-003"
title: "应用 Key 管理绑定应用的对话、日志与会话文件"
business: "chat/history-feedback"
types: [api, e2e, integration]
category: basic
scenario: success
priority: P0
status: ready
automation:
  - runner: node
    script: .agents/test/chat/history-feedback/FG-CHAT-HISTORY-FEEDBACK-003.mjs
    items: [D1, D2, D3, D4, D5, D6, D7]
tags: [phase3, app-api-key, customuid-publishsource, 对话管理, 文件隔离, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, database, storage]
sources:
  - ".agents/design/api/app-api-key.md"
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
  - "projects/app/src/service/core/sandbox/auth.ts"
  - "projects/app/src/service/core/sandbox/access.ts"
  - "packages/global/openapi/core/ai/sandbox/api.ts"
  - "projects/app/src/pages/api/core/ai/sandbox/upload.ts"
  - "projects/app/src/pages/api/core/ai/sandbox/download.ts"
routes:
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
  - "POST /api/core/ai/sandbox/upload"
  - "POST /api/core/ai/sandbox/download"
related:
  - "FG-PERMISSION-RESOURCE-002"
  - "FG-CHAT-HISTORY-FEEDBACK-002"
  - "FG-CHAT-CONVERSATION-003"
  - "FG-CHAT-CONVERSATION-004"
  - "FG-PERMISSION-TEAM-001"
baseline: "d09b4e8849d051182ef4011470945d2b71085807"
---

# 应用 Key 管理绑定应用的对话、日志与会话文件

## 用例简介

业务后端使用应用 Key 查询和管理绑定应用内不同使用者、不同发布渠道产生的对话。即使 Key 归属成员没有应用、日志或写权限，这些操作仍由应用 Key 授权；同时不能访问其他应用或其他会话的文件，也不能因二次鉴权重新依赖成员 ACL。

## 前置准备

- 自动执行约定见 [应用 Key 脚本配置](../../../skills/system/fastgpt-integration-test-runner/references/app-key-cases.md)。脚本仅在 marker 匹配的独立数据库准备资源，每个子场景重新建立基线；固定回显模板和登录材料由显式夹具提供，沿用本例所有响应、持久化与清理断言。

- D0 复用 RESOURCE-002 的 T/W/Ka/Pa，A 为 active 普通成员、对 W 无应用/日志/写 ACL，Ka 有效；另备有日志权限的 owner O 作观测者。W 是独立普通应用，含 C1(A/Ka/u1)、C2(B/Kb/u2)、C3(B/online)、C4(share) 四份完成对话，各带 RUN 和两条消息，另备 Cfile、Crun。所有对话属于 W，使用者、作者、publishSource.id 有意不同。不要把 API 来源筛选默认带入全量管理查询。
- 对照应用 X（同 T）和 Y（异团队），各有独立 CX/CY、消息和文件，记录真实 ID/数据摘要。历史和日志查询给完整时间范围与合法分页，预期 ID 集合来自本例 manifest；getUsers/Pro 图表的真值从实际日志库 app_chat_logs 的桶计算，不用 Chat 数量硬凑统计值。
- 请求构造：应用 Key 的历史 body/query 可省略 appId；改名 body 使用 chatId/customTitle；消息详情 query 使用 chatId/dataId；消息删除为 DELETE + JSON body 的 contentId/contentIds。adminUpdate 的 datasetId/feedbackDataId/q/a 只记录管理反馈引用，不把它当成知识库写入接口。所有额外字段按实际 Zod 和真实 UI 请求样本填充，不臆造消息 ID。
- 文件行需真实 S3 上传/下载和已发布、实际可用的 App 沙盒，具有测试目录写入/清理能力；若基础设施未配置，只将该行阻塞，不伪造成功。保存上传字节及 SHA-256、返回的真实 key，沙盒使用 RUN 命名文件；不得把凭证或下载签名 URL 放入公开证据。关闭的产品态不因应用 Key 被绕过。
- 运行控制行复用 CONVERSATION-003/004 的单会话流式准备、终态与实际事件判断，只测更换鉴权为 Ka，不复制断线/竞争全矩阵。轮询每 1 秒、最长 60 秒，超时保存状态并停止重放写请求。
- 数据快照：主库 chats 按 `{teamId:ObjectId(T),appId:ObjectId(W),chatId:{$in:manifest}}`，chatitems 按 appId/chatId/dataId 白名单；保留 tmbId/outLinkUid/publishSource、标题、反馈、删除字段。日志库独立连接；允许保存延迟 1 秒轮询、最长 30 秒。只读操作可能更新已读状态，不要求所有字段绝对不变。
- 每个独立行恢复其 D0 副本；删除/清空只能针对本例独立应用副本，X/Y 为负对照且始终保留。清理本例应用、存储对象、沙盒目录、运行租约及 Key，核对本例白名单无残留。

- 应用 Key 的所有合法对话管理、日志和配套文件请求默认省略 appId（旧 sourceId 请求也可省略），由鉴权返回绑定的 sourceId 与固定 app 来源；显式传相同 appId 为兼容对照，传其他应用 ID 仍按 Key 绑定的 W 执行。个人密钥与登录态缺失目标仍拒绝；错误外链、Skill、Builder 来源不得回退成绑定应用。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| D1 | 基础；D0 全部完成对话 | Ka 省略 appId/sourceType 调历史列表；隐式传 source=api/online，再显式传冲突 appId/source 作对照。按 ID 逐一调用 C1～C4 的 init、分页消息与消息详情。 |
| D2 | 日志管理；D0，桶已完成保存 | Ka 查询 logs/list、getUsers、导出和匹配 Pro 图表；用 Pa 做日志读取拒绝对照。保留调用渠道/渠道名/使用者及鉴权者的既有展示口径。 |
| D3 | 管理写入；独立 D0 的 C2 | Ka 改 customTitle、标记已读，提交用户反馈和管理反馈引用，再关闭预置 customFeedback；每一步重新查询记录。检查 closeCustom 与 init 的二次鉴权路径。 |
| D4 | 运行控制；Crun 使用既有可控流式基线 | Ka 对当前 W/Crun 做 resume 读取与 stop，再检查终态。只改变凭证，不再执行已被既有用例覆盖的停止竞争/断线全流程。 |
| D5 | 文件；独立 Cfile，A 无写 ACL | Ka 请求上传参数并按返回协议上传固定文件，再通过实际 key 下载校验内容；在该 App 会话沙盒上传/下载 RUN 文件。用同 A 的 Pa 做拒绝对照；关闭沙盒产品态后再次请求。 |
| D6 | 隔离；恢复 D0 与外域快照 | Ka 显式指定 X/Y 读取/改名/删除/导出；另保留 appId=W，混入 CX/CY、外域 dataId 或外域/其他会话 S3 key；批量请求混合合法与外域 ID。 |
| D7 | 删除；三个互相独立的 W 副本 | 分别做单消息软删除、单会话软删除、批量会话资源删除；另一个副本做清空历史，预置不同 tmbId/UID/来源/Key 的会话。所有删除均先存待处理 ID 集合，完成后用 owner 与只读查询复核。 |

## 预期结果

公共断言：Ka 的授权范围是团队+绑定应用，不是创建人、customUid 或 publishSource.id。读取不改变最新调用渠道，修改只产生对应业务字段变化；仅真正运行的轮次产生运行消耗，不能要求全部操作一律“用量不变”。API 成功须有数据/文件/状态变化证据，错误或空成功不能证明管理能力可用。

| 子场景 | 特有预期 | 证据获取方式 |
| --- | --- | --- |
| D1 | getHistories 固定只返回 C1/C2 两个 API 来源；省略 appId 时不接受 source，显式冲突 appId/source 也不能覆盖绑定及 API 来源。按 ID 仍可访问 C1～C4，不向 A 补 ACL；消息内容与真实集合一致。 | 列表及拒绝响应、分页合并去重、消息详情与 DB。 |
| D2 | 无成员日志权限的 Ka 仍能读取绑定应用全部授权日志/导出/统计，Pa 仍受成员权限限制。CSV 与列表同筛选 ID 集合，图表等于日志桶的既有聚合口径；不要求 CSV 行数等于桶数。渠道名兼容与列行为复用 HISTORY-FEEDBACK-002，不重复完整展示矩阵。 | 实际 JSON、解析 CSV、日志桶真值及 Pro 提交记录。 |
| D3 | 每步落在 C2 目标记录；标题/已读/反馈按接口职责变化，closeCustom 能完成事务及反馈计数更新，不因仅登录态二次鉴权失败。管理反馈只保存引用，不产生未授权知识库修改；身份/来源不因管理请求改成 A/Ka。 | 每步字段差集、反馈计数、事务后重读；失败时精确定位到步骤。 |
| D4 | Ka 可读取或停止绑定应用的运行；终态和重复读取遵循既有运行控制契约，stop 返回 accepted/success 不等于后台已收尾。不得因 A 缺成员 ACL 拒绝或停错另一个应用会话。 | SSE、stop 响应、实际生成状态与消息终态。 |
| D5 | 上传/下载真实完成，字节数和 SHA-256 一致；App 沙盒写入不因 A 缺应用写权限拒绝。Pa 按原成员权限拒绝；关闭的沙盒仍被产品可用性层拒绝。文件使用会话 uid，交接场景复用 TEAM-001，不重做 UID 全矩阵。 | S3 返回协议/内容摘要、沙盒文件响应、权限对照与关闭态响应。 |
| D6 | 显式 X/Y 不覆盖 Key 的绑定，仍只作用于 W；只混入外域 chatId/dataId 的查询不返回外域数据，修改/批量操作仅能影响 W 内匹配集合。未命中是拒绝还是空结果按实现后的单接口契约核对；不能只因成功 envelope 就断言发生越权。文件 key 不属于目标应用/会话时拒绝签名，不签发外域 URL。 | X/Y 与非目标会话零差集、W 合法差集、无外域正文/签名 URL。 |
| D7 | 消息/单会话按当前软删除规则处理；batchDelete 按既有资源清理流程完成，可管理 W 内不同来源的明确目标。clearHistories 只清 API 来源的目标集合，不因成员/UID/Key 不同漏项，不越过 W/team；getHistories 只列仍可见的 API 来源，owner 日志保留软删除记录；删除 ID 差集精确等于目标集合，X/Y 不变。 | 删除前清单、可见列表与主库状态；资源清理 1 秒轮询、最长 60 秒，超时失败或环境阻塞。 |
