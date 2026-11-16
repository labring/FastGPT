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
status: "ready"
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
  - "packages/service/common/system/systemInstanceConfig/polling.ts"
  - "packages/service/common/system/systemInstanceConfig/frontend.ts"
  - "packages/global/common/system/config/registry.ts"
  - "packages/global/common/system/config/proEnv.ts"
  - "packages/global/common/system/config/teamMode.ts"
  - "packages/global/common/system/config/scopes.ts"
  - ".agents/design/common/admin-instance-config-env-boundary.md"
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
  - "pro/admin/src/service/support/user/inform/sendMessage.ts"
  - "pro/admin/src/pages/api/support/user/inform/create.ts"
  - "pro/admin/src/service/support/wallet/bill/pay/alipay/alipayProcessor.ts"
  - "pro/admin/src/pages/api/support/wallet/bill/pay/updatePayment.ts"
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
baseline: "afc92e5f5d8cd3978e5d3865a5770119e00908da"
---

# 运行期配置接管：站点、安全、账号、资源与性能策略

## 用例简介

管理员保存站点品牌、跨域/CSRF、登录会话、文件夹层级和工作流循环上限后，真实业务请求应在无需重新部署的情况下使用数据库中的新值，环境变量不得再把已保存值覆盖回去。本例验证已迁入实例配置的代表性策略在保存、轮询和重启后的权威来源，并用社区版固定账号策略、外部数据源地址与向量库验证各自边界。Pro ENV 团队模式和运营内容作为同快照的保留范围记录，不将其视作管理表单字段。

## 前置准备

- 环境与版本：一个可修改环境变量并重启 App/Pro 节点的商业版部署，License 允许所需功能；C2/C5/C6/C8 可另在社区版执行，C3/C4 的社区版对照需要在独占实例切换版本并重启，记录 App/Pro 实际 commit、`BASE_URL`、`STORAGE_VENDOR`、Redis/Mongo 和实际日志采集位置。准备独立测试团队与 root 账号。
- 测试数据：应用 A 中准备工作流 W：循环节点输入数组固定 3 项，子节点只写固定值；准备一个已有两层文件夹的目录树；准备测试用户 U（可重复登录）和可创建11个独立登录态的浏览器/HTTP上下文；准备 1MB/2MB 两个确定性文件。记录 D0 的 domain revision、全部 17 个 scope 的 `system_instance_configs` 文档（缺失保持缺失）和页面初始值；包括 commercial.subPlans、proEnv.teamMode 及合并后的 operations 三个子项，业务域修改不得覆盖辅助 scope。
- 基线 D0：站点名称、favicon、分享域名、脚本列表、`security.allowedOrigins`、`security.csrfEnabled`、`security.passwordLoginMinuteLimitCount`、`security.maxLoginSession`、`auth.openApiKeyMaxCount`、`auth.passwordExpiredMonth`、`resource.maxFolderDepth`、`resource.uploadFileMaxSize`、`performance.workflow.maxLoopTimes` 的当前生效值全部记录。`auth.teamMode` 是退役字段，团队模式仅由 Pro `TEAM_MODE` 发布到 proEnv；准备 sync 对照时同时记录外部用户系统是否真正配置，无外部用户系统时有效模式应降为 single。
- 复位约定：每个子场景开始前通过 Admin API 保存回 D0，并等待 revision 生效；C3 打开第三个会话后注销本轮登录态，不能只关闭浏览器当作注销；C5/C6 使用独立测试目录/应用，避免影响其他测试数据。
- 验证能力：浏览器可观察标题、favicon、导航项、分享链接和 Toast；HTTP 客户端可发 CORS/CSRF 请求；Mongo 只读查询配置与业务记录；服务日志可按 `requestId`/callsite（如 `runtime.common.system.constants.getPasswordLoginMinuteLimitCount`）检索；向量库或提供商请求需要可观测的代理/日志。
- 阻塞项：C7 的 Feishu/语雀数据源路由需要本轮受控协议服务、合成应用凭据和 ENV 重启能力；没有时该行阻塞，不把“保存成功”当作路由生效。C8 的 HNSW 搜索宽度只能通过向量库查询日志/代理观察，环境没有该观测能力时阻塞。平台不保证对旧索引同步开关之类已退役 ENV 的兼容，执行前不要把旧 ENV 当作预期来源。

- 明确夹具：循环子节点使用固定文本输出，不调用模型；并发登录态检查使用同一测试用户的独立 Cookie。外部数据源允许本轮合成凭据配受控 HTTP 协议服务，不使用真实供应商账号；向量参数通过本轮 PG 协议转发捕获 SET/查询验证，不改 Dev 全局日志。

- 执行入口：本例尚无关联的完整 Node/浏览器脚本，所有子场景由 AI 按真实 API/UI、受控外呼和只读查询执行；C7/C8 的可观测依赖、C9 短信代理和 C10 证书夹具缺失时分别记录阻塞，不以代码阅读或保存成功替代运行证据。

- 新版消费增量：C9 短信代理只监听本机且绝不转发，用本轮合成用户/手机号、模板和凭据；不重复发送真实验证码。C10 使用本轮 NOTPAY 账单、内存生成的测试证书与密钥，支付表单只做惰性解析不执行、不打开网关、不产生真实支付。三种证书各做空串/空白的拒绝，成功路径验证表单签名和证书序列号，账单状态/金额/套餐/余额不变。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；D0，站点页可用 | 保存 `site.name`、`site.favicon`、`site.customApiDomain`、`site.customSharePageDomain`、`site.scripts` 为一个新品牌值；等待 ≤5 秒后刷新首页、打开 API Key/分享链接弹窗并观察脚本网络请求。记录 DB 和页面结果；随后把 `SYSTEM_NAME`、`CUSTOM_SHARE_PAGE_DOMAIN` 等对应 ENV 改成不同值并重启节点，再观察。 |
| C2 | 边界；D0 | 保存 `security.allowedOriginsEnabled=true`、`security.allowedOrigins=["https://allowed.example"]`，分别从允许和不允许的 Origin 发 API 预检；将 enabled 设 false 并保留名单，重复观察；再设 true 并清空白名单后重复。随后保存 `security.csrfEnabled=true`，用带 `fastgpt_token` Cookie 的 GET `/api/common/system/getInitData` 分别省略/携带 `fastgpt-web-request` 头；再把 `csrfEnabled=false` 后重复省略头请求。 |
| C3 | 基础/版本边界；商业版 D0，测试用户 U | 商业版保存 `security.passwordLoginMinuteLimitCount=2`、`security.maxLoginSession=2`、`auth.openApiKeyMaxCount=1`。对 U 连续调用 `preLogin` 3 次；随后恢复预登录限流为足够值并确认生效，用三个独立浏览器上下文登录 U；在团队中创建第 2 个 API Key。社区版对照在复用上述 DB 值且重启后，用新的测试用户依次验证第 3 次 preLogin 仍可继续、第 11 次受限，登录会话上限为 10，并尝试通过配置 API 写入两个 Pro 登录防护字段。每一步记录响应及 Redis/Mongo 中会话/Key 数量。 |
| C4 | 边界；商业版用户 U 有密码更新时间 | 商业版分别保存页面有效期输入 `0`（保存归一为 `null`）、`1`、`null`；另直接 API 提交 `0` 验证严格拒绝。只对本轮明确 ID 的测试用户，把 `passwordUpdateTime` 设为 40 天前，调用 `checkPswExpired`。保留商业版 `passwordExpiredMonth=1` 的 DB 值切到社区版重启，再检查密码过期结果、配置页面/API 边界；结束后恢复 D0 与用户字段。未提交该字段表示保留原值，不等同显式 null。 |
| C5 | 边界；文件夹树和文件已准备 | 保存 `resource.maxFolderDepth=2`，在已有两层目录下创建第 3 层文件夹；再保存 `=3` 重复同一创建操作。保存 `resource.uploadFileMaxSize=1`，上传 2MB 文件，再上传 0.5MB 文件。记录 API 响应、页面提示和 DB 中新建的文件夹。 |
| C6 | 基础；工作流 W，D0 | 保存 `performance.workflow.maxLoopTimes=2`，运行 W（数组 3 项），记录循环节点输出/错误；再保存 `=3`，用同一应用和新会话重跑。随后把 `WORKFLOW_MAX_LOOP_TIMES` ENV 改为 1 并重启，确认 DB 的 3 仍生效。 |
| C7 | 边界；商业版，可记录外呼的 Feishu/语雀协议服务 | 将部署 ENV `FEISHU_BASE_URL` 或 `YUQUE_DATASET_BASE_URL` 设为本轮受控服务并重启对应进程，触发对应数据源导入/同步，记录实际 host/path；通过真实配置 API 尝试旧 `providers.dataSource` 地址字段并读取 providers。恢复 ENV 并重启后重复路由观察。 |
| C8 | 边界；有向量库查询日志/代理 | 保存 `vector.hnswEfSearch=50` 和 `=300`，对同一知识库执行相同召回；从向量库日志/代理读取实际搜索宽度；记录生效快照和查询参数。 |
| C9 | 边界；本轮短信代理 | 通过真实Pro通知创建入口发送同步BIND_NOTIFICATION通知；代理分别返回成功、HTTP200业务拒绝、HTTP400、HTTP500和isp.SYSTEM_ERROR，记录每个目标的请求次数和安全错误，不向真实手机投递；恢复通道配置与ENV。 |
| C10 | 边界；本轮合成支付宝配置/未支付账单 | 通过真实配置API保存完整合成证书A/B，再调用Pro updatePayment并惰性解析签名表单；逐一将应用证书、支付宝公钥证书、根证书设为空串/空白，调用同一账单并检查拒绝及零副作用；恢复原配置并删除合成账单。 |

## 预期结果

公共断言：保存接口在事务提交后返回，保存节点后台刷新；其他 App/Pro 进程按 scope 的 `_id/revision` 常驻轮询，每轮结束等待 1 秒，不依赖配置 Mongo watch/300ms 防抖。每 250ms 观察业务结果，正常受控环境给 5 秒上限并记录实际传播时间，超时保留故障/环境证据，不用固定 sleep 判通过。已迁入实例配置的旧 ENV 只在迁移时作为 seed；节点重启不得覆盖已保存 DB 值。外部提供商地址和 Pro ENV 保留其部署权威，社区版账号三策略固定为 null/10/10。保存不成功时旧配置继续生效，不能出现“页面显示已改、业务仍用旧值”的静默状态；所有测试资源只使用本次 run 标识。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI + DB + log | 刷新后标签标题、favicon、导航项和分享链接 host 使用新值；API Key 页面展示的 API base URL 使用 `customApiDomain`；`site.scripts` 对应脚本产生网络请求；DB `site` overrides 含这些字段。改对应 ENV 并重启后页面仍显示 DB 值，证明 ENV 不再抢占；若脚本被浏览器策略拦截，记录控制台证据而不是判为配置失败。 | 页面截图、分享/API Key 页面、脚本请求、`system_instance_configs.site`、重启前后日志。 |
| C2 | API + DB | 预检从 `https://allowed.example` 返回匹配的 `Access-Control-Allow-Origin`，不允许来源不返回该值；enabled=false 时保留名单但放开来源；enabled=true 且清空列表后同样恢复“允许所有来源/回显 Origin”语义。CSRF 开启且缺少 `fastgpt-web-request` 时返回 HTTP 403、`statusText=csrf_invalid`；带头时 200；关闭后缺少头也放行。配置保存后无需重启即生效。 | 预检响应头、GET 响应、DB security 文档。 |
| C3 | API + DB/Redis | 第 3 次 `preLogin` 返回 `verifyCodeTooFrequently` 语义；第 3 个登录会话使最早会话失效，剩余会话数不超过 2；第 2 个 API Key 创建被 `OPENAPI_KEY_MAX_COUNT` 对应限制拒绝。限制值恢复后，新请求按新值执行；失败请求不得留下多余 Key/会话。社区版即使 DB 仍存商业版 2/2，运行期也固定使用登录限流 10/会话上限 10，写入这两个 Pro 字段返回 403；auth.openApiKeyMaxCount 仍按 all 字段可配置。 | 响应错误、会话列表、API Key 列表、DB revision。 |
| C4 | API + DB | 页面输入 `0` 归一保存为 `null`，未设置/null 均返回 `false`；直接 API 提交 `0` 返回 400 且配置不变；`1` 且 `passwordUpdateTime` 为 40 天前返回 `true`。社区版即使 DB 保留 1 也固定 null，过期检查返回 false；其 auth 页面隐藏且写该 Pro 字段返回 403。不得把页面的 `0` 错当作“立即过期”或回落旧 ENV；省略字段不清空。 | `checkPswExpired` 响应、用户密码更新时间查询。 |
| C5 | API/UI + DB | `maxFolderDepth=2` 时创建第 3 层文件夹返回 `folderDepthLimit` 语义且不落库；改为 3 后同一操作成功并写入正确的 `parentId`/层级。`uploadFileMaxSize=1` 时 2MB 文件被拒绝，0.5MB 通过；拒绝时对象存储无残留对象。 | 创建响应、文件夹文档、上传响应/对象键。 |
| C6 | API/UI + log | `maxLoopTimes=2` 时循环节点返回 `workflow:loop_run_max_iterations_exceeded` 对应文案/错误，子流程不执行第 3 轮；`=3` 时同一 W 成功并产生 3 次固定输出。改 ENV 并重启后仍以 DB 的 3 为准。 | 运行日志/节点输出、DB performance 文档、重启前后运行结果。 |
| C7 | integration | 数据源请求命中 ENV 指定的受控 host/path；providers 表单和 Schema 不提供数据源基础地址，商业版提交旧 `providers.dataSource` 字段返回 400 且 DB/revision 不变；恢复 ENV 重启后请求回到原地址（原服务不可达时只验证路由）。不能把失效字段保存拒绝当作配置错误；无协议服务或外呼证据时该变体阻塞。 | ENV 存在性及地址、重启记录、mock 请求、旧字段拒绝响应及 providers 前后快照。 |
| C8 | integration | 两次召回的向量库查询参数分别反映 50/300（或经 provider 归一后的明确值）；DB `vector.hnswEfSearch` 与运行值一致，重启/ENV 变化不覆盖。缺少向量库观测时本行阻塞。 | 向量库日志/代理、DB vector 文档。 |
| C9 | API + proxy + log | 成功只请求1次；200业务拒绝和400均只请求1次；500及isp.SYSTEM_ERROR最多4次（首次+3重试）后失败；响应和新增日志不包含合成AK/Secret；配置恢复。本项只证明投递与错误分类链路，不替代真实注销/计费事件触发。 | 代理计数、Pro响应、日志凭据缺失布尔值、配置恢复。 |
| C10 | API + SDK + DB | 完整A/B均产生证书模式表单，网关/应用ID/序列号及RSA签名正确；三证书空/空白均拒绝且不改变账单、套餐或余额；不执行返回HTML或发起真实支付宝请求。 | 惰性表单解析、配置API、账单BSON/余额/套餐快照。 |
