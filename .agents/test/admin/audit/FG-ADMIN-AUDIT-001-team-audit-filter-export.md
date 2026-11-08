---
case_version: 1
id: FG-ADMIN-AUDIT-001
title: 团队审计筛选与 CSV 导出保持一致
business: admin/audit
types: [api, ui, e2e, integration]
category: basic
scenario: success
priority: P1
status: ready
tags: [团队审计, 日期范围, CSV, 国际化, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, ui, database, storage]
sources:
  - packages/global/common/zod/index.ts
  - packages/global/common/time/timezone.ts
  - projects/app/src/pages/account/team/index.tsx
  - projects/app/src/pageComponents/account/team/Audit/index.tsx
  - projects/app/src/web/support/user/team/operantionLog/api.ts
  - packages/web/components/common/DateRangePicker/index.tsx
  - packages/global/openapi/support/user/team/audit/api.ts
  - packages/service/common/http/entry.ts
  - packages/service/support/user/audit/schema.ts
  - packages/web/support/user/audit/processors/index.ts
  - packages/web/support/user/audit/processors/commonProcessor.ts
  - packages/service/common/file/csv.ts
  - pro/admin/src/pages/api/support/user/team/audit/list.ts
  - pro/admin/src/pages/api/support/user/team/audit/export.ts
  - pro/admin/src/service/support/user/audit/service.ts
  - pro/admin/src/service/support/user/audit/utils.ts
  - pro/admin/src/service/support/user/audit/export.ts
routes:
  - POST /api/proApi/support/user/team/audit/list
  - POST /api/proApi/support/user/team/audit/export
related: []
automation: []
baseline: "main=749172c6d8c96a115649b294534dbb82febc72d7; pro=52c9eac136782adf2b4a95a9f569ec9c1e2701e6"
---

# 团队审计筛选与 CSV 导出保持一致

## 用例简介

团队管理员按日期、历史成员及事件查找操作记录，并将全部匹配记录导出为可读的多语言 CSV。本例验证页面筛选和接口使用同一时间范围，列表与导出的记录集合一致，普通成员无法读取团队审计，套餐沿用页面软限制。

## 前置准备

- 使用已有本地 dev 主应用及 Pro、现有 Mongo/日志库和 Redis；记录实际监听进程的源码目录、主仓库与 Pro 提交，不能用文档 baseline 替代部署核实。AI 使用真实 HTTP、Chromium 页面及限定数据库查询执行，不声明未实现的 automation。
- 复用 `.agents/test/support/environment.mjs` 准备本轮独立团队 T、owner 及普通成员 A/B/N、回显应用 W；认证材料保留仓库外。所有新增 ID 写入本轮 manifest。B 的离职、成员名称和本轮套餐夹具在每项结束恢复，不能调整既有账号。
- D0：在日志连接的 `operationlogs` 中按真实 Schema 写入本轮 T 的受控历史记录。选两个过去的完整自然日 S/E，插入 S−1ms、S、S+1ms、E−1ms、E、E+1ms 的记录，记录每条 `_id`。混合 owner/B、LOGIN/CREATE_APP，另插入无 tmbId 的 system 记录、ADMIN_LOGIN 记录及清单内另一个测试 teamId 的记录。metadata 使用可辨认的 RUN、应用名、`account_team:type.Workflow bot` 等系统标签；名称含逗号、双引号和公式前导字符的样本仅用于本轮身份。
- C1 使用含今天的独立 UI 数据集；C2/C4/C6 各恢复 D0 后独立执行，新增的导出事件不纳入预先固定的期望集合。C5 使用单独日期窗口和显式 ID 清单，不能覆盖 D0 或其他团队。
- 成功 JSON 同时检查 HTTP 与 `code: 200/data`；拒绝检查实际业务错误或 HTTP 400，不能把 HTTP 200 当成功。导出成功检查 `text/csv`、UTF-8 BOM、Content-Disposition 并用 CSV 解析器比较字段和精确集合。仅将本轮数据与脱敏响应写入证据。
- 每次有效且已鉴权的导出发起后，每秒轮询至多 15 秒，按 T、操作者、EXPORT_AUDIT_LOGS 和本次精确时间参数确认恰好一条记录；预检空/超量也记录动作。非法入参及越权不得新增该动作。
- 清理：关闭下载与浏览器，按 manifest 删除本轮夹具；W 通过业务删除入口回收，再精确清理新建团队、账号和日志。只读确认本轮资源归零，保存清理结果。大文件断流、背压及并发删除故障注入由既有局部代码测试覆盖，本例不在共享 dev 注入全局故障。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；owner，UI 独立数据 | 进入 `/account/team?teamTab=audit`。捕获首次列表请求，核对默认七个自然日。打开操作时间，核对未来日期禁用，选择过去两日但先关闭，切换事件触发请求确认旧范围未改变；重新选择并确认。组合成员/事件筛选，检查空结果提示及禁用导出；恢复全部，实际点击导出。保存可见表格、请求及下载。 |
| C2 | 边界；D0，B 标记离职 | 列表依次省略成员/事件、指定 B 与 CREATE_APP、成员空数组、事件空数组；同时传伪造 teamId。按 D0 的 ID 比较分页 list/total 与完整匹配集合，检查历史成员标记、首尾毫秒及后台/系统/其他团队排除。 |
| C3 | 异常与软限制；恢复 D0 | owner 在本轮无订阅配置下请求列表/导出；有效普通成员和匿名请求同样接口。owner 分别发送逆序、非法日期、缺日期及非法成员 ID；核对拒绝和导出动作差集。 |
| C4 | 基础；恢复 D0 | 列表 pageSize=1，再向导出附加同样分页字段。分别以 zh-CN、en、zh-Hant、ko-KR 导出，解析所有行。覆盖工作流应用类型、离职成员、用户原文、CSV 转义及公式前导字符。另查询并导出本轮 EXPORT_AUDIT_LOGS 事件，核对其详情中的时间为可读日期。 |
| C5 | 边界；独立窗口 | 空窗口导出；在另一独立窗口写入精确 50,000 条后导出并比较全部 ID 对应的唯一标记；只新增第 50,001 条后再次导出。按动作记录核对实际匹配条数及空/超量拒绝，无静默截断。 |
| C6 | 偏移与兼容；各变体独立 D0 | 分别使用 +08:00、-05:00、+05:45 的相同日历日期起止值查询与导出。另用 `2026-10-26T00:00:00.000-04:00` 至 `2026-11-01T23:59:59.999-05:00` 的跨夏令时范围。比较绝对时间匹配集合、CSV 行时间及文件名；另在浏览器固定纽约回拨日 2026-11-01 00:30 后读取真实默认列表/下载请求，不修改服务端或共享服务时钟；不传 timezone。另以无偏移 ISO 与显式 Z 对照：无偏移时按服务器时区解释与导出，Z 始终按 UTC；记录服务端 TZ。 |

## 预期结果

公共断言：所有结果限于登录身份的团队及成员审计；列表和导出按原始 `[dateStart,dateEnd]` 闭区间匹配 Mongo Date，首尾保留毫秒。操作前后保存 `operationlogs.find({teamId:ObjectId(T),_id:{$in:manifest}})` 及本次导出事件快照；截图只包含本轮身份。导出不修改原始 metadata，清理完成后本轮账号、团队及受控记录归零。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI、真实请求及下载 | 未来日期按钮不可选；首次范围为本地今天−6日 00:00:00.000 至今天 23:59:59.999；取消不改变已应用范围，确认后列表与下载使用相同起止字符串；空结果可见且导出不可用。 | 页面截图/可见文本、脱敏请求 body、下载 CSV。 |
| C2 | HTTP、日志库 | 只有 S/E 及区间内的精确 ID；指定成员和事件按 AND，维度内 OR。省略表示全部、空数组表示无记录；其他团队及 system/admin 记录均不出现，离职成员仍可筛选。 | 各输入、code/data、固定 ID 集及数据库快照。 |
| C3 | HTTP、动作差集 | owner 无套餐硬拦截；普通成员/匿名被拒绝。非法格式、逆序和 ID 被入参校验拒绝；这些失败不新增导出事件。接口只验证绝对时间格式和顺序，未来日历限制由控件承担，不按结束 offset 重新推断今天。保留页面既有套餐提示，不新增定时刷新要求。 | 身份 teamId/tmbId 安全投影、响应及前后事件 ID 差集。 |
| C4 | CSV、列表、数据库 | 导出全部匹配记录，忽略分页；四种语言均无裸系统 key。用户名称/应用名等原文及 CSV 字段可无损解析，公式前导字符被中和。导出动作详情时间不暴露 ISO 原串，动作不包含在自身文件中，后续查询可见。 | CSV 原文件/解析行、分页响应、导出事件 metadata。 |
| C5 | CSV 精确计数及 HTTP | 空和 50,001 条返回 HTTP 400；50,000 条完整输出，标记集合一条不少且无重复。每次有效发起各新增一次动作，total 分别为 0、50000、50001。 | 文件哈希、计数/集合比对、拒绝响应、事件快照。 |
| C6 | HTTP、CSV、日志库 | 各偏移均按绝对时间匹配，边界外 1ms 排除；跨 DST 范围及回拨日零点浏览器默认范围合法。服务端 UTC、切换前/后及中午的 schema 时钟对照另由相邻局部测试验证，不冒充服务端时钟集成。CSV 全部时间使用 dateStart 的固定偏移；无偏移时使用起点时刻的服务器偏移，Z 使用 UTC。文件名保留原始起止日历日期，不推断 IANA/DST。 | 逐变体请求、匹配 ID、解析时间、Content-Disposition。 |
