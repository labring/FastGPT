---
case_version: 1
id: FG-APP-WORKFLOW-058
title: 历史工具集配置和引用兼容
business: app/workflow/execution
category: boundary
types: [ui, api, e2e, integration]
scenario: special
priority: P1
status: draft
tags: [pr-8074, toolset, compatibility, mcp, http, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [ui, response, database, log]
sources:
  - packages/global/core/workflow/type/node.ts
  - packages/global/core/workflow/migration/legacy/schema.ts
  - packages/global/core/workflow/migration/legacy/workflow.ts
  - packages/global/core/workflow/migration/secret.ts
  - packages/global/openapi/core/app/common/api.ts
  - packages/global/openapi/core/app/version/api.ts
  - projects/app/src/pages/api/core/app/create.ts
  - projects/app/src/pages/api/core/app/version/publish.ts
  - projects/app/src/pages/api/core/app/mcpTools/update.ts
  - packages/service/core/app/version/controller.ts
  - packages/service/core/app/jsonSchemaStorage.ts
  - packages/service/core/app/utils.ts
  - packages/service/core/workflow/dispatch/utils/index.ts
  - packages/service/core/workflow/dispatch/child/runTool.ts
  - packages/service/core/app/version/schema.ts
  - packages/service/core/app/schema.ts
routes:
  - POST /api/core/app/create
  - POST /api/core/app/version/publish
  - GET /api/core/app/detail
  - GET /api/core/app/version/detail
  - POST /api/v1/chat/completions
related: [FG-APP-WORKFLOW-053, FG-APP-WORKFLOW-054, FG-APP-WORKFLOW-056, FG-PERMISSION-RESOURCE-003]
baseline: 346deb76c7fb8f7d961f0312d57bdea3d541180a
---

# 历史工具集配置和引用兼容

## 用例简介

历史工作流及源工具集在缺少嵌套 ID、存在旧占位字段或旧凭据格式时仍可读取、保存和调用。当前版本的源工具集行为另见 056。

## 前置准备

- 服务与模型夹具复用 053；源 App 与引用工作流均使用独立测试资源。发布者具有源 App 读取/管理和工作流写入权限；本例专注兼容性，授权与拒绝矩阵见权限关联用例。
- S0：通过现有独立 MCP/HTTP 工具集入口各创建一个 App，包含 echo 完整输入 Schema；HTTP 保留 method/path、输入/输出定义及原始 OpenAPI。记录 toolsetAppId、type、源 rootNodeId、最新 Version ID 与创建/更新请求；MCP App 的真实类型枚举是 `toolSet`，HTTP 为 `httpToolSet`，不能用模板 ID `mcpToolSet` 冒充 App.type。
- W0：按产品入口在新工作流引用 S0，记录 pluginId、嵌套 toolId、摘要、头像、版本资源快照和挂载关系。作为允许对照，先能调用 echo；不把源 App 的完整定义复制成新的内联节点。
- 历史夹具 V0：在隔离数据库副本保留三种经过旧版本验证的资源：① 旧 MCP 外部节点配置在首个隐藏 input，迁移后可缺嵌套 toolId；② 独立 MCP 源根保存空 `toolId:""` 占位；③ HTTP 源根保存完整工具与历史 JSON Schema 编码、已确认凭据字段中的旧双字段 wrapper。每个样本附旧 commit、实际 App.type、图/Version/源资源对应关系、脱敏归档哈希及旧版本可运行证据；不要求普通业务对象接受凭据迁移。
- 阻塞项：V0 归档和隔离装载步骤尚未提供，C4 不能据临时拼接对象判为已验证；本例暂为 draft。当前版本兼容对照单独见 056。独立源 App 的完整数据和工作流的摘要是两种合法保存形态，字段本来都在 toolConfig，本例不把“所有旧 MCP 都搬字段”当作需求。
- 证据：记录 apps/app_versions 的限定只读快照，使用实际详情/版本详情响应、模型参数与远端审计交叉验证。Schema 在存储中可能编码为 JSON 字符串，按已有 jsonSchemaStorage 规则解码后比较业务结构，不把编码差异误判为丢失。
- 复位与清理：每个类型及独立场景使用 S0/W0 副本；每轮最长 90 秒。完成后先删除引用工作流，再删除本例源 App，检查操作结果；历史归档仅销毁本次恢复副本。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C4 | 历史兼容；隔离恢复 V0，逐样本独立运行 | 新版本打开并保存历史资源，重新读取详情与所选 Version，再运行引用工作流。嵌套 toolId 已存在与缺失两变体分别验证；另验证版本自身旧配置，不用当前 App 的配置补写历史版本内容。 |

## 预期结果

公共断言：源工具集 App 完整定义与工作流引用摘要分别保持各自语义；详情加载、保存、运行全部可用，不能只验证某个 Schema.safeParse。保存成功使用实际 HTTP 与业务包判断；失败创建以唯一资源名限定检查副作用。外部引用响应不带源鉴权，具体加密/导出断言归 054。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C4 | 历史归档 + 详情 + Version + 调用 | 首个隐藏 input 的旧配置可以读取迁移；缺嵌套 toolId 时可用 pluginId 补齐，已有有效 ID 保留；空占位仅在历史边界去掉；HTTP 完整根和 Schema 编码可读；旧凭据在明确鉴权容器内转为当前单来源格式。旧 Version 的工具/配置不被当前 App 值覆盖。 | 每个 V0 样本的旧新配置语义差异、保存后 Version、实际 echo 调用；归档缺失则对应场景阻塞。 |

只读查询：

```js
db.apps.find(
  { teamId: ObjectId("<teamId>"), name: { $in: ["<本例成功名称>", "<本例拒绝名称>"] } },
  { name: 1, type: 1, publishedVersionId: 1 }
);
db.app_versions.find(
  { appId: { $in: [ObjectId("<toolsetAppId>"), ObjectId("<workflowAppId>")] } },
  { appId: 1, nodes: 1, edges: 1, resources: 1, time: 1 }
).sort({ time: -1 });
```
