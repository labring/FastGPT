---
case_version: 1
id: FG-TOOL-SYSTEM-PLUGIN-001
title: 内容审核插件与全局策略的配置、互斥启用、测试与卸载恢复
business: tool/system-plugin
types: [api, ui, e2e, integration]
category: basic
scenario: success
priority: P0
status: ready
tags: [内容审核, 系统插件, 审核策略, 互斥启用, 密钥脱敏, 插件市场, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, ui, database, storage]
sources:
  - packages/global/core/plugin/moderation/type.ts
  - packages/global/core/plugin/moderation/constants.ts
  - packages/global/openapi/core/plugin/admin/moderation/api.ts
  - packages/global/openapi/core/plugin/marketplace/api.ts
  - packages/service/core/plugin/moderation/schema.ts
  - packages/service/core/plugin/moderation/entity.ts
  - packages/service/core/plugin/moderation/service.ts
  - packages/service/core/plugin/moderation/utils.ts
  - packages/service/core/plugin/restoreLocalConfigs.ts
  - packages/service/thirdProvider/fastgptPlugin/moderation.ts
  - packages/service/thirdProvider/fastgptPlugin/lifecycle.ts
  - projects/app/src/pages/api/core/plugin/admin/moderation/list.ts
  - projects/app/src/pages/api/core/plugin/admin/moderation/config.ts
  - projects/app/src/pages/api/core/plugin/admin/moderation/check.ts
  - projects/app/src/pages/api/core/plugin/admin/moderation/policy.ts
  - projects/app/src/pages/api/core/plugin/admin/moderation/delete.ts
  - projects/app/src/pages/api/core/plugin/admin/moderation/restore.ts
  - projects/app/src/pages/api/core/plugin/admin/pkg/upload.ts
  - projects/app/src/pages/api/core/plugin/admin/pkg/confirm.ts
  - projects/app/src/pages/api/core/plugin/admin/installWithUrl.ts
  - projects/app/src/pageComponents/admin/AdminContainer.tsx
  - projects/app/src/pageComponents/admin/moderation/policy/index.tsx
  - projects/app/src/pageComponents/admin/moderation/policy/PluginItemRow.tsx
  - projects/app/src/pageComponents/admin/moderation/policy/EditPluginModal.tsx
  - projects/app/src/pageComponents/admin/moderation/policy/ModerationTestCard.tsx
  - projects/app/src/pageComponents/admin/config/tool/Marketplace.tsx
  - projects/marketplace/src/service/plugin/repo.ts
  - projects/marketplace/src/service/tool/upload.ts
  - projects/marketplace/src/service/tool/data.ts
  - projects/marketplace/src/pages/api/tool/list.ts
  - projects/marketplace/src/pages/api/tool/detail.ts
  - projects/marketplace/src/pages/api/tool/versions.ts
  - projects/marketplace/src/pages/api/tool/getDownloadUrl.ts
routes:
  - GET /api/core/plugin/admin/moderation/list
  - POST /api/core/plugin/admin/moderation/config
  - POST /api/core/plugin/admin/moderation/check
  - GET /api/core/plugin/admin/moderation/policy
  - POST /api/core/plugin/admin/moderation/policy
  - POST /api/core/plugin/admin/moderation/delete
  - POST /api/core/plugin/admin/moderation/restore
  - POST /api/core/plugin/admin/pkg/upload
  - POST /api/core/plugin/admin/pkg/confirm
  - POST /api/core/plugin/admin/installWithUrl
  - GET /api/core/plugin/admin/tool/list
  - POST /marketplace/api/tool/list
  - GET /marketplace/api/tool/detail
  - GET /marketplace/api/tool/versions
  - GET /marketplace/api/tool/getDownloadUrl
  - POST /marketplace/api/tool/getDownloadUrl
related:
  - FG-APP-WORKFLOW-052
  - FG-PERMISSION-RESOURCE-003
automation: []
baseline: "c915077feb8edd7cfa36fe73b49c9d00550d24a1"
---

# 内容审核插件与全局策略的配置、互斥启用、测试与卸载恢复

## 用例简介

系统管理员在后台安装、配置、测试并启用内容审核插件，维护全局审核策略（生效环节与处理策略），并通过插件市场或本地安装包完成软卸载与保留配置的恢复。本例验证审核插件与普通系统工具严格隔离、凭据加密存储与掩码回写保护、保存配置前的同步可用性探测、全局单插件互斥启用及策略事务一致性。

## 前置准备

- 环境与版本：本地已启动 FastGPT 主应用、FastGPT Plugin 服务与 Marketplace 服务，连接同一套开发 MongoDB 与对象存储；记录各进程实际源码提交。商用 License 处于有效激活态（使 `/admin/moderation/policy` 导航可见）。AI 通过真实 HTTP、Chromium 页面与只读 Mongo 查询执行。
- 身份与权限：系统管理员账号 `root`（用于后台管理与插件操作），以及一个普通团队 owner 账号 `U_normal`（用于验证非 root 越权拒绝）。凭证通过环境变量或本地受控会话注入，不写入仓库。
- 测试数据：准备两个受控审核插件包 `P_mod_a`（如关键词审核插件 `moderation-test-a`，含 `secretSchema`：必填密钥 `apiKey` `isSecret: true`、普通字符串 `blockedKeywords`、数字 `strategyId`）和 `P_mod_b`（`moderation-test-b`），以及一个同 ID 或对照的普通工具插件包 `P_tool_a`。记录操作前 `system_moderation_plugins`、`system_tools`、`system_configs`（`type: 'moderationPolicy'`）与 Marketplace `tools`、`downloadcounts` 的快照 D0。
- 复位约定：C1～C4 按顺序构成从安装、配置、策略启用到效果测试的連続主链路；C5～C8 各基于已安装并配置好 `P_mod_a`、`P_mod_b` 的基线状态 D1 独立验证异常、互斥、卸载恢复与市场隔离，每步结束后恢复至 D1，全部执行完毕后恢复 D0。
- 验证能力：浏览器访问 `/admin/moderation/policy` 与 `/config/tool/marketplace?type=moderation`；HTTP 调用上述 routes；只读查询 `db.system_moderation_plugins.find({ pluginId: { $in: [P_mod_a, P_mod_b] } })`、`db.system_configs.find({ type: 'moderationPolicy' })`、`db.system_tools.find({ pluginId: /moderation-test/ })`。
- 关联标识：本轮测试标识 `RUN_ID`，测试插件 ID `P_mod_a`、`P_mod_b` 及全局策略固定竞争记录 ID `000000000000000000000021`（或既有最早策略记录 `_id`）。
- 清理方式：测试结束后先通过 `POST /api/core/plugin/admin/moderation/policy` 关闭全局审核，再卸载并清理本轮新增的测试插件记录与市场索引，将 `system_configs` 与 `system_moderation_plugins` 恢复到 D0 快照。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；D0，root 登录 | 进入 `/admin/moderation/policy`（验证后台导航仅暴露该单一内容审核入口，无 records/logs 子菜单）。开启「是否开启内容审核」，在空状态下点击「从本地安装」上传并确认 `P_mod_a.pkg` 与 `P_mod_b.pkg`。随后调用 `GET /api/core/plugin/admin/moderation/list` 与 `GET /api/core/plugin/admin/tool/list`。 |
| C2 | 基础；承接 C1（待配置态） | 在插件列表直接点击 `P_mod_a` 单选框观察提示；打开 `P_mod_a`「配置参数」弹窗，先不填必填 `apiKey` 点击保存；再填写有效 `apiKey`、`blockedKeywords: "敏感词A,违规词B"`、`strategyId: 101` 并保存。重新打开弹窗，不修改已显示「已配置凭据」的 `apiKey`，仅将 `strategyId` 清空后保存，再改为 `202` 保存。 |
| C3 | 基础；承接 C2（已配置 `P_mod_a`、`P_mod_b` 为 D1） | 在页面选中 `P_mod_a` 为当前生效服务，勾选用户输入、模型输入、最终输出，设置流式审核间隔为 `40`、疑似风险为「拦截并记录」、服务异常为「拦截未审核内容」，点击保存。刷新页面观察列表默认折叠状态与表单值；再将总开关关闭并保存。 |
| C4 | 基础；恢复 D1 并启用 `P_mod_a` | 在「审核效果测试」卡片分别输入正常文本、含拦截关键词文本、含疑似风险关键词文本、触发插件返回 `verdict: 'error'` 的文本，依次点击「开始测试」，检查结果徽标、命中标签、关键词及内容详情高亮摘要。 |
| C5 | 异常；基于 D1 | 1) 以普通账号 `U_normal` 请求 `list`/`config`/`check`/`policy`/`delete`/`restore`；2) `root` 调用 `config` 传入会导致插件探测返回 `verdict: 'error'` 或连接失败的凭据，同时带 `enabled: true`；3) `root` 调用 `POST /api/core/plugin/admin/moderation/policy` 传 `enabled: true` 但 `activePluginId: ""`。 |
| C6 | 边界；基于 D1 且 `P_mod_a` 已启用 | 通过 `POST /api/core/plugin/admin/moderation/config` 对 `P_mod_b` 传 `enabled: true`，或通过 `policy` 接口将 `activePluginId` 切换为 `P_mod_b`；并发发起两次不同插件的启用/策略更新请求，检查数据库事务更新结果。 |
| C7 | 边界；基于 D1 | 1) 在 `P_mod_a` 处于 `enabled: true` 时调用 `delete`；2) 先停用 `P_mod_a` 后在 UI 点击卸载确认；3) 导航至 `/config/tool/marketplace?type=moderation`（验证未保存策略草稿保留与切换四语种 `zh-CN`/`en`/`zh-Hant`/`ko-KR` 无裸 key），对已卸载的 `P_mod_a` 执行重新安装/恢复，返回策略页检查已保存配置。 |
| C8 | 边界；Marketplace 服务与客户端 | 1) 向 Marketplace 上传 `type: 'moderation'` 的 `P_mod_a.pkg`；尝试用不同 `source` 覆盖已有 `official` 插件，或用同 `pluginId`+同 `version` 上传 `type: 'tool'` 包；2) 分别调用 Marketplace `list`、`detail`、`versions` 以及不带 `Content-Type` 的普通 `GET /api/tool/getDownloadUrl?toolId=...&type=moderation` 与批量 `POST /api/tool/getDownloadUrl`。 |

## 预期结果

公共断言：所有管理接口成功响应必须通过对应 Zod Schema 校验（HTTP 200 且 `code: 200`），API 响应与前端状态中绝不出现明文 `apiKey` 或加密密文结构；数据库 `system_moderation_plugins` 中同一时间最多只有一条记录 `enabled: true`；`MongoSystemConfigs` 更新不产生路径冲突（无 Mongo `code=40` 错误）。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI、API、数据库 | 侧栏仅显示「内容审核」单一入口；安装后 `moderation/list` 返回 `P_mod_a`、`P_mod_b` 且 `hasConfiguredSecrets: false`、`enabled: false`；`tool/list` 与 `system_tools` 不包含这两个审核插件。 | 页面截图、两个 list 接口响应、`system_tools` 查询结果。 |
| C2 | UI、API、数据库 | 待配置点击单选弹出「请先配置插件参数」且不选中；缺必填项阻止提交；保存成功后 `moderation/list` 中 `hasConfiguredSecrets: true`，`apiKey` 值为 `__fastgpt_masked_secret__`，数据库 `secretsVal.apiKey` 为加密对象 `{ secret: "..." }`。未点修改直接保存时原密文不被掩码覆盖；清空可选数字提交 `null` 删除该字段，填 `202` 后数据库存为数值 `202` 而非字符串。 | 弹窗截图、`moderation/list` 响应、`system_moderation_plugins` BSON 快照。 |
| C3 | UI、API、数据库 | 保存开启策略后，`system_configs` 写入 `enabled: true, activePluginId: P_mod_a` 及对应 hooks/strategy，`system_moderation_plugins` 中仅 `P_mod_a.enabled === true`。刷新页面后因已有生效服务，插件列表默认收起。关闭总开关保存后，`system_configs.value.enabled === false` 且所有插件 `enabled === false`。 | 页面重载状态、`policy` GET/POST 响应、`system_configs` 与 `system_moderation_plugins` 快照。 |
| C4 | UI、API | 四种裁决分别展示「通过 / 不通过 / 疑似风险 / 服务异常」标签；`verdict: 'error'` 作为正常 HTTP 200 业务结果返回并展示 `errorMessage`，不触发 500 崩溃；非 pass 结果展示归一化命中标签（含分数）、去重关键词及带高亮的 120 字内上下文片段。 | 测试卡片截图、`moderation/check` 请求与响应。 |
| C5 | API、UI、数据库 | `U_normal` 全部被管理员鉴权拒绝；探测返回 `error` 或抛错时 `config` 保存失败，UI 提示通用安全引导且不泄露底层堆栈，数据库不新增或修改原配置、不改变原启用状态；未选插件开启策略被拒绝且不触发任何插件状态变更。 | 拒绝响应、Toast 文本、前后数据库精确比对。 |
| C6 | API、数据库 | 启用 `P_mod_b` 后，`P_mod_a` 在同一事务内变为 `enabled: false`，`system_configs` 的 `activePluginId` 同步为 `P_mod_b`；并发更新下不出现双 `enabled: true` 窗口，无更新操作符冲突。 | 并发请求响应、`system_moderation_plugins` 与 `system_configs` 快照。 |
| C7 | UI、API、数据库 | 已启用插件直接调用 `delete` 返回拒绝错误；停用后卸载将本地记录置为 `deleted: true, enabled: false` 并禁用远端 system 安装，策略页默认列表隐藏该插件。从市场恢复或重装后 `deleted: false`、`enabled: false`，原有 `secretsVal` 完整保留且不自动开启审核；四语种切换下卸载确认框与来源筛选均显示对应翻译，无裸 key。 | 删除拒绝响应、软删与恢复前后 BSON 快照、四语种 UI 截图。 |
| C8 | API、数据库、对象存储 | 跨 `source` 覆盖与同版本跨 `type` 覆盖均被拒绝；`list`/`detail`/`versions` 按 `type` 隔离返回，`moderation` 条目 `isToolset: false`；无请求体的普通 `GET getDownloadUrl`（Next 解析 `req.body` 为 `''`）与批量 `POST` 均返回 200 及正确下载链接，且 `downloadcounts` 按 `type: 'moderation'` 独立累加。 | Marketplace 各接口响应、`tools` 与 `downloadcounts` 集合快照。 |
