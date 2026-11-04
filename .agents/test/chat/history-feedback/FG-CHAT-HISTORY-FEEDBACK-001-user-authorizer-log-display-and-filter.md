---
case_version: 1
id: "FG-CHAT-HISTORY-FEEDBACK-001"
title: "对话日志使用者与鉴权者的展示、筛选和导出"
business: "chat/history-feedback"
types:
  - "api"
  - "ui"
  - "e2e"
  - "integration"
category: "basic"
scenario: "success"
priority: "P1"
status: "ready"
tags:
  - "customuid-publishsource"
  - "phase1"
  - "customUid"
  - "chat-logs"
  - "覆盖基础场景"
  - "覆盖边界场景"
evidence:
  - "response"
  - "ui"
  - "database"
sources:
  - "packages/global/openapi/core/app/log/api.ts"
  - "packages/global/core/app/logs/utils.ts"
  - "packages/global/core/app/logs/constants.ts"
  - "packages/service/core/app/logs/utils.ts"
  - "projects/app/src/pages/api/core/app/logs/list.ts"
  - "projects/app/src/pages/api/core/app/logs/getUsers.ts"
  - "projects/app/src/pages/api/core/app/logs/exportLogs.ts"
  - "projects/app/src/pageComponents/app/detail/Logs/LogTable.tsx"
  - "projects/app/src/pageComponents/app/detail/Logs/UserFilter.tsx"
  - "projects/app/src/pageComponents/app/detail/Logs/LogKeysConfigPopover.tsx"
  - "projects/app/src/web/core/app/api/log.ts"
  - "packages/service/support/permission/publish/authChat.ts"
routes:
  - "POST /api/core/app/logs/list"
  - "POST /api/core/app/logs/getUsers"
  - "POST /api/core/app/logs/exportLogs"
  - "GET /api/core/app/logs/getLogKeys"
  - "PUT /api/core/app/logs/updateLogKeys"
related:
  - "FG-INTEGRATION-OPENAPI-001"
  - "FG-CHAT-HISTORY-FEEDBACK-002"
baseline: "dd3cc357757bfb7c11a607c279a69a5f73a48c74"
---

# 对话日志使用者与鉴权者的展示、筛选和导出

## 用例简介

应用管理者查看同一 Key 产生的多个用户对话时，应能区分实际使用者与鉴权成员。本例贯通日志页面、分页接口和 CSV，验证默认列、使用者筛选，以及分享访客和外部 UID 的不同展示规则。

## 前置准备

- 环境：沿用 FG-INTEGRATION-OPENAPI-001 的 D0 资源准备；只复用准备与基础调用，不必重跑其参数/代理矩阵。日志操作用对 W 有日志读取权限的登录成员 L，并准备无该权限的成员 N。
- 在独立 W 生成清单 D1：R1=A 鉴权/无 customUid；R2=A/RUN-u1；R3=A/RUN-u2；R4=B/RUN-u1；R5=A/customUid=B.tmbId。另在受保护分享链接下让有 W 权限的成员 B 访问生成 R6；旧分享访客夹具 R7 的 tmbId=A、outLinkUid=B.tmbId、source=share，用于验证旧展示语义，夹具仅限独立测试库并记录原始 BSON。
- 每条记录独立 chatId，一次成功运行并等待 app_chat_logs 可见。为 R2 加一个有效好评，为 R3 的 chatId 加搜索前缀，记录时间窗和精确 manifest `{chatId,tmbId,outLinkUid,source}`。不要依赖列表默认排序推断归属。
- 观察查询复用 OPENAPI-001；UI 入口为“应用详情 → 对话日志”，依据可见的“使用者”“鉴权者”、列设置和筛选菜单定位，不假造 selector。启用会话 ID 列用于将 UI 行与 manifest 对应。
- 默认列用全新测试成员偏好，或先保存再恢复其列配置。getLogKeys/updateLogKeys 的 appId、logKeys 按契约提交；CSV 从页面导出，保留其 sourcesMap/title/logKeys 请求，避免手造错误表头。
- 清理：恢复列偏好；删除测试分享及独立应用。数据库夹具按 appId+精确 chatId 白名单清理，确认 chats/chatitems/app_chat_logs 无该 manifest 残留。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；D1、全新列偏好 | L 打开日志，查询 getLogKeys，显式打开鉴权者列后刷新页面；另保存一组旧偏好（关闭使用者、改变列顺序），读取并刷新。 |
| C2 | 基础；D1 | 定位 R1～R7，核对使用者和鉴权者，hover 成员信息；比较 list 的 tmbId/outLinkUid/authMember/sourceMember。 |
| C3 | 筛选；每变体恢复 D1 全量查询 | list 分别省略 tmbIds/outLinkUids、只选成员 A、只选 RUN-u1、同时选 A 和 RUN-u1、两个数组均为空；再为 RUN-u1 叠加 source=api、chatSearch 和反馈筛选。分页 pageSize=2 汇总各页。 |
| C4 | 搜索；D1 | getUsers 使用相同 app/time 范围，查询 RUN-u1、A 的成员名/用户名、包含正则元字符的字面搜索；逐页取完。 |
| C5 | 导出；D1，同 C3 的筛选 | 在页面打开两身份列后导出；用 CSV 解析器读取 R1～R7。另创建含逗号、双引号、换行、公式起始字符的外部 UID 小样本，导出并检查单元格边界和转义。 |
| C6 | 权限；D1 | N 直接请求 list/getUsers/exportLogs；再由 L 用不属于自身团队的 appId 请求同接口。 |

## 预期结果

公共断言：普通日志接口成功为 HTTP 200、code=200 且 data 满足 schema；导出为 text/csv，不把解析后的列数当成身份正确性的唯一证据。各筛选的 chatId 集合与 manifest 按业务规则计算，list.total 等于完整结果条数，翻页并集无漏项/重复。只读查询均限定独立 W，不扫描全库。

| 子场景 | 特有预期 | 证据 |
| --- | --- | --- |
| C1 | 全新默认使用者显示、鉴权者隐藏；手动开启后刷新保留。旧偏好的列顺序与关闭状态保留，缺少的鉴权者列补入且默认关闭，不强行开启使用者。 | get/update 请求、可见列与刷新后截图。 |
| C2 | R1 使用者/鉴权者均为 A；R2/R3 为原外部 UID/A；R4 为 RUN-u1/B；R5 使用者显示 B 的 ID 原文、鉴权者 A，不将 API UID 解析成 B 成员。R6 两者为实际校验访客 B；R7 使用者显示分享访客 B 姓名/头像（含离职状态，如存在），鉴权者仍为 A。 | 对应 API 字段、UI 与 manifest。 |
| C3 | 只选 A 仅包含有效 outLinkUid 为空的 A 记录；不会顺带选中 A 鉴权的全部外部用户。选 RUN-u1 命中 R2/R4；成员与外部用户选择为组内 OR，叠加搜索/反馈/来源为组间 AND。两个空数组结果为空，省略表示不筛选。 | 每个变体的完整 chatId 集合和 total。 |
| C4 | 能按外部 UID 和团队成员名查找；使用者与来源分组、排序/分页按接口实际结果核验；字面搜索不将元字符当作任意匹配，不混入其他团队用户。 | getUsers 的 ids、total、逐页结果；不要求不同来源同 UID 被合并成一条。 |
| C5 | 鉴权者为 `tmbId:成员名`，成员无有效名时只有 ID；无外部 UID 的使用者采用同格式；有 outLinkUid 时 CSV 不拼接成员名；普通值保持原值，公式起始值按现有 sanitizeCsvField 规则文本化。CSV 安全转义后保持正确列边界，不产生可执行公式；list/export 相同过滤的会话集合一致。 | 解析后的 CSV、原始字节和 manifest；界面展示与 CSV 格式分别验收。 |
| C6 | 原有日志权限拒绝，不泄漏对话或成员信息；不以 HTTP 200/空 UI 掩盖业务错误。 | HTTP/业务错误、页面错误状态。 |
