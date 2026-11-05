---
case_version: 1
id: "FG-PERMISSION-TEAM-001"
title: "成员离职、应用转让与注销时应用 Key 持续可用"
business: "permission/team"
types: [api, e2e, integration]
category: boundary
scenario: special
priority: P0
status: ready
automation:
  - runner: node
    script: .agents/test/permission/team/FG-PERMISSION-TEAM-001.mjs
    items: [T1, T2, T3, T4, T5, T6, T7]
tags: [phase3, app-api-key, customuid-publishsource, 离职交接, Pro, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, database, storage]
sources:
  - ".agents/design/api/app-api-key.md"
  - "pro/admin/src/service/core/changeOwner.ts"
  - "pro/admin/src/service/support/user/controller.ts"
  - "pro/admin/src/pages/api/core/app/changeOwner.ts"
  - "pro/admin/src/pages/api/support/user/team/member/delete.ts"
  - "pro/admin/src/pages/api/support/user/team/member/leave.ts"
  - "pro/admin/src/service/support/user/account/cancellation/finalize/cleanupTeams.ts"
  - "pro/admin/src/service/support/user/account/cancellation/finalize/residualCheck.ts"
  - "packages/global/openapi/core/app/permission/index.ts"
  - "packages/global/openapi/support/user/team/member/api.ts"
  - "packages/service/support/permission/resourcePermissionService.ts"
  - "packages/service/core/app/controller.ts"
  - "projects/app/src/pages/api/core/app/batch/delete.ts"
  - "packages/service/support/user/team/delete/processor.ts"
  - "packages/service/support/user/audit/schema.ts"
routes:
  - "DELETE /api/proApi/support/user/team/member/delete"
  - "DELETE /api/proApi/support/user/team/member/leave"
  - "POST /api/proApi/core/app/changeOwner"
  - "POST /api/core/app/batch/delete"
related:
  - "FG-INTEGRATION-OPENAPI-002"
  - "FG-PERMISSION-RESOURCE-002"
  - "FG-CHAT-HISTORY-FEEDBACK-003"
baseline: "d09b4e8849d051182ef4011470945d2b71085807"
---

# 成员离职、应用转让与注销时应用 Key 持续可用

## 用例简介

成员离开团队后，其应用 Key 分别转交对应应用 owner，接入后端继续使用原 Key；应用 owner 离开时先转应用，再转 Key。主动转让应用、账户注销和应用删除也必须遵守相同归属与失效规则，不能把应用 Key 误删、交错负责人或解绑成个人凭证。

## 前置准备

- 使用本地 dev 主站、Pro 及已有 Mongo/Redis/S3 配置；脚本逐项新建可回收的测试团队、账号、应用与 Key，不新建独立服务或数据库。执行约定见[应用 Key 脚本配置](../../../skills/system/fastgpt-integration-test-runner/references/app-key-cases.md)。

- L0：独立 T，团队 owner O；普通成员 A，应用 W owner=B、应用 X owner=C、应用 V owner=A；A 持有 W 的 Kw、X 的 Kx、V 的 Kv 和个人 Pa。B/C 另有自己的应用 Key，另一团队 U 有负对照 Key。给接收人的 personal Key 数量准备“已满”变体，不能影响应用交接。
- 为 Kw/Kx/Kv 保存明文于执行器私有内存并记录 `_id/type/appId/tmbId/createTime/limit/usagePoints` 快照，证据中只保存不可逆摘要或内存恒等比较结论。用各 Key 创建已完成会话及含 customUid 的文件；另备无 customUid 的历史文件变体，按会话实际 uid 保存。历史 Chat.tmbId/outLinkUid 前快照不可省略。
- API 移出使用登录 owner 的 `DELETE .../member/delete?tmbId=A`；主动离开为 A 登录态 DELETE leave；主动转让 body 为 `{appId:W,ownerId:新成员真实tmbId}`。各行用独立 L0 副本，调用后重新登录仍有效的观测者，不能用已撤销的离职者 Cookie 推断 Key 失效。
- 同步边界：基线的批量同步删除另有分支，并受 TRANSFER_RESOURCE_ON_MEMBER_LEAVE 控制，不等于调用 removeUserFromTeam。开启时目标为同一应用 owner 交接规则；关闭时应用及其应用 Key 均不交接，保留现有绑定与归属；恢复成员不夺回已交接 Key。通过真实同步服务传入本轮用户列表；开关仅在该服务子进程中切换，不修改共享 dev 配置，不增加虚构的 disable API。
- 注销仅针对可回收账号。T7 使用真实 Mongo 与 `cleanupAccountCancellationTeams(userId)`、`checkAccountCancellationResiduals(userId)` 的服务集成，测试入口从最终清理阶段开始；不覆盖用户验证、等待期及完整注销端到端。
- 事务行需要可控地让接收 owner 不合法或在一组 Key 条件写入后、事务提交前触发真实失败；不 mock 所有 DB。记录快照、注入位置和会话边界。同步/故障/注销验证能力缺失时仅相关行阻塞。
- 只读检查按本次 teamId、appId、Key._id、memberId 白名单，集合从实际 Model 取得；日志库 operationLogs 按团队/时间/操作者核查。API 调用后允许额度与最近使用时间真实增加；比较“交接本身不改额度”时先暂停业务调用，分别保留交接前后与复用调用后的快照。
- 删除与异步清理 1 秒轮询、最长 60 秒；注销服务检查用实际返回结果判断，不人为推进框架状态。结束后移除临时团队/应用/账号与存储对象，恢复所有故障与同步配置。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| T1 | 普通成员移出；L0 不含 A 自有应用变体 | 分别用 owner 移出与 A 主动离开两个副本，A 同时持有 W/X 的 Key；承接交接后的原 Key 值调用两个应用，查旧会话和文件。 |
| T2 | owner 离职；完整 L0 | 移出 A，观察其 V 所有权与 Kw/Kx/Kv 的转移，再用原值续聊和创建新会话；接收人个人 Key 已满变体重复本行。 |
| T3 | 主动转让；W owner=B，其他应用保留 | B 将 W 转给 M；W 有 B/A 各自 Key，B 另持有 X 的 Key。核查实际转移应用 ID 与 Key 所属；其他资源和权限按既有流程处理。 |
| T4 | 删除；独立应用/文件夹副本 | owner 删除 W，另做含子应用的文件夹批量删除；删除请求成功后立即用原应用 Key 调用，等待资源清理。个人 Pa、X/U 的 Key 保留为负对照。 |
| T5 | 事务与竞争；恢复 L0 的独立副本 | 将一个有效应用的接收 owner 设为非法/不可用，或在 Key 批量写入后提交前注入失败；核查业务回滚。修复后按业务入口重试；并发执行移出与主动转让时记录最终获胜状态；增加应用 Key 创建在交接前、交接占锁期间和交接后到达的变体，确认无归属离职者的漏交接 Key。 |
| T6 | 同步禁用/恢复；隔离同步团队 | 使用真实同步分支移除 A，再恢复成员；覆盖转资源开关开启。关闭时核对应用和 Key 归属保持不变，恢复后仍保持该归属。 |
| T7 | 注销清理；可回收非 owner 测试账号 | 通过上述真实清理服务处理 A 的非 owner 团队关系，再执行 residualCheck；检查转移 Key 未被注销前置清理删除。owner 团队整体删除另用可销毁团队副本调用现有团队删除服务验证。 |

## 预期结果

公共断言：正常交接只更新 Key.tmbId，明文、Key._id、绑定 appId、累计用量和限制在无业务调用的交接窗口保持不变，不新增 createdByTmbId。历史 Chat 身份不被交接任务批量改写，原 Key 可继续读绑定应用历史；新会话归属新的鉴权成员。业务日志/会话与实际用量按后续调用真实变化，不要求外部登录会话撤销可被 Mongo 事务回滚。

| 子场景 | 特有预期 | 证据获取方式 |
| --- | --- | --- |
| T1 | Kw→B、Kx→C，不能都变 O/root；B/C 原持有的 Key、U Key 不变。Pa 不交接且离职身份不能继续使用；原 Kw/Kx 仍可调用/管理历史及文件，不因 Chat.tmbId=A 漏项。 | 应用 owner 与 Key 归属映射、旧 Key 调用/文件摘要、成员状态。 |
| T2 | V.tmbId 先变 O，Kv 最终→O；Kw/Kx 仍分别→B/C。接收人个人 Key 满不阻塞交接，Key 数量不增加；新会话鉴权者分别为接收人，外部 UID 不改写。 | 最终应用/Key 一致性和事务路径证据、交接窗口快照、前后调用。 |
| T3 | W 中 B 持有的 Key→M，A 的 Key 不变；B 在 X 的 Key 不变，不能因宽泛 resourceList 一起转给 M。相同原 Key 可用，管理权限随当前应用管理关系判断。 | 实际转移应用 ID 清单、四组 Key 精确差集、管理请求。 |
| T4 | 软删除即拒绝该应用 Key 的后续调用，最终清理覆盖实际删除的子应用；不能 unset appId 后保留为 personal 可用 Key。Pa、X/U Key 与未删除应用不变；不把“未马上物理删除”误判为仍有访问权。 | 删除响应、即时调用拒绝、异步终态及类型/绑定快照。 |
| T5 | 本次事务内的应用 owner、Key 归属、成员状态、资源 ACL 无半提交；失败不留下部分 Key 已转移。已执行的非事务性登出允许保留。修复后重试收敛；竞争条件不能覆盖已经转交给别人的 Key，最终归属须与获胜业务操作一致；创建与交接共用团队锁，冲突可重试，交接后延迟创建重新鉴权并拒绝。 | 事务前/失败后/重试后快照、竞争时间线，不只看单个 HTTP 成功。 |
| T6 | 开启时批量同步也按实际应用 owner 交接，不能仅改成员状态、统一转 root 或漏转；成员恢复不自动夺回 Key。关闭时应用与应用 Key 都不交接；有效应用 Key 的调用不因成员状态变化被成员 ACL 拦截。 | 同步分支、实际配置、成员/Key/应用快照与恢复结果。 |
| T7 | 非 owner 团队内先完成应用与 Key 交接，再清个人/无效残留；已转交 Key 的 `_id` 与明文仍在且可用，residualCheck 不把接收人持有的 Key 当 A 残留。删除整个 owner 团队则其全部 Key 随团队清理，不向其他团队转移。 | 清理服务返回、residuals、精确 Key 差集、原值调用；仅标记已覆盖服务路径。 |
