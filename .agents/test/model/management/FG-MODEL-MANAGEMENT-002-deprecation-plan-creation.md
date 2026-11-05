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
baseline: "3eca129944291a82acda9471201dccc5cb2525cf; pro=48ee04dd34d4d5b13e77ed4ce184124e491a765a"
---

# 管理员创建模型下架通知计划并幂等保存排期

## 用例简介

root 在系统模型配置中发起下架通知，平台将模型范围、日历日期和渠道保存为可追踪计划。重复提交同一请求应复用计划与轮次，管理员能在发送记录中看到一致内容。

## 前置准备

- 复用 MANAGEMENT-001 的隔离模型与 RUN。D0 仅 M_LLM/M_EMB 为已启用且标记 true；M_TTS/M_NORMAL 未标记，M_OFF 为停用但标记 true，M_TEAM 属团队范围。模型配置列表的筛选与勾选不是通知模型选择器。
- 部署 App + Pro，主仓库/Pro 基线见 baseline，License 有效；两服务连接专用 Mongo/Redis。UI 走 `BASE_URL/api/proApi/admin/system/inform/modelDeprecation/*`，Pro 实际路由为 `/api/admin/system/inform/modelDeprecation/*`。记录实际代理请求，不把前端 Pro 不可用时的空数据降级视为成功。
- 记录 `ADMIN_SESSION` 为 root，另有非 root 的有效会话。保持浏览器所需 Cookie/CSRF 上下文；原始 HTTP 复现沿用本部署登录请求，不使用 rootkey 代替 root 用户身份。
- 创建前用实际 BullMQ SDK 暂停本例专用 `QueueNames.modelDeprecationInform`，确保核对计划时未开始投递。下架日 D 选至少 10 天后的日期，本例不触及截止；记录后端 createdAt=T0。请求 R0=`{requestId:RUN+"-C1",models:[M_LLM,M_EMB],plannedDeprecationAt:D,channels:["inApp","email","sms"]}`。
- 证据：`db.model_deprecation_informs.find({requestId:{$in:REQUEST_IDS}})`；逐计划用真实队列 `getJob("modelDeprecationInform:"+campaignId+":"+runIndex)` 读取状态/data，不猜 Redis 物理前缀。HTTP 成功为 200/code=200/data.id 非空；普通业务拒绝按实际 HTTP 与业务错误共同判断，不强加所有错误都是 HTTP 400。
- 历史分页请求 body `{pageNum:1,pageSize:20}`，以 data.list 中 id 限定本例；每 1 秒最多 30 秒等待可读。轮次字段以存储记录为准，不以客户端时钟推断。
- 清理：没有产品删除通知计划接口。结束后先终止尚可终止的本例计划、移除本例稳定 Job，再由隔离库夹具 teardown 删除精确 campaignId 的计划和失败记录；不对共享库做批量删除。恢复模型与专用队列，投递到收件箱的资源由后续用例清理。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；D0 | root 在“系统模型”列表筛选 M_NORMAL、仅勾选 M_OFF，再点“发送下架通知”，选 D 与默认两项渠道并提交；查询计划、三个 Job 与历史。 |
| C2 | 边界；新 requestId | 原始 HTTP 并发发送两份完全相同 R0；随后再原样重放一次。不得重放一个未确认成功且已更改内容的请求。 |
| C3 | 异常；承接 C2 | 保持同一 requestId，分别只更改日期、模型列表或渠道；每个变体恢复已持久化的原计划。 |
| C4 | 配置边界；新 requestId | 独立提交只含 inApp、只含 email/sms 两种渠道组合。 |
| C5 | 异常；新 requestId | 从合法 R0 分别改为缺 requestId、models=[]、channels=[]、重复渠道或非法日期；其余条件不变。 |
| C6 | 业务拒绝；新 requestId | 界面打开后把 M_LLM 标记改为 false，再用旧模型列表提交；另用 M_TEAM 或不存在的稳定 ID 替换一个模型。 |
| C7 | 身份/部署边界；独立环境快照 | 有效非 root 会话调用 create/list；恢复 root 后，在隔离 License 无效部署调用；再恢复有效 License 作对照。 |

## 预期结果

公共断言：计划中的模型 ID、日期与渠道保存准确；无通知实际投递发生在本例暂停阶段。历史只返回展示字段，不暴露团队游标或联系方式。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI/API/数据库/队列 | models 精确为 M_LLM/M_EMB；表格筛选与勾选不改变范围。日期原样为 D；三个 delivery run 的 scheduledAt 分别为 T0、T0+48h、T0+96h，状态 scheduled。首轮三渠道，后两轮仅 email/sms。 | HAR、请求/响应、完整计划、三个 Job.data、历史行。 |
| C2 | API/数据库/队列 | 所有成功响应 id 相同；该 requestId 仅一条计划，各 runIndex 只有稳定 Job，无额外轮次。 | 响应 ID 集合、精确计数、Job 清单。 |
| C3 | API/数据库 | 明确拒绝，不静默返回旧计划作为新内容；原 models/date/runs 不改写。 | 业务错误与原计划前后快照。 |
| C4 | API/数据库 | 仅站内信生成 1 轮；仅外部渠道生成 3 轮且没有站内信。 | 两条新计划 runs 数量与渠道。 |
| C5 | API/数据库 | 输入校验为 HTTP 400、code=400；不创建对应 requestId 的记录。 | 原始响应与按 requestId 查询结果。 |
| C6 | API/数据库 | 服务端重读系统范围及预警标记后拒绝，不仅信任打开弹窗时的列表；无新计划。停用模型的手工 API 入参是否一律拒绝未确认，本例不据 UI 筛选臆造此预期。 | 模型变更快照、请求及计划差集。 |
| C7 | API/数据库 | 非 root 无权创建/读取管理历史；License 无效不能执行通知管理；有效 root 对照成功。拒绝时无本例新计划，不把代理返回的空 list 当作授权通过。 | 会话角色、实际上游响应、DB 差集。 |
