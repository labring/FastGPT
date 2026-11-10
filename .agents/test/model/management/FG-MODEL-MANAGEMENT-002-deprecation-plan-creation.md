---
case_version: 1
id: "FG-MODEL-MANAGEMENT-002"
title: "管理员创建模型下架通知计划并幂等保存排期"
business: "model/management"
types: ["api", "ui", "integration"]
category: "basic"
scenario: "success"
priority: "P1"
status: "ready"
tags: ["pr-8205", "model-deprecation", "覆盖基础场景", "覆盖异常场景", "覆盖边界场景"]
evidence: ["response", "ui", "database", "queue"]
sources:
  - "projects/app/src/pageComponents/model/ModelConfigTable.tsx"
  - "projects/app/src/pageComponents/model/ModelDeprecationInformModal.tsx"
  - "projects/app/src/pageComponents/admin/inform/modelDeprecationUtils.ts"
  - "projects/app/src/web/admin/system/inform/api.ts"
  - "projects/app/src/web/admin/common/request.ts"
  - "projects/app/src/pages/api/proApi/[...path].ts"
  - "packages/global/openapi/admin/system/inform/api.ts"
  - "packages/service/common/http/entry.ts"
  - "packages/service/common/response/index.ts"
  - "pro/admin/src/pages/api/admin/system/inform/modelDeprecation/create.ts"
  - "pro/admin/src/pages/api/admin/system/inform/modelDeprecation/list.ts"
  - "pro/admin/src/service/middleware/entry.ts"
  - "pro/admin/src/service/middleware/licenseCheck.ts"
  - "pro/admin/src/service/support/permission/adminCert.ts"
  - "pro/admin/src/service/support/user/inform/modelDeprecation/schema.ts"
  - "pro/admin/src/service/support/user/inform/modelDeprecation/service.ts"
  - "pro/admin/src/service/support/user/inform/modelDeprecation/utils.ts"
  - "pro/admin/src/service/support/user/inform/modelDeprecation/queue.ts"
routes:
  - "POST /api/proApi/admin/system/inform/modelDeprecation/create"
  - "POST /api/proApi/admin/system/inform/modelDeprecation/list"
related:
  - "FG-MODEL-MANAGEMENT-001"
  - "FG-MODEL-MANAGEMENT-003"
  - "FG-MODEL-MANAGEMENT-004"
  - "FG-MODEL-MANAGEMENT-005"
baseline: "738e6bdafdfb4b10fa9254c6fbf2cffc7d25e925; pro=bde643736c348e08239fad15e0e2b8fbb8013001"
---

# 管理员创建模型下架通知计划并幂等保存排期

## 用例简介

root 在系统模型配置中发起下架通知，平台保存模型范围、带 offset 的下架截止时间、创建时发送锚点及渠道。后续提醒沿用发送锚点的时分秒与 offset，每轮使用同一渠道配置。重复提交同一请求应复用计划与轮次，管理员能在发送记录中看到一致内容。

## 前置准备

- 需求依据：[模型下架通知（飞书）](https://fael3z0zfze.feishu.cn/docx/Yk2GdhzAnod6nVxPtiGc7jRunlg)，结合用户 2026-11-10 的确认；冲突处以本用例列出的最新口径为准。
- 复用 MANAGEMENT-001 的隔离模型与 RUN。D0 仅 M_LLM/M_EMB 为已启用且标记 true；M_TTS/M_NORMAL 未标记，M_OFF 为停用但标记 true，M_TEAM 属团队范围。模型配置列表的筛选与勾选不是通知模型选择器。
- 部署 App + Pro，主仓库/Pro 基线见 baseline，License 有效；两服务复用 dev 已配置的 Mongo/Redis，以本例模型、requestId、campaignId 清单隔离数据；不得暂停共享业务队列。UI 走 `BASE_URL/api/proApi/admin/system/inform/modelDeprecation/*`，Pro 实际路由为 `/api/admin/system/inform/modelDeprecation/*`。记录实际代理请求，不把前端 Pro 不可用时的空数据降级视为成功。
- 记录 `ADMIN_SESSION` 为 root，另有非 root 的有效会话。保持浏览器所需 Cookie/CSRF 上下文；原始 HTTP 复现沿用本部署登录请求，不使用 rootkey 代替 root 用户身份。
- 使用测试 worker gate 保持本例 campaign 未投递，核对完成后放行；记录 gate 关联 ID，不暂停共享队列。记创建日为 D0，下架日 D=D0+20 个日历日，截止为浏览器本地 D 的 23:59:00。记录浏览器提交锚点 A（例如 D0 的 `14:00:00+08:00`）及服务端 createdAt=T0；请求 R0=`{requestId:RUN+"-C1",models:[M_LLM,M_EMB],plannedDeprecationAt:"<D>T23:59:00+08:00",notificationTime:"<D0>T14:00:00+08:00",channels:["inApp","email","sms"]}`，实际日期与时分秒取本轮浏览器值。
- 证据：`db.model_deprecation_informs.find({requestId:{$in:REQUEST_IDS}})`；逐计划用真实队列 `getJob("modelDeprecationInform:"+campaignId+":"+runIndex)` 读取状态/data，不猜 Redis 物理前缀。HTTP 成功为 200/code=200/data.id 非空；普通业务拒绝按实际 HTTP 与业务错误共同判断，不强加所有错误都是 HTTP 400。
- 已确认：日期从浏览器本地明天起至今天后 90 天可选；发送入口只按 root＋有效商业版显示，不因合格模型数量为零而隐藏。创建成功的计划内容不可编辑；允许同一批模型以新 requestId 另建计划，旧计划保持不变。
- 历史分页请求 body `{pageNum:1,pageSize:20}`，以 data.list 中 id 限定本例；每 1 秒最多 30 秒等待可读。轮次字段以存储记录为准，不以客户端时钟推断。
- C10 七种窗口均用独立 requestId；notificationTime 取同一浏览器钟点与 offset，DDL 为对应日期本地 23:59:00。先以合法测试 gate 隔离本例 campaign，读取计划和全部稳定 Job，验证排期后终止；本项验证排期集合，不将加速消费说成真实等待 90 天。
- C11 独立 P1 使用 A/B 两个标记模型、D0+14；关闭后重开新建弹窗，另建 P2 为相同模型、D0+7。两者均无编辑入口；用新建入口提交不是修改旧日期。
- C12 用共 21 条本例合法历史计划（createdAt 不同，包含一条有 4 个展示名的展示行，以及一条 A/B 范围的 P1 对照）验证列表分页；原计划或夹具均先终止，不在共享库制造真实批量通知。保存这 21 个 ID 的精确集合及顺序；不得混入业务历史。选一条 P1 做模型范围快照对照，新增模型 C 并取消 B 的预警后只重开历史，不另建计划。
- 清理：没有产品删除通知计划接口。结束后先终止尚可终止的本例计划、移除本例稳定 Job，再按登记清单删除精确 campaignId 的计划和失败记录；不对共享库做批量删除。恢复模型并解除本例 gate，投递到收件箱的资源由后续用例清理。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；D0 | root 在“系统模型”列表筛选 M_NORMAL、仅勾选 M_OFF，再点“发送下架通知”，选 D 与默认两项渠道并提交；查询计划、全部稳定 Job 与历史。 |
| C2 | 边界；新 requestId | 原始 HTTP 并发发送两份完全相同 R0；随后再原样重放一次。不得重放一个未确认成功且已更改内容的请求。 |
| C3 | 异常；承接 C2 | 保持同一 requestId，分别只更改截止时间、notificationTime、模型列表或渠道；每个变体恢复已持久化的原计划。 |
| C4 | 配置边界；新 requestId | 独立提交只含 inApp、只含 email/sms 两种渠道组合。 |
| C5 | 异常；新 requestId | 从合法 R0 分别改为缺 requestId、models=[]、channels=[]、重复渠道、非法日期、仅日期/不带 offset 的截止时间、缺失/不带 offset 的 notificationTime；其余条件不变。 |
| C6 | 业务拒绝；新 requestId | 界面打开后把 M_LLM 标记改为 false，再用旧模型列表提交；另用 M_TEAM 或不存在的稳定 ID 替换一个模型。 |
| C7 | 身份/部署边界；独立环境快照 | 有效非 root 会话调用 create/list；恢复 root 后，在隔离 License 无效部署调用；再恢复有效 License 作对照。 |
| C8 | 日历/钟点边界；独立新 requestId | 使用浏览器 UTC、America/Los_Angeles、Asia/Kathmandu 分别提交；另选 D0+12、明天、D0+90、D0+91 日的日期，通过原始 HTTP 补充 UI 禁用日期对照。每个变体恢复有效模型与渠道。 |
| C9 | 表单/入口；身份与模型数量独立变体 | root＋有效商业版下分别准备有/无合格模型并打开弹窗；再对照非 root 商业版、root 非商业版。查看默认渠道、清空日期及昨天/今天/明天/+90/+91 的禁用状态。 |
| C10 | 排期参数矩阵；1/3/7/10/14/30/90 天窗口 | 对下表每个窗口独立创建，读取全部 delivery runs、稳定 Job 和历史发送行，比较日历偏移/钟点/次数；读取结束终止本例计划。 |
| C11 | 新建与不可修改；P1 创建成功 | 关闭再打开新建弹窗，为同一 A/B 模型另选日期创建 P2；对比两个请求标识、计划 ID、P1/P2 的时间、轮次与历史行。更改同 requestId 内容的拒绝沿用 C3。 |
| C12 | 历史展示/快照；21 条合法计划 | 翻两页再返回，重开弹窗与刷新页面；检查四模型行的前三行和 hover 全清单。再新增 C、取消 B 的预警，重开 P1 历史；核对模型范围和日期。 |

C10 完整排期矩阵（数字是创建日后的日历偏移；第 0 天为实际服务端即时首轮，其余沿用 notificationTime 钟点）：

| 窗口 | 发送日偏移 | delivery 次数 |
| --- | --- | --- |
| 1 天 | 0 | 1 |
| 3 天 | 0、2 | 2 |
| 7 天 | 0、4、6 | 3 |
| 10 天 | 0、3、7、9 | 4 |
| 14 天 | 0、5、7、11、13 | 5 |
| 30 天 | 0、5、10、15、20、23、27、29 | 8 |
| 90 天 | 0、5、10、15、20、25、30、35、40、45、50、55、60、65、70、75、80、83、87、89 | 20 |

## 预期结果

公共断言：计划中的模型 ID、两个原始时间与渠道保存准确；无通知实际投递发生在本例暂停阶段。历史只返回展示字段，不暴露团队游标或联系方式。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI/API/数据库/队列 | models 精确为 M_LLM/M_EMB；表格筛选与勾选不改变范围。两个时间字符串连同 offset 原样保存，历史保持一致；D0+20 日夹具的 delivery run 为 T0 立即发送，以及 D0+5/+10/+13/+17/+19 日的 A 钟点（例如均为 14:00:00+08:00），状态 scheduled，所有轮次均保留三渠道。 | HAR、请求/响应、完整计划、全部稳定 Job.data、历史行。 |
| C2 | API/数据库/队列 | 所有成功响应 id 相同；该 requestId 仅一条计划，各 runIndex 只有稳定 Job，无额外轮次。 | 响应 ID 集合、精确计数、Job 清单。 |
| C3 | API/数据库 | 明确拒绝，不静默返回旧计划作为新内容；原 models/plannedDeprecationAt/notificationTime/runs 不改写。 | 业务错误与原计划前后快照。 |
| C4 | API/数据库 | 两种渠道组合均按同一日历规则生成全部轮次；每轮只含所选渠道。 | 两条新计划 runs 数量与渠道。 |
| C5 | API/数据库 | 输入校验为 HTTP 400、code=400；不创建对应 requestId 的记录。 | 原始响应与按 requestId 查询结果。 |
| C6 | API/数据库 | 服务端重读系统范围及预警标记后拒绝，不仅信任打开弹窗时的列表；无新计划。停用模型的手工 API 入参是否一律拒绝未确认，本例不据 UI 筛选臆造此预期。 | 模型变更快照、请求及计划差集。 |
| C7 | API/数据库 | 非 root 无权创建/读取管理历史；License 无效不能执行通知管理；有效 root 对照成功。拒绝时无本例新计划，不把代理返回的空 list 当作授权通过。 | 会话角色、实际上游响应、DB 差集。 |
| C8 | UI/API/数据库/队列 | UI 截止时间为所选日的本地 23:59:00，并使用该日期的实际 offset；A 为创建时 offset，后续时分秒与 offset 沿用 A（不随服务器 TZ 或 DDL 钟点改变）。D0+12 的第 5 天与 D-7 重合只存一轮；明天的 D-1 与创建日重合只保留即时首轮；第 90 天允许、第 91 天拒绝且无新计划。 | HAR 的两个原始时间、scheduledAt 换算为 A offset 后的日历与钟点、UI 禁用状态及拒绝响应。 |
| C9 | UI/API | root＋有效商业版总能看见入口；无合格模型时可打开但不可创建。非 root 或非商业版不显示该入口。站内信默认选中且不可取消，短信/邮件可切换；未选日期禁用提交，昨天/今天不可选，明天/+90 可选，+91 不可选。 | 各身份/License/模型数量下的入口、checkbox、日期格及按钮状态截图；合法提交的渠道请求。 |
| C10 | API/数据库/队列/UI | 七种窗口各自的完整日历序列和次数与矩阵相等，无多发/漏发/同日重复；10 天窗口不得出现第 5 天周期提醒。各次均早于 DDL，后续钟点/offset 与锚点相同，Job.data 和历史轮次对应。 | 每窗口原始请求、全部 scheduledAt 与 offset 投影、Job 清单和历史行；逐项比较精确数组。 |
| C11 | UI/API/数据库 | P1 日期不能编辑，P2 使用不同 requestId/id 并成为独立历史计划；P1 的模型、DDL、锚点、排期及渠道完全不变，P2 按新日期排期。相同 requestId 同内容仍复用，改内容拒绝沿用 C2/C3。 | 两份创建请求及响应、P1 只读前后快照、P2 新排期与历史两行。 |
| C12 | UI/API/数据库 | 历史支持每页 20 条，21 条应能完整翻页，无重复遗漏；按创建时间倒序，返回/刷新后保留；无额外排序、筛选、删除或改日期入口。模型范围最多显示三行，hover 按顺序逐行显示完整清单。P1 仍保留原 A/B 范围，不因新增 C 或 B 取消标记改变；日期仍为创建时值。 | 两页全部 ID 与顺序、总数/翻页状态、四模型 tooltip、标记变动前后同一 P1 快照和截图。 |
