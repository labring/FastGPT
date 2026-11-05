---
case_version: 1
id: "FG-ADMIN-CONFIG-003"
title: "运行期配置接管：站点、安全、账号、资源与性能策略"
business: "admin/configuration"
types:
  - "e2e"
  - "integration"
  - "api"
category: "boundary"
scenario: "special"
priority: "P0"
status: "draft"
tags:
  - "instance-config"
  - "runtime-takeover"
  - "env-authority"
  - "cors-csrf"
  - "auth-policy"
  - "resource-limit"
  - "workflow-limit"
  - "覆盖基础场景"
  - "覆盖异常场景"
  - "覆盖边界场景"
evidence:
  - "ui"
  - "response"
  - "database"
  - "log"
sources:
  - "projects/app/src/service/common/system/index.ts"
  - "projects/app/src/service/common/system/volumnMongoWatch.ts"
  - "projects/app/src/service/middleware/entry.ts"
  - "packages/service/common/system/systemInstanceConfig/runtime.ts"
  - "packages/service/common/system/systemInstanceConfig/controller.ts"
  - "packages/service/common/system/constants.ts"
  - "packages/service/common/middle/reqFrequencyLimit.ts"
  - "packages/service/common/system/utils.ts"
  - "packages/service/common/parentFolder/depth.ts"
  - "packages/service/common/parentFolder/ancestorIds.ts"
  - "packages/service/common/s3/uploadPolicy/service.ts"
  - "packages/service/support/user/session.ts"
  - "packages/service/support/user/account/verification/password/service.ts"
  - "packages/service/common/rateLimit/interface/accountVerification.ts"
  - "projects/app/src/service/support/user/account/password.ts"
  - "projects/app/src/pages/api/support/openapi/create.ts"
  - "packages/service/core/workflow/constants.ts"
  - "packages/service/core/workflow/dispatch/loopRun/runLoopRun.ts"
  - "packages/service/core/workflow/dispatch/parallelRun/runParallelRun.ts"
  - "packages/service/common/feishu/endpoint.ts"
  - "packages/service/common/dingtalk/endpoint.ts"
  - "packages/service/core/dataset/apiDataset/yuqueDataset/api.ts"
  - "packages/service/core/dataset/search/defaultRecall/embeddingRecall.ts"
  - "projects/app/src/web/context/AppShell.tsx"
  - "projects/app/src/pages/api/common/system/getInitData.ts"
  - "projects/app/src/components/support/apikey/Table.tsx"
  - "projects/app/src/components/Layout/navbar.tsx"
  - "projects/app/src/pageComponents/app/detail/Publish/Link/SelectUsingWayModal.tsx"
  - "packages/web/i18n/zh-CN/admin.json"
routes:
  - "GET /api/admin/system/config/get"
  - "POST /api/admin/system/config/update"
  - "GET /api/common/system/getInitData"
  - "POST /api/support/user/account/preLogin"
  - "POST /api/support/user/account/loginByPassword"
  - "GET /api/support/user/account/password/checkPswExpired"
  - "POST /api/core/app/folder/create"
  - "POST /api/core/app/create"
related:
  - "FG-ADMIN-CONFIG-001"
  - "FG-ADMIN-CONFIG-002"
baseline: "27d88d71f44614d89aef7d7d04fe65431ea19288"
---

# 运行期配置接管：站点、安全、账号、资源与性能策略

## 用例简介

管理员保存站点品牌、跨域/CSRF、登录会话、文件夹层级和工作流循环上限后，真实业务请求应在无需重新部署的情况下使用数据库中的新值，环境变量不得再把已保存值覆盖回去。本例用每个域的代表性字段验证“数据库是唯一运行时权威来源”，并为外部提供商和向量库保留可独立验证的边界。

## 前置准备

- 环境与版本：一个可修改环境变量并重启节点的部署（社区版或商业版均可，覆盖字段均登记为 `edition: all`），记录 commit、`BASE_URL`、`STORAGE_VENDOR`、Redis/Mongo 和实际日志采集位置。准备独立测试团队与 root 账号。
- 测试数据：应用 A 中准备工作流 W：循环节点输入数组固定 3 项，子节点只写固定值；准备一个已有两层文件夹的目录树；准备测试用户 U（可重复登录）和两个浏览器上下文；准备 1MB/2MB 两个确定性文件。记录 D0 的 domain revision、`system_instance_configs` 文档和页面初始值。
- 基线 D0：站点名称、favicon、分享域名、脚本列表、`security.allowedOrigins`、`security.csrfEnabled`、`security.passwordLoginMinuteLimitCount`、`security.maxLoginSession`、`auth.openApiKeyMaxCount`、`auth.passwordExpiredMonth`、`resource.maxFolderDepth`、`resource.uploadFileMaxSize`、`performance.workflow.maxLoopTimes` 的当前生效值全部记录。
- 复位约定：每个子场景开始前通过 Admin API 保存回 D0，并等待 revision 生效；C3 打开第三个会话后要关闭全部测试会话；C5/C6 使用独立测试目录/应用，避免影响其他测试数据。
- 验证能力：浏览器可观察标题、favicon、导航项、分享链接和 Toast；HTTP 客户端可发 CORS/CSRF 请求；Mongo 只读查询配置与业务记录；服务日志可按 `requestId`/callsite（如 `runtime.common.system.constants.getPasswordLoginMinuteLimitCount`）检索；向量库或提供商请求需要可观测的代理/日志。
- 阻塞项：C7 的 Feishu/语雀数据源路由需要可用的应用凭据和可拦截外呼的 mock；没有时该行阻塞，不把“保存成功”当作路由生效。C8 的 HNSW 搜索宽度只能通过向量库查询日志/代理观察，环境没有该观测能力时阻塞。平台不保证对 `SYNC_INDEX` 之类已退役 ENV 的兼容，执行前不要把旧 ENV 当作预期来源。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；D0，站点页可用 | 保存 `site.name`、`site.favicon`、`site.customApiDomain`、`site.customSharePageDomain`、`site.scripts` 为一个新品牌值；等待 ≤5 秒后刷新首页、打开 API Key/分享链接弹窗并观察脚本网络请求。记录 DB 和页面结果；随后把 `SYSTEM_NAME`、`CUSTOM_SHARE_PAGE_DOMAIN` 等对应 ENV 改成不同值并重启节点，再观察。 |
| C2 | 边界；D0 | 保存 `security.allowedOrigins=["https://allowed.example"]`，分别从允许和不允许的 Origin 发 API 预检；再清空白名单并重复。随后保存 `security.csrfEnabled=true`，用带 `fastgpt_token` Cookie 的 GET `/api/common/system/getInitData` 分别省略/携带 `fastgpt-web-request` 头；再把 `csrfEnabled=false` 后重复省略头请求。 |
| C3 | 基础；D0，测试用户 U | 保存 `security.passwordLoginMinuteLimitCount=2`、`security.maxLoginSession=2`、`auth.openApiKeyMaxCount=1`。对 U 连续调用 `preLogin` 3 次；用三个独立浏览器上下文登录 U；在团队中创建第 2 个 API Key。每一步记录响应和 Redis/Mongo 中的会话/Key 数量。 |
| C4 | 边界；用户 U 有密码更新时间 | 分别保存 `auth.passwordExpiredMonth=0`、`1`、`null/未设置`；用只读 DB 把 U 的 `passwordUpdateTime` 固定为 40 天前，调用 `checkPswExpired`，记录 false/true。 |
| C5 | 边界；文件夹树和文件已准备 | 保存 `resource.maxFolderDepth=2`，在已有两层目录下创建第 3 层文件夹；再保存 `=3` 重复同一创建操作。保存 `resource.uploadFileMaxSize=1`，上传 2MB 文件，再上传 0.5MB 文件。记录 API 响应、页面提示和 DB 中新建的文件夹。 |
| C6 | 基础；工作流 W，D0 | 保存 `performance.workflow.maxLoopTimes=2`，运行 W（数组 3 项），记录循环节点输出/错误；再保存 `=3`，用同一应用和新会话重跑。随后把 `WORKFLOW_MAX_LOOP_TIMES` ENV 改为 1 并重启，确认 DB 的 3 仍生效。 |
| C7 | 边界；可拦截外呼的 Feishu/语雀测试环境 | 在 providers 页把 `providers.dataSource.feishuBaseUrl`（或语雀）改为本地 mock 地址，触发一次对应数据源导入/同步；记录 mock 收到的 host/path；恢复原值。 |
| C8 | 边界；有向量库查询日志/代理 | 保存 `vector.hnswEfSearch=50` 和 `=300`，对同一知识库执行相同召回；从向量库日志/代理读取实际搜索宽度；记录生效快照和查询参数。 |

## 预期结果

公共断言：保存成功后最多等待一次配置重载（变更流 300ms + 页面刷新；给 5 秒上限），业务侧应读取新快照；环境变量只在迁移时作为 seed，节点重启后不得覆盖已保存 DB 值。保存不成功时旧配置继续生效，不能出现“页面显示已改、业务仍用旧值”的静默状态；所有测试资源只使用本次 run 标识。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI + DB + log | 刷新后标签标题、favicon、导航项和分享链接 host 使用新值；API Key 页面展示的 API base URL 使用 `customApiDomain`；`site.scripts` 对应脚本产生网络请求；DB `site` overrides 含这些字段。改对应 ENV 并重启后页面仍显示 DB 值，证明 ENV 不再抢占；若脚本被浏览器策略拦截，记录控制台证据而不是判为配置失败。 | 页面截图、分享/API Key 页面、脚本请求、`system_instance_configs.site`、重启前后日志。 |
| C2 | API + DB | 预检从 `https://allowed.example` 返回匹配的 `Access-Control-Allow-Origin`，不允许来源不返回该值；清空列表后恢复“允许所有来源/回显 Origin”语义。CSRF 开启且缺少 `fastgpt-web-request` 时返回 HTTP 403、`statusText=csrf_invalid`；带头时 200；关闭后缺少头也放行。配置保存后无需重启即生效。 | 预检响应头、GET 响应、DB security 文档。 |
| C3 | API + DB/Redis | 第 3 次 `preLogin` 返回 `verifyCodeTooFrequently` 语义；第 3 个登录会话使最早会话失效，剩余会话数不超过 2；第 2 个 API Key 创建被 `OPENAPI_KEY_MAX_COUNT` 对应限制拒绝。限制值恢复后，新请求按新值执行；失败请求不得留下多余 Key/会话。 | 响应错误、会话列表、API Key 列表、DB revision。 |
| C4 | API + DB | `0` 与未设置/null 均表示永不过期，返回 `false`；`1` 且 `passwordUpdateTime` 为 40 天前返回 `true`。不得把 `0` 错当作“立即过期”或回落旧 ENV。 | `checkPswExpired` 响应、用户密码更新时间查询。 |
| C5 | API/UI + DB | `maxFolderDepth=2` 时创建第 3 层文件夹返回 `folderDepthLimit` 语义且不落库；改为 3 后同一操作成功并写入正确的 `parentId`/层级。`uploadFileMaxSize=1` 时 2MB 文件被拒绝，0.5MB 通过；拒绝时对象存储无残留对象。 | 创建响应、文件夹文档、上传响应/对象键。 |
| C6 | API/UI + log | `maxLoopTimes=2` 时循环节点返回 `workflow:loop_run_max_iterations_exceeded` 对应文案/错误，子流程不执行第 3 轮；`=3` 时同一 W 成功并产生 3 次固定输出。改 ENV 并重启后仍以 DB 的 3 为准。 | 运行日志/节点输出、DB performance 文档、重启前后运行结果。 |
| C7 | integration | 数据源请求命中配置的 mock host/path，而不是旧 ENV 地址；恢复后请求回到原地址（若原地址不可达只验证路由，不要求外部服务成功）。无可用凭据/外呼拦截能力时本行阻塞，不能伪造通过。 | mock 请求记录、providers 文档、集成日志。 |
| C8 | integration | 两次召回的向量库查询参数分别反映 50/300（或经 provider 归一后的明确值）；DB `vector.hnswEfSearch` 与运行值一致，重启/ENV 变化不覆盖。缺少向量库观测时本行阻塞。 | 向量库日志/代理、DB vector 文档。 |
