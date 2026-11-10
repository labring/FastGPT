---
case_version: 1
id: FG-PERMISSION-RESOURCE-003
title: 外部工具集引用遵守版本授权与动态资源边界
business: permission/resource
category: boundary
types: [ui, api, e2e, integration]
scenario: special
priority: P0
status: ready
tags: [pr-8074, toolset, permission, resource-snapshot, mcp, http, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [ui, response, database, log]
sources:
  - .agents/design/core/app/app-resource-permission.md
  - packages/service/core/app/resource/utils.ts
  - packages/service/core/workflow/resource/context.ts
  - packages/service/core/workflow/resource/service.ts
  - packages/service/core/workflow/dispatch/utils/index.ts
  - packages/service/core/workflow/dispatch/child/runTool.ts
  - packages/global/openapi/core/workflow/node.ts
  - projects/app/src/pages/api/core/app/version/publish.ts
  - packages/service/core/app/utils.ts
  - packages/service/core/app/version/schema.ts
  - packages/service/core/app/schema.ts
routes:
  - POST /api/core/app/version/publish
  - GET /api/core/app/detail
  - POST /api/core/workflow/debug
  - POST /api/v1/chat/completions
related: [FG-APP-WORKFLOW-053, FG-APP-WORKFLOW-054, FG-APP-WORKFLOW-056]
baseline: 346deb76c7fb8f7d961f0312d57bdea3d541180a
---

# 外部工具集引用遵守版本授权与动态资源边界

## 用例简介

工作流保留外部 MCP/HTTP 工具集引用后，已发布版本只能使用其资源快照授权的工具范围；工具集后续新增工具不能自动扩大旧版本权限。新增内联能力也不能使带 pluginId 的外部引用绕过资源授权或返回源工具集凭据。

## 前置准备

- 夹具与测试网关复用 FG-APP-WORKFLOW-053，源 App 准备复用 056 的 S0 当前版本部分，不依赖其历史归档。MCP、HTTP 作为相同授权规则的两个变体，每个变体独立资源。
- 身份：同一测试团队 A 的发布者 P 有工作流写入、源工具集 S 的读取/管理权限；运行者 R 可运行已发布工作流，无 S 直接读取权限。另准备团队 B 的工具集 Sforeign，P/R 不具有其授权。R 为普通成员，不使用 root 身份或发布者 API Key 代替。
- V0：P 把仅含 echo 的 S 挂载为外部工具集并发布工作流 W；保存 publishedVersionId 与 resources，确认 tool 类型主体是 S 的 App ID，子工具范围为 echo。记录 P/R 在资源权限界面的实际授权状态，模型资源配置独立可用，避免模型无权掩盖工具结论。
- 后续 S1：S 新增 lookup 并保存源版本，但不更新 W 的引用摘要或发布版本。模型网关记录实际暴露的工具目录，并可要求选择 lookup；对于目录里不存在的工具不伪造合法工具调用。
- 每个独立拒绝场景恢复 W 的 V0 副本；C1→C2 连续，C4 为有明确授权者的发布更新。按 appId、toolsetAppId、teamId、RUN_ID 限定 DB 和远端审计。
- 版本快照授权与运行人实时权限是不同路径：已命中发布快照的 echo 应可供 R 执行；不能把“R 没有源 App 直接权限，所以所有调用都失败”写成正确预期。未被该快照授权的引用必须校验实际操作者权限与团队归属。
- 等待、脱敏及删除测试应用沿用 053；完成后恢复临时授权变更，删除 W 后再删除 S/Sforeign。无双团队或权限配置能力时，相应场景阻塞，不能用代码 mock 的 auth 成功代替。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；W/V0，R 无 S 直接读权限 | R 从正式聊天入口运行 W 并调用 echo；P 查看 W 详情，检查外部引用返回形态。 |
| C2 | 边界；承接 C1，源 App 更新为 S1，W 仍为 V0 | R 新建会话运行 W，观察模型工具目录；请求执行 lookup，再执行 echo 作为允许对照。 |
| C3 | 异常；W/V0 副本 | P 将外部引用 ID 改为未授权的 Sforeign，尝试发布；另一个独立变体保留 pluginId，向工具集配置混入 url/headerSecret/完整工具定义，尝试通过普通 workflow 发布接口写入。 |
| C4 | 边界；从 V0 开始，P 有 S 读权限 | P 通过正常入口刷新引用摘要并重新发布 W，确认新资源快照已包含 lookup；R 新建会话调用 lookup。 |

## 预期结果

公共断言：依次检查调用身份、选中 Version.resources、实际可见工具目录、远端业务调用。发布被拒绝时已发布版本指针和该版本快照保持，草稿可能按既有策略保存或过滤资源，草稿成功不代表已获发布授权；不要求已经发生的模型请求/用量被回滚。没有工具名限制的历史整集授权不用于替代本例明确 toolNames 的 V0。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | 真实聊天 + DB + 详情 + 审计 | R 按 V0 快照可执行 echo；资源主体保持 S 的父 App ID，不变成临时子节点 ID。详情仅含引用和展示摘要，不含源地址/凭据/完整执行定义。 | R 登录网络证据、V0 resources、详情字段路径及服务调用。 |
| C2 | 模型请求 + DB + 审计 | V0 的展开工具仍限制为 echo，lookup 不因源 App 新增而暴露或被执行；echo 保持可用。模型可能回答无法调用，验收实际目录与零次 lookup 调用，不逐字要求回答内容。 | 模型 tools 目录、原 Version 快照、lookup/echo 分别的调用审计。 |
| C3 | 真实 API + DB + 审计 | 跨团队未授权资源不能发布；混合引用/内联配置被写入契约拒绝，不能降级为内联执行来绕过 pluginId 授权。旧 publishedVersionId 不推进，Sforeign 服务没有本例业务调用。 | 两个独立变体的错误响应、指针/快照前后对照、远端审计；错误码按实际响应记录，不编造统一权限码。 |
| C4 | 发布 + DB + 正式聊天 | P 正常发布后才扩大新 Version 的工具范围，R 可按新快照调用 lookup；旧 V0 的 resources 不被就地改写。 | 两个 Version 的精确资源差集、发布响应及 R 的新会话审计。 |

只读查询必须区分工作流 App ID 与源工具集 ID：

```js
db.apps.findOne(
  { _id: ObjectId("<workflowAppId>"), teamId: ObjectId("<teamAId>") },
  { publishedVersionId: 1 }
);
db.app_versions.find(
  { appId: ObjectId("<workflowAppId>"), _id: { $in: [ObjectId("<V0>"), ObjectId("<V1>")] } },
  { resources: 1, nodes: 1, isPublish: 1, time: 1 }
);
```
