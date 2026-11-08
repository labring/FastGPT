---
case_version: 1
id: FG-ADMIN-AUDIT-002
title: 日期筛选与列表、导出和图表的实际查询范围一致
business: admin/audit
types: [api, ui, e2e, integration]
category: boundary
scenario: special
priority: P1
status: ready
tags: [日期范围, 时区, 毫秒精度, 统计, 覆盖基础场景, 覆盖边界场景]
evidence: [response, ui, database, storage]
sources:
  - packages/global/common/time/dateRange.ts
  - packages/web/components/common/DateRangePicker/index.tsx
  - projects/app/src/web/common/api/request.ts
  - projects/app/src/pages/account/usage/index.tsx
  - projects/app/src/pageComponents/account/usage/Dashboard.tsx
  - projects/app/src/pageComponents/account/usage/UsageTable.tsx
  - projects/app/src/pageComponents/app/detail/Logs/LogChart.tsx
  - projects/app/src/pageComponents/app/detail/Logs/LogTable.tsx
  - projects/app/src/pageComponents/model/ModelDashboard/index.tsx
  - projects/app/src/pageComponents/model/Log/index.tsx
  - projects/app/src/pages/api/core/ai/model/channel/dashboard.ts
  - projects/app/src/pages/api/core/ai/model/channel/logs.ts
  - packages/service/core/ai/model/channel/observability.ts
  - packages/service/core/app/logs/chatLogsSchema.ts
  - packages/service/support/wallet/usage/schema.ts
  - pro/admin/src/pages/api/core/app/logs/getChartData.ts
  - pro/admin/src/pages/api/support/wallet/usage/getUsage.ts
  - pro/admin/src/pages/api/support/wallet/usage/getDashboardData.ts
routes:
  - POST /api/proApi/core/app/logs/getChartData
  - POST /api/proApi/support/wallet/usage/getUsage
  - POST /api/proApi/support/wallet/usage/getDashboardData
  - POST /api/proApi/support/wallet/usage/exportUsage
  - GET /api/core/ai/model/channel/dashboard
  - GET /api/core/ai/model/channel/logs
related: []
automation: []
baseline: "main=f90561878b76156969fc114c9725e2f36bb11a32; pro=a0ae2def8af78f2abcde29249a09766c48a24728"
---

# 日期筛选与列表、导出和图表的实际查询范围一致

## 用例简介

用户选择日历日期后，列表、导出和图表应使用选择起日的零点到止日的最后一毫秒，不能额外向前或向后查询。本例覆盖 ISO 时间接口、模型 Unix 毫秒接口以及按请求偏移统计的应用日志图表，并验证留存也受所选窗口限制。

## 前置准备

- 使用已有本地 dev 主应用、Pro、Mongo/日志库、Redis 和已配置 AIProxy，不创建另一套服务。记录真实监听进程的源码目录与两个提交。AI 使用真实 HTTP、Chromium 和限定数据库查询执行；本例没有 automation 映射。
- 用 `.agents/test/support/environment.mjs` 新建本轮团队 T、owner 和应用 W，资源 ID 写 manifest；复用配置但保留既有账号/资源。仅在 T/W 中准备数据，所有时间用明确 Date/ISO 构造，不能依赖执行机 TZ。
- D0：为每个偏移变体准备过去两日的 S−1ms、S、S+1ms、E−1ms、E、E+1ms，日志库 `app_chat_logs` 的 teamId/appId 固定 T/W，userId/chatId/来源/Token/points 使用独立可辨认标记。业务库 `usages` 使用同样 time，list 为空且 totalPoints 明确。保存 ID、时间和预期集合；每个独立场景复位本轮数据，不能跨变体累积计数。
- 浏览器变体为 Asia/Shanghai、America/New_York、Asia/Kathmandu；账号 timezone 保持 Asia/Shanghai 作为对照。日期选择使用执行当天之前的可选日期；按当前真实本地日验证默认范围。模型入口用 `/account/model` 的当前成员渠道，只读监控/日志，不调用模型、不改渠道配置。团队模型开关须开启；默认关闭时可仅覆盖当前本地 dev 进程的配置，记录覆盖位置与恢复结果，不写共享配置表。如真实 AIProxy 不可用仅相关项阻塞。
- 用量导出有每成员每分钟一次的既有额度：C4 三个偏移可分别使用 owner 和本轮 A/B 临时管理员，各执行一次导出；仅为 A/B 新建本轮团队管理权限记录并在场景结束删除，不重置其他成员限流。
- C2/C3 的基本查询窗口、来源及时间粒度保持明确。留存单独准备新用户在第 1 日创建、第 2 日活跃以及只在 E+1ms 活跃的对照；后者不能因 retention offset 被计入窗口。周/月/季度桶的起点可早于所选起日，但原始记录查询不能扩展，不能将桶标签等同于查询起点。
- HTTP 同时检查状态与业务 code/data；数据库必需读取只按 T/W 和 manifest 的 ID 查询。捕获实际浏览器网络请求，不能用直接调用日期 helper 或 mock API 代替 UI 验证。可读证据不含 Cookie、连接串或既有用户数据。
- 清理：关闭浏览器，先删除本轮日志和用量夹具，再经应用业务删除入口回收 W；精确清理本轮账号/团队及残留日志，核对清单归零。没有部署版本、真实请求或必需查询证据时不能判通过。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | UI；每个浏览器 TZ 独立上下文 | 打开 `/account/usage` 及 W 的 `/app/detail?appId=W&currentTab=logs`。检查默认范围，选择两个过去日期并确认，切换用量表格/概览及应用日志列表/图表，捕获请求。选择另一日期后取消，再通过切换视图请求，核对原范围未被 Date 原地修改。 |
| C2 | 毫秒与时区；每个偏移恢复 D0 | 分别用 +08:00、-05:00、+05:45 调用真实 getChartData，user/chat/appTimespan=day；对比桶 timestamp、用户/会话数量、points 与 Token 总和及数据库精确 ID。账号时区保持不变，不传额外 timezone。 |
| C3 | 周期与留存；恢复对应夹具 | 对同一有限窗口依次按 week/month/quarter 请求；核对各桶起点与所有指标总和。再以 offset=1 请求留存，比较窗口内次日活跃与仅 E+1ms 活跃对照。 |
| C4 | 使用记录；各偏移恢复 D0 | 调用 getUsage、getDashboardData（unit=day）及 exportUsage；比较列表 ID、统计总积分和 CSV 实际条数/时间，特别保留 E−1ms 与 E 的记录，排除 S−1ms 和 E+1ms。通过 C1 的页面下载入口补验浏览器发出的导出边界。 |
| C5 | 模型监控；每个浏览器 TZ 独立上下文 | 打开 `/account/model`，进入监控和调用日志。检查默认昨天与今天的完整自然日；选择两个过去日期，捕获真实 dashboard/logs GET 的 startTimestamp、endTimestamp 和监控 timezone，核对响应及页面日期。 |

## 预期结果

公共断言：选择起日 D1 至止日 D2 时，接口起点等于浏览器本地 D1 00:00:00.000，终点等于 D2 23:59:59.999；ISO 字符串携带各边界实际偏移，Unix 接口为对应绝对毫秒值。任何来源、粒度或视图切换都不额外增加一天，也不丢失末尾 999 毫秒。所有样本仅来自 T/W，清理按 manifest 完成。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI、请求 | 用量默认今天−7日至今天、应用日志默认今天−6日至今天，首尾均完整；三个 TZ 的确认日期与各视图 body 一致，取消后原范围不变。 | 各 TZ 页面截图/可见日期、按入口分类的真实请求 body。 |
| C2 | HTTP、数据库 | 仅 S、S+1ms、E−1ms、E 计入；各日桶按请求起点固定偏移分组，无账户/服务器时区漂移；数量、points、输入/输出 Token 均等于固定集合总和。 | 请求/响应、Mongo ID/Date 快照、独立计算的桶及指标集合。 |
| C3 | HTTP、数据库 | 周一/每月1日/季度首日为桶起点，桶内只含所选窗口记录；三个粒度总量相等。offset 不扩大查询，只在窗口外活跃的用户留存数为 0，窗口内活跃对照为 1。 | 逐粒度响应、留存前后对照、限定原始记录。 |
| C4 | HTTP、CSV、UI | 列表、CSV 与日期窗口匹配集合一致，概览总积分等于该集合；E 的最后一毫秒不会消失，边界外不计入。页面下载请求与列表边界完全相同。 | 列表 ID、统计响应、CSV 原文件/解析结果、浏览器请求。 |
| C5 | UI、真实 GET | 默认昨天零点至今天最后一毫秒；选定日期后两个接口毫秒值等于各 TZ 计算的绝对值。监控保留已有 IANA timezone 参数，取浏览器时区；日志协议保持原有 Unix 毫秒。真实接口返回业务成功。 | GET query、code/data、页面可见日期及截图。 |
