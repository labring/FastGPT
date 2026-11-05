---
case_version: 1
id: "FG-MODEL-MANAGEMENT-001"
title: "模型下架预警标记在配置与选择入口一致呈现"
business: "model/management"
types: ["api", "ui", "integration"]
category: "boundary"
scenario: "special"
priority: "P1"
status: "ready"
tags: ["pr-8205", "model-deprecation", "覆盖基础场景", "覆盖异常场景", "覆盖边界场景"]
evidence: ["response", "ui", "database"]
sources:
  - "packages/global/core/ai/model/schema.ts"
  - "packages/global/openapi/core/ai/model/api.ts"
  - "packages/global/openapi/core/ai/model/summary.ts"
  - "packages/service/core/ai/model/schema.ts"
  - "packages/service/core/ai/model/constants.ts"
  - "packages/service/core/ai/model/service.ts"
  - "packages/service/core/ai/model/utils.ts"
  - "projects/app/src/pages/api/core/ai/model/update.ts"
  - "projects/app/src/pages/api/core/ai/model/summary.ts"
  - "projects/app/src/service/core/ai/model/auth.ts"
  - "projects/app/src/pageComponents/model/ModelConfigForm.tsx"
  - "projects/app/src/components/Select/AIModelSelector.tsx"
  - "projects/app/src/components/Select/AIModelSelector.utils.ts"
  - "projects/app/src/components/Select/ModelStatusLabel.tsx"
  - "projects/app/src/components/core/app/TTSSelect.tsx"
  - "packages/service/common/response/index.ts"
routes:
  - "GET /api/core/ai/model/config"
  - "PUT /api/core/ai/model/update"
  - "PUT /api/core/ai/model/updateStatus"
  - "GET /api/core/ai/model/catalog"
  - "POST /api/core/ai/model/summary"
related:
  - "FG-MODEL-MANAGEMENT-002"
baseline: "3eca129944291a82acda9471201dccc5cb2525cf; pro=48ee04dd34d4d5b13e77ed4ce184124e491a765a"
---

# 模型下架预警标记在配置与选择入口一致呈现

## 用例简介

平台管理员提前标记即将下架的系统模型，应用配置者应在模型选择时看见一致提醒。预警标记与启用状态独立，不能因增加标签而禁止仍可用的模型，也不能掩盖已停用、删除或无权使用的状态。

## 前置准备

- 在隔离部署使用 `BASE_URL`、root 登录态 `ROOT_SESSION`、团队成员 A 登录态及其可配置的团队模型；不记录真实凭证。Mongo 只读账号可查测试库 `ai_models`。
- 建立带唯一 `RUN=pr8205-<执行批次>` 名称的系统模型 M_LLM、M_EMB、M_TTS，另有正常对照 M_NORMAL 和团队模型 M_TEAM。各模型类型、能力、渠道与套餐均有效，A 有使用权；每次只改变本场景指定字段。
- D0：所有模型已启用，预警标记为 false 或缺失。保存 `GET config?channelType=system/team` 的完整可编辑 modelData；PUT update 使用 `{modelId,channelType,modelData}`，保留 type/provider/name/config 等必需字段，不能只传标记。启停使用 `{modelIds:[id],isActive,channelType}`。
- 每行独立恢复 D0，C3/C4/C5 先给目标系统模型加标记。通过模型配置页编辑保存；在应用编辑器的 LLM、索引模型与模型 TTS 入口观察下拉候选和已选值，控件按模型唯一名称及“即将下架”文本定位，不使用臆造 selector。
- 每次更新后刷新页面，并无 version 参数请求 catalog、用 `{modelIds:[目标ID]}` 请求 summary；每秒轮询最多 15 秒。网络错误单独记录，不能当作模型下架。使用专用模型接收端验证选择后的一次真实调用，不比较自由文本。
- 只读快照：`db.ai_models.find({_id:{$in:MODEL_OBJECT_IDS}},{name:1,type:1,scope:1,isActive:1,isUpcomingDeprecation:1})`。保留返回 envelope 的 HTTP 状态与 code/data；成功应为 HTTP 200、code=200，不能只依据界面 toast。
- 清理：恢复模型原字段和应用原配置，删除本例独立应用及模型；未恢复前不将本例模型设为共享默认模型。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；D0 | 分别为 M_LLM、M_EMB、M_TTS 打开标记并保存；刷新配置和相应选择入口，选中后发起可控调用。 |
| C2 | 边界；D0 | 先打开 M_LLM 标记、保存，再关闭并保存；每次均刷新与重新读取目录。另用缺失标记的历史模型作对照。 |
| C3 | 边界；D0 + M_LLM 预警 | 同时开启 testMode，观察下拉候选，再把 testMode 关闭。 |
| C4 | 异常；D0 + M_LLM 预警 | 已选 M_LLM 后停用它；独立副本删除该模型；分别刷新已选状态。 |
| C5 | 异常；D0 + M_LLM 预警 | A 未持有该模型的应用基线授权，撤销 A 使用权，再请求不带 appId 的 summary 并打开选择器。 |
| C6 | 边界；D0 | A 编辑 M_TEAM，界面确认没有运营标记开关；用合法团队模型更新 body 额外附加 `isUpcomingDeprecation:true` 后保存。 |

## 预期结果

公共断言：预警字段在系统模型持久化、目录与摘要之间语义一致；以用户实际可见的标签、选中状态和刷新结果验收。调用是否允许由启用状态、能力和权限决定。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI/API/数据库/调用接收端 | 三类系统模型的标记为 true，候选与已选值显示“即将下架”；仍可选择和调用，不能因预警直接停用。 | 各模型快照、catalog/summary 的目标项、界面截图及调用记录。 |
| C2 | UI/API/数据库 | 关闭后为 false、标签消失；历史缺失字段按无预警显示，不能误判停用。 | 同 ID 两次快照、刷新后的可见结果。 |
| C3 | UI | 下拉候选优先显示下架提醒，隐藏该候选的测试模式标签；不能把这一规则扩展成所有配置表都必须隐藏 testMode。 | 同一候选前后截图。 |
| C4 | UI/API | 停用 summary.status=disabled，删除为 deleted；已选值明确显示不可用状态，不能仅显示预警而看似可用。 | 响应目标项、已选值截图。 |
| C5 | UI/API | summary.status=forbidden，候选目录排除无权模型，提醒标签不授予使用权限；不要求名称完全隐藏。 | A 的目录 ID 集合及摘要。 |
| C6 | UI/API/数据库 | 团队编辑界面无此开关，服务端清理该运营字段，M_TEAM 不变成 true。 | 实际请求、更新结果、M_TEAM 精确快照。 |
