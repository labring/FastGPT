---
case_version: 1
id: "FG-MODEL-MANAGEMENT-005"
title: "实际下架截止时刻起所有通知路径停止投递"
business: "model/management"
types: ["api", "integration"]
category: "boundary"
scenario: "special"
priority: "P1"
status: "ready"
tags: ["pr-8205", "model-deprecation", "覆盖基础场景", "覆盖异常场景", "覆盖边界场景"]
evidence: ["response", "database", "queue"]
sources:
  - "packages/global/openapi/admin/system/inform/api.ts"
  - "projects/app/src/pageComponents/admin/inform/modelDeprecationUtils.ts"
  - "pro/admin/src/service/support/user/inform/modelDeprecation/utils.ts"
  - "pro/admin/src/service/support/user/inform/modelDeprecation/service.ts"
  - "pro/admin/src/service/support/user/inform/modelDeprecation/worker.ts"
  - "pro/admin/src/service/support/user/inform/modelDeprecation/queue.ts"
  - "pro/admin/src/service/support/user/inform/modelDeprecation/entity.ts"
  - "pro/admin/src/service/support/user/inform/sendMessage.ts"
routes:
  - "POST /api/proApi/admin/system/inform/modelDeprecation/create"
  - "POST /api/proApi/admin/system/inform/modelDeprecation/recover"
  - "POST /api/proApi/admin/system/inform/modelDeprecation/retry"
  - "POST /api/proApi/admin/system/inform/modelDeprecation/list"
related:
  - "FG-MODEL-MANAGEMENT-002"
  - "FG-MODEL-MANAGEMENT-003"
  - "FG-MODEL-MANAGEMENT-004"
baseline: "b3e128bfcc22b0de0ca435fcc3f1da0f906bbe12; pro=4d64498b1ef48009d314794ef895a4612db9a017"
---

# 实际下架截止时刻起所有通知路径停止投递

## 用例简介

下架截止时间是带 offset 的实际时刻，前端提交所选日期在浏览器本地 23:59 的值。普通排期、队列迟到、故障恢复、人工重发和发送器内部重试都遵守这一 DDL，运行中的批次跨过截止后也不能再发起新投递。

## 前置准备

- 需求依据：用户确认接口接收并保存带 offset 的下架时间；发送锚点另用 notificationTime 保存创建时钟点。最新要求取代“下架日 00:00”口径，允许发送的条件为 `now < new Date(plannedDeprecationAt)`，等于 DDL 即停止。
- 复用 MANAGEMENT-002/003/004 的 dev App/Pro/Mongo/Redis、成功接收端、独立 campaign/团队及清理清单。仅限本例资源使用时钟/gate，不调整宿主、共享服务或数据库时钟。
- 受控时钟：只在本轮专用 App/Pro 子进程设置 `FASTGPT_TEST_CLOCK_FILE=/绝对路径/clock.json` 和 `NODE_OPTIONS="--require=/仓库绝对路径/.agents/test/support/controlled-clock.cjs"`。初始文件为 `{"now":null}`；启动成功后原子写入 `{"now":毫秒时间戳}` 冻结 Date，系统定时器仍走真实时间。测试控制器不加载此文件，使用真实时间作超时。先验证真实 create 的 createdAt 与冻结值精确相等、真实 worker 已消费且 inform.time 相等，再执行边界断言。
- 投递 gate：SMTP 接收端在 DATA 后保留响应，可在 D 前进入、推进时钟到 D 后返回 550，验证发送器内部重试不再发起请求。站内信测试在本轮隔离工作树的 `createModelDeprecationUserInform` 中，仅于真实 Mongo insert 完成后等待本机 HTTP gate；记录返回的 inform.time，放行后继续原业务。此临时插桩只增加等待，不替代扫描器、写入、sendMessage 或状态推进，结束后恢复源文件并校验 git diff；不把插桩提交到产品代码。
- 正向与负向分别用独立计划，入队前冻结到 D-2ms，暂停本轮专用队列，计划保存后将时钟设为 D-1ms、D、D+1ms 再放行；该队列必须是本轮专用 Redis DB，不能暂停共享业务队列。API 与 worker 观察的时间必须与控制文件一致。
- 夹具示例：notificationTime=`2026-11-01T14:00:00+08:00`，DDL D=`2026-11-21T23:59:00+08:00`；测试时替换成当前未来日期。正常候选为即时首轮及 11/06、11/11、11/14、11/18、11/20 的 14:00+08:00。各行独立 campaign，模型/团队有效且仍引用计划模型，排除“无人命中”造成的零投递。
- 记录接收端每个请求的发起时刻、worker 观测时间及数据库新增 inform；D 前已经发起的请求在 D 后回执可正常完成，不属于 D 后新投递。负向对照先证明同夹具在 D 前可送达，并确认 Job 已消费或明确停止，不能只 sleep 后看“未收到”。
- 每 1 秒最多 120 秒等待停止推进；稳定后观察 10 秒无新接收请求。到期将 scheduled/running/failed/interrupted 轮次改为 skipped，errorSummary=`Model deprecation deadline reached`，保留 completed/terminated、游标和既有计数。
- 清理：解除本例 gate、还原测试时钟适配，移除本例 Jobs，再按 ID 清单删除资源；不新建本地数据库或清空 dev 业务数据。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础排期；新计划 | 按示例创建计划，核对全部候选时间；正常运行 D 前轮次。 |
| C2 | 临界；独立 campaign | 对同形有效目标分别在 D-1ms、D、D+1ms 发起本轮投递，接收端即时成功。 |
| C3 | 队列迟到/内部重试；截止前已入队 | 将 scheduledAt<D 的本例 Job gate 到 D 后消费；另让外部发送第一次在 D 前失败、sendMessage 内部下一次重试到达 D。 |
| C4 | 恢复/重发；独立失败夹具 | D 后分别 HTTP recover failed/interrupted、retry completed+unresolved；重启本例 worker 自动恢复 scheduled/running/interrupted。 |
| C5 | 执行中跨 DDL；D-1s | 首个目标完成后，gate 后续目标或团队页；推进到 D 再放行同团队后续成员、外部渠道及下一团队/页。 |
| C6 | offset/进程时区边界；独立副本 | 固定 D 的绝对时刻，分别提交 `2026-11-21T23:59:00+08:00` 与等价的 `2026-11-21T08:59:00-07:00`（实际换成未来日期）；Pro 进程 TZ 在 UTC/Asia/Shanghai 间切换作对照。 |
| C7 | 过期创建/幂等重放；独立 requestId | 在 D 后用真实 create HTTP 提交 D；另在 D 前创建，D 后保持原 requestId 和 notificationTime 重放。 |

## 预期结果

公共断言：所有新投递满足 `发起时刻 < D`，不因浏览器/服务器时区、队列重试或新 requestId 绕过 DDL。到期处理不覆盖既有完成结果；D 前已发起请求可完成，不要求撤回。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | API/数据库/队列/接收端 | 两个时间及 offset 原样保存，后续轮次为锚点 14:00，全部 scheduledAt<D；D 前正常送达所选渠道。 | 原始请求、计划/Job、换算到锚点 offset 的时间与收件记录。 |
| C2 | 服务集成/数据库/接收端 | D-1ms 允许；D 与 D+1ms 零新增投递，未完成 run 跳过。 | 受控时钟时间线、消费确认、inform 与外部请求差集。 |
| C3 | 队列/发送器/接收端 | D 后消费的旧 Job 不发送；发送器内部重试在 D 起也不再发起请求，不能只在 Worker 入口检查。 | 原 scheduledAt、消费时刻、每次网络尝试发起时间和零新增记录。 |
| C4 | API/队列/数据库 | recover/retry 明确业务拒绝；启动恢复跳过过期计划，不新增可发送轮次。未完成状态改 skipped，completed 保留。 | 实际响应、runIndex/状态/计数前后快照、Job 和收件差集。 |
| C5 | 服务集成/接收端 | D 前已开始的调用可完成；D 起同团队其他成员、渠道及后续团队均不再发起新投递。 | gate 时序、各调用发起时刻，不能只比较收件时间。 |
| C6 | API/服务集成 | 两种 ISO 表示原样保存但截止瞬间相同；D 两侧行为一致，不随进程 TZ 漂移。 | 原始字符串、换算后的 UTC 截止值、时区配置与投递差集。 |
| C7 | API/数据库/接收端 | 过期新建明确拒绝且无记录；原标识重放不新增计划，到期后也不补发。 | HTTP/业务响应、requestId 精确计数、原 runs 状态及接收差集。 |
