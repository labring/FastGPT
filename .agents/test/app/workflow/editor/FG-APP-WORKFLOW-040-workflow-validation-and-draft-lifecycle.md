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
  - projects/app/src/pages/api/core/app/version/publish.ts
  - packages/service/core/app/version/schema.ts
  - packages/service/core/app/schema.ts
  - packages/service/common/http/entry.ts
  - packages/service/common/response/index.ts
routes:
  - POST /api/core/app/version/publish
related: []
baseline: 5a5211f70998f5311cd40b0e5362a1414be6fbdf
---

# 运行发布校验与草稿保存恢复

## 用例简介

在工作流编辑器中，分别使用存在纯串行回环的图和合法条件回流的图，检查运行、发布前校验以及草稿保存。非法图应被运行和发布入口拦截，但仍能保存为草稿，并在刷新后完整恢复；合法图应能进入运行预览和发布确认弹窗。本例在确认弹窗取消发布，不发送消息或实际发布。

## 前置准备

- 环境：独立测试实例、Chrome、中文界面；登录具有本例临时应用写入和删除权限的账号，记录 BASE_URL、appId、teamId、版本和 run 标识。
- 配置：在应用列表新建临时工作流，普通节点填固定文本。顶部应用更多菜单支持“导入配置”和“导出配置 → 导出 JSON”；模型目录可正常读取。A、B 等是别名，记录实际 nodeId；→ 为普通边，⇢ 为菱形工具挂载。
- 公共基线：每组图准备一次，导出所有 edges 的 (source, sourceHandle, target, targetHandle) 四元组集合 E0。临时画布边 ID 不持久化；比较精确集合/差集，不以边数或刷新后的临时 ID 代替。
- 复位：除明确“承接”的行外，子场景从所指基线开始。参数化行逐个变体执行，失败先保存证据并复位再继续，记录“子场景编号 / 变体”，避免后续失败由脏状态引起。
- Gbad 通过导出配置增加 C → A 后导入；所有文本已填写，没有额外孤立节点。Ggood 的判断条件、输入与引用有效。
- 记录独立 appId、teamId、publishedVersionId 和保存前时间 T0。具备测试库 apps、app_versions 只读权限；保存通过正常登录浏览器发起。
- 本例止于编辑页前置检查、草稿保存和发布弹窗取消；不发送消息或确认正式发布。
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

## 预期结果

公共断言：保持类操作要求关系集合不变；新增/删除操作要求差集精确等于目标关系，其他配置按本例约定保留。业务预期拒绝也是符合预期，不能把主标签 scenario=failure 当作实际测试失败。

| 子场景 | 特有预期 |
| --- | --- |
| C1 | 提示连线/纯串行回环问题，不能进入可运行预览或发布确认；E=E0，不因校验失败修复原图。 |
| C2 | 保存成功；isPublish 未设置为 true，HTTP=200、code=200、data=null。本次只保存草稿，不推进发布版本。 |
| C3 | 刷新后的四条语义关系等于 E0；最新手动草稿 isPublish 不为 true，保存的图完整，apps.publishedVersionId 与准备阶段相同。 |
| C4 | 合法受控回流通过前置检查，预览与确认弹窗可达；关闭按实际视口/交互判定，不能只看 DOM 挂载。取消后保持 Ggood，不执行确认发布。 |

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
