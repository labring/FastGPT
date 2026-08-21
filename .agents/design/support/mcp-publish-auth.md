# MCP 发布鉴权与身份代理

## 任务概述

MCP 发布能力与个人 APIKey 的管理和执行语义保持一致：

- 管理列表仅返回当前团队成员创建的 MCP 发布项。
- `tools/list` 是公开元数据接口，持有发布 key 即可读取工具描述，不校验发布者的实时应用权限。
- `tools/call` 是执行接口，每次调用都使用有效团队成员身份校验目标应用读权限。
- 团队 owner 可以为发布项开启 `authProxy`。调用方通过
  `x-fastgpt-auth-proxy-username` 或 `x-fastgpt-auth-proxy-tmb-id` 指定代理成员；两个请求头同时存在时必须指向同一成员。

## 设计

### 管理边界

`mcp_keys` 继续记录创建成员 `tmbId`。列表固定按 `{ teamId, tmbId }` 查询，更新和删除也只允许创建成员操作，团队管理权限不扩大到其他成员的发布项。

### 公开协议

`tools/list` 只根据发布 key 读取绑定应用及最新版本并生成 tool schema。该路径不解析身份代理，也不调用应用权限鉴权。

`tools/call` 根据发布 key 读取 `teamId`、`tmbId`、`authProxy` 和绑定应用：

1. 未传身份代理时，以发布者 `tmbId` 作为有效成员。
2. 传入身份代理时，要求发布项已开启 `authProxy`。
3. username 和 tmbId 都只能解析到当前团队内未离开的成员；同时传入时必须匹配同一成员。
4. 使用有效成员调用 `authAppByTmbId(..., ReadPermissionVal)`，通过后再运行工作流。
5. 对话记录、运行用户信息和工作流 `uid` 都归属有效成员。

Streamable HTTP 直接读取请求头。独立 SSE 服务在建立连接时保存代理请求头，并在每次 `tools/call` 转发到主应用；`tools/list` 不转发身份信息。

### 兼容性

`authProxy` 缺省为 `false`，旧记录无需迁移。未使用代理头的现有 MCP 客户端仍以发布者身份执行；发布者失去目标应用读权限后，后续执行会立即失败。

## 风险与注意事项

- 发布 key 仍是执行凭证，需要按密钥管理；公开仅指工具描述无需额外用户登录态。
- 身份代理不跨团队，已离开成员不能继续被代理。
- SSE 连接只缓存调用方提供的代理标识，发布项开关与成员权限在每次执行时重新读取。

## TODO

- [x] MCP schema、OpenAPI schema 和前端类型增加 `authProxy`。
- [x] 管理列表及 CRUD 权限收敛到创建成员。
- [x] 创建/更新接口增加 owner-only `authProxy` 校验。
- [x] 实现代理身份解析和执行时应用权限校验。
- [x] Streamable HTTP 与 SSE 转发代理请求头。
- [x] 发布表单增加 owner-only 身份代理开关及多语言文案。
- [x] 补充局部测试并运行类型检查。
