---
case_version: 1
id: FG-APP-WORKFLOW-054
title: 内联工具集凭据的保存、引用与导出隔离
business: app/workflow/management
category: boundary
types: [ui, api, e2e, integration]
scenario: special
priority: P0
status: ready
tags: [pr-8074, inline-toolset, credential, mcp, http, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [ui, response, database, log]
sources:
  - packages/global/common/secret/type.ts
  - packages/service/common/secret/utils.ts
  - projects/app/src/components/common/secret/HeaderAuthConfig.tsx
  - projects/app/src/pageComponents/app/detail/Edit/HTTPTools/utils.ts
  - projects/app/src/pageComponents/app/detail/Edit/HTTPTools/SchemaConfigModal.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/hooks/toolSetDebug.ts
  - projects/app/src/pages/api/core/app/mcpTools/getTools.ts
  - projects/app/src/pages/api/core/app/version/publish.ts
  - packages/global/openapi/core/app/version/api.ts
  - packages/service/core/app/controller.ts
  - packages/service/core/app/utils.ts
  - packages/service/core/workflow/dispatch/utils/index.ts
  - packages/service/core/workflow/dispatch/child/runTool.ts
  - projects/app/src/web/core/workflow/utils.ts
  - projects/app/src/pageComponents/app/detail/ExportConfigPopover.tsx
  - packages/service/core/app/version/schema.ts
routes:
  - POST /api/core/app/version/publish
  - GET /api/core/app/detail
  - POST /api/core/app/mcpTools/getTools
  - POST /api/core/workflow/debug
  - POST /api/v1/chat/completions
related: [FG-APP-WORKFLOW-053, FG-APP-WORKFLOW-056, FG-PERMISSION-RESOURCE-001]
baseline: 346deb76c7fb8f7d961f0312d57bdea3d541180a
---

# 内联工具集凭据的保存、引用与导出隔离

## 用例简介

作者为内联工具集配置鉴权后，保存、自动保存、刷新和重新编辑应保持可用，存储与详情中不暴露静态明文。导出配置应清除鉴权；工作流变量引用应保留引用关系，在正式执行和具备相同变量值的单工具调试中得到一致解析。

## 前置准备

- 环境、账号、清理及 M0/H0 夹具复用 053；本例另建独立工作流，不复用其已发布 appId。OpenAPI 文档保持公开，鉴权施加在实际 HTTP 业务接口；不假定私有文档能复用业务鉴权头下载。
- 凭据：仅使用隔离环境的 `TOKEN_A`、`TOKEN_B`；MCP 目录与调用均校验 Authorization，HTTP 业务校验 Authorization 和 `X-API-Key`。服务审计只记录接收的凭据别名 A/B/缺失，不输出令牌。UI、请求及 DB 证据必须脱敏。
- D0：以静态 TOKEN_A 配置并发布的工作流，记录 appId、nodeId、保存前 Version、publishedVersionId；固定 q 带 RUN_ID。测试库 apps/app_versions 只读，密文不通过生产密钥离线解密。
- 引用变体 Dref：配置应用全局变量 `apiToken`，通过配置导入为 MCP `headerSecret.Authorization={ref:["VARIABLE_NODE_ID","apiToken"]}`，给出当次变量值 TOKEN_A；不假定页面存在逐字段引用开关。导入时保留真实节点/连线模板。需要调试页面能收集同一应用变量上下文；若当前实现提前无上下文发现工具，将其记为功能失败。
- 导出：使用顶部更多菜单的导出 JSON；同时准备一个包含 Agent selectedTools 的配置副本验证同一导出清理函数，业务参数中放一个普通同名对象 `{headerSecret:"ordinary-business-value"}`，它不是鉴权容器。
- 超时沿用 053；保存前后各截取一次脱敏网络与只读记录。除 C1 明确连续外，每个子场景重新从 D0 副本开始。没有 DB 读取能力时，加密持久化断言阻塞，不能只凭 UI 遮挡判定通过。
- 当前基线的 HTTP 请求头 helper 会生成旧双字段凭据；C2 应要求新保存成功而不是接受拒绝。引用凭据调试同样以需求一致性为验收，不沿用当前无 resolver 的错误作为成功结果。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；MCP/HTTP 静态凭据两个变体，D0 | 首次保存并发布，刷新详情；不修改鉴权，再编辑描述并保存一次；两次分别调试和正式调用 echo。 |
| C2 | 边界；HTTP D0 | 新增非空自定义头 `X-API-Key=TOKEN_A`，分别触发自动保存与手动发布；刷新后将头改名、更新为 TOKEN_B，再保存。通过实际 UI 的网络请求检查最终 headerSecret 形态。 |
| C3 | 边界；MCP Dref | 在应用变量已设 TOKEN_A 时进行单工具目录加载/调试和完整对话；下一次新运行将变量改为 TOKEN_B，再执行。每次均记录服务认证别名与目录/调用请求。 |
| C4 | 异常；独立 Dref 副本 | 将 apiToken 变为未定义，另一个变体给非字符串值；尝试运行；恢复 TOKEN_A 后重试。 |
| C5 | 边界；D0 和 selectedTools 导出副本 | 各导出一次 JSON，检查父工具集、完整工具列表、单工具与 selectedTools 专用配置中的鉴权；将脱敏配置导入另一临时工作流，观察缺鉴权提示，再手工补回凭据。 |
| C6 | 边界；HTTP D0 | 明确删除 X-API-Key，保存刷新；再添加同名空头，最后填入 TOKEN_B。每步记录存储配置和一次业务调用，避免直接从最后一步推断中间状态。 |

## 预期结果

公共断言：成功保存为 HTTP 200、`code=200,data=null`，并核对本例 Version；静态非空凭据最终是单来源 `{secret:...}`，ref 则保留引用，不能落库为解析后的令牌。密文可因实现变化重生成，判断是否仍可正确认证，不要求密文逐字不变。工具业务参数、模型用量和鉴权配置分开检查，不泛化为失败后所有数据不变。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | DB + 详情 + 远端审计 | DB 和详情响应不含 TOKEN_A 明文；静态凭据保存为 secret 分支。未编辑凭据的第二次保存不丢失、不会产生不可解密的二次加密，工具两次均认证为 A。 | 054 下述查询、脱敏详情响应、服务认证别名及结果；不导出真实密文到公共报告。 |
| C2 | UI + 请求契约 + DB | 自动保存和发布均接受新增/修改头；新请求使用当前单来源凭据，不生成 `{value,secret}` 双字段对象。改名后旧 key 消失，新 key 与 TOKEN_B 生效；baseUrl 留空仍加密。 | 每阶段 publish 请求/响应、Version key 集合与 HTTP 审计。 |
| C3 | UI + 正式运行 + DB | 目录发现和实际 MCP 调用在同一变量上下文内使用 A；切换后使用 B，不复用 A 的认证客户端；DB 始终保存 ref。变量值不出现在模型生成的业务参数 Schema 中。 | 两次网关/服务审计、目录响应和调试结果、只读配置。 |
| C4 | 响应 + 审计 | 缺值或非字符串引用明确失败，不能把数组/对象字符串化成请求头、不能使用旧令牌继续业务调用；恢复后成功。允许失败阶段产生目录/模型调用等已发生行为，按服务审计区分。 | 可见错误、请求终态、服务是否收到可认证业务调用以及恢复对照。 |
| C5 | 导出 JSON + 导入 UI | 专用工具鉴权容器中的 headerSecret 被清除，包括 selectedTools 和工具列表；普通业务参数里的同名字段保留。导入后要求补鉴权，不能继承源工作流凭据；补回后可调用。 | 导出文件的字段路径集合差异、导入节点状态、服务审计；不以全文删除 headerSecret 字符串作为判断。 |
| C6 | DB + 服务审计 | 删除后不再携带旧令牌；重加空头不会复活已删除的密文；补 TOKEN_B 后使用 B。需要鉴权的中间调用应按协议失败，不要求保存空配置必然失败。 | 各阶段 headerSecret key 集合、调用认证别名与响应。 |

只读核验限定本例资源，查询结果仅在受控环境检查、对外证据脱敏：

```js
db.apps.findOne({ _id: ObjectId("<appId>"), teamId: ObjectId("<teamId>") }, { publishedVersionId: 1 });
db.app_versions.find(
  { appId: ObjectId("<appId>") },
  { nodes: 1, isPublish: 1, isAutoSave: 1, time: 1 }
).sort({ time: -1 }).limit(4);
```
