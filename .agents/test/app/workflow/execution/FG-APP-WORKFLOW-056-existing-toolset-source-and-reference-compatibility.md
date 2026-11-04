---
case_version: 1
id: FG-APP-WORKFLOW-056
title: 已有工具集 App 与历史工作流引用保持可用
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
related: [FG-APP-WORKFLOW-053, FG-APP-WORKFLOW-054, FG-PERMISSION-RESOURCE-001]
baseline: 346deb76c7fb8f7d961f0312d57bdea3d541180a
---

# 已有工具集 App 与历史工作流引用保持可用

## 用例简介

已有独立 MCP/HTTP 工具集 App 继续保存完整工具定义，工作流引用这些 App 后仍能展示、调用和保存。新增内联摘要契约不能截断源工具集参数，也不能使旧引用因缺少嵌套 ID、历史占位字段或旧凭据格式而失效。

## 前置准备

- 服务与模型夹具复用 053；源 App 与引用工作流均使用独立测试资源。发布者具有源 App 读取/管理和工作流写入权限；本例专注兼容性，授权与拒绝矩阵见权限关联用例。
- S0：通过现有独立 MCP/HTTP 工具集入口各创建一个 App，包含 echo 完整输入 Schema；HTTP 保留 method/path、输入/输出定义及原始 OpenAPI。记录 toolsetAppId、type、源 rootNodeId、最新 Version ID 与创建/更新请求；MCP App 的真实类型枚举是 `toolSet`，HTTP 为 `httpToolSet`，不能用模板 ID `mcpToolSet` 冒充 App.type。
- W0：按产品入口在新工作流引用 S0，记录 pluginId、嵌套 toolId、摘要、头像、版本资源快照和挂载关系。作为允许对照，先能调用 echo；不把源 App 的完整定义复制成新的内联节点。
- 历史夹具 V0：在隔离数据库副本保留三种经过旧版本验证的资源：① 旧 MCP 外部节点配置在首个隐藏 input，迁移后可缺嵌套 toolId；② 独立 MCP 源根保存空 `toolId:""` 占位；③ HTTP 源根保存完整工具与历史 JSON Schema 编码、已确认凭据字段中的旧双字段 wrapper。每个样本附旧 commit、实际 App.type、图/Version/源资源对应关系、脱敏归档哈希及旧版本可运行证据；不要求普通业务对象接受凭据迁移。
- 阻塞项：V0 归档和隔离装载步骤尚未提供，C4 不能据临时拼接对象判为已验证；本例暂为 draft。C1～C3 的当前版本兼容对照可以单独执行。独立源 App 的完整数据和工作流的摘要是两种合法保存形态，字段本来都在 toolConfig，本例不把“所有旧 MCP 都搬字段”当作需求。
- 证据：记录 apps/app_versions 的限定只读快照，使用实际详情/版本详情响应、模型参数与远端审计交叉验证。Schema 在存储中可能编码为 JSON 字符串，按已有 jsonSchemaStorage 规则解码后比较业务结构，不把编码差异误判为丢失。
- 复位与清理：每个类型及独立场景使用 S0/W0 副本；每轮最长 90 秒。完成后先删除引用工作流，再删除本例源 App，检查操作结果；历史归档仅销毁本次恢复副本。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；S0，MCP/HTTP 两变体 | 修改一个工具描述并通过原入口保存，再刷新源 App、读取版本详情；使用 W0 调用 echo。随后通过通用 version/publish 保存该源根的完整配置。 |
| C2 | 边界；独立 S0 副本 | 使用真实 POST /api/core/app/create 合约复制源根：type 与源协议匹配，nodes 使用包含完整 Schema 的真实根节点。创建成功后读取详情并调用；再只将 type 改为 workflow、用唯一名称提交同一完整根配置，作为拒绝对照。 |
| C3 | 边界；W0 | 修改引用节点本地描述并保存/刷新，调试和正式对话调用；同时检查图标与 source App 完整参数。按当前 API 的实际数据结构记录源 App 与引用节点，不假定二者返回相同字段。 |
| C4 | 历史兼容；隔离恢复 V0，逐样本独立运行 | 新版本打开并保存历史资源，重新读取详情与所选 Version，再运行引用工作流。嵌套 toolId 已存在与缺失两变体分别验证；另验证版本自身旧配置，不用当前 App 的配置补写历史版本内容。 |

## 预期结果

公共断言：源工具集 App 完整定义与工作流引用摘要分别保持各自语义；详情加载、保存、运行全部可用，不能只验证某个 Schema.safeParse。保存成功使用实际 HTTP 与业务包判断；失败创建以唯一资源名限定检查副作用。外部引用响应不带源鉴权，具体加密/导出断言归 054。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI + API + DB + 调用 | 专用入口和通用发布入口都接受匹配类型的完整根；输入必填项和 HTTP 路由/输出 Schema 未丢失。引用工作流仍调用正确 echo，源定义不会因为“摘要持久化”被压成仅名称描述。 | 两次 Version、详情与模型 parameters、远端结果对照。 |
| C2 | 真实 API + DB | 匹配类型创建成功，返回实际新 appId，完整定义可读可用；普通 workflow 的完整源根请求被入参契约拒绝，不创建同名资源。请求头/body 保留真实登录授权，不能绕过 API 直接调用 onCreateApp。 | 请求/响应、按 teamId+唯一名称查询 apps、对应 Version。 |
| C3 | UI + API + DB | 引用保持 pluginId/规范 toolId 与本地描述，头像保留原资源展示；摘要不包含完整 Schema 或源凭据。模型参数来自源定义，local 描述覆盖不破坏调用，也不修改源 App 的定义。 | 源/引用前后差集、实际模型请求与工具审计。 |
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
