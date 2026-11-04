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
status: "ready"
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
  - "packages/service/core/chat/publishSource/entity.ts"
  - "packages/service/core/chat/publishSource/utils.ts"
  - "packages/service/core/chat/publishSource/service.ts"
  - "packages/global/core/chat/publishSource/type.ts"
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
  - "packages/global/core/app/logs/constants.ts"
routes:
  - "POST /api/core/app/logs/list"
  - "POST /api/core/app/logs/getUsers"
  - "POST /api/core/app/logs/exportLogs"
  - "GET /api/core/app/logs/getLogKeys"
  - "PUT /api/core/app/logs/updateLogKeys"
related:
  - "FG-CHAT-HISTORY-FEEDBACK-001"
  - "FG-CHAT-CONVERSATION-001"
  - "FG-ADMIN-MAINTENANCE-001"
baseline: "764fb41c517cab5ab89ec54ee06c621bf7fb807a"
---

# 日志调用渠道、渠道名兼容与 ID Tooltip

## 用例简介

管理者在日志中分别看到调用渠道类型和具体渠道名称，并通过悬停名称查看渠道 ID。本例检查新旧响应兼容、渠道改名/删除，以及缺字段时的统一文案，确保来源关联不改变第一阶段的双身份展示。

## 前置准备

- 环境为 4.18.0 及以上版本，依据 `.agents/design/api/chat-publish-source.md` 的两列、名称回退与 ID Tooltip 规则。新增列 key=`publishSourceType`，默认开启；原 `source` 列继续控制渠道名，保留已有开关和顺序。
- 沿用 CONVERSATION-001 的临时资源，使用对 W 有日志读取权限的登录成员 L；新建 R1(api/Ka)、R2(share/S1)、R3(mcp/M1)；R4 为仅旧 sourceName=“历史入口”且无 publishSource 的旧记录；R5 旧/新名称均缺失；R6 type=api 无 id、有旧 sourceName；R7 来源记录不存在、旧名称缺失但 publishSource.id 存在；R8 对应记录不存在、有旧 sourceName。R10 为在线使用 online，分别备名称缺失及旧 sourceName/返回 name 有应用名的变体。另备旧名称 null/空串/空白变体。R9 为仅 UI 的未来未知 type 响应夹具，通过测试专用 HTTP 代理仅替换本例 logs/list 响应中 R9 的 publishSource.type 为 future 提供，保存原始/替换响应，不向真实 Schema 强行写非法枚举后把接口报错当成 UI 验收。
- 夹具均由本例独立 appId/chatId 白名单管理，保存 BSON 初态。无 publishSource 的展示夹具在本子场景结束前不跑迁移，以免 type 被回填改变“缺失”条件。
- 页面入口“应用详情 → 对话日志”，按可见列名“调用渠道”“渠道名”及显示文本定位。记录 list 原始 data.list 项，确认 id 字符串等于渠道真实 _id。API 仅扩展 `{type,id,name}`，缺失属性可省略；展示兜底文案由客户端生成。
- rename/delete 只针对临时渠道；通过真实管理页面操作并保存网络证据，刷新后观察。跨团队/类型冲突夹具只在隔离库创建；不匹配应用仅用于确有应用归属约束的 OutLink/MCP，不把个人 API Key 的旧默认 appId 当新绑定权限。
- 列偏好先保存原始 getLogKeys 响应及页面顺序/开关，准备一份合法旧配置（无新列，旧 source/user/authUser 各有明确开关）。未知 type 和旧响应兼容变体由测试专用 HTTP 代理限定本例 appId 的单次 list 响应替换：前者只改 R9 的 type，后者只移除目标行 publishSource、保留 sourceName。其余请求直通，分别记录真实响应与替换响应，不将代理结果当作后端接口兼容证据。
- 筛选真值分开准备：Chat 快照用于 list/count/CSV；app_chat_logs 自身来源和时间桶用于 getUsers/Pro 图表。含一个同会话 15 分钟窗口内 Ka→Kb 的连续运行，以及超过该桶窗口后的新桶对照（用隔离时间夹具，不等待固定 15 分钟）；保存每桶 userId、来源、兼容名称和数值前快照。Pro 按基线固定子模块 89a878e6551a1cf50cb69be98cab69e8349e3fe0 核对 getChartData；没有匹配 Pro 环境时图表子步骤阻塞。
- 清理：恢复本例列偏好、删除剩余临时渠道和应用；撤销全部夹具。性能行的数据也限定临时应用与 manifest，不污染共享开发库中的真实记录。

## 测试步骤

| 子场景 | 类型与起始状态 | 操作 |
| --- | --- | --- |
| C1 | 基础；R1～R3 | 打开两个列，刷新并查询 list；分别悬停三条渠道名称。 |
| C2 | 旧记录；R4～R6、空名称、R9 UI 夹具和 R10 | 刷新页面核对旧数据；在实际前端兼容测试入口分别提供旧 sourceName-only 响应和未来未知 type，检查可见文案。 |
| C3 | 生命周期；R1、R7、R8 | 修改 Ka 名称后刷新；删除另一临时 Key 生成对应无关联记录；分别有/无旧名称，hover 最终显示文本。 |
| C4 | 关联隔离；临时异常夹具 | 来源 id 指向其他团队/不匹配应用的渠道，或两个集合中具有相同 ObjectId 的不同类型渠道；L 查询日志。 |
| C5 | 筛选、统计与身份；按上述 Chat/日志桶各自基线 | 对 api/share 来源、使用者和时间范围分别查询 list/getUsers、导出，并在可用 Pro 页面查图表；对照新 type 缺失回退旧 source、新 type 与旧 source 冲突，以及来源筛选省略/空数组。运行 Ka→Kb 同桶与新桶对照；身份展示仅回归分享访客和默认双身份，不重复第一阶段完整 UID 矩阵。 |
| C6 | 来源更新；承接 CONVERSATION-001 C2/C3 | 来源从分享到 API、从 API 到 online 后刷新；检查渠道名和 tooltip 不残留前一 ID/name。 |
| C7 | 性能；独立性能应用 | 固定相同基础设施和 100000 条临时数据，保存旧/新版本各自索引清单；预热后 pageSize=20，首屏/深分页/来源+使用者筛选各采样 30 次，记录 P50/P95、错误率、查询次数与 explain。先在可比较索引下对比，若采用新索引再单独记录效果，不混作一个结论。样本不依赖模型调用。 |
| C8 | 列偏好；恢复已备份旧配置，默认用户用独立账号 | 打开“应用详情 → 对话日志”的列配置；检查旧开关/顺序，显示两列后拖动并保存、刷新重载。另以未保存偏好的测试账号检查身份列默认状态，新调用渠道列默认开启。 |

## 预期结果

公共规则：调用渠道仅按 publishSource.type 映射，type 缺失或未知显示 `-`；在线使用的渠道名固定为 `-`，即使有旧应用名；其他来源的渠道名顺序为“有效 publishSource.name → 有效旧 sourceName → 渠道已删除”，null/undefined/空串/纯空白均算无有效名称。name 的兜底不参与鉴权，不把“渠道已删除”反写成真实渠道名。Hover 仅使用响应中的 publishSource.id，不追加每行请求。

| 子场景 | 特有预期 | 证据 |
| --- | --- | --- |
| C1 | 调用渠道分别为“API 调用”“分享链接”“MCP 调用”；渠道名为当前配置名。响应对象只用业务字段 id，非 `_id`；存在 id 时 Tooltip 为 `渠道 ID：{id}`。 | list JSON、可见行及 hover 截图。 |
| C2 | R4 调用渠道=`-`、渠道名=历史入口；R5 名称=渠道已删除；R6 有可靠 type 则显示 API 调用，缺 id 不影响类型文案；有旧名称则展示，否则统一删除文案。无 id 不显示 ID Tooltip；R9 未知 type 也显示 `-`，不误用旧 source 标签；R10 调用渠道=在线使用、渠道名固定 `-`，不显示旧应用名或删除文案，导出保持相同结果。 | BSON 与真实响应/页面；旧响应及未知类型另存前端夹具和可见渲染证据。 |
| C3 | 改名显示新名；关联不到时先回退旧名，仍没有则显示“渠道已删除”；有 id 时即使是删除文案也显示 ID Tooltip。旧名存在不能错误一律覆盖为删除。 | 生命周期前后 JSON、hover 截图。 |
| C4 | 关联严格限定当前团队及适用的资源关系，不泄漏其他渠道名/发布者；不同类型同 ID 不串集合；按旧名/删除文案降级。 | 安全投影、JSON 与类型/id 对照。 |
| C5 | list/count/CSV 按 Chat 最新来源且集合/total 一致；新 type 缺失才回退旧 source，UI `-` 不导致旧记录漏选。来源筛选省略为全部、空数组为未选择。getUsers/图表按桶自身来源统计，不强求与 Chat 最新来源逐条相等；同桶累计保留首条 type/id/兼容名称，新桶采用本次来源，计数增量正确。 | Chat/桶两份真值及精确筛选结果、CSV 两列、可用 Pro 图表；核对 userId 与第一阶段身份规则。 |
| C6 | 显示最新来源；online 无 id 不带旧 ID Tooltip，旧来源名不参与当前名称回退。 | 每次运行后 JSON、BSON 和 UI。 |
| C7 | 无业务错误，集合/total 与 manifest 一致；渠道按页/集合批量查询，不逐行请求、不在分页前增加渠道 lookup。性能对比分清代码与索引变化；无既定预算时只报告测量。 | 脱敏样本、索引清单、explain/允许的 DB 观测；mock 清理后精确查无记录。 |
| C8 | 原 SOURCE 列配置继续控制渠道名，既有开关/顺序不被重置，新列可独立配置且刷新保留；默认使用者可见、鉴权者隐藏。新调用渠道列默认开启。 | get/updateLogKeys 脱敏请求响应、可见列及刷新后截图、配置恢复记录。 |
