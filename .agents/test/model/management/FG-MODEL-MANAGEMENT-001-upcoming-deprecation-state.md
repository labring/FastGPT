---
case_version: 1
id: "FG-MODEL-MANAGEMENT-001"
title: "模型下架预警标记在配置与选择入口一致呈现"
business: "model/management"
types: ["api", "ui", "e2e", "integration"]
category: "boundary"
scenario: "special"
priority: "P1"
status: "ready"
tags: ["pr-8205", "model-deprecation", "覆盖基础场景", "覆盖异常场景", "覆盖边界场景"]
evidence: ["response", "ui", "database", "queue"]
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
  - "projects/app/src/pageComponents/model/ModelConfigTable.tsx"
  - "projects/app/src/components/core/ai/DeprecationTag.tsx"
  - "projects/app/src/pageComponents/chat/ChatWindow/ChatAIModelSelector.tsx"
  - "projects/app/src/pageComponents/app/detail/Edit/ChatAgent/EditForm.tsx"
  - "projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/SettingLLMModel.tsx"
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
baseline: "738e6bdafdfb4b10fa9254c6fbf2cffc7d25e925; pro=bde643736c348e08239fad15e0e2b8fbb8013001"
---

# 模型下架预警标记在配置与选择入口一致呈现

## 用例简介

平台管理员提前标记即将下架的系统模型，应用配置者应在模型选择时看见一致提醒。预警标记与启用状态独立，不能因增加标签而禁止仍可用的模型，也不能掩盖已停用、删除或无权使用的状态。

## 前置准备

- 需求依据：[模型下架通知（飞书）](https://fael3z0zfze.feishu.cn/docx/Yk2GdhzAnod6nVxPtiGc7jRunlg)，结合用户 2026-11-10 的确认；冲突处以本用例列出的最新口径为准。
- 在隔离部署使用 `BASE_URL`、root 登录态 `ROOT_SESSION`、团队成员 A 登录态及其可配置的团队模型；不记录真实凭证。Mongo 只读账号可查测试库 `ai_models`。
- 建立带唯一 `RUN=pr8205-<执行批次>` 名称的系统模型 M_LLM、M_EMB、M_TTS，另有正常对照 M_NORMAL 和团队模型 M_TEAM。各模型类型、能力、渠道与套餐均有效（索引模型补齐页面必填 batchSize，TTS 有有效音色），A 有使用权；每次只改变本场景指定字段。
- 普通成员用当前成员 schema 与团队 ACL 建立，不能写入过时的 `role:"member"`；普通成员和非 root 团队管理员分别作为越权变体，先通过真实 tokenLogin 确认身份。后者虽有团队管理权限，也不能配置系统模型。
- D0：所有模型已启用，预警标记为 false 或缺失。保存 `GET config?channelType=system/team` 的完整可编辑 modelData；PUT update 使用 `{modelId,channelType,modelData}`，保留 type/provider/name/config 等必需字段，不能只传标记。启停使用 `{modelIds:[id],isActive,channelType}`。
- 每行独立恢复 D0，C3/C4/C5 先给目标系统模型加标记。通过模型配置页编辑保存；在应用编辑器的 LLM、索引模型与模型 TTS 入口观察下拉候选和已选值，控件按模型唯一名称及“即将下架”文本定位，不使用臆造 selector。
- 每次更新后刷新页面，并无 version 参数请求 catalog、用 `{modelIds:[目标ID]}` 请求 summary；每秒轮询最多 15 秒。网络错误单独记录，不能当作模型下架。使用专用模型接收端验证选择后的一次真实调用，不比较自由文本。
- 只读快照：`db.ai_models.find({_id:{$in:MODEL_OBJECT_IDS}},{name:1,type:1,scope:1,isActive:1,isUpcomingDeprecation:1})`。保留返回 envelope 的 HTTP 状态与 code/data；成功应为 HTTP 200、code=200，不能只依据界面 toast。
- C3 补充多模态索引模型 M_MULTI（embedding，config.vision=true），有预警/Beta/多模态的组合；M_NORMAL 为无标记对照。样式按公共预警组件的红/粉色语义验收，不把截图中的偶然像素颜色写死。
- C7/C8 用独立测试部署或可精确限定本轮的只读查询，分别记录 `model_deprecation_informs` 计划、`informs` 消息与本轮稳定 Job 清单。只操作标记，不点击发送；外部请求零增量复用 MANAGEMENT-003 的受控 SMTP/SMS_PROXY 观察端。原有计划与队列不得为测例被清空或暂停。
- C9 补充聊天首页、Agent、工作流 AI 对话节点/工具调用节点/知识库搜索重排节点、知识库文本/图片理解入口；Simple App、知识库索引及 TTS 复用本轮 C1 证据，无该证据时包含必要前序。各入口仅选一个能代表本类型的标记模型，不用 LLM 假装重排/TTS。候选和已选值都需取证，复用组件或单测不能替代真实入口。
- C10 使用 schema 允许长度内的长别名（含 RUN，例如 120 个汉字）及短模型标识，选普通模型选择器、TTS 两种组件实现及工作流画布布局作代表，在 1440×1000 和 375×812 视口验证。工作流桌面画布另记录产品实际支持的最小宽度，不能把不可进入的入口判为已覆盖。
- 清理：恢复模型原字段和应用原配置，删除本例独立应用及模型；未恢复前不将本例模型设为共享默认模型。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；D0 | 分别为 M_LLM、M_EMB、M_TTS 打开标记并保存；刷新配置和相应选择入口，选中后发起可控调用。 |
| C2 | 边界；D0 | 先打开 M_LLM 标记、保存，再关闭并保存；每次均刷新与重新读取目录。另用缺失标记的历史模型作对照。 |
| C3 | 边界；D0 + M_LLM 预警 | 分别给 M_LLM 与 M_MULTI 同时开启 testMode，比较系统配置列表、下拉候选与已选值的标签颜色/位置/顺序；再关闭 testMode。 |
| C4 | 异常；D0 + M_LLM 预警 | 已选 M_LLM 后停用它；独立副本删除该模型；分别刷新已选状态。 |
| C5 | 异常；D0 + M_LLM 预警 | A 未持有该模型的应用基线授权，撤销 A 使用权，再请求不带 appId 的 summary 并打开选择器。 |
| C6 | 边界；D0 | A 编辑 M_TEAM，界面确认没有运营标记开关；用合法团队模型更新 body 额外附加 `isUpcomingDeprecation:true` 后保存。 |
| C7 | 权限；D0，非 root 团队管理员/普通成员分别执行 | 直接访问系统模型页，读取系统配置，并以合法完整 modelData 伪造系统模型 PUT update（附预警 true）；另以 root 对照同一模型。 |
| C8 | 标记幂等与无发送副作用；D0 | 记录模型、计划、Job、消息基线；root 对同一模型连续两次设 true 并保存，再关闭标记、刷新；只读核对所有差集。 |
| C9 | 多入口矩阵；D0 + 相应模型预警 | 分别在聊天首页 `/chat?pane=h`、Agent AI 配置、工作流 AI 对话/工具调用/知识库搜索重排及知识库文本/图片理解入口打开候选，先选正常对照再选标记模型，刷新已保存配置；索引/TTS 复用 C1。 |
| C10 | 长名称/窄屏；复用 C1/C9 的代表组件与布局 | 将一个正常模型与一个标记模型改为长别名；桌面 hover、切换窄屏，打开候选并完成选择，再刷新检查已选值；结束恢复名称。 |

## 预期结果

公共断言：预警字段在系统模型持久化、目录与摘要之间语义一致；以用户实际可见的标签、选中状态和刷新结果验收。调用是否允许由启用状态、能力和权限决定。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI/API/数据库/调用接收端 | 开关初态关闭；三类系统模型标记保存为 true，候选与已选值显示一个红/粉色“即将下架”提醒，紧邻模型名称且刷新不丢失；仍可选择和调用，不能因预警直接停用。 | 各模型快照、catalog/summary 的目标项、界面截图及调用记录。 |
| C2 | UI/API/数据库 | 关闭后为 false、标签消失；历史缺失字段按无预警显示，不能误判停用。 | 同 ID 两次快照、刷新后的可见结果。 |
| C3 | UI | 下拉候选有预警时隐藏 Beta；预警可与多模态共存且位于多模态前。系统配置列表和下拉候选均隐藏 Beta；即将下架排在其他标签前。各真实入口颜色、文案与相对顺序一致。 | 同一候选前后截图。 |
| C4 | UI/API | 停用 summary.status=disabled，展示模型名与已停用状态且不显示预警标签；删除为 deleted，展示模型缺失/不可用状态，不新增“已下架”运营标签。按飞书文案要求，“该模型已下架”文字也需记录为文案差异，不能仅因当前实现如此而判符合。 | 响应目标项、已选值截图。 |
| C5 | UI/API | summary.status=forbidden，候选目录排除无权模型，提醒标签不授予使用权限；不要求名称完全隐藏。 | A 的目录 ID 集合及摘要。 |
| C6 | UI/API/数据库 | 团队编辑界面无此开关，服务端清理该运营字段，M_TEAM 不变成 true。 | 实际请求、更新结果、M_TEAM 精确快照。 |
| C7 | UI/API/数据库 | 两种非 root 身份均不能进入系统配置或写运营字段；系统 config/update 明确拒绝，模型原字段、计划及消息均无变化。root 对照可保存。 | 角色与权限快照、页面拒绝、原始响应及模型前后值。 |
| C8 | UI/API/数据库/队列 | 同 ID 只保留一个布尔状态、列表和已选处各至多一个预警标签；关闭后消失。计划、Job 和站内/外部通知均零新增；标记本身不发送。 | 三次保存请求、精确模型快照、计划/Job/消息前后集合及截图。 |
| C9 | UI/端到端 | 每个已列入口的对应模型候选与已选值均有预警且可选择；未标记对照无标签。重排、TTS、多模态独立取证，缺入口不记通过；保存刷新保留模型稳定 ID 与预警。 | 按入口和模型类型分组的路由、DOM、候选/已选截图及保存请求。 |
| C10 | UI | 名称省略时能 hover 查看完整内容；预警不被挤掉、遮挡或裁切，名称与标签不重叠；选择控件无非预期横向滚动且可完成选择。窄屏采用产品支持的完整名称查看方式取证。 | 两种视口、hover/完整名称呈现、控件边界与选择后的截图。 |
