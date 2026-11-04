---
case_version: 1
id: "FG-CHAT-HISTORY-FEEDBACK-002"
title: "日志调用渠道、渠道名兼容与 ID Tooltip"
business: "chat/history-feedback"
types:
  - "api"
  - "ui"
  - "e2e"
  - "integration"
category: "boundary"
scenario: "special"
priority: "P1"
status: "draft"
tags:
  - "customuid-publishsource"
  - "phase2"
  - "publishSource"
  - "chat-logs"
  - "tooltip"
  - "覆盖基础场景"
  - "覆盖边界场景"
evidence:
  - "response"
  - "ui"
  - "database"
sources:
  - "packages/global/openapi/core/app/log/api.ts"
  - "projects/app/src/pages/api/core/app/logs/list.ts"
  - "projects/app/src/pages/api/core/app/logs/exportLogs.ts"
  - "projects/app/src/pages/api/core/app/logs/getUsers.ts"
  - "projects/app/src/pageComponents/app/detail/Logs/LogTable.tsx"
  - "projects/app/src/pageComponents/app/detail/Logs/LogKeysConfigPopover.tsx"
  - "packages/service/core/app/logs/utils.ts"
  - "packages/global/core/app/logs/utils.ts"
  - "packages/service/support/openapi/schema.ts"
  - "packages/service/support/outLink/schema.ts"
  - "packages/service/support/mcp/schema.ts"
  - "packages/service/core/chat/chatSchema.ts"
  - "packages/service/core/app/logs/chatLogsSchema.ts"
routes:
  - "POST /api/core/app/logs/list"
  - "POST /api/core/app/logs/getUsers"
  - "POST /api/core/app/logs/exportLogs"
  - "GET /api/core/app/logs/getLogKeys"
  - "PUT /api/core/app/logs/updateLogKeys"
related:
  - "FG-CHAT-HISTORY-FEEDBACK-001"
  - "FG-CHAT-CONVERSATION-005"
  - "FG-ADMIN-MAINTENANCE-001"
baseline: "dd3cc357757bfb7c11a607c279a69a5f73a48c74"
---

# 日志调用渠道、渠道名兼容与 ID Tooltip

## 用例简介

管理者在日志中分别看到调用渠道类型和具体渠道名称，并通过悬停名称查看渠道 ID。本例检查新旧响应兼容、渠道改名/删除，以及缺字段时的统一文案，确保来源关联不改变第一阶段的双身份展示。

## 前置准备

- 需求以本聊天最终确认为准。基线无扩展 publishSource 响应与两列 UI，保持 draft；实现完成、调用渠道枚举与列配置落实后执行，不臆造列配置 key。
- 沿用 CONVERSATION-005 的临时资源，使用对 W 有日志读取权限的登录成员 L；新建 R1(api/Ka)、R2(share/S1)、R3(mcp/M1)；R4 为仅旧 sourceName=“历史入口”且无 publishSource 的旧记录；R5 旧/新名称均缺失；R6 type=api 无 id、有旧 sourceName；R7 来源记录不存在、旧名称缺失但 publishSource.id 存在；R8 对应记录不存在、有旧 sourceName。另备旧名称空串/空白变体。
- 夹具均由本例独立 appId/chatId 白名单管理，保存 BSON 初态。无 publishSource 的展示夹具在本子场景结束前不跑迁移，以免 type 被回填改变“缺失”条件。
- 页面入口“应用详情 → 对话日志”，按可见列名“调用渠道”“渠道名”及显示文本定位。记录 list 原始 data.list 项，确认 id 字符串等于渠道真实 _id。API 仅扩展 `{type,id,name}`，缺失属性可省略；展示兜底文案由客户端生成。
- rename/delete 只针对临时渠道；通过其真实管理页面操作并保存网络证据，刷新后观察。有关联的 app/type/team 不匹配夹具只在隔离库创建，不借此读取其他团队数据。
- 清理：恢复本例列偏好、删除剩余临时渠道和应用；撤销全部夹具。性能行的数据也限定临时应用与 manifest，不污染共享开发库中的真实记录。

## 测试步骤

| 子场景 | 类型与起始状态 | 操作 |
| --- | --- | --- |
| C1 | 基础；R1～R3 | 打开两个列，刷新并查询 list；分别悬停三条渠道名称。 |
| C2 | 旧记录；R4～R6、空名称变体 | 刷新页面，核对新列和原渠道名列；同时在旧接口响应形态下检查前端 sourceName 回退。 |
| C3 | 生命周期；R1、R7、R8 | 修改 Ka 名称后刷新；删除另一临时 Key 生成对应无关联记录；分别有/无旧名称，hover 最终显示文本。 |
| C4 | 关联隔离；临时异常夹具 | 来源 id 指向其他团队/不匹配应用的渠道，或两个集合中具有相同 ObjectId 的不同类型渠道；L 查询日志。 |
| C5 | 历史与身份；相同数据集 | 用 sources、使用者及时间范围筛选 list/getUsers，再按同筛选导出；回归 HISTORY-FEEDBACK-001 已证明的身份展示，重点核对分享访客识别与两列来源值。 |
| C6 | 来源更新；承接 CONVERSATION-005 C2/C3 | 来源从分享到 API、从 API 到 online 后刷新；检查渠道名和 tooltip 不残留前一 ID/name。 |
| C7 | 性能；独立性能应用 | 在旧/新版本相同基础设施、相同索引和 100000 条临时数据下，预热后对固定 pageSize=20 的首屏/深分页/来源+使用者筛选各采样 30 次，记录 P50/P95、错误率、DB 查询次数及 explain。样本生成不得依靠真实模型调用。 |

## 预期结果

公共规则：调用渠道仅按 publishSource.type 映射，type 缺失或未知显示 `-`；渠道名顺序为“有效 publishSource.name → 有效旧 sourceName → 渠道已删除”，null/undefined/空串/纯空白均算无有效名称。name 的兜底不参与鉴权，不把“渠道已删除”反写成真实渠道名。Hover 仅使用响应中的 publishSource.id，不追加每行请求。

| 子场景 | 特有预期 | 证据 |
| --- | --- | --- |
| C1 | 调用渠道分别为“API调用”“分享链接”“MCP”；渠道名为当前配置名。响应对象只用业务字段 id，非 `_id`；存在 id 时 Tooltip 为 `渠道 ID：{id}`。 | list JSON、可见行及 hover 截图。 |
| C2 | R4 调用渠道=`-`、渠道名=历史入口；R5 名称=渠道已删除；R6 有可靠 type 则显示 API调用，缺 id 不影响类型文案；有旧名称则展示，否则统一删除文案。无 id 不显示 ID Tooltip。 | 每个夹具对应响应/页面，无隐藏文本代替可见断言。 |
| C3 | 改名显示新名；关联不到时先回退旧名，仍没有则显示“渠道已删除”；有 id 时即使是删除文案也显示 ID Tooltip。旧名存在不能错误一律覆盖为删除。 | 生命周期前后 JSON、hover 截图。 |
| C4 | 关联严格限定当前团队及适用的资源关系，不泄漏其他渠道名/发布者；不同类型同 ID 不串集合；按旧名/删除文案降级。 | 安全投影、JSON 与类型/id 对照。 |
| C5 | list、筛选、CSV 同一来源语义，历史 source 在迁移窗口仍能筛选/计数；不因新列显示 `-` 丢掉旧记录。身份默认仍只显示使用者，鉴权者默认隐藏。 | 精确 chatId 集合、两列 CSV、双身份 UI。 |
| C6 | 显示最新来源；online 无 id 不带旧 ID Tooltip，旧来源名不参与当前名称回退。 | 每次运行后 JSON、BSON 和 UI。 |
| C7 | 无业务错误，集合/total 与已知 manifest 一致；关联查询按页、按实际集合分组批量执行，查询次数不随每页行数逐行增长，不在分页前增加渠道 lookup。保存相对性能对比；没有预先约定延迟预算时只提交测量证据，不自行宣称 P95 达标。 | 脱敏性能原始样本、explain/允许的 DB 观测；全部 mock 数据清理后的计数。 |
