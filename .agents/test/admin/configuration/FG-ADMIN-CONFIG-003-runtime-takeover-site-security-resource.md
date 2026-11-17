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
  - "projects/app/src/pageComponents/login/LoginForm/PolicyTip.tsx"
  - "projects/app/src/components/CommunityModal/index.tsx"
  - "projects/app/src/pageComponents/dashboard/agent/filters/TemplateCategoryFilter.tsx"
  - "projects/app/src/pageComponents/login/LoginForm/LoginGuideLink.tsx"
  - "projects/app/src/components/Layout/SupportBot.tsx"
  - "projects/app/src/pageComponents/chat/ChatSetting/HomepageSetting/index.tsx"
  - "projects/app/src/pages/dataset/list/index.tsx"
  - "projects/app/src/pageComponents/app/detail/Publish/index.tsx"
  - "projects/app/src/components/common/ComplianceTip/index.tsx"
  - "projects/app/src/pages/account/info/index.tsx"
  - "projects/app/src/components/support/wallet/QRCodePayModal.tsx"
  - "packages/service/common/file/image/utils.ts"
  - "packages/service/common/s3/accessLink/url.ts"
  - "packages/service/common/security/fileUrlValidator.ts"
  - "projects/app/src/service/core/plugin/debug/connectionUrl.ts"
  - "pro/admin/src/service/support/user/inform/templates/emailTemplates.ts"
  - "packages/service/core/chat/file/service.ts"
  - "packages/service/common/s3/config/constants.ts"
  - "packages/global/common/system/config/frontendProjection.ts"
  - "projects/app/src/pageComponents/account/AccountContainer.tsx"
  - "projects/app/src/pageComponents/account/customDomain/createModal.tsx"
  - "pro/admin/src/service/support/customDomain/config.ts"
  - "pro/admin/src/service/support/k8s/controller.ts"
  - "pro/admin/src/service/support/customDomain/controllers/domain.ts"
  - "packages/service/core/workflow/dispatch/tools/http468.ts"
  - "packages/service/common/api/axios.ts"
  - "packages/service/support/permission/auth/common.ts"
  - "packages/service/common/file/multer.ts"
  - "packages/service/core/workflow/utils/fileLimits.ts"
  - "projects/app/src/pages/api/v1/chat/completions.ts"
  - "projects/app/src/pages/api/v2/chat/completions.ts"
  - "packages/service/support/outLink/runtime/service.ts"
  - "packages/service/support/permission/teamLimit.ts"
  - "packages/service/common/string/replaceVariable.ts"
  - "projects/app/src/pages/api/core/dataset/exportAll.ts"
  - "projects/app/src/pages/api/support/user/team/limit/exportDatasetLimit.ts"
  - "projects/app/src/pages/api/support/user/team/limit/webSyncLimit.ts"
  - "pro/admin/src/pages/api/core/app/evaluation/create.ts"
  - "packages/service/core/app/evaluation/mq.ts"
  - "projects/app/src/service/core/dataset/collection/archive.ts"
  - "projects/app/src/pages/api/core/dataset/collection/batchDownload.ts"
  - "projects/app/src/pages/api/core/dataset/collection/getDownloadTicket.ts"
  - "projects/app/src/pages/api/core/workflow/debug.ts"
  - "projects/app/src/pages/api/core/chat/chatTest.ts"
  - "projects/app/src/service/core/app/utils.ts"
  - "projects/app/src/service/support/mcp/utils.ts"
  - "packages/service/core/ai/skill/debugChat/handler.ts"
  - "pro/admin/src/pages/api/core/chat/chatHome.ts"
  - "pro/admin/src/service/core/ai/workflowBuilder/runner.ts"
  - "pro/admin/src/service/core/app/evaluation/index.ts"
  - "packages/service/common/file/parseTimeout.ts"
  - "packages/service/worker/function.ts"
  - "packages/service/worker/utils.ts"
  - "packages/service/common/string/utils.ts"
  - "projects/app/src/service/core/dataset/queues/datasetParse.ts"
  - "projects/app/src/service/core/dataset/training/utils.ts"
  - "projects/app/src/service/core/dataset/queues/generatePreCreatedData.ts"
  - "projects/app/src/service/core/dataset/queues/rebuild.ts"
  - "projects/app/src/service/core/dataset/queues/rebuildSynonym.ts"
  - "projects/app/src/service/core/dataset/queues/generateQA.ts"
  - "pro/admin/src/service/core/dataset/training/autoTrainingProcess.ts"
  - "pro/admin/src/service/core/dataset/training/utils.ts"
  - "pro/admin/src/service/core/dataset/training/imageIndex.ts"
  - "pro/admin/src/service/core/dataset/training/imageParse.ts"
  - "packages/service/support/wallet/sub/utils.ts"
  - "packages/service/core/ai/record/service.ts"
  - "packages/service/common/vectorDB/controller.ts"
  - "packages/service/core/workflow/dispatch/ai/agent/utils.ts"
  - "packages/service/core/workflow/dispatch/ai/agent/index.ts"
  - "packages/service/core/plugin/teamPluginPolicy.ts"
  - "packages/service/core/ai/model/utils.ts"
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
baseline: "897611e5cdd2b4d5617c5104d0d9bb5b9ebd8a6c"
---

# 运行期配置接管：站点、安全、账号、资源与性能策略

## 用例简介

管理员保存站点品牌、跨域/CSRF、登录会话、文件夹层级和工作流循环上限后，真实业务请求应在无需重新部署的情况下使用数据库中的新值，环境变量不得再把已保存值覆盖回去。本例验证已迁入实例配置的代表性策略在保存、轮询和重启后的权威来源，并用社区版固定账号策略、外部数据源地址与向量库验证各自边界。Pro ENV 团队模式和运营内容作为同快照的保留范围记录，不将其视作管理表单字段。

## 前置准备

- 环境与版本：一个可修改环境变量并重启 App/Pro 节点的商业版部署，License 允许所需功能；C2/C5/C6/C8 可另在社区版执行，C3/C4 的社区版对照需要在独占实例切换版本并重启，记录 App/Pro 实际 commit、`BASE_URL`、`STORAGE_VENDOR`、Redis/Mongo 和实际日志采集位置。准备独立测试团队与 root 账号。
- 测试数据：应用 A 中准备工作流 W：循环节点输入数组固定 3 项，子节点只写固定值；准备一个已有两层文件夹的目录树；准备测试用户 U（可重复登录）和可创建11个独立登录态的浏览器/HTTP上下文；准备 1MB/2MB 两个确定性文件。记录 D0 的 domain revision、全部 17 个 scope 的 `system_instance_configs` 文档（缺失保持缺失）和页面初始值；包括 commercial.subPlans、proEnv.teamMode 及合并后的 operations 三个子项，业务域修改不得覆盖辅助 scope。
- 基线 D0：站点名称、favicon、分享域名、脚本列表、`security.allowedOrigins`、`security.csrfEnabled`、`security.passwordLoginMinuteLimitCount`、`security.maxLoginSession`、`auth.openApiKeyMaxCount`、`auth.passwordExpiredMonth`、`resource.maxFolderDepth`、`resource.uploadFileMaxSize`、`performance.workflow.maxLoopTimes` 的当前生效值全部记录。`auth.teamMode` 是退役字段，团队模式仅由 Pro `TEAM_MODE` 发布到 proEnv；准备 sync 对照时同时记录外部用户系统是否真正配置，无外部用户系统时有效模式应降为 single。
- 复位约定：每个子场景开始前通过 Admin API 保存回 D0，并等待 revision 生效；C3 打开第三个会话后注销本轮登录态，不能只关闭浏览器当作注销；C5/C6 使用独立测试目录/应用，避免影响其他测试数据。遵循 FG-ADMIN-CONFIG-001 的 BSON 类型保留、独占锁、精确 CAS 和长窗口 License metadata 例外；短请求拒绝仍精确零写，不回滚正常 License 验签或未知写入。
- 验证能力：浏览器可观察标题、favicon、导航项、分享链接和 Toast；HTTP 客户端可发 CORS/CSRF 请求；Mongo 只读查询配置与业务记录；服务日志可按 `requestId`/callsite（如 `runtime.common.system.constants.getPasswordLoginMinuteLimitCount`）检索；向量库或提供商请求需要可观测的代理/日志。
- 阻塞项：C7 的 Feishu/语雀数据源路由需要本轮受控协议服务、合成应用凭据和 ENV 重启能力；没有时该行阻塞，不把“保存成功”当作路由生效。C8 的 HNSW 搜索宽度只能通过向量库查询日志/代理观察，环境没有该观测能力时阻塞。平台不保证对旧索引同步开关之类已退役 ENV 的兼容，执行前不要把旧 ENV 当作预期来源。

- 明确夹具：循环子节点使用固定文本输出，不调用模型；并发登录态检查使用同一测试用户的独立 Cookie。外部数据源允许本轮合成凭据配受控 HTTP 协议服务，不使用真实供应商账号；向量参数通过本轮 PG 协议转发捕获 SET/查询验证，不改 Dev 全局日志。

- C7 证据边界：受控源 A/B 使用确定性且不同的文本与受控 embedding 协议，保留真实 App 导入、Mongo 分块/训练状态、PG 向量及 Pro 队列同步证据。恢复默认 ENV 前，先把本轮 dataset 的 collection/data/training 完整 BSON 快照加密落盘；默认上游仅通过禁止转发的代理观察路由，HTTP 可记录 host/path，HTTPS CONNECT 只能证明 authority，不能声称看到加密 path、真实供应商鉴权或同步成功。日志必须按同一条记录中的 datasetId/jobId 归属，兼容同行/换行对象与长错误记录；解析失败需复核队列终态和已保存快照，禁止盲重放已提交同步。若某次缺少完整前快照，只能报告实际核对的内容/索引/向量子集，不补写“完整 BSON 不变”。HTTP 失败日志安全另按 FG-ADMIN-CONFIG-004/C14 验证，不以默认路由拒绝替代脱敏证据。

- 执行入口：本例尚无关联的完整 Node/浏览器脚本，所有子场景由 AI 按真实 API/UI、受控外呼和只读查询执行；C7/C8 的可观测依赖、C9 短信代理和 C10 证书夹具缺失时分别记录阻塞，不以代码阅读或保存成功替代运行证据。

- 新版消费增量：C9 短信代理只监听本机且绝不转发，用本轮合成用户/手机号、模板和凭据；不重复发送真实验证码。C10 使用本轮 NOTPAY 账单、内存生成的测试证书与密钥，支付表单只做惰性解析不执行、不打开网关、不产生真实支付。三种证书各做空串/空白的拒绝，成功路径验证表单签名和证书序列号，账单状态/金额/套餐/余额不变。

- C11–C15 为分层消费者增量，独立于 C1–C10 的真实 Dev 保存/传播链路：可用完整、Schema 归一的进程私有快照输入真实生产组件、handler、服务或 SDK；不得把 getter、静态扫描、保存成功或单纯参数 spy 当作业务消费。每个变体记录生产入口、受控边界、原始测试输出与实际断言，组件/内存持久化边界、原生协议、真实 Worker/Redis、既有 CI 分别列证。没有关联完整执行脚本，不将局部 Vitest 挂为完整场景 automation；复用既有 CI 时绑定确切 commit、job 与断言，不宣称本轮重跑。
- C11/C15 夹具：以真实 `buildSystemFrontendConfig` 或 `buildCustomDomainFeConfig` 投影连接受控 store/context，再挂载生产 React 组件。可替换样式装饰、异步子面板、身份/数据请求和导航边界，实际菜单条件、链接构造、点击与 meta 输出必须执行；为三种域名 provider 准备合成 kubeconfig，只指向本机不转发 HTTP fixture，不接真实集群。
- C12–C14 隔离：原生 HTTP/TLS/multipart 只监听回环，超时源可取消；创建的临时文件逐路径删除。队列/lease 如使用真实 Redis，只准随机 owned key/队列前缀，不能接全局 Dev consumer、清库或扫描 cron。Mongo/S3/lease 使用内存边界的变体须明示；真实 TTL 专项仅复用确切 CI 的独立测试库证据，不对 Dev 索引操作。真实解析 Worker 用现有 worker bundle，切换合法快照、记录线程替换/终止及预留量释放；不得将 mock Worker 计入真实线程变体。所有 DOM、socket、计时器、Worker、快照和 owned 缓存均在 finally 清理/恢复。
## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；D0，站点页可用 | 保存 `site.name`、`site.favicon`、`site.customApiDomain`、`site.customSharePageDomain`、`site.scripts` 为一个新品牌值；等待 ≤5 秒后刷新首页、打开 API Key/分享链接弹窗并观察脚本网络请求。记录 DB 和页面结果；随后把 `SYSTEM_NAME`、`CUSTOM_SHARE_PAGE_DOMAIN` 等对应 ENV 改成不同值并重启节点，再观察。 |
| C2 | 边界；D0 | 保存 `security.allowedOriginsEnabled=true`、`security.allowedOrigins=["https://allowed.example"]`，分别从允许和不允许的 Origin 发 API 预检；将 enabled 设 false 并保留名单，重复观察；再设 true 并清空白名单后重复。随后保存 `security.csrfEnabled=true`，用带 `fastgpt_token` Cookie 的 GET `/api/common/system/getInitData` 分别省略/携带 `fastgpt-web-request` 头；再把 `csrfEnabled=false` 后重复省略头请求。 |
| C3 | 基础/版本边界；商业版 D0，测试用户 U | 商业版保存 `security.passwordLoginMinuteLimitCount=2`、`security.maxLoginSession=2`、`auth.openApiKeyMaxCount=1`。对 U 连续调用 `preLogin` 3 次；随后恢复预登录限流为足够值并确认生效，用三个独立浏览器上下文登录 U；在团队中创建第 2 个 API Key。社区版对照在复用上述 DB 值且重启后，用新的测试用户依次验证第 3 次 preLogin 仍可继续、第 11 次受限，登录会话上限为 10，并尝试通过配置 API 写入两个 Pro 登录防护字段。每一步记录响应及 Redis/Mongo 中会话/Key 数量。 |
| C4 | 边界；商业版用户 U 有密码更新时间 | 商业版分别保存页面有效期输入 `0`（保存归一为 `null`）、`1`、`null`；另直接 API 提交 `0` 验证严格拒绝。只对本轮明确 ID 的测试用户，把 `passwordUpdateTime` 设为 40 天前，调用 `checkPswExpired`。保留商业版 `passwordExpiredMonth=1` 的 DB 值切到社区版重启，再检查密码过期结果、配置页面/API 边界；结束后恢复 D0 与用户字段。未提交该字段表示保留原值，不等同显式 null。 |
| C5 | 边界；文件夹树和文件已准备 | 保存 `resource.maxFolderDepth=2`，在已有两层目录下创建第 3 层文件夹；再保存 `=3` 重复同一创建操作。保存 `resource.uploadFileMaxSize=1`，上传 2MB 文件，再上传 0.5MB 文件。记录 API 响应、页面提示和 DB 中新建的文件夹。 |
| C6 | 基础；工作流 W，D0 | 保存 `performance.workflow.maxLoopTimes=2`，运行 W（数组 3 项），记录循环节点输出/错误；再保存 `=3`，用同一应用和新会话重跑。随后把 `WORKFLOW_MAX_LOOP_TIMES` ENV 改为 1 并重启，确认 DB 的 3 仍生效。 |
| C7 | 边界；商业版，可记录外呼的 Feishu/语雀协议服务 | 分别将部署 ENV `FEISHU_BASE_URL`、`YUQUE_DATASET_BASE_URL` 设为受控源 A并重启对应进程，从真实 App 数据源入口导入固定文本 A，等待分块/训练和 PG 索引完成；切到受控源 B 后经真实 Pro 队列同步，核对旧 A 分块替换为 B及实际 host/path。通过真实配置 API 尝试旧 `providers.dataSource` 字段并读取 providers。保存完整前快照，恢复 ENV 并重启，再调用真实文件列表和 Pro 同步入口；用禁止转发代理观察默认目标与失败终态，核对 B内容保留，按本轮 ID 清理队列、数据源及派生资源。 |
| C8 | 边界；有向量库查询日志/代理 | 保存 `vector.hnswEfSearch=50` 和 `=300`，对同一知识库执行相同召回；从向量库日志/代理读取实际搜索宽度；记录生效快照和查询参数。 |
| C9 | 边界；本轮短信代理 | 通过真实Pro通知创建入口发送同步BIND_NOTIFICATION通知；代理分别返回成功、HTTP200业务拒绝、HTTP400、HTTP500和isp.SYSTEM_ERROR，记录每个目标的请求次数和安全错误，不向真实手机投递；恢复通道配置与ENV。 |
| C10 | 边界；本轮合成支付宝配置/未支付账单 | 通过真实配置API保存完整合成证书A/B，再调用Pro updatePayment并惰性解析签名表单；逐一将应用证书、支付宝公钥证书、根证书设为空串/空白，调用同一账单并检查拒绝及零副作用；恢复原配置并删除合成账单。 |

| C11 | 边界；进程私有快照与生产 React/feature gate | 对描述、文档/联系 Markdown/模板课程/登录帮助/客服 iframe 链接依次设 A/B/空；对版权、三数据源、五发布渠道、合规文案和优惠入口设置可区分的混合开关再反向切换，支付表单 URL 做 A/B/空。挂载真实对应父组件并点击实际入口；账户入口加 owner/非 owner 对照。以有效测试 License 调用真实团队模型、插件 install/confirm/upload handler，开启后再关闭对应 feature，保留身份/目录/Plugin 边界受控。 |
| C12 | 边界；受控原生 HTTP/TLS、multipart 与生产校验入口 | 在生产请求链验证内网开关、工作流证书开关与节点/通用 Axios 独立响应上限，复用 C004/C14 的协议和安全日志证据。文件 URL 用允许/不允许精确 host、保留名单关闭与空名单；URL 生成依次切换 fileDomain、公网站点及空值。真实 multipart 验证数量边界及失败临时文件清理，字节类型不符在 skipFileTypeCheck 开/关对照；变量替换用合法 1M/2M 上限和同一阈值两侧输入。另由生产 cookie 写入/清除入口核对 Secure 切换。 |
| C13 | 边界；私有工作流与 owned 调度资源，各变体独立复位 | 用无模型的三个串行 textEditor 节点，对 maxRunTimes=0/1/3 执行真实 runWorkflow，并核对 debug handler 传入当前预算；parallel cap=1/2、用户请求并发10，以受控异步子任务观察真实任务池峰值和汇总。用相同文件跨合法 XLSX 行/列/单元格/合并单元格、HTML阈值与超时快照运行真实 Worker；队列验证热增/热降与 in-flight 保持。以生产准入验证文件夹数量、评测行数、导出/同步时间窗口、套餐/QPM与向量 lease 动态额度；Agent 节点 engine 选择与追踪 TTL 用精确 CI 断言补证。 |
| C14 | 边界；本轮归档清单与受控 Mongo/S3/lease 边界 | 对同一小清单验证 maxFiles、maxSourceSizeMiB 两侧与后续快照生效，进行中的预检固定开始时限额；从真实 ticket/batchDownload handler 核对当前 maxConcurrency 传给资源执行器，运行实际成员/集群 slot 竞争分支。让 Mongo/S3 读取可控延迟，观察 prepareTimeoutSeconds、取消、迟到结果、ZIP 写入与清理；恢复后同一合法清单可重试。 |
| C15 | 边界；自定义域名三 provider 的组件与回环 API | enable false→true→false 核对真实账户入口；选择 aliyun/tencent/volcengine，按真实公开投影 A/B 核对 CNAME。逐 provider 替换私有 kubeconfig namespace、issuerServiceName、nginxServiceName，在生产部署/验证控制器及真实 Kubernetes SDK 下捕获 Certificate/Ingress 与验证路径请求；每轮关闭连接并复位私有快照。 |
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
| C7 | integration | 两数据源的 App 导入 A、Mongo 分块/PG 索引、Pro 队列同步 B与旧内容替换均成功，源请求命中对应 ENV host/path；providers 表单和 Schema 不提供数据源基础地址，旧 `providers.dataSource` 返回 400且拒绝窗口 BSON/revision 精确不变。恢复 ENV 后实际 API/worker 选回原目标，禁止转发代理的真实供应商连接数为 0；HTTPS 仅报告 CONNECT authority，不要求默认导入/同步成功。受控拒绝后的已存 B内容应保持，完整 BSON 或子集证明严格依实际前快照区分。不能把失效字段拒绝、只读 DB或代理收到请求当作导入/索引/同步成功；无协议服务或外呼证据时对应变体阻塞。 | 各角色实际 ENV/PID与重启、A/B协议请求、App响应、队列 jobId及终态、Mongo/PG按 datasetId 的前后结果、默认路由 authority/零转发、类型完整的加密前快照与脱敏差集、清理审计。 |
| C8 | integration | 两次召回的向量库查询参数分别反映 50/300（或经 provider 归一后的明确值）；DB `vector.hnswEfSearch` 与运行值一致，重启/ENV 变化不覆盖。缺少向量库观测时本行阻塞。 | 向量库日志/代理、DB vector 文档。 |
| C9 | API + proxy + log | 成功只请求1次；200业务拒绝和400均只请求1次；500及isp.SYSTEM_ERROR最多4次（首次+3重试）后失败；响应和新增日志不包含合成AK/Secret；配置恢复。本项只证明投递与错误分类链路，不替代真实注销/计费事件触发。 | 代理计数、Pro响应、日志凭据缺失布尔值、配置恢复。 |
| C10 | API + SDK + DB | 完整A/B均产生证书模式表单，网关/应用ID/序列号及RSA签名正确；三证书空/空白均拒绝且不改变账单、套餐或余额；不执行返回HTML或发起真实支付宝请求。 | 惰性表单解析、配置API、账单BSON/余额/套餐快照。 |
| C11 | component + production handler/gate | 描述 meta 使用当前值，清空按默认/翻译回退；各链接/Markdown source/iframe 更新且空值不残留；菜单和版权/合规独立条件正确，非 owner 不显示兑换/折扣入口，支付表单只生成当前链接不发支付请求。团队模型/插件下一次请求随真实服务端 gate 关闭而拒绝，未进入受控目录/写入边界；不能用旧前端旗标绕过。 | 每字段对应的组件/handler 断言、DOM/链接和点击输出、快照恢复。Markdown renderer、导航、异步面板和数据边界逐项注明；不称 Dev 全站 UI、真实发布/导入/支付。 |
| C12 | native protocol + production policy | 节点与通用客户端响应上限独立，非法证书只在专用允许分支放行；内网开关在 production 模式边界验证，development 旁路不算证明。文件校验按精确 host，关闭检查仍保留名单，空名单依既定不限语义；URL 优先当前 fileDomain，清空回退 site.publicUrl，再空为相对路径。multipart 超量拒绝并清理已收临时文件，类型开关仅改变实际字节判定；1M 阈值之上停止替换而 2M 可替换，复位后恢复；cookie 设置/清除属性一致。 | 原生 HTTP/TLS/multipart 请求、真实生产输出和 owned 文件清单；只观测受控响应的 cookie，不称新增浏览器登录。对象 alias/下载依赖真实 Mongo 的结果仅按确切 CI 单独标注，不能把无 DB runner 的 buffering 超时计为通过。 |
| C13 | engine + Worker + scoped scheduling + CI | 串行真实节点执行数/输出分别为 0/1/3；实际并行池峰值1/2，任务全部完成且活跃数回0。真实 Worker 对同一文件按当前阈值拒绝/通过，旧 idle 线程随环境替换；实际超时取消源、终止线程并释放排队/预留量，后续任务成功。队列热降不取消正在运行任务，只阻止/退出后续超额 claim，热增允许新任务；quota/cooldown/QPM/lease 各临界值与清理正确，时间窗口是 Mongo 时间戳条件而非臆造 Redis TTL。Agent engine 断言验证真实 dispatcher 的 provider 选择；追踪 TTL 断言验证真实 CI Mongo 索引创建/collMod/同值无操作/客户不兼容索引保护。 | 按变体记录真实执行层：工作流引擎、受控 child boundary、handler 参数连接、Node thread、owned Redis Worker/lease、内存 Model claim、既有 CI Mongo；不得合称完整 Dev 模型/向量/训练流程，未选的测试不计入通过。保留预算/峰值/任务终态、owned prefix/key归零与线程清理证据。 |
| C14 | production archive/API boundary | 超量文件/源大小预检拒绝且后续新配置可接受；预检自身固定开始快照，超时/取消立即退出，不继续调度迟到 metadata/S3。成员互斥与 slot 耗尽错误可区分，ticket 在取得 lease 后才消费，失败不得留可误用票据或持有 lease；真实 ZIP writer 按既定条目输出，失败/断连销毁源流。maxConcurrency 的 handler 参数连接与执行器竞争分别列证，不能把参数断言冒充新集群容量实验。 | 清单/阈值/timeout/取消断言、ticket 与 lease 时序、ZIP 条目及流关闭结果；Mongo/S3/lease 受控时明确标注，不称真实 Dev 归档下载或共享集群压测。 |
| C15 | component + Kubernetes SDK HTTP | enable 决定账户入口；三 provider 的 CNAME 使用各自当前公开域名且不含私有 kubeconfig。真实 SDK 请求分别使用当前 kubeconfig namespace、Certificate issuerRef 与 Ingress backend，验证 Ingress 使用当前路径/服务；A/B无旧值残留。 | React 断言及回环 API 捕获的 method/path/非敏感 body、socket清理；不宣称真实 DNS、证书签发、Ingress 部署或集群权限验证。 |
