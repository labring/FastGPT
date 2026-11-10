---
case_version: 1
id: "FG-MODEL-MANAGEMENT-003"
title: "按模型引用识别受影响团队并投递正确渠道"
business: "model/management"
types: ["api", "ui", "e2e", "integration"]
category: "boundary"
scenario: "special"
priority: "P1"
status: "ready"
tags: ["pr-8205", "model-deprecation", "覆盖基础场景", "覆盖异常场景", "覆盖边界场景"]
evidence: ["response", "ui", "database", "queue"]
sources:
  - "packages/global/common/workflow/model.ts"
  - "projects/app/src/pageComponents/admin/inform/modelDeprecationUtils.ts"
  - "pro/admin/src/service/support/user/inform/modelDeprecation/scanner.ts"
  - "packages/service/core/app/version/controller.ts"
  - "pro/admin/src/service/support/user/inform/modelDeprecation/entity.ts"
  - "pro/admin/src/service/support/user/inform/modelDeprecation/worker.ts"
  - "pro/admin/src/service/support/user/inform/schema.ts"
  - "pro/admin/src/service/support/user/inform/sendMessage.ts"
  - "pro/admin/src/service/support/user/inform/templates/emailTemplates.ts"
  - "pro/admin/src/service/support/user/inform/templates/informTemplates.ts"
  - "pro/admin/src/service/support/user/inform/templates/smsTemplates.ts"
  - "projects/app/src/pageComponents/admin/config/user.tsx"
  - "projects/app/src/web/admin/config/adapt.ts"
routes:
  - "POST /api/proApi/admin/system/inform/modelDeprecation/create"
  - "POST /api/proApi/admin/system/inform/modelDeprecation/list"
related:
  - "FG-MODEL-MANAGEMENT-002"
  - "FG-MODEL-MANAGEMENT-005"
baseline: "e11ba6771f; pro=a4e8e9016e70fbaf7972c44d7f01b38cb635c6a5"
---

# 按模型引用识别受影响团队并投递正确渠道

## 用例简介

下架通知面向配置仍引用计划模型的团队，常规轮次发送前需要重新判断当前引用。站内信发给团队成员，外部提醒依据团队通知账号选择短信或邮件，不能把草稿和同名工具参数误认为静态系统模型引用。

## 前置准备

- 继承 MANAGEMENT-002 的真实服务、请求、计划/Job 查询与清理方法。补充有效 rerank 类型系统模型 M_RERANK，并启用 M_TTS/M_RERANK 的标记后，计划范围固定为 M_LLM/M_EMB/M_TTS/M_RERANK；D 至少在创建后 20 个日历日。每个子场景另建 requestId/campaign，独立恢复团队配置。
- 使用专用 SMTP 收件箱和 `SMS_PROXY` 测试接收端；它们替代外部投递设施，不 mock 扫描器、sendMessage、队列或数据库。短信模板 MODEL_DEPRECATION/MODEL_DEPRECATION_EN 配置不同测试模板 ID，用于确认当前发送器固定使用 MODEL_DEPRECATION。接收端记录时间、目标别名、模板和正文，保存报告时脱敏。
- 建立独立团队矩阵：T1 当前发布版本静态引用 M_LLM，草稿已换 M_NORMAL；T2 仅草稿引用 M_LLM、当前发布版本用 M_NORMAL；T3 未软删知识库配置 M_EMB；T4 仅知识库 agentModelId 或 vlmModelId 引用 M_LLM；T5 只有运行时变量模型引用；T6 只有普通工具字符串参数 model=M_LLM；T7 历史系统 model 名称引用，缺 modelId；T7 的独立兼容副本去掉 publishedVersionId，保留最新 isPublish=true 版本；T8 被软删除的应用和知识库；T9 仅 questionGuide 或模型 TTS 配置引用。除指定引用外，所有默认模型与其他资源不引用计划模型。
- T1 用邮箱通知账号、中文 Owner；T3 用测试手机号、英文 Owner。每个团队另有两个活跃成员与一个非活跃成员，Owner 同时在成员表中，用于验证去重。T4 另作 notificationAccount 缺失对照；各模型名称含 RUN，便于消息关联。
- 确认各队列运行的时间窗 t0/t1，`db.informs.find({teamId:{$in:TEAM_IDS},time:{$gte:t0,$lte:t1},content:{$regex:RUN}})`；按 teamId/userId 精确比对。消息无 campaignId 字段，同一 RUN 计划串行执行，不能用不存在字段关联。
- 首轮每 1 秒读计划与收件端，最多 120 秒等待 run.status=completed 且 failureCount=0。后续轮次默认实际等待对应 scheduledAt，再用同一终态判据；若加速，只能按本例 campaignId 用夹具调整待执行 scheduledAt 并重建对应稳定 Job，明确记录这是轮次投递集成，不声称测过跨日排期的真实计时精度。排期精度由 MANAGEMENT-002 覆盖。
- 缺少某一外部接收端时，该渠道阻塞并记录待补消息证据，不以计划 completed 代替送达。结束后通过通知中心删除本例站内信并清空测试收件箱，恢复各团队配置、移除测试资源。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；完整团队矩阵 | 创建首轮含三渠道的新计划，运行真实 worker；收齐团队通知与收件端记录。 |
| C2 | 引用边界；独立 T7 副本 | 依次对照：缺 modelId 的历史名称；有效 modelId 与另一 legacy 名冲突；无效非空 modelId 搭配有效 legacy 名；迁移前自定义选择器的动态变量；再用无发布指针的 T7 副本运行，设置更新的未发布草稿为 M_NORMAL。 |
| C3 | 配置范围；独立 T4/T9 副本 | 以知识库 agent/vlm、Agent datasetParams 的重排（M_RERANK）/问题扩展（M_LLM）模型、questionGuide、模型 TTS 为参数矩阵，逐项只保留一处计划模型引用再执行首轮。 |
| C4 | 连续状态；承接 C1 | 第一轮完成后，T1 的发布版本移除全部计划模型，T2 发布引用 M_LLM；T3 继续保留 M_EMB。执行第二、第三个常规轮次。 |
| C5 | 收件对象边界；独立新计划 | 首轮 T1/T3 都启用站内信及短信/邮件；T4 不填通知账号。读取 Owner、成员与外部目标。 |
| C6 | 文案与日期；独立 T1/T3 副本 | 模型名称包含 `<>&` 字符和 RUN，选带 offset 的截止时间 D（浏览器所选日 23:59）；分别以中文、英文 Owner 触发邮件、中文短信和站内信，查看模型列表和日期。 |

## 预期结果

公共断言：受众按配置引用而非近期调用量判断；命中任一计划模型即纳入团队。常规轮次重新扫描，单团队不因多处引用而重复执行同一轮渠道投递；队列故障重放的保证另见 MANAGEMENT-004。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | 服务集成/数据库/接收端 | 命中集合精确含 T1/T3/T4/T7/T9，排除 T2/T5/T6/T8；未填通知账号的团队仅有站内信。 | 发布指针与知识库初态、实际消息 teamId/目标别名集合、计划终态。 |
| C2 | 服务集成/数据库 | 历史名可解析命中；稳定 ID 优先；无效非空 ID 不降级为 legacy；动态变量不作为静态命中；无发布指针时仍按最新正式版本命中，不能用更新的未发布草稿覆盖它。 | 每个副本唯一引用、模型目录对应关系、是否有本轮消息。 |
| C3 | 服务集成/数据库 | 每种明确静态槽位独立命中；普通工具同名字段和整体变量引用对照不命中。 | 每变体版本/配置 BSON 与团队消息差集。 |
| C4 | 队列/数据库/接收端 | 后两轮不再通知 T1，新纳入 T2，T3 继续收到本轮渠道提醒；所选渠道每轮一致，当前命中团队仍收到站内信。 | 每轮执行前快照、分轮时间窗的精确消息差集。 |
| C5 | 数据库/接收端/UI | 站内信用户集合为 Owner∪活跃成员并去重，非活跃成员不加入；邮箱只走 email，手机号只走 sms，无账号跳过外部渠道。 | userId 精确集合、两端渠道记录、用户通知中心可见内容。 |
| C6 | 接收端/数据库 | 邮件、短信和站内信正文使用整个计划模型列表，日期只显示 D 的原始日历日 `YYYY-MM-DD`，不显示时分秒和 offset；存储的 D 保留完整时间及 offset。邮件按语言选择模板，站内信按收件成员语言选择模板，短信固定使用中文模板。邮件中的特殊字符被转义而非执行 HTML。 | 原始测试邮件 MIME、短信模板参数、站内信正文与计划时间快照。 |
