---
case_version: 1
id: "FG-MODEL-MANAGEMENT-004"
title: "通知失败可定位重发且计划终止后不再恢复"
business: "model/management"
types: ["api", "ui", "integration"]
category: "abnormal"
scenario: "failure"
priority: "P1"
status: "ready"
tags: ["pr-8205", "model-deprecation", "覆盖基础场景", "覆盖异常场景", "覆盖边界场景"]
evidence: ["response", "ui", "database", "queue"]
sources:
  - "projects/app/src/pageComponents/model/ModelDeprecationHistoryModal.tsx"
  - "packages/global/openapi/admin/system/inform/api.ts"
  - "pro/admin/src/pages/api/admin/system/inform/modelDeprecation/failures.ts"
  - "pro/admin/src/pages/api/admin/system/inform/modelDeprecation/recover.ts"
  - "pro/admin/src/pages/api/admin/system/inform/modelDeprecation/retry.ts"
  - "pro/admin/src/pages/api/admin/system/inform/modelDeprecation/terminate.ts"
  - "pro/admin/src/service/support/user/inform/modelDeprecation/service.ts"
  - "pro/admin/src/service/support/user/inform/modelDeprecation/entity.ts"
  - "pro/admin/src/service/support/user/inform/modelDeprecation/schema.ts"
  - "pro/admin/src/service/support/user/inform/modelDeprecation/queue.ts"
  - "pro/admin/src/service/support/user/inform/modelDeprecation/worker.ts"
routes:
  - "POST /api/proApi/admin/system/inform/modelDeprecation/list"
  - "POST /api/proApi/admin/system/inform/modelDeprecation/failures"
  - "POST /api/proApi/admin/system/inform/modelDeprecation/recover"
  - "POST /api/proApi/admin/system/inform/modelDeprecation/retry"
  - "POST /api/proApi/admin/system/inform/modelDeprecation/terminate"
related:
  - "FG-MODEL-MANAGEMENT-002"
  - "FG-MODEL-MANAGEMENT-003"
  - "FG-MODEL-MANAGEMENT-005"
baseline: "b3e128bfcc22b0de0ca435fcc3f1da0f906bbe12; pro=4d64498b1ef48009d314794ef895a4612db9a017"
---

# 通知失败可定位重发且计划终止后不再恢复

## 用例简介

管理员需要区分个别消息投递失败与整个轮次启动失败或中断，并选择正确恢复方式。恢复沿用原轮次和游标，重发只处理未解决失败，终止计划后不能通过启动恢复或重试重新发送。

## 前置准备

- 需求依据：[模型下架通知（飞书）](https://fael3z0zfze.feishu.cn/docx/Yk2GdhzAnod6nVxPtiGc7jRunlg)，结合用户 2026-11-10 的确认；冲突处以本用例列出的最新口径为准。
- 复用 MANAGEMENT-002/003 的 dev 服务与隔离资源、SMTP/SMS_PROXY、受众和清理；下架日远于本例所有操作，截止由 MANAGEMENT-005 单独验收。
- R0 正常投递计划；F0 是接收端对一个指定团队持续失败、其他团队成功后得到的 completed 轮次和 unresolved 失败记录。外部 sendMessage 自身会重试，失败计数按最终记录计，不能把网络尝试次数当 failureCount。
- 恢复夹具 G0：使用按 campaignId 限定的 worker gate，从合法计划结构在 dev Mongo 制作独立 campaign 副本，设置原 runIndex 的 failed/interrupted/scheduled/running 状态及有效 upperTeamId/cursorTeamId。保存夹具 BSON和唯一 requestId；明确这是状态恢复集成，不声称已复现真实进程崩溃。游标前后各准备一个可命中的团队，当前页没有未提交消息。
- “原地重试/不新增记录”按业务展示验收：保留同一 campaign，重试链只显示末端，不新增重复历史计划。单条外部投递失败允许内部追加 retry run 并保留审计链；failed/interrupted 的整轮恢复仍沿用原 runIndex，不能把两种重试混为同一规则。
- C9 建立仍引用计划模型的团队，首轮仅对外部接收端注入失败。保留原计划的下一次常规 delivery run 与稳定 Job，先记录 scheduledAt/channels/status；撤除故障后仅加速本例下一轮，按 MANAGEMENT-003 的队列夹具约定执行，不能把 retry run 冒充下一次常规提醒。
- C10 分别用有已完成轮次的 30 天计划 P_STOP 与 3 天计划 P_DONE。P_STOP 首轮完成后终止；P_DONE 按本例夹具加速剩余常规轮次直到全部完成且无异常。所有时钟值仍早于对应 DDL；root＋有效商业版始终保留。历史关闭重开/刷新均取证，不只检查数据库状态。
- 接口 body：failures=`{campaignId,runIndex,pageNum:1,pageSize:20}`，recover/retry=`{campaignId,runIndex}`，terminate=`{campaignId}`。每次 UI 操作保留实际请求，失败列表以 data.list 为准。
- 只读：`db.model_deprecation_informs.findOne({_id:CAMPAIGN_ID})`；`db.model_deprecation_inform_failures.find({campaignId:CAMPAIGN_ID,runIndex:INDEX})`；其他消息查询复用 MANAGEMENT-003。点击历史行异常数量按需读取只读 JSON；准备至少 21 条本例失败记录检查分页，不能读取其他计划。
- 每 1 秒轮询原/重发轮次，最多 120 秒到 completed 或预期失败终态；恢复启动查询最多 30 秒。运行中终止用接收端 gate 暂停本页、提交终止、放行已开始页，至少准备两页团队。不能要求撤回已发出的外部请求。
- 重复/竞态场景在请求后先查计划和 Job 是否已成功；只按稳定标识重试。清理先解除所有 gate、终止本例计划，再执行 MANAGEMENT-002 的精确 teardown。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 异常；R0 | 使一个外部目标持续投递失败，其余成功；等待本轮结束并查看异常明细。 |
| C2 | 恢复边界；G0 各状态独立 | failed/interrupted 分别点历史“重试”并检查请求；scheduled/running/interrupted/failed 四种起点分别重启 Pro worker。 |
| C3 | 重发；F0 | 撤除目标故障后并发两次 retry；等待完成；再以无 unresolved 失败的来源调用 retry。 |
| C4 | 连续失败；新 F0 | 保持来源目标失败，执行重发；再次重发新轮次，随后恢复接收端，检查整条失败链与历史行。 |
| C5 | 收件目标切换；F0 独立副本 | 重发前分别更改通知账号但保持同渠道、改成另一渠道、删除团队，或让站内信原用户不再属于当前收件集合。 |
| C6 | 终止；scheduled 计划与 gated running 计划独立 | 调用 terminate；放行当前页，观察后续页与未来轮次；再调用 recover/retry 并重启 worker。 |
| C7 | 运行边界；合法计划副本 | 原 run 为 completed/scheduled 时调用 recover；未 completed 的来源调用 retry；另传不存在 campaign 或越界 runIndex。 |
| C8 | UI/数据边界；21 条失败夹具 | 在历史里翻页并点击异常明细、翻第二页；查看故意含测试邮箱/手机号的错误对象所产生的实际持久化记录。 |
| C9 | 连续状态；首轮外部失败，后续常规轮次待执行 | 首轮结束后查看异常数与后续等待行；恢复接收端，触发同计划下一次常规 delivery run，核对团队站内信/外部请求差集和其他未来行。 |
| C10 | 计划最终状态 UI；P_STOP/P_DONE 独立 | 对 P_STOP 首轮完成后点击终止，重开历史并刷新；对 P_DONE 加速剩余原轮次直至全部完成，再重开历史。分别检查每轮状态、操作列、重试入口和页头发送入口。 |

## 预期结果

公共断言：状态与副作用共同验证。completed 表示处理结束，仍可能有 failureCount>0；异常数量为失败调用记录数，不能按团队去重后代替。记录精确 campaign/run/sourceFailureId 关系。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | API/数据库/接收端 | 轮次 completed，有 unresolved 失败；其他团队消息已送达。failureCount 等于本轮实际失败记录数。 | 明细、计数和其他目标接收记录。 |
| C2 | UI/API/队列/数据库 | failed/interrupted 的按钮发 recover，沿用原 runIndex/游标，不追加 retry；启动自动补投 scheduled/running/interrupted，跳过 failed。 | HAR、runs 长度/索引、Job.data、游标前后消息差集。 |
| C3 | API/数据库/队列 | 同一来源并发请求只产生一个在途 retry run，返回相同 runIndex；仅投递未解决失败，成功后来源记录 resolved。没有可重发记录时拒绝。 | 两次响应 created/runIndex、失败状态、接收目标差集。 |
| C4 | UI/数据库 | 再次失败时旧失败 superseded，并关联新 unresolved 记录；后续成功变 resolved。UI 每条重试链只显示末端，不能重复展示旧失败为当前可重试项。 | sourceFailureId/supersededByFailureId 链、UI、每轮 failureCount。 |
| C5 | 数据库/接收端 | 同渠道新账号使用发送时读取的新值；渠道已变、团队或目标失效则来源失败 not_applicable，不继续向旧目标发送。 | 原/新通知账号快照、失败状态、目标接收记录。 |
| C6 | API/队列/数据库 | 待发送轮次取消；运行任务在页边界停止，后续页和轮次不发送；已终止计划禁止恢复/重发，启动也不重新补投。 | terminate 返回索引、页界时序、Job 状态、下一页消息零增量。 |
| C7 | API/数据库 | 明确拒绝不合法状态或索引，runs/游标/失败关系不被改写。 | 业务错误与对应精确快照。 |
| C8 | UI/API/数据库 | 明细分页无重复遗漏且限定 campaign/run；记录及接口不保存联系方式或消息 payload，诊断保留安全错误摘要/调用栈。 | 全页 ID 集合、实际故障生成的错误记录及脱敏前后对照。 |
| C9 | UI/队列/数据库/接收端 | 首轮保持 completed＋实际失败数，后续行仍 scheduled/等待执行且没有被删。故障撤除后下一次原 delivery run 正常完成，并重新向当前受影响团队投递所选渠道；未创建 retry run，其他未来轮次及其他计划保持原排期。 | 原/后轮 runIndex/kind、前后计划和 Job 快照、历史等待行及分轮消息/外部请求差集。 |
| C10 | UI/API/数据库 | P_STOP 只把未完成行变为已终止，原已完成行保持全部完成；P_DONE 所有原轮次显示全部完成且无异常。两者操作列均为 `-`，关闭重开与刷新不恢复终止/重试按钮；root 商业版页头发送入口仍保留，另建计划按 MANAGEMENT-002/C11 验收，不要求全局禁止新建。 | 两计划各次历史截图、原/终态轮次精确集合、操作列与页头按钮可见性。 |

页级恢复说明：游标仅在整页处理后提交。若一页部分消息成功、游标提交前基础设施失败，恢复允许重放未提交页；不以“绝不重复任何消息”作为本用例预期。涉及该故障的执行应保存实际页界与已发送目标证据。
