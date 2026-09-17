# Admin 实例配置与环境变量边界草案

> 状态：讨论稿，暂不实施。
>
> 目标：为 `/admin` 配置中心和运行时配置加载确定边界。当前阶段不做加密，进入 MongoDB 的敏感字段暂时明文保存，但配置注册表必须保留 `secret` 元数据，为后续加密迁移保留空间。

## 1. 初版结论

环境变量不再按“是否有默认值”或“是否 optional”划分，而按配置职责划分：

```text
启动所需的基础设施、部署拓扑、进程身份和跨进程信任
    -> 环境变量

实例级的产品策略、功能开关、限额、外部提供商和子服务客户端配置
    -> system_instance_configs MongoDB 文档

一次性初始化参数、迁移开关、构建时参数
    -> 环境变量，但不作为 Admin 运行时配置
```

环境变量的最小目标不是“只剩 schema 中 required 的字段”，而是只保留运行时无法从 MongoDB 获取、或者不应该由 Admin 修改的字段。

本稿使用四种结论：

```text
数据库       Admin 可编辑，system_instance_configs 是运行时权威来源
环境变量     启动或部署边界，Admin 不可编辑
首次导入     旧环境变量只在首次初始化时写入数据库，之后不再覆盖数据库值
待确认       目前存在产品/部署取舍，先不迁移，避免破坏现有部署
```

本稿的变量级判断以“谁负责提供这个值”为准，而不是以当前代码是否使用
`createEnv`、字段是否 `optional` 或是否存在默认值为准：

| 分类 | 是否进入 `system_instance_configs` | 是否由 Admin 编辑 | 判断标准 |
| --- | --- | --- | --- |
| `DB` | 是 | 是 | 站点策略、产品开关、业务限额、并发控制、外部服务调用参数；持久化集合为 `system_instance_configs` |
| `ENV` | 否 | 否 | MongoDB/Redis/对象存储/向量库连接、安全根、域名拓扑、进程身份 |
| `SERVICE` | 否 | 否（第一阶段） | 独立子服务自己的端口、进程池、OS 隔离和启动认证 |
| `BUILD` | 否 | 否 | 构建期、测试期、迁移脚本和操作系统继承变量 |

第 10 章是当前完整的变量盘点和迁移对照表。后续新增环境变量时，必须先在该表
中归类，再决定是否增加 Admin 配置字段；不能只修改某一个 `env.ts`。

## 2. 目标配置树

```text
system_instance_configs（一实例一个 document）
└── config
    ├── site                 站点、品牌和可编辑的公开入口
    ├── auth                 注册、登录和账号策略
    ├── security             安全策略和访问限制
    ├── feature              功能清单和实验开关
    ├── commercial           套餐、支付、优惠和商业能力
    ├── resource              文件、目录、请求和业务资源限制
    ├── performance           并发、超时、队列和处理能力
    ├── storage              文件策略；对象存储连接仍由环境变量提供
    ├── vector               向量检索策略；向量库连接仍由环境变量提供
    ├── providers             PDF、分块、第三方数据源等提供商
    └── subservice            插件、代码沙箱、AI Proxy、Agent Sandbox

环境变量
├── bootstrap                MongoDB、Redis、日志库和连接池
├── security                 根密钥、签名密钥、跨进程共享密钥
├── deployment               端口、域名反向代理、构建时路径
├── lifecycle                索引同步、系统迁移等启动行为
└── standalone-service       独立进程自身的监听和启动参数
```

`config` 中的字段保存当前完整生效值。没有管理员修改的字段也写入默认值，不使用 `overrides` 或 `secretOverrides`。

## 3. 建议进入 MongoDB 的配置

### 3.1 站点与商业化

| 配置项 | 当前环境变量 | 目标位置 | 说明 |
| --- | --- | --- | --- |
| 站点名称、描述、图标 | `SYSTEM_NAME`、`SYSTEM_DESCRIPTION`、`SYSTEM_FAVICON` | `config.site` | Admin 可直接修改，修改后运行时生效 |
| 中国大陆 IP 跳转 | `CHINESE_IP_REDIRECT_URL` | `config.site` | 站点行为配置 |
| 前端、文件和下载公开地址 | `FE_DOMAIN`、`FILE_DOMAIN`、`FILE_DOWNLOAD_PUBLIC_URL_PREFIX` | **环境变量** | 与 DNS、反向代理和已签发链接强绑定，第一版不允许 Admin 直接修改；`NEXT_PUBLIC_BASE_URL` 同样保留环境变量 |
| Marketplace 地址 | `MARKETPLACE_URL` | `config.site` 或 `config.subservice` | 属于实例的外部服务入口 |
| 支付表单地址 | `PAY_FORM_URL` | `config.commercial` | 商业化配置 |
| 优惠券和折扣入口 | `SHOW_COUPON`、`SHOW_DISCOUNT_COUPON` | `config.commercial` | 同时受版本能力过滤 |
| 聊天版权设置 | `HIDE_CHAT_COPYRIGHT_SETTING` | `config.feature` | 站点功能开关 |
| 开源版/商业版功能可见性 | 无直接环境变量 | 配置注册表元数据 | 不建议把 edition 当成普通可编辑字段 |
| OpenAPI Key 数量上限 | `OPENAPI_KEY_MAX_COUNT` | `config.auth` 或 `config.resource` | 实例级限制 |
| 密码过期周期 | `PASSWORD_EXPIRED_MONTH` | `config.auth` | Admin 可管理 |

### 3.2 用户、登录与安全策略

| 配置项 | 当前环境变量 | 目标位置 | 说明 |
| --- | --- | --- | --- |
| 企业微信自动跳转 | `WECOM_LOGIN_AUTO_REDIRECT` | `config.auth` | 登录策略 |
| IP 限流、内网检查 | `USE_IP_LIMIT`、主站侧 `CHECK_INTERNAL_IP` | `config.security` | 主站策略可以运行时读取；独立 Sandbox 的 `CHECK_INTERNAL_IP` 仍由 Sandbox 环境变量提供 |
| CSRF 开关 | `CSRF_ENABLED` | `config.security` | Admin 可控，但关闭时必须记录审计日志 |
| 密码登录频率限制 | `PASSWORD_LOGIN_MINUTE_LIMIT_COUNT` | `config.security` | 安全限流 |
| 最大登录客户端数 | `MAX_LOGIN_SESSION` | `config.security` | 用户会话策略 |
| 自定义跨域来源 | `ALLOWED_ORIGINS` | `config.security` | 需要定义空值和默认策略，不能只依赖前端配置 |
| 多媒体转 Base64 | `MULTIPLE_DATA_TO_BASE64` | `config.feature` | 运行时能力开关 |
| Agent 引擎 | `AGENT_ENGINE` | `config.feature` | 版本能力过滤后展示 |
| 知识库同义词 | `DATASET_SYNONYM_ENABLED` | `config.feature` | 功能开关 |
| 跳过文件类型检查 | `SKIP_FILE_TYPE_CHECK` | `config.security` | 建议高风险操作单独审计 |
| 禁用缓存 | `DISABLE_CACHE` | `config.feature.disableCache` | 可配置，但要提示需要重新加载进程缓存 |
| 新团队默认权限 | `DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED` | `config.auth` | 只影响新建团队 |
| Agent Sandbox 免费提示 | `AGENT_SANDBOX_FREE_TIP` | `config.commercial` | 商业能力展示配置 |

`AUTH_COOKIE_SECURE`、`TRUSTED_PROXY_ENABLE` 和 `TRUSTED_PROXY_IPS` 暂不放入数据库，见第 5 节。它们直接依赖 HTTPS 和反向代理部署方式，错误修改可能导致全站登录或客户端 IP 判断异常。

### 3.3 并发、超时和资源限制

这些字段都是 Admin 的“限制与性能”配置，不再散落在环境变量中：

```text
config.performance
├── workflow
│   ├── maxRunTimes                 WORKFLOW_MAX_RUN_TIMES
│   ├── maxLoopTimes                WORKFLOW_MAX_LOOP_TIMES
│   └── parallelMaxConcurrency      WORKFLOW_PARALLEL_MAX_CONCURRENCY
├── parse
│   ├── fileTimeoutSeconds          PARSE_FILE_TIMEOUT_SECONDS
│   ├── xlsxMaxRows                XLSX_PARSE_MAX_ROWS
│   ├── xlsxMaxColumns             XLSX_PARSE_MAX_COLUMNS
│   ├── xlsxMaxCells               XLSX_PARSE_MAX_CELLS
│   ├── xlsxMaxMergedCells         XLSX_PARSE_MAX_MERGED_CELLS
│   └── maxHtmlTransformChars      MAX_HTML_TRANSFORM_CHARS
├── dataset
│   ├── parseMaxProcess             DATASET_PARSE_MAX_PROCESS
│   ├── vectorMaxProcess            VECTOR_MAX_PROCESS
│   ├── qaMaxProcess                QA_MAX_PROCESS
│   └── vlmMaxProcess               VLM_MAX_PROCESS
├── chat
│   ├── maxQpm                      CHAT_MAX_QPM
│   ├── logUrl                      CHAT_LOG_URL
│   ├── logInterval                 CHAT_LOG_INTERVAL
│   └── logSourceIdPrefix           CHAT_LOG_SOURCE_ID_PREFIX
├── streamResume
│   ├── ttlSeconds                  STREAM_RESUME_TTL_SECONDS
│   ├── postCompleteTtlSeconds      STREAM_RESUME_POST_COMPLETE_TTL_SECONDS
│   ├── redisMaxmemoryRatio         STREAM_RESUME_REDIS_MAXMEMORY_RATIO
│   └── memoryCheckIntervalMs       STREAM_RESUME_REDIS_MEMORY_CHECK_INTERVAL_MS
├── tracking
│   ├── batchUpdateTime             TRACK_BATCH_UPDATE_TIME
│   └── retentionHours              LLM_REQUEST_TRACKING_RETENTION_HOURS
├── task
│   └── evalConcurrency             EVAL_CONCURRENCY
└── channel
    └── wechatConcurrency           WECHAT_CHANNEL_CONCURRENCY

config.resource
├── serviceRequestMaxContentLength  SERVICE_REQUEST_MAX_CONTENT_LENGTH
├── maxFolderDepth                  MAX_FOLDER_DEPTH
├── appFolderMaxAmount              APP_FOLDER_MAX_AMOUNT
├── datasetFolderMaxAmount          DATASET_FOLDER_MAX_AMOUNT
├── uploadFileMaxSize               UPLOAD_FILE_MAX_SIZE
├── uploadFileMaxAmount             UPLOAD_FILE_MAX_AMOUNT
└── systemMaxStringLengthM          SYSTEM_MAX_STRING_LENGTH_M
```

`VECTOR_VQ_LEVEL`、`MILVUS_LANGUAGE_IDENTIFIER`、`HNSW_EF_SEARCH`、`HNSW_MAX_SCAN_TUPLES` 和 `FILE_URL_EXPIRED_DAYS` 也属于数据库配置：前四项放在 `config.vector`，后者放在 `config.storage`。

需要保留的约束：更新配置时必须校验 `WORKFLOW_PARALLEL_MAX_CONCURRENCY <= WORKFLOW_MAX_LOOP_TIMES`，不能只依赖环境变量加载阶段校验。

### 3.4 外部提供商与子服务客户端配置

目标是把“FastGPT 如何调用外部服务”放到数据库；服务本身的监听端口和进程启动参数另行处理。

| 配置项 | 当前环境变量 | 目标位置 | 敏感性 | 说明 |
| --- | --- | --- | --- | --- |
| 插件服务地址和访问 Token | `PLUGIN_BASE_URL`、`PLUGIN_TOKEN` | `config.subservice.plugin` | Token 是敏感字段 | 目标为 DB，插件服务需要增加配置读取/刷新机制 |
| Code Sandbox 地址和访问 Token | `CODE_SANDBOX_URL`、`CODE_SANDBOX_TOKEN` | `config.subservice.codeSandbox` | Token 是敏感字段 | 主站客户端配置进入 DB，Sandbox 进程自己的监听认证另行保留启动配置 |
| AI Proxy 地址和 Token | `AIPROXY_API_ENDPOINT`、`AIPROXY_API_TOKEN` | `config.subservice.aiProxy` | Token 是敏感字段 | 需要从模块加载时读取改为运行时配置快照 |
| Agent Sandbox Provider 与参数 | `AGENT_SANDBOX_PROVIDER`、各 `AGENT_SANDBOX_*` | `config.subservice.agentSandbox` | 多个 Token/Key | 主站调用侧的 Provider、地址、CPU、内存、存储、镜像、超时和代理地址均属于实例配置；独立 Sandbox 进程自身的启动参数见第 5 节 |
| Agent Sandbox Proxy HMAC 密钥 | `AGENT_SANDBOX_PROXY_SECRET` | 环境变量 | 高敏感 | 主站和独立 Proxy 之间的跨进程信任根，暂不进入 Admin |
| PDF 增强解析服务 | `CUSTOM_PDF_PARSE_*`、`SOMARK_API_KEY`、`DOC2X_KEY`、`TEXTIN_*` | `config.providers.documentParse` | Key 是敏感字段 | 暂时明文，但 UI/API 必须按 secret 字段处理 |
| Sangfor 文档解析和智能分块 | `DOCUMENT_PARSE_PROVIDER`、`SANGFOR_*`、`CUSTOM_PDF_PARSE_URL/KEY` | `config.providers.documentParse` / `config.providers.chunk` | Key 是敏感字段 | 当前 Sangfor 复用 `CUSTOM_PDF_PARSE_URL/KEY` 作为服务地址和 Bearer Token，迁移时需要兼容复制，详见第 10 章 |
| CRM 归因服务 | `CRM_API_URL`、`CRM_API_KEY` | `config.providers.crm` | Key 是敏感字段 | 未配置时保持关闭 |
| Feishu、DingTalk、Yuque 基础地址 | `FEISHU_BASE_URL`、`DINGTALK_BASE_URL`、`DINGTALK_OAPI_BASE_URL`、`YUQUE_DATASET_BASE_URL` | `config.providers.dataSource` | 否 | 默认官方地址也写入数据库 |

`PRO_URL` 和 `PRO_TOKEN` 暂保留在环境变量中。它们承担商业版服务连接和版本授权边界，不能被开源版 Admin 当作普通子服务配置暴露；后续如果商业版明确采用中心配置服务，再单独设计迁移。

### 3.5 文件与向量运行策略

按已确认的边界，对象存储和向量数据库的连接配置不进入 `system_instance_configs`。数据库只管理不改变基础设施拓扑的运行策略：

```text
config.vector
├── vqLevel                      VECTOR_VQ_LEVEL
├── languageIdentifier           MILVUS_LANGUAGE_IDENTIFIER
├── hnswEfSearch                 HNSW_EF_SEARCH
├── hnswMaxScanTuples            HNSW_MAX_SCAN_TUPLES
└── processLimits                VECTOR_MAX_PROCESS 等处理并发

config.storage
├── downloadMode                 STORAGE_DOWNLOAD_URL_MODE
├── downloadRedirectTtlSeconds  STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS
├── fileUrlExpiredDays           FILE_URL_EXPIRED_DAYS
└── processLimits                由 `config.resource` 管理的上传和资源限制
```

以下对象存储和向量数据库基础设施配置继续由环境变量注入：

```text
PG_URL
OCEANBASE_URL
SEEKDB_URL
MILVUS_ADDRESS
MILVUS_TOKEN
OPENGAUSS_URL

STORAGE_VENDOR
STORAGE_PUBLIC_BUCKET
STORAGE_PRIVATE_BUCKET
STORAGE_REGION
STORAGE_S3_ENDPOINT
STORAGE_EXTERNAL_ENDPOINT
STORAGE_R2_PUBLIC_ENDPOINT
STORAGE_S3_CDN_ENDPOINT
STORAGE_ACCESS_KEY_ID
STORAGE_SECRET_ACCESS_KEY
以及其余 STORAGE_COS_* / STORAGE_OSS_* / STORAGE_S3_* 参数
```

因此启动顺序仍然是：环境变量连接 MongoDB、Redis、对象存储和向量数据库，之后读取 `system_instance_configs` 生成运行策略快照。连接客户端不能在模块 import 阶段只读取实例数据库策略；基础设施连接与实例运行策略要分别初始化。

## 3.6 配置校验与加载边界

推荐采用三层校验，而不是把 MongoDB 文档直接作为 `createEnv({ runtimeEnv })` 的输入：

```text
bootstrapEnvSchema.parse(process.env)
        |
        v
连接 MongoDB，读取 system_instance_configs
        |
        v
SystemInstanceConfigSchema.parse(document.config)
        |
        v
合并 bootstrapEnv + systemInstanceConfig
        |
        v
RuntimeConfigSchema.parse(runtimeConfig)
```

原因是两类配置的生命周期和错误处理不同：环境变量负责进程启动和基础设施，数据库配置负责 Admin 可编辑的实例行为；直接复用 `createEnv` 会把数据库缺失、首次初始化、动态刷新和环境变量兼容导入混在一起。配置注册表仍可以复用同一组 Zod 字段 schema，但应由独立的 `SystemInstanceConfigSchema` 负责数据库文档校验。

首次启动或迁移时，旧环境变量只作为一次性 seed：

```text
数据库已有字段       -> 保留数据库值
数据库缺少字段       -> 使用环境变量值；没有环境变量则使用注册表默认值
数据库已初始化完成    -> 后续环境变量不再覆盖数据库
```

其中 PDF/Sangfor 是一个需要明确记录的兼容例外：当前代码没有
`SANGFOR_PARSE_URL` 或 `SANGFOR_PARSE_KEY`，而是由 `CUSTOM_PDF_PARSE_URL` 和
`CUSTOM_PDF_PARSE_KEY` 提供地址和 Token。目标文档可以保留
`documentParse.customPdf` 与 `documentParse.sangfor` 两个逻辑配置块，但 seed
时必须按当前 provider 将同一组旧变量复制到实际消费的逻辑块，不能假设它们是
两组独立的环境变量。

## 4. 明确保留为环境变量的配置

### 4.1 必须先于 MongoDB 的基础设施配置

| 配置项 | 当前环境变量 | 原因 |
| --- | --- | --- |
| 主数据库连接 | `MONGODB_URI` | 没有它就无法读取实例配置。即使当前 schema 给了本地默认值，也不能因此迁移到 Admin |
| 日志数据库连接 | `MONGODB_LOG_URI` | 日志连接属于部署基础设施，启动阶段初始化；是否启用日志库不是实例业务配置 |
| Redis 连接 | `REDIS_URL` | 进程级缓存、队列和观测初始化依赖；后续只把 Redis 行为参数（如流恢复 TTL）放入 DB |
| MongoDB 连接池 | `DB_MAX_LINK` | 进程资源参数，不属于租户/实例产品策略 |
| 进程环境 | `NODE_ENV`、`NEXT_RUNTIME`、`HOSTNAME`、`PORT` | 由进程管理器和部署平台决定 |

### 4.2 安全根和跨进程信任

| 配置项 | 当前环境变量 | 原因 |
| --- | --- | --- |
| 根密钥 | `ROOT_KEY` | 最高权限校验，不应由 Admin 页面修改 |
| 文件 Token 密钥 | `FILE_TOKEN_KEY` | 已签发 URL 的验证根，修改会影响历史链接 |
| AES 密钥 | `AES256_SECRET_KEY` | 当前虽暂时不用于新配置加密，仍是系统级密钥 |
| Invoke JWT 密钥 | `INVOKE_TOKEN_SECRET` | 插件反向调用的信任根 |
| Agent Sandbox Proxy 密钥 | `AGENT_SANDBOX_PROXY_SECRET` | 独立 Proxy 和主站之间的 HMAC 信任 |
| 反向代理信任 | `TRUSTED_PROXY_ENABLE`、`TRUSTED_PROXY_IPS` | 与部署拓扑强相关，错误配置影响客户端 IP 和安全判断 |
| Cookie Secure | `AUTH_COOKIE_SECURE` | 与实际 HTTPS 终止位置强相关 |

这些字段即使属于“敏感配置”，本轮也不实现加密；它们只是因为安全边界不同而继续留在环境变量。

### 4.3 构建、部署和启动生命周期配置

| 配置项 | 当前环境变量 | 原因 |
| --- | --- | --- |
| Web 路径前缀 | `NEXT_PUBLIC_BASE_URL` | 可能在构建期注入并影响前端资源路径 |
| 索引同步 | `SYNC_INDEX` | 启动时数据库维护行为，不应通过 Admin 在线切换 |
| 系统迁移批大小 | `SYSTEM_MIGRATION_BATCH_SIZE` | 迁移执行期保护参数，避免修改配置后影响正在运行的升级 |
| 默认根用户密码 | `DEFAULT_ROOT_PSW` | 只用于首次初始化/引导；初始化后不能作为运行时配置源 |
| MCP SSE Proxy 地址 | `SSE_MCP_SERVER_PROXY_ENDPOINT` | 已明确保持环境变量注入 |
| Pro 服务连接 | `PRO_URL`、`PRO_TOKEN` | 商业版服务和授权边界，开源版不暴露为普通 Admin 配置 |

`MONGODB_LOG_URI`、`REDIS_URL` 和 `DB_MAX_LINK` 可能在当前 Zod schema 中是 optional 或带默认值，但仍属于“部署基础设施环境变量”。这里的“必填”指进程职责上的启动前依赖，不机械等同于 `z.optional()` 或是否存在默认值。

### 4.4 进程观测配置

以下暂时保留环境变量，不进入实例配置：

```text
LOG_ENABLE_CONSOLE
LOG_CONSOLE_LEVEL
LOG_ENABLE_OTEL
LOG_OTEL_LEVEL
LOG_OTEL_SERVICE_NAME
LOG_OTEL_URL
METRICS_ENABLE_OTEL
METRICS_EXPORT_INTERVAL
METRICS_OTEL_SERVICE_NAME
METRICS_OTEL_URL
TRACING_ENABLE_OTEL
TRACING_OTEL_SERVICE_NAME
TRACING_OTEL_URL
TRACING_OTEL_SAMPLE_RATIO
```

原因是它们决定进程启动后的 exporter、日志管道和采样行为，修改后通常需要重启或重新建立连接。Admin 可以在“运维/诊断”中展示状态，但第一版不作为运行时编辑项。

## 5. 独立子服务的边界

“子服务配置”是 Admin 的一个独立菜单，不等于所有子服务进程的全部启动变量都迁入 MongoDB。

```text
Admin config.subservice
├── 记录 FastGPT 调用子服务所需的地址、业务参数和可轮换凭据
├── 由主站读取并生成运行时配置快照
└── 后续通过配置版本或 change stream 通知客户端刷新

子服务环境变量
├── 自身监听端口
├── 自身启动所需的最小认证/引导参数
├── 自身运行目录和 OS 隔离参数
└── 连接 MongoDB/配置中心所需的基础设施参数
```

当前独立 Code Sandbox 的以下变量先按进程配置处理，不纳入主站实例配置的第一批迁移：

```text
SANDBOX_PORT
SANDBOX_TOKEN
SANDBOX_POOL_SIZE
SANDBOX_QUEUE_ID_CONCURRENCY
SANDBOX_DISABLE_SECCOMP
SANDBOX_API_MAX_BODY_MB
SANDBOX_MAX_TIMEOUT
SANDBOX_MAX_MEMORY_MB
SANDBOX_MAX_TMP_MB
SANDBOX_MAX_OUTPUT_MB
CHECK_INTERNAL_IP
SANDBOX_REQUEST_MAX_COUNT
SANDBOX_REQUEST_TIMEOUT
SANDBOX_REQUEST_MAX_RESPONSE_MB
SANDBOX_REQUEST_MAX_BODY_MB
SANDBOX_JS_ALLOWED_MODULES
SANDBOX_PYTHON_ALLOWED_MODULES
```

原因不是它们永远不能进入数据库，而是它们由独立进程在启动时创建进程池、加载隔离策略和生成 worker。若要迁移，需要先让 Sandbox 拥有配置中心客户端，并定义配置变更后的 worker 重建策略。迁移前不要出现“主站 DB 已更新，但 Sandbox 仍使用旧 env”的隐式不一致。

`packages/service/worker/env.ts` 中的 `MAX_HTML_TRANSFORM_CHARS` 和 `XLSX_PARSE_MAX_*` 不应继续维护第二份独立来源。迁移后它们归属主站 `config.performance.parse`，主站启动 worker 时显式注入经过校验的运行时配置；worker 自身只保留进程通信、`NODE_ENV` 和代理等启动环境。

MCP Server 和 Marketplace 也先保留各自的进程启动环境。它们不是主站 `/admin` 实例配置的直接消费者，后续可以通过统一配置客户端另立设计。

## 6. 开源版与商业版过滤

配置来源和版本可见性是两个维度：

```text
配置注册表
├── key
├── section
├── secret
├── edition: community | pro | all
└── applyMode: live | reload | restart | immutable
```

过滤规则：

1. 开源版不注册或不展示 `edition=pro` 的菜单和字段；不能只依靠前端隐藏。
2. Admin API 也必须按当前版本过滤字段，开源版不能通过手工请求读取或写入商业配置。
3. 运行时读取配置时，社区版只消费社区能力；商业版字段即使存在于同一个大文档中，也不应被社区版执行。
4. 商业版的 `PRO_URL`、`PRO_TOKEN` 仍由环境变量提供，作为版本授权边界，不纳入普通配置表单。
5. MongoDB 文档可以保留商业版字段，但必须定义未知字段、降级和导入导出的兼容策略；另一种更严格的做法是商业字段仅由 Pro 注册表写入，待后续决定。

## 7. 明文存储阶段的安全约束

本轮接受以下字段暂时明文存储：

```text
子服务 Token
AI Provider/API Key
对象存储 Access Key / Secret Key
向量数据库 Token
第三方解析服务 Key
```

但仍需要在配置注册表中标记：

```text
secret: true
```

这不是现在就加密，而是要求：

- Admin 查询接口默认返回脱敏值，只有写入时接受新值；
- 审计日志不能记录完整值；
- 前端表单不能把已保存的完整值回显给浏览器；
- 导出、诊断和错误日志不能输出完整值；
- 后续可以按注册表批量迁移到加密字段，不改变配置 key 和菜单组织。

## 8. 迁移顺序建议

```text
MONGODB_URI 环境变量
        |
        v
读取并校验 system_instance_configs
        |
        +--> 初始化 site/auth/security/feature
        |
        +--> 初始化 limits/performance/resource
        |
        +--> 初始化 storage/vector/providers
        |
        +--> 初始化 subservice 客户端
        |
        v
运行时配置快照 + revision/change stream 刷新
```

建议顺序：

1. 先建立配置注册表和一实例一个文档的 Schema，默认值初始化到文档。
2. 先迁移站点、功能开关、认证策略、并发限制等无外部连接的配置。
3. 再迁移 PDF/分块、AI Proxy、插件和 Agent Sandbox 等外部提供商配置。
4. 最后迁移对象存储和向量数据库，并把初始化从 import 阶段改为读取配置后的显式初始化。
5. 稳定后再考虑独立 Code Sandbox、MCP Server、Marketplace 的配置中心接入。

## 9. 当前边界结论

以下内容已经按本轮讨论确定，后续实现不应再次反向设计：

1. `system_instance_configs` 使用“一实例一个完整大文档”，不使用 `namespace`、`overrides`、`secretOverrides` 或按配置分片的多个文档。
2. 未被管理员修改的字段也直接保存默认值；数据库文档始终代表完整的当前生效快照。
3. 配置校验采用独立的 `SystemInstanceConfigSchema`，不把 MongoDB 文档直接塞入 `createEnv({ runtimeEnv })`；启动环境和实例配置分别校验。
4. 当前阶段敏感字段允许明文存储，但必须保留 `secret: true` 元数据，并在查询、审计、日志和导出时脱敏。
5. MongoDB、Redis、对象存储、向量数据库的连接信息，以及安全根、跨进程密钥、部署域名拓扑继续通过环境变量注入。
6. 子服务客户端配置在 Admin 中单独组织为“子服务配置”；独立子服务自身的端口、进程池、OS 隔离和启动认证暂不迁入主站实例文档。
7. 开源版/商业版使用注册表进行菜单、字段、读写 API 和运行时消费的统一过滤；开源版采用隐藏（`hide`）而不是只展示禁用状态。
8. `PRO_URL`、`PRO_TOKEN` 当前继续作为环境变量，作为商业服务和授权边界，不作为普通 Admin 配置项。

## 10. 完整环境变量与实例配置对照

本章是当前代码的变量盘点，覆盖以下来源：

- `packages/service/env.ts`：主站共享服务配置；
- `projects/app/src/env.ts`：App 配置；
- `packages/service/worker/env.ts`：文件解析 Worker 配置；
- `projects/code-sandbox/src/env.ts`：独立 Code Sandbox 进程配置；
- `projects/mcp_server/src/env.ts`：独立 MCP Server 进程配置；
- `projects/agent-sandbox-proxy` 和 `projects/fastgpt-ide-agent`：Rust 独立子服务直接读取的环境变量。

变量分为四类：

```text
DB       -> 迁移到 system_instance_configs，Admin 可编辑，环境变量只用于首次 seed
ENV      -> 永久由进程启动环境注入，Admin 不可编辑
SERVICE  -> 独立子服务自己的启动参数，不属于主站 system_instance_configs
BUILD    -> 构建、测试、脚本或操作系统继承变量，不属于运行时 Admin 配置
```

下面的路径以当前初版 `SystemInstanceConfigSchema` 为准。变量名仍保留在表中，是为了支持迁移期兼容和逐项清理；迁移完成后，`DB` 类变量不再作为运行时覆盖来源。

### 10.1 迁移到 system_instance_configs 的变量

#### 站点、登录与商业化

| 环境变量 | MongoDB 配置路径 | 迁移说明 |
| --- | --- | --- |
| `SYSTEM_NAME` | `config.site.name` | 站点名称 |
| `SYSTEM_DESCRIPTION` | `config.site.description` | 站点描述 |
| `SYSTEM_FAVICON` | `config.site.favicon` | 站点图标；若当前由构建期注入，需先改为运行时初始化数据 |
| `CHINESE_IP_REDIRECT_URL` | `config.site.chineseRedirectUrl` | 空字符串表示关闭 |
| `MARKETPLACE_URL` | `config.site.marketplaceUrl` | 外部 Marketplace 地址 |
| `OPENAPI_KEY_MAX_COUNT` | `config.auth.openApiKeyMaxCount` | OpenAPI Key 数量上限 |
| `PASSWORD_EXPIRED_MONTH` | `config.auth.passwordExpiredMonth` | 未配置映射为 `null` |
| `WECOM_LOGIN_AUTO_REDIRECT` | `config.auth.wecomLoginAutoRedirect` | 企业微信登录策略 |
| `DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED` | `config.auth.defaultTeamBasicPermissionsEnabled` | 只影响新建团队 |
| `PAY_FORM_URL` | `config.commercial.payFormUrl` | 空字符串表示未配置 |
| `SHOW_COUPON` | `config.commercial.showCoupon` | 受 edition 过滤 |
| `SHOW_DISCOUNT_COUPON` | `config.commercial.showDiscountCoupon` | 受 edition 过滤 |
| `AGENT_SANDBOX_FREE_TIP` | `config.commercial.agentSandboxFreeTip` | 受 edition 过滤 |
| `HIDE_CHAT_COPYRIGHT_SETTING` | `config.feature.hideChatCopyrightSetting` | 站点功能开关 |

#### 安全与功能开关

| 环境变量 | MongoDB 配置路径 | 迁移说明 |
| --- | --- | --- |
| `USE_IP_LIMIT` | `config.security.useIpLimit` | 主站 IP 限流 |
| `CHECK_INTERNAL_IP` | `config.security.checkInternalIp` | 这里只指主站；Code Sandbox 同名变量仍属于独立服务 |
| `CSRF_ENABLED` | `config.security.csrfEnabled` | 关闭时必须审计 |
| `PASSWORD_LOGIN_MINUTE_LIMIT_COUNT` | `config.security.passwordLoginMinuteLimitCount` | 密码登录限流 |
| `MAX_LOGIN_SESSION` | `config.security.maxLoginSession` | 用户会话上限 |
| `ALLOWED_ORIGINS` | `config.security.allowedOrigins` | 逗号分隔字符串转换为字符串数组 |
| `SKIP_FILE_TYPE_CHECK` | `config.security.skipFileTypeCheck` | 高风险开关，必须审计 |
| `MULTIPLE_DATA_TO_BASE64` | `config.feature.multipleDataToBase64` | 多媒体传输策略 |
| `DATASET_SYNONYM_ENABLED` | `config.feature.datasetSynonymEnabled` | 知识库同义词开关 |
| `AGENT_ENGINE` | `config.feature.agentEngine` | `fastAgent` 或 `piAgent` |
| `DISABLE_CACHE` | `config.feature.disableCache` | 生效时需要清理或重建进程缓存 |

#### 并发、超时与资源限制

| 环境变量 | MongoDB 配置路径 | 环境变量 | MongoDB 配置路径 |
| --- | --- | --- | --- |
| `WORKFLOW_MAX_RUN_TIMES` | `config.performance.workflow.maxRunTimes` | `WORKFLOW_MAX_LOOP_TIMES` | `config.performance.workflow.maxLoopTimes` |
| `WORKFLOW_PARALLEL_MAX_CONCURRENCY` | `config.performance.workflow.parallelMaxConcurrency` | `PARSE_FILE_TIMEOUT_SECONDS` | `config.performance.parse.fileTimeoutSeconds` |
| `XLSX_PARSE_MAX_ROWS` | `config.performance.parse.xlsxMaxRows` | `XLSX_PARSE_MAX_COLUMNS` | `config.performance.parse.xlsxMaxColumns` |
| `XLSX_PARSE_MAX_CELLS` | `config.performance.parse.xlsxMaxCells` | `XLSX_PARSE_MAX_MERGED_CELLS` | `config.performance.parse.xlsxMaxMergedCells` |
| `MAX_HTML_TRANSFORM_CHARS` | `config.performance.parse.maxHtmlTransformChars` | `CHAT_MAX_QPM` | `config.performance.chat.maxQpm` |
| `CHAT_LOG_URL` | `config.performance.chat.logUrl` | `CHAT_LOG_INTERVAL` | `config.performance.chat.logInterval` |
| `CHAT_LOG_SOURCE_ID_PREFIX` | `config.performance.chat.logSourceIdPrefix` | `TRACK_BATCH_UPDATE_TIME` | `config.performance.tracking.batchUpdateTime` |
| `LLM_REQUEST_TRACKING_RETENTION_HOURS` | `config.performance.tracking.retentionHours` | `EVAL_CONCURRENCY` | `config.performance.task.evalConcurrency` |
| `WECHAT_CHANNEL_CONCURRENCY` | `config.performance.channel.wechatConcurrency` | `DATASET_PARSE_MAX_PROCESS` | `config.performance.dataset.parseMaxProcess` |
| `VECTOR_MAX_PROCESS` | `config.performance.dataset.vectorMaxProcess` | `QA_MAX_PROCESS` | `config.performance.dataset.qaMaxProcess` |
| `VLM_MAX_PROCESS` | `config.performance.dataset.vlmMaxProcess` | `STREAM_RESUME_TTL_SECONDS` | `config.performance.streamResume.ttlSeconds` |
| `STREAM_RESUME_POST_COMPLETE_TTL_SECONDS` | `config.performance.streamResume.postCompleteTtlSeconds` | `STREAM_RESUME_REDIS_MAXMEMORY_RATIO` | `config.performance.streamResume.redisMaxmemoryRatio` |
| `STREAM_RESUME_REDIS_MEMORY_CHECK_INTERVAL_MS` | `config.performance.streamResume.redisMemoryCheckIntervalMs` | `SERVICE_REQUEST_MAX_CONTENT_LENGTH` | `config.resource.serviceRequestMaxContentLength` |
| `MAX_FOLDER_DEPTH` | `config.resource.maxFolderDepth` | `APP_FOLDER_MAX_AMOUNT` | `config.resource.appFolderMaxAmount` |
| `DATASET_FOLDER_MAX_AMOUNT` | `config.resource.datasetFolderMaxAmount` | `UPLOAD_FILE_MAX_SIZE` | `config.resource.uploadFileMaxSize` |
| `UPLOAD_FILE_MAX_AMOUNT` | `config.resource.uploadFileMaxAmount` | `SYSTEM_MAX_STRING_LENGTH_M` | `config.resource.systemMaxStringLengthM` |

并发配置写入前必须重新执行跨字段校验：

```text
config.performance.workflow.parallelMaxConcurrency
    <= config.performance.workflow.maxLoopTimes
```

#### Redis、文件与向量运行策略

| 环境变量 | MongoDB 配置路径 | 迁移说明 |
| --- | --- | --- |
| `STORAGE_DOWNLOAD_URL_MODE` | `config.storage.downloadMode` | 只保存下载策略，不保存对象存储连接 |
| `STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS` | `config.storage.downloadRedirectTtlSeconds` | 临时下载链接 TTL |
| `FILE_URL_EXPIRED_DAYS` | `config.storage.fileUrlExpiredDays` | 聊天文件短链有效期 |
| `VECTOR_VQ_LEVEL` | `config.vector.vqLevel` | 只保存检索策略 |
| `MILVUS_LANGUAGE_IDENTIFIER` | `config.vector.languageIdentifier` | `lingua` 或 `whatlang` |
| `HNSW_EF_SEARCH` | `config.vector.hnswEfSearch` | 向量检索参数 |
| `HNSW_MAX_SCAN_TUPLES` | `config.vector.hnswMaxScanTuples` | PG 检索参数 |

#### 外部 Provider

| 环境变量 | MongoDB 配置路径 | 迁移说明 |
| --- | --- | --- |
| `CUSTOM_PDF_PARSE_URL` | `config.providers.documentParse.customPdf.url` | PDF 解析地址 |
| `CUSTOM_PDF_PARSE_KEY` | `config.providers.documentParse.customPdf.key` | `secret: true` |
| `SOMARK_API_KEY` | `config.providers.documentParse.customPdf.somarkApiKey` | `secret: true` |
| `DOC2X_KEY` | `config.providers.documentParse.customPdf.doc2xKey` | `secret: true` |
| `TEXTIN_APP_ID` | `config.providers.documentParse.customPdf.textinAppId` | 按敏感字段处理 |
| `TEXTIN_SECRET_CODE` | `config.providers.documentParse.customPdf.textinSecretCode` | `secret: true` |
| `DOCUMENT_PARSE_PROVIDER` | `config.providers.documentParse.provider` | 当前空字符串转换为 `none` |
| `SANGFOR_PARSE_EXTENSIONS` | `config.providers.documentParse.sangfor.extensions` | 逗号分隔扩展名仍保持字符串或后续规范化为数组 |
| `SANGFOR_PARSE_TIMEOUT_SECONDS` | `config.providers.documentParse.sangfor.timeoutSeconds` | 请求超时 |
| `SANGFOR_CHUNK_URL` | `config.providers.chunk.url` | 非空时 seed `config.providers.chunk.enabled=true` |
| `SANGFOR_CHUNK_KEY` | `config.providers.chunk.key` | `secret: true` |
| `SANGFOR_CHUNK_TIMEOUT_MINUTES` | `config.providers.chunk.timeoutMinutes` | 智能分块超时 |
| `CRM_API_URL` | `config.providers.crm.apiUrl` | 与 `enabled` 一起校验 |
| `CRM_API_KEY` | `config.providers.crm.apiKey` | `secret: true` |
| `FEISHU_BASE_URL` | `config.providers.dataSource.feishuBaseUrl` | 默认官方地址写入 DB |
| `DINGTALK_BASE_URL` | `config.providers.dataSource.dingtalkBaseUrl` | 默认官方地址写入 DB |
| `DINGTALK_OAPI_BASE_URL` | `config.providers.dataSource.dingtalkOapiBaseUrl` | 默认官方地址写入 DB |
| `YUQUE_DATASET_BASE_URL` | `config.providers.dataSource.yuqueDatasetBaseUrl` | 默认官方地址写入 DB |

#### 子服务客户端

| 环境变量 | MongoDB 配置路径 | 迁移说明 |
| --- | --- | --- |
| `PLUGIN_BASE_URL` | `config.subservice.plugin.baseUrl` | 主站调用插件服务的地址 |
| `PLUGIN_TOKEN` | `config.subservice.plugin.token` | `secret: true` |
| `CODE_SANDBOX_URL` | `config.subservice.codeSandbox.baseUrl` | 主站调用 Code Sandbox 的地址 |
| `CODE_SANDBOX_TOKEN` | `config.subservice.codeSandbox.token` | `secret: true` |
| `AIPROXY_API_ENDPOINT` | `config.subservice.aiProxy.endpoint` | 迁移时有值则启用 AI Proxy |
| `AIPROXY_API_TOKEN` | `config.subservice.aiProxy.token` | `secret: true` |
| `AGENT_SANDBOX_PROVIDER` | `config.subservice.agentSandbox.provider` | 空值转换为 `none` |
| `AGENT_SANDBOX_SEALOS_BASEURL` | `config.subservice.agentSandbox.sealosdevbox.baseUrl` | Provider 依赖字段 |
| `AGENT_SANDBOX_SEALOS_TOKEN` | `config.subservice.agentSandbox.sealosdevbox.token` | `secret: true` |
| `AGENT_SANDBOX_SEALOS_WORK_DIRECTORY` | `config.subservice.agentSandbox.sealosdevbox.workDirectory` | 工作目录 |
| `AGENT_SANDBOX_SEALOS_IMAGE` | `config.subservice.agentSandbox.sealosdevbox.image` | 镜像 |
| `AGENT_SANDBOX_OPENSANDBOX_BASEURL` | `config.subservice.agentSandbox.opensandbox.baseUrl` | Provider 依赖字段 |
| `AGENT_SANDBOX_OPENSANDBOX_API_KEY` | `config.subservice.agentSandbox.opensandbox.apiKey` | `secret: true` |
| `AGENT_SANDBOX_OPENSANDBOX_RUNTIME` | `config.subservice.agentSandbox.opensandbox.runtime` | `docker` 或 `kubernetes` |
| `AGENT_SANDBOX_OPENSANDBOX_IMAGE` | `config.subservice.agentSandbox.opensandbox.image` | 镜像 |
| `AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY` | `config.subservice.agentSandbox.opensandbox.useServerProxy` | OpenSandbox 网络策略 |
| `AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL` | `config.subservice.agentSandbox.opensandbox.volumeManagerUrl` | Provider 依赖字段 |
| `AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN` | `config.subservice.agentSandbox.opensandbox.volumeManagerToken` | `secret: true` |
| `AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX` | `config.subservice.agentSandbox.opensandbox.volumeNamePrefix` | 持久卷名称前缀 |
| `AGENT_SANDBOX_CPU_COUNT` | `config.subservice.agentSandbox.common.cpuCount` | 公共资源参数 |
| `AGENT_SANDBOX_MEMORY_MIB` | `config.subservice.agentSandbox.common.memoryMiB` | 公共资源参数 |
| `AGENT_SANDBOX_STORAGE_SIZE_GI` | `config.subservice.agentSandbox.common.storageSizeGi` | 公共资源参数 |
| `AGENT_SANDBOX_SUSPEND_MINUTES` | `config.subservice.agentSandbox.common.suspendMinutes` | 生命周期参数 |
| `AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS` | `config.subservice.agentSandbox.common.archiveInactiveDays` | 生命周期参数 |
| `AGENT_SANDBOX_MAX_EDIT_DEBUG` | `config.subservice.agentSandbox.common.maxEditDebug` | 编辑调试实例上限 |
| `AGENT_SANDBOX_ENTRYPOINT_TIMEOUT_SECONDS` | `config.subservice.agentSandbox.common.entrypointTimeoutSeconds` | 执行超时 |
| `AGENT_SANDBOX_WS_MAX_MESSAGE_BYTES` | `config.subservice.agentSandbox.common.wsMaxMessageBytes` | WebSocket 消息上限 |
| `AGENT_SANDBOX_WS_MAX_FRAME_BYTES` | `config.subservice.agentSandbox.common.wsMaxFrameBytes` | WebSocket 帧上限 |
| `AGENT_SANDBOX_NPM_REGISTRY` | `config.subservice.agentSandbox.common.npmRegistry` | 运行环境镜像源 |
| `AGENT_SANDBOX_PYPI_INDEX_URL` | `config.subservice.agentSandbox.common.pypiIndexUrl` | 运行环境镜像源 |
| `AGENT_SANDBOX_APT_MIRROR` | `config.subservice.agentSandbox.common.aptMirror` | 运行环境镜像源 |

### 10.2 永久保留为主站环境变量的变量

这些变量即使有默认值，也不允许由 Admin 修改，因为它们决定进程能否启动、基础设施拓扑、跨进程信任或已签发凭据的有效性。

#### 基础设施与进程身份

```text
MONGODB_URI
MONGODB_LOG_URI
REDIS_URL
DB_MAX_LINK
NODE_ENV
NEXT_RUNTIME
HOSTNAME
PORT
```

#### 安全根、反向代理与跨进程信任

```text
ROOT_KEY
FILE_TOKEN_KEY
AES256_SECRET_KEY
INVOKE_TOKEN_SECRET
AGENT_SANDBOX_PROXY_SECRET
AGENT_SANDBOX_PROXY_URL
AGENT_SANDBOX_PREVIEW_PROXY_URL
AUTH_COOKIE_SECURE
TRUSTED_PROXY_ENABLE
TRUSTED_PROXY_IPS
```

`AGENT_SANDBOX_PROXY_URL` 和 `AGENT_SANDBOX_PREVIEW_PROXY_URL` 是浏览器或独立 Proxy 的部署地址；`AGENT_SANDBOX_PROXY_SECRET` 是跨进程信任根，三者均不进入 `config.subservice.agentSandbox`。

#### 域名、构建和生命周期

```text
FE_DOMAIN
FILE_DOMAIN
FILE_DOWNLOAD_PUBLIC_URL_PREFIX
NEXT_PUBLIC_BASE_URL
SYNC_INDEX
SYSTEM_MIGRATION_BATCH_SIZE
DEFAULT_ROOT_PSW
SSE_MCP_SERVER_PROXY_ENDPOINT
PRO_URL
PRO_TOKEN
```

其中 `SYSTEM_NAME`、`SYSTEM_DESCRIPTION`、`SYSTEM_FAVICON` 当前还被 `next.config.ts` 和浏览器端初始化读取。迁移到 DB 后必须先增加运行时初始化配置，再移除构建期读取；不能直接删除环境变量导致静态页面拿不到站点信息。

#### 对象存储基础设施连接

```text
STORAGE_VENDOR
STORAGE_PUBLIC_BUCKET
STORAGE_PRIVATE_BUCKET
STORAGE_REGION
STORAGE_S3_ENDPOINT
STORAGE_EXTERNAL_ENDPOINT
STORAGE_R2_PUBLIC_ENDPOINT
STORAGE_S3_CDN_ENDPOINT
STORAGE_PUBLIC_ACCESS_EXTRA_SUB_PATH
STORAGE_ACCESS_KEY_ID
STORAGE_SECRET_ACCESS_KEY
STORAGE_S3_FORCE_PATH_STYLE
STORAGE_S3_MAX_RETRIES
STORAGE_COS_PROTOCOL
STORAGE_COS_USE_ACCELERATE
STORAGE_COS_CNAME_DOMAIN
STORAGE_COS_PROXY
STORAGE_OSS_ENDPOINT
STORAGE_OSS_CNAME
STORAGE_OSS_INTERNAL
STORAGE_OSS_SECURE
STORAGE_OSS_ENABLE_PROXY
```

这里不包含已经迁移到 DB 的 `STORAGE_DOWNLOAD_URL_MODE` 和 `STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS`。

#### 向量数据库基础设施连接

```text
PG_URL
OCEANBASE_URL
SEEKDB_URL
MILVUS_ADDRESS
MILVUS_TOKEN
OPENGAUSS_URL
```

这里不包含已经迁移到 DB 的 `VECTOR_VQ_LEVEL`、`MILVUS_LANGUAGE_IDENTIFIER`、`HNSW_EF_SEARCH` 和 `HNSW_MAX_SCAN_TUPLES`。

#### 日志、指标与链路追踪

```text
LOG_ENABLE_CONSOLE
LOG_CONSOLE_LEVEL
LOG_ENABLE_OTEL
LOG_OTEL_LEVEL
LOG_OTEL_SERVICE_NAME
LOG_OTEL_URL
METRICS_ENABLE_OTEL
METRICS_EXPORT_INTERVAL
METRICS_OTEL_SERVICE_NAME
METRICS_OTEL_URL
TRACING_ENABLE_OTEL
TRACING_OTEL_SERVICE_NAME
TRACING_OTEL_URL
TRACING_OTEL_SAMPLE_RATIO
```

这些参数控制进程启动时建立的 exporter、日志管道和采样器，第一版只在运维页面展示状态，不作为 Admin 可编辑配置。

#### 进程级网络代理

```text
HTTP_PROXY
HTTPS_PROXY
NO_PROXY
ALL_PROXY
```

它们由部署环境或 Worker 子进程继承，不是实例业务配置。

### 10.3 独立子服务自己的环境变量

这些变量不应直接写入主站 `system_instance_configs`。即使 Admin 未来提供“子服务配置”菜单，也只能通过独立服务的配置客户端或受控重启协议修改。

#### Code Sandbox

```text
SANDBOX_PORT
SANDBOX_TOKEN
SANDBOX_POOL_SIZE
SANDBOX_QUEUE_ID_CONCURRENCY
SANDBOX_DISABLE_SECCOMP
SANDBOX_API_MAX_BODY_MB
SANDBOX_MAX_TIMEOUT
SANDBOX_MAX_MEMORY_MB
SANDBOX_MAX_TMP_MB
SANDBOX_MAX_OUTPUT_MB
CHECK_INTERNAL_IP
SANDBOX_REQUEST_MAX_COUNT
SANDBOX_REQUEST_TIMEOUT
SANDBOX_REQUEST_MAX_RESPONSE_MB
SANDBOX_REQUEST_MAX_BODY_MB
SANDBOX_JS_ALLOWED_MODULES
SANDBOX_PYTHON_ALLOWED_MODULES
```

这些变量在进程启动时创建 Worker 池、设置 OS 隔离和网络访问限制。主站更新 `config.subservice.codeSandbox` 后，Code Sandbox 不会自动获得新值，因此第一批迁移保持独立环境变量。

#### MCP Server

```text
FASTGPT_ENDPOINT
PORT
```

MCP Server 作为独立进程启动，暂不读取主站 `system_instance_configs`。

#### Agent Sandbox Proxy

```text
PORT
PREVIEW_PORT
FASTGPT_APP_URL
FASTGPT_APP_REQUEST_TIMEOUT_SECS
AGENT_SANDBOX_PROXY_SECRET
AGENT_SANDBOX_PROXY_ADDRESS_CACHE_TTL_SECS
AGENT_SANDBOX_PROXY_REWRITE_HOST
RUST_LOG
```

其中 `AGENT_SANDBOX_PROXY_SECRET` 与主站环境变量必须保持一致；`FASTGPT_APP_URL` 是 Proxy 回连主站的部署地址，不是主站可编辑的子服务客户端配置。

#### FastGPT IDE Agent

```text
FASTGPT_WORKDIR
FASTGPT_IDE_MAX_FILE_BYTES
FASTGPT_IDE_WS_MAX_MESSAGE_BYTES
FASTGPT_IDE_WS_MAX_FRAME_BYTES
```

这些变量决定独立 IDE Agent 的工作目录、文件上限和 WebSocket 限制，暂不纳入主站配置中心。

### 10.4 Worker 迁移注意事项

当前 `packages/service/worker/env.ts` 仍直接声明以下变量：

```text
MAX_HTML_TRANSFORM_CHARS
XLSX_PARSE_MAX_ROWS
XLSX_PARSE_MAX_COLUMNS
XLSX_PARSE_MAX_CELLS
XLSX_PARSE_MAX_MERGED_CELLS
```

它们在目标方案中全部归属 `config.performance.parse`。迁移完成后，主站生成经过
`SystemInstanceConfigSchema` 校验的 Worker 启动快照，通过 IPC 或显式 Worker 参数传入；
Worker 自身只保留 `NODE_ENV`、`HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY` 等进程环境。

### 10.5 构建、测试和操作系统变量

以下变量不进入 Admin 配置，也不计入生产环境变量与实例配置的业务对照：

```text
VITEST
CI
FASTGPT_TEST_MAX_WORKERS
RUN_READ_FILE_WORKER_INTEGRATION
RUN_READ_FILE_WORKER_PDF_PATH
RUN_READ_FILE_WORKER_XLSX_PATH
RUN_READ_FILE_WORKER_PDF_STRESS
RUN_READ_FILE_WORKER_DOC_STRESS
RUN_READ_FILE_WORKER_DOC_STRESS_PATH
SANDBOX_INTEGRATION
SANDBOX_INTEGRATION_MONGODB_URI
SANDBOX_INTEGRATION_REDIS_URL
MIGRATION_VECTOR_TYPE
TEXT_STORE_VECTOR_TYPE
NEXT_PUBLIC_WORKFLOW_LEAVE_CONFIRM
PATH
HOME
TMPDIR
SHELL
```

`NEXT_PUBLIC_WORKFLOW_LEAVE_CONFIRM` 是前端构建期行为开关，不能因为它带有
`NEXT_PUBLIC_` 前缀就当作 Admin 运行时配置。`npm_package_version`、`NEXT_PHASE`
等构建和 Next.js 生命周期元数据同样不进入实例配置。

`OPENAI_BASE_URL`、`CHAT_API_KEY` 目前只在历史测试或兼容场景中出现，不属于当前
主站 `serviceEnv` 的有效配置入口；它们不迁移到 MongoDB，也不应重新作为 Admin
字段恢复。若未来重新启用，必须单独定义新的 provider 配置和迁移规则。

### 10.6 迁移期间的优先级和空值规则

```text
system_instance_configs 中已有字段
    -> 永远优先，环境变量不得覆盖

system_instance_configs 中缺少字段
    -> 使用对应环境变量转换后的值
    -> 环境变量也不存在时，使用 SystemInstanceConfigSchema 默认值

system_instance_configs 不存在
    -> 读取所有 DB 类环境变量构造完整 config
    -> 通过 SystemInstanceConfigSchema 校验
    -> 以 _id=instance、schemaVersion=1、revision=0 写入
```

具体空值转换：

- URL 类空值写成 `''`；
- `DOCUMENT_PARSE_PROVIDER` 空值写成 `none`；
- `AGENT_SANDBOX_PROVIDER` 空值写成 `none`；
- `PASSWORD_EXPIRED_MONTH`、`CHAT_LOG_INTERVAL` 未配置写成 `null`；
- `ALLOWED_ORIGINS` 未配置写成 `[]`，配置后按逗号和空白拆分；
- `SANGFOR_CHUNK_URL`、`CRM_API_URL`、`AIPROXY_API_ENDPOINT` 有效时才启用对应 Provider；
- `DOCUMENT_PARSE_PROVIDER=sangfor` 时，将 `CUSTOM_PDF_PARSE_URL/KEY` 同步到
  `documentParse.sangfor.url/key`，同时保留 `documentParse.customPdf` 的兼容值；
- secret 字段即使暂时明文存储，也必须按照注册表的 `secret: true` 处理，不能进入日志、审计详情或普通查询响应。

### 10.7 变量盘点的完整性要求

当前对照表覆盖主站 `serviceEnv`、App `appEnv`、Worker、Code Sandbox、MCP
Server、Agent Sandbox Proxy 和 IDE Agent 的运行时变量。为了避免“代码里还有变量但
文档没有归类”，校对规则如下：

1. `packages/service/env.ts` 中的每一个 server 字段必须出现在 10.1、10.2 或 10.3 中。
2. `projects/app/src/env.ts`、`packages/service/worker/env.ts` 和
   `projects/code-sandbox/src/env.ts` 中的每一个字段必须在对应进程小节中出现。
3. 直接使用 `process.env.X` 或 Rust `env::var("X")` 的运行时变量，即使没有
   `createEnv` schema，也必须归入 `ENV`、`SERVICE` 或 `BUILD`。
4. 测试、脚本、操作系统和依赖库自己的变量只登记在 10.5，不得误生成 Admin 字段。
5. 每次迁移一个 `DB` 变量，都必须同时删除运行时对该环境变量的持续覆盖逻辑，避免
   “数据库看起来已修改但进程仍优先使用 env”的双来源。

## 11. Admin 菜单与配置域映射草图

```text
管理员
├── 概览
│   ├── 管理员主页（现有 Admin 首页）
│   └── 系统版本
├── 数据面板（Tab）
│   ├── 全局统计
│   ├── 流量
│   ├── 活跃
│   ├── 付费
│   └── 成本
├── 运营管理（由“通知管理”演进）
├── 用户与团队
│   ├── 用户管理
│   └── 团队管理
├── 商业化
│   ├── 套餐管理
│   ├── 支付记录
│   ├── 开票管理
│   └── 套餐与充值配置
├── 用户资源
│   ├── 应用
│   └── 知识库
├── 系统资源配置
│   ├── 系统模型
│   ├── 系统工具
│   └── 应用模板
├── 子服务配置
│   ├── 插件服务
│   ├── Code Sandbox
│   ├── AI Proxy
│   └── Agent Sandbox
├── 系统配置
│   ├── 基础配置（site）
│   ├── 功能清单（feature）
│   ├── 用户与登录（auth）
│   ├── 安全配置（security）
│   ├── 限制与性能（resource/performance）
│   ├── 文件与存储策略（storage）
│   ├── 向量检索策略（vector）
│   ├── 第三方提供商（providers）
│   └── 配置状态与生效状态
└── 审计日志
```

菜单节点和字段都通过同一份注册表过滤。商业化菜单、商业版子服务字段以及其
运行时能力在社区版统一隐藏；页面隐藏、API 字段过滤和运行时能力判断必须使用
同一套 edition 结果，不能由前端单独维护一份白名单。

“系统配置”只放实例级策略；MongoDB/Redis/对象存储/向量库连接、密钥根、部署
域名、独立进程端口等环境变量可以在“配置状态”中只读展示来源和是否已配置，不能
变成可编辑表单。

## 12. 待确认决策（已更新）

### 已确认

1. 接受上述 Admin 菜单树作为下一轮设计基线；概览就是现有“管理员主页”，并增加系统版本信息。
2. 数据面板使用 Tab 组织全局统计、流量、活跃、付费和成本。
3. 通知管理后续更名为运营管理；系统配置拆细，子服务配置作为独立菜单。
4. 单实例配置采用一个完整 MongoDB document，默认值直接落库，不使用 overrides。
5. 必须保留在环境变量中的基础设施、安全根、部署拓扑和独立进程参数不因为有默认值而迁移到 Admin。
6. 开源版对商业菜单和字段采用隐藏策略，且后端 API 和运行时也必须过滤。
7. 当前阶段敏感配置暂不加密，但仍按 secret 字段脱敏和审计。

### 仍待确认

1. `FE_DOMAIN`、`FILE_DOMAIN`、`FILE_DOWNLOAD_PUBLIC_URL_PREFIX` 是否长期只读环境变量，还是未来允许通过配置中心管理；当前草案按环境变量处理。
2. Code Sandbox、MCP Server 等独立进程是否在后续接入配置中心；如果接入，配置变更时采用热更新、重建 Worker 还是受控重启。
3. 社区版和商业版的最终菜单/字段能力矩阵，尤其是“系统模型、系统工具、应用模板、Agent Sandbox”各自的 edition 归属。
4. 配置 `applyMode` 的实际生效协议：哪些字段支持 live/reload，哪些字段必须 restart，以及集群节点如何确认已应用同一 revision。
5. PDF/Sangfor 逻辑配置块最终是否长期分开保存；当前迁移必须兼容旧的 `CUSTOM_PDF_PARSE_URL/KEY` 一组变量，不能要求新增一组 `SANGFOR_PARSE_URL/KEY`。
6. 系统版本展示取包版本、构建版本还是部署镜像版本；本草案只确定它属于概览，不把版本号写入实例配置。
