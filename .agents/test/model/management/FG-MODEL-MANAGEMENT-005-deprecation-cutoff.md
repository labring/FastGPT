---
case_version: 1
id: "FG-MODEL-MANAGEMENT-005"
title: "下架日零点后所有通知路径停止投递"
business: "model/management"
types: ["api", "integration"]
category: "boundary"
scenario: "special"
priority: "P1"
status: "draft"
tags: ["pr-8205", "model-deprecation", "覆盖基础场景", "覆盖异常场景", "覆盖边界场景"]
evidence: ["response", "database", "queue"]
sources:
  - "packages/global/openapi/admin/system/inform/api.ts"
  - "projects/app/src/pageComponents/admin/inform/modelDeprecationUtils.ts"
  - "pro/admin/src/service/support/user/inform/modelDeprecation/utils.ts"
  - "pro/admin/src/service/support/user/inform/modelDeprecation/service.ts"
  - "pro/admin/src/service/support/user/inform/modelDeprecation/worker.ts"
  - "pro/admin/src/service/support/user/inform/modelDeprecation/queue.ts"
routes:
  - "POST /api/proApi/admin/system/inform/modelDeprecation/create"
  - "POST /api/proApi/admin/system/inform/modelDeprecation/recover"
  - "POST /api/proApi/admin/system/inform/modelDeprecation/retry"
  - "POST /api/proApi/admin/system/inform/modelDeprecation/list"
related:
  - "FG-MODEL-MANAGEMENT-002"
  - "FG-MODEL-MANAGEMENT-003"
  - "FG-MODEL-MANAGEMENT-004"
baseline: "3eca129944291a82acda9471201dccc5cb2525cf; pro=48ee04dd34d4d5b13e77ed4ce184124e491a765a"
---

# 下架日零点后所有通知路径停止投递

## 用例简介

模型计划下架后，继续提醒已失去提前迁移的作用。普通排期、队列迟到、故障恢复及人工重发都必须遵守下架日当天 00:00 的截止点，执行中的批次跨过截止点后也不能再发起新投递。

## 前置准备

- 需求依据：本次 PR #8205 解读中用户明确确认“计划下架后不再发送”，并选择“下架日当天 00:00 起停止”。该预期优先于 baseline 当前无截止检查的实现，不能把三轮照常发送写成正确结果。
- 复用 MANAGEMENT-002/003/004 的真实 App/Pro/Mongo/Redis、成功接收端、计划和失败夹具。单独启动可控时钟的测试 API/worker；只替换系统时钟和外部接收设施，不 mock 投递许可、恢复、重发、扫描和持久化逻辑。
- 阻塞项：产品尚未约定统一业务日界时区，也未提供已验证的 API/worker 时钟控制启动方式。补齐这两项后才改 ready；当前以 Asia/Shanghai 演示数据，不能据用户电脑时区推定全球业务规则。known bug 本身不是用例定义通过的证据。
- 演示：T0=2026-11-07 12:00，plannedDeprecationAt=`2026-11-10`，D=2026-11-10 00:00（待落实的统一业务时区）；正常候选轮次 T0、T0+48h、T0+96h。每行独立新 campaign，模型和团队始终有效且仍引用计划模型，排除“无人命中”造成的零投递。
- 在真实队列将各类原 Job 准备为可立即执行，分别控制执行开始时刻；不能只改变数据库 scheduledAt 就声称覆盖实际发送时刻。gate 可在目标之间或团队页之间控制推进，在跨截止场景等待 D 前已开始请求全部到达 gate，再推进时钟。
- 记录每个接收端请求的发起时间、worker 观测时间及 DB 的新 inform；D 前已发起请求在 D 后才回执不属于新投递。负向验证要先证明同夹具在 D 前可以送达；检查 Job 已消费或明确停止，不能仅固定 sleep 后看“未收到”。
- 统一判据：每 1 秒最多 120 秒等本轮停止推进或进入明确不再执行的状态；达到稳定状态后再观察 10 秒无新接收请求，记录状态和值。到期后历史采用何种状态尚未约定，不臆造 expired 或沿用会将整个计划当管理员终止的 skipped。
- 清理：解除 gate、还原时钟与业务时区配置，终止/移除本例 Jobs，再精确 teardown；不得调整宿主或共享数据库的系统时间。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础/排期；T0 新计划 | 创建三轮候选计划，分别在 T0、T0+48h、T0+96h 调度执行，保留实际轮次与接收记录。 |
| C2 | 临界；相同资源的独立 campaign | 分别在 D-1ms、D、D+1ms 发起本轮投递，接收设施即时成功。 |
| C3 | 队列迟到；截止前已入队 | scheduledAt<D，暂停 worker 直至 D 后恢复；对已进入基础设施自动重试的 Job 重复该变体。 |
| C4 | 恢复/重发；独立 G0/F0 | 在 D 后分别人工 recover failed/interrupted、人工 retry completed+unresolved、重启 worker 自动恢复 scheduled/running/interrupted。 |
| C5 | 执行中跨日；gate 前为 D-1s | 首个目标完成后阻塞下一目标；推进到 D 再继续同团队其他渠道及下一团队/下一页。 |
| C6 | 时区边界；补齐统一业务时区后 | 浏览器和 Pro 分别用 UTC、Asia/Shanghai、America/Los_Angeles，但保存同一日历日期；以同一 UTC 瞬间执行 D 两侧对照。 |
| C7 | 过期创建/重复提交；独立 requestId | 在 D 后用真实 create HTTP 提交 D；另在 D 前创建并在 D 后原 requestId 重放，确保接收路径可观测。 |

## 预期结果

公共断言：实际新投递必须满足 `发送时刻 < D`，并保持原有管理员、模型可用性与受众规则。禁止通过新建 Job、恢复游标或新 requestId 绕过截止；不要求外部已经接收的消息被撤回。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | API/队列/接收端 | 前两轮可发，T0+96h 已越过 D，不能实际投递；排期如何存储由修正方案决定，不能仅靠删排期通过整套用例。 | 计划与 Job 实际记录、三次调度时间、接收差集。 |
| C2 | 服务集成/数据库/接收端 | D-1ms 允许；D 与 D+1ms 均零新增投递。 | 受控时钟时间线、队列处理确认、inform 与外部请求。 |
| C3 | 队列/接收端 | 创建/入队在截止前也不能放行截止后的执行或自动重试。 | 原 scheduledAt、消费/重试时刻、新请求零增量。 |
| C4 | API/队列/数据库 | 所有恢复与重发路径都不再产生消息；是否直接拒绝 API 或接收后停止按产品明确方案验收，不能假定不存在的错误码。 | 每类实际 API 响应、原/新 runIndex、Job 状态及消息差集。 |
| C5 | 服务集成/接收端 | D 前已开始的调用可完成；D 起不能再发起同团队后续渠道或后续团队的新投递。 | gate 时序、每条调用开始时刻，不能仅比较收件时间。 |
| C6 | API/服务集成 | 日期保持 YYYY-MM-DD，截止瞬间按已确认业务时区一致，不随浏览器或进程 TZ 漂移。 | 配置、存储日期、换算后的 UTC 截止值与两侧结果。 |
| C7 | API/数据库/接收端 | 两种请求都不能产生 D 后新通知；同标识重放仍遵守原计划幂等。 | 请求 ID、计划数量及明确终止执行后的接收差集。 |
