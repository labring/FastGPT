---
case_version: 1
id: FG-APP-WORKFLOW-040
title: 运行发布校验与草稿保存恢复
business: app/workflow/editor
category: boundary
types:
  - ui
  - api
scenario: special
priority: P0
status: ready
tags:
  - connection-rules
  - workflow-editor
  - legacy-group-16
  - 覆盖异常场景
  - 覆盖边界场景
  - 覆盖基础场景
evidence:
  - ui
  - response
  - database
sources:
  - document/content/guide/build/workflow/rules.mdx
  - packages/workflow-core/src/edge/validation.ts
  - projects/app/src/pageComponents/app/detail/ExportConfigPopover.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/utils.ts
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/ImportSettings.tsx
  - projects/app/src/pageComponents/app/detail/Workflow/Header.tsx
  - projects/app/src/pageComponents/app/detail/Workflow/components/SaveButton.tsx
  - projects/app/src/components/common/Modal/SaveAndPublishModal.tsx
  - projects/app/src/components/core/app/ScheduledTriggerConfig.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/SystemConfigDrawer.tsx
  - projects/app/src/pageComponents/app/detail/context.tsx
  - projects/app/src/web/core/workflow/editor/session/workflowSession.tsx
  - projects/app/src/web/core/workflow/localDraft/storage.ts
  - projects/app/src/web/core/workflow/localDraft/useWorkflowDraftLifecycle.ts
  - projects/app/src/pages/api/core/app/create.ts
  - projects/app/src/pages/api/core/app/detail.ts
  - projects/app/src/pages/api/core/app/version/publish.ts
  - projects/app/src/service/core/app/utils.ts
  - packages/service/core/app/version/schema.ts
  - packages/service/core/app/schema.ts
  - packages/service/common/http/entry.ts
  - packages/service/common/response/index.ts
routes:
  - POST /api/core/app/create
  - GET /api/core/app/detail
  - POST /api/core/app/version/publish
related: [FG-APP-WORKFLOW-060]
automation:
  - runner: playwright
    script: .agents/test/app/workflow/editor/FG-APP-WORKFLOW-040.browser.spec.ts
    items: [C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C11]
baseline: 9b0128032da5c30749d579d04e4c26e86bca99f7
---

# 运行发布校验与草稿保存恢复

## 用例简介

在工作流编辑器中检查串行回环和合法条件回流的运行、发布校验。验证本地草稿恢复、保存期间后续编辑的保留，以及打开配置面板时保持草稿原样。

## 前置准备

- 环境：本地 dev、Chromium、中文界面；登录具有本例临时应用写入和删除权限的账号，记录 BASE_URL、appId、teamId、版本和 run 标识。
- 配置：在应用列表新建临时工作流，普通节点填固定文本。顶部应用更多菜单支持“导入配置”和“导出配置 → 导出 JSON”；模型目录可正常读取。A、B 等是别名，记录实际 nodeId；→ 为普通边，⇢ 为菱形工具挂载。
- 公共基线：每组图准备一次，导出所有 edges 的 (source, sourceHandle, target, targetHandle) 四元组集合 E0。临时画布边 ID 不持久化；比较精确集合/差集，不以边数或刷新后的临时 ID 代替。
- 复位：除明确“承接”的行外，子场景从所指基线开始。参数化行逐个变体执行，失败先保存证据并复位再继续，记录“子场景编号 / 变体”，避免后续失败由脏状态引起。
- Gbad 通过导出配置增加 C → A 后导入；所有文本已填写，没有额外孤立节点。Ggood 的判断条件、输入与引用有效。
- Gsafe 为 `Start → A`。先通过详情接口确认 A 的名称。C5 至 C7 各从独立的 Gsafe 应用开始，用 A 的名称区分云端和后续各次编辑。测试网络延迟或失败仅拦截本例当前浏览器、当前 appId 的保存请求。
- C8、C9 分别使用未配置定时执行的独立 Gsafe 应用。C9 仅保存草稿，不启用实际定时任务。
- C10 从工作台点击独立的 Gsafe 应用进入编辑器，浏览器历史内保留工作台路由。仅暂缓该应用首笔自动保存的真实服务回执。
- C11 连接本地 dev Mongo，以本例 appId 和正式版本 ID 限定历史夹具。只给该版本追加一条已删除节点指向 A 的悬挂边；其他图数据沿用 Gsafe。
- C5 使用浏览器 localStorage 内存放的应用与当前成员实际键 `fastgpt_workflow_local_draft_v1:["<tmbId>","<appId>"]`，值包含 `version:1`、`appId`、`tmbId`、`savedAt`、`restoreAfterLogin:false` 和 `data`。`data` 取一次真实“仅保存”送出的 `nodes`、`edges`、`chatConfig`、`referenceSnapshots`。旧 JSON 变体仅去掉 `referenceSnapshots`，两变体分开启动浏览器上下文或重置本例应用。
- 记录独立 appId、teamId、publishedVersionId 和保存前时间 T0。保存通过正常登录浏览器发起。C3 用 `FASTGPT_TEST_MONGODB_URI` 连接本地 dev Mongo，仅按本例 appId 查询。
- 触发离开自动保存时，使用浏览器刷新；若环境启用离开提示，取消首次刷新以观察请求和本地备份，再按场景决定是否继续。网络异常仅在请求实际发出后记录；待业务响应和存储变化最多 10 秒。
- 证据与清理：按子场景保存 UI、配置快照及所需响应/只读查询；允许路径实际释放建边，拒绝路径同时检查目标不可连接和释放后无新增边。完成后保存证据，通过更多菜单删除本例临时应用；保留失败现场时记录 appId 与原因。

Gbad：

```text
Start → A → B → C → A
```

Ggood：

```text
Start → A → Branch
Branch[continue] → C
Branch[ELSE] → Exit
C → A
```

## 测试步骤

按场景表执行。公共准备只做一次，场景之间按“起始状态”复位或承接；同一行的多个节点/参数变体复用同一判定方法。

| 子场景 | 类型与起始状态 | 操作差异 |
| --- | --- | --- |
| C1 | 异常场景；Gbad / E0 | 分别点击“运行”和“保存并发布”，每次记录当前配置。 |
| C2 | 边界场景；承接 C1，仍为 Gbad | 选择“仅保存”，记录 POST /api/core/app/version/publish?appId=本例 appId 的请求、响应及已保存状态。 |
| C3 | 边界场景；承接 C2 成功后的草稿 | 确认保存完成后刷新，重新导出；按下述只读查询核对数据库。 |
| C4 | 基础场景；切换到 Ggood 并重新记录 E0 | 点击“运行”，确认预览实际进入视口后关闭；再选择“保存并发布”，进入确认弹窗后取消。 |
| C5 | 边界；Gsafe，本地 JSON 与云端等价 | 分别写入完整备份和缺少快照数组的旧备份，再刷新。每个变体导入仅改变 A 名称的图并触发离开自动保存。 |
| C6 | 异常；Gsafe，服务器基线保持原名称 | 导入名称 A1；中断首笔离开自动保存。用同一浏览器上下文打开详情，核对 A1 和恢复提示。再次触发离开保存并核对云端仍为基线，再“仅保存”。 |
| C7 | 边界；Gsafe，保存 A1 时发生 A2 编辑 | 导入 A1，发送首笔“仅保存”，暂缓浏览器转交真实服务响应。期间导入 A2，释放首笔响应；核对页面和两次保存后的实际云端值。 |
| C8 | 基础；Gsafe，定时执行未配置 | 在系统配置中打开定时执行弹窗，确认开关状态后关闭。检查保存状态和导出配置。 |
| C9 | 边界；Gsafe，定时执行未配置 | 打开定时配置并启用默认的每日零点。在周期下拉中依次选择每周、星期一、08:00，再关闭弹窗并仅保存。 |
| C10 | 边界；Gsafe，自动保存回执晚于离开页面 | 导入 A1，触发刷新后取消原生确认，让自动保存落库。暂缓回执，确认本地备份为 A1；浏览器返回工作台，再释放回执。 |
| C11 | 历史兼容；Gsafe 的正式版本带有一条悬挂边 | 用详情接口读出工作流，以旧客户端形态原样提交自动保存。另在同一请求形态中显式追加悬挂边，核对拒绝及历史版本原值。 |

## 预期结果

公共断言：保持类操作要求关系集合不变；新增/删除操作要求差集精确等于目标关系，其他配置按本例约定保留。业务预期拒绝也是符合预期，不能把主标签 scenario=failure 当作实际测试失败。

| 子场景 | 特有预期 |
| --- | --- |
| C1 | 提示连线/纯串行回环问题，不能进入可运行预览或发布确认；E=E0，不因校验失败修复原图。 |
| C2 | 保存成功；isPublish 未设置为 true，HTTP=200、code=200、data=null。本次只保存草稿，不推进发布版本。 |
| C3 | 刷新后的四条语义关系等于 E0；最新手动草稿 isPublish 不为 true，保存的图完整，apps.publishedVersionId 与准备阶段相同。 |
| C4 | 合法受控回流通过前置检查，预览与确认弹窗可达；关闭按实际视口/交互判定，不能只看 DOM 挂载。取消后保持 Ggood，不执行确认发布。 |
| C5 | 两种备份打开时均被清理，当前图保持 Gsafe。随后实际发出 `autoSave:true`，业务成功；详情 API 包含新名称，发布指针与准备阶段相同。 |
| C6 | 第一次失败留下本例本地备份，云端不变。重新打开恢复 A1，显式保存之前云端保持原名称；“仅保存”后详情为 A1，已确认的本地备份被删除。 |
| C7 | A1 保存确实成功且首次读回为 A1；晚到的响应不覆盖页面的 A2。再次“仅保存”后详情为 A2，发布指针始终不变。 |
| C8 | 开关关闭，弹窗打开后可见。关闭后仍显示「已保存」，导出配置没有定时执行字段。 |
| C9 | 只选每周和星期一时，已配置的周期仍显示每天零点。选齐后显示星期一 08:00。保存请求及草稿读回均为 `0 8 * * 1`，发布指针保持准备阶段的值。 |
| C10 | 实际响应为 HTTP 200、code=200，本次备份被清理。详情中 A 仍为 A1，发布指针保持准备阶段的值。 |
| C11 | 详情仅返回 Gsafe 的有效边，原样自动保存成功，工作副本仍含该有效边。新提交的悬挂边被拒绝，正式版本指针和历史版本的原始边保持不变。 |

C3 数据库证据按本例 appId 限定：

```js
// T0、appId 替换为准备阶段记录的值，使用只读账号。
db.app_versions.find(
  { appId: ObjectId("<appId>"), time: { $gte: ISODate("<T0>") }, isAutoSave: { $ne: true } },
  { nodes: 1, edges: 1, isPublish: 1, time: 1 }
).sort({ time: -1 }).limit(1);
db.apps.findOne({ _id: ObjectId("<appId>") }, { publishedVersionId: 1 });
```

缺少入口、准备或验证证据时记录对应子场景阻塞，不将其或整个用例标记为通过。
