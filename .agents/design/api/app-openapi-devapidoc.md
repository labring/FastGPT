# 应用接口 OpenAPI Schema 化与 DevAPI 文档分类设计

## 背景

当前 `devapidoc` 已经接入 `packages/global/openapi/path.ts` 的全量开发者文档路径，应用相关接口里已有部分接口完成了 OpenAPI schema 声明，例如：

- 应用创建与权限：`packages/global/openapi/core/app/common`
- 应用日志：`packages/global/openapi/core/app/log`
- HTTP 工具集：`packages/global/openapi/core/app/httpTools`
- MCP 工具集：`packages/global/openapi/core/app/mcpTools`
- Playground 发布渠道：`packages/global/openapi/core/app/publishChannel/playground`

后续计划继续把应用相关接口改为使用 schema 声明，并纳入 `devapidoc`，需要先统一分类边界，避免按路径随意堆叠。

## 目标

1. 应用相关接口在 `devapidoc` 中形成清晰的两级分类。
2. OpenAPI schema 文件按业务模块拆分，避免 `core/app/common` 继续膨胀。
3. 明确本轮纳入范围和暂不纳入范围，避免把应用构建页依赖的所有接口都混入应用管理。
4. 纳入 `devapidoc` 的接口必须按 API 开发规范补齐 zod schema，并在路由实现中复用同一份 schema 做入参校验。

## 分类原则

`devapidoc` 采用两级分类：

- 大类用于文档左侧分组，例如“应用管理”“工具管理”。
- 二级模块对应 OpenAPI tag，例如“基础应用”“版本管理”“发布渠道”。

接口归类优先按业务语义，而不是纯路径：

- `/core/app/**` 多数属于应用管理或工具管理。
- `/support/outLink/**` 虽然在 support 下，但业务上属于应用发布渠道。
- `/support/openapi/**` 业务上属于 API Key 管理，应放入应用管理。
- `/support/mcp/**` 业务上属于 MCP 发布管理，应放入工具管理。

## Schema 补齐原则

本轮目标是文档化和类型收敛，默认不主动改变现有接口形态；如果接口明显是写操作但使用了 GET/POST 等不合适方法，可以同步调整为更规范的 HTTP method。本轮已将更新类接口统一收敛为 `PUT`，删除类接口保持 `DELETE`。

1. 默认保持现有 path、query/body 参数位置不变；HTTP method 可在明显不规范时同步修正。
2. 每个纳入 `devapidoc` 的接口都需要在 `packages/global/openapi/**/api.ts` 中声明 query/body/response schema。
3. schema 文件头部按 API skill 规范声明 API 名称、路由、方法、描述和标签。
4. API handler 需要复用同一份 schema 校验入参：
   - 新增或重构的 Next.js API 边界优先使用 `parseApiInput`。
   - 已有简单路由如果暂不重构，也至少使用对应 schema 解析 `req.query` 或 `req.body`。
5. 关键接口返回值使用 response schema parse，保证文档和实际返回结构一致。
6. OpenAPI path 只引用 schema，不重复手写结构。
7. 如果现有接口命名、方法或参数风格不统一，先按现状文档化；只有明显错误才单独评估迁移，避免把接口迁移和 schema 补齐混在一起。

## 纳入范围

### 应用管理

#### 基础应用

用于应用本体的创建、查询、更新、复制、删除和结构转换。

- `POST /core/app/create`
- `POST /core/app/list`
- `GET /core/app/detail`
- `PUT /core/app/update`
- `DELETE /core/app/del`
- `POST /core/app/copy`
- `POST /core/app/getBasicInfo`
- `POST /core/app/transitionWorkflow`

建议目录：

- `packages/global/openapi/core/app/common`

后续如果 `common` 过大，可以拆为：

- `packages/global/openapi/core/app/base`

#### 文件夹管理

用于应用目录创建和路径查询。

- `POST /core/app/folder/create`
- `GET /core/app/folder/path`

建议目录：

- `packages/global/openapi/core/app/folder`

#### 权限管理

用于应用权限查询和继承权限恢复。

- `GET /core/app/getPermission`
- `PUT /core/app/resumeInheritPermission`

建议目录：

- `packages/global/openapi/core/app/permission`

#### 版本管理

用于应用版本发布、查询和更新版本名称。

- `POST /core/app/version/publish`
- `POST /core/app/version/list`
- `GET /core/app/version/detail`
- `GET /core/app/version/latest`
- `PUT /core/app/version/update`

建议目录：

- `packages/global/openapi/core/app/version`

#### 模板管理

用于应用模板列表和详情。

- `GET /core/app/template/list`
- `GET /core/app/template/detail`

建议目录：

- `packages/global/openapi/core/app/template`

#### 日志管理

用于应用日志字段、列表、导出、用户列表和统计数据。

- `GET /core/app/logs/getLogKeys`
- `PUT /core/app/logs/updateLogKeys`
- `POST /core/app/logs/list`
- `POST /core/app/logs/exportLogs`
- `POST /core/app/logs/getUsers`
- `GET /proApi/core/app/logs/getTotalData`
- `POST /proApi/core/app/logs/getChartData`

建议目录：

- `packages/global/openapi/core/app/log`

#### 发布渠道

用于外链/Playground 等应用发布渠道配置。普通 CRUD 和 Playground 配置纳入，第三方平台 callback 暂不纳入。

- `GET /support/outLink/list`
- `POST /support/outLink/create`
- `PUT /support/outLink/update`
- `DELETE /support/outLink/delete`
- `GET /support/outLink/playground/config`
- `PUT /support/outLink/playground/update`

建议目录：

- 通用外链：`packages/global/openapi/support/outLink`
- Playground：`packages/global/openapi/core/app/publishChannel/playground`

#### API Key 管理

用于应用或团队 API Key 的创建、查询、更新、删除和健康检查。

- `POST /support/openapi/create`
- `GET /support/openapi/list`
- `PUT /support/openapi/update`
- `DELETE /support/openapi/delete`
- `GET /support/openapi/health`

建议目录：

- `packages/global/openapi/support/openapi`

### 工具管理

#### HTTP 工具

用于 HTTP 工具集应用的创建、更新、OpenAPI schema 解析和工具运行测试。

- `POST /core/app/httpTools/create`
- `PUT /core/app/httpTools/update`
- `POST /core/app/httpTools/getApiSchemaByUrl`
- `POST /core/app/httpTools/runTool`

建议目录：

- `packages/global/openapi/core/app/httpTools`

#### MCP 工具

用于 MCP 工具集应用的创建、更新、工具解析、子工具查询和工具运行测试。

- `POST /core/app/mcpTools/create`
- `PUT /core/app/mcpTools/update`
- `POST /core/app/mcpTools/getTools`
- `GET /core/app/mcpTools/getChildren`
- `POST /core/app/mcpTools/runTool`

建议目录：

- `packages/global/openapi/core/app/mcpTools`

#### MCP 发布管理

用于管理 MCP 发布 key 及其绑定的应用。

- `GET /support/mcp/list`
- `POST /support/mcp/create`
- `PUT /support/mcp/update`
- `DELETE /support/mcp/delete`

建议目录：

- `packages/global/openapi/support/mcpServer`

## 暂不纳入范围

### 系统工具

本轮不处理系统工具相关接口。

暂不纳入：

- `/core/app/tool/getSystemToolTemplates`
- `/core/app/tool/getPreviewNode`
- `/core/app/tool/getVersionList`
- `/core/app/tool/path`
- `/core/plugin/team/list`
- `/core/plugin/team/toolDetail`
- `/core/plugin/team/toggleInstall`

这些接口主要服务应用构建页的工具选择、团队工具安装和系统工具查看，后续可以单独作为“系统工具/团队工具”模块处理。

### AI 技能管理

本轮不放入应用管理。

暂不纳入：

- `/core/ai/skill/**`

AI Skill 是独立资源，虽然应用构建页会读取 skill 列表和详情，但模块边界应放在“AI 技能管理”，不应混入应用接口。

### 发布渠道运行时和第三方 callback

暂不纳入：

- `GET /core/chat/outLink/init`
- `/support/outLink/wechat/**`
- `/support/outLink/feishu/[token]`
- `/support/outLink/wecom/[token]`
- `/support/outLink/dingtalk/[token]`
- `/support/outLink/offiaccount/[token]`

这些接口更偏运行时入口或第三方平台回调，不适合放在普通开发者接口文档里。

### MCP 协议入口

暂不纳入：

- `/mcp/app/[key]/mcp`
- `/support/mcp/server/toolList`
- `/support/mcp/server/toolCall`

这些接口偏 MCP 协议运行入口或服务端内部调用，和普通 REST OpenAPI 文档形态不同。后续如果要公开，应单独设计 MCP 文档。

## Tag 设计

建议新增或调整 tag：

```ts
appCommon: '基础应用',
appFolder: '应用文件夹',
appPer: '应用权限',
appVersion: '应用版本',
appTemplate: '应用模板',
appLog: '应用日志',
publishChannel: '发布渠道',
apiKey: 'API Key 管理',
httpTools: 'HTTP 工具',
mcpTools: 'MCP 工具',
mcpServer: 'MCP 发布管理'
```

建议 `openAPITagGroups`：

```ts
{
  name: '应用管理',
  tags: [
    TagsMap.appCommon,
    TagsMap.appFolder,
    TagsMap.appPer,
    TagsMap.appVersion,
    TagsMap.appTemplate,
    TagsMap.appLog,
    TagsMap.publishChannel,
    TagsMap.apiKey
  ]
},
{
  name: '工具管理',
  tags: [TagsMap.httpTools, TagsMap.mcpTools, TagsMap.mcpServer]
}
```

## 建议目录结构

```text
packages/global/openapi/core/app/
  common/
  folder/
  permission/
  version/
  template/
  log/
  httpTools/
  mcpTools/
  publishChannel/

packages/global/openapi/support/
  openapi/
  outLink/
  mcpServer/
```

## TODO

1. [x] 新增缺失 tag，并调整 `openAPITagGroups` 的“应用管理”“工具管理”两级分类。
2. [x] 为基础应用接口补齐 schema 和 OpenAPI path。
3. [x] 为文件夹管理接口新增 schema 和 OpenAPI path。
4. [x] 将 `getPermission` 从 `common` 迁移到 `permission`，并补齐 `resumeInheritPermission`。
5. [x] 为版本管理接口新增 schema 和 OpenAPI path。
6. [x] 为模板管理接口新增 schema 和 OpenAPI path。
7. [x] 保持日志管理现有 schema，检查是否需要补充 response schema 和路由返回 parse。
8. [x] 检查发布渠道现有 schema，补齐通用 outLink CRUD。
9. [x] 检查 API Key 管理现有 schema，补齐 create/list/update/delete。
10. [x] 检查 MCP 发布管理现有 schema，补齐 create/list/update/delete。
11. [x] 在 `projects/app/src/pages/api/**` 对应路由中使用 schema 校验入参，并在必要位置校验返回值；没有 schema 的接口需要按 API skill 先补齐 schema。
12. [x] 确认 `devapidoc` 展示完整，`openapi` API Key 文档不引入未开放接口。
