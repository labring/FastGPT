# FastGPT Data Access Layer 设计

> 状态：Redis Cache、Runtime、BullMQ 基础设施和 BullMQ 业务队列 services 已完成当前一版重构；当前等待 DAL-R6H review。全量测试按约定暂不执行。

## 1. 决策

新增 workspace package：

```text
packages/dal/
package name: @fastgpt/dal
```

DAL（Data Access Layer）负责 FastGPT 的数据存储基础设施、持久化模型、持久化规则，以及 Repository 和 Cache 实现。它允许包含必要的数据访问语义，但不承载权限、API、工作流或外部服务编排。

本路线只处理 Redis。MongoDB 与 Vector DB 不纳入当前项目，也不在 Redis 完成后自动启动迁移。

## 2. 为什么采用 DAL package

当前 `@fastgpt/service` 同时包含应用服务、数据库连接、Redis 协议封装、业务缓存、Repository 和 Cache。目录位置无法阻止业务直接获取 client，也无法阻止底层数据代码反向依赖 service。

独立 DAL package 提供编译期依赖边界：

```text
@fastgpt/global
       ^
       |
@fastgpt/dal
       ^
       |
@fastgpt/service
       ^
       |
projects/app、pro/admin、其他服务端应用
```

必须满足：

- `@fastgpt/dal` 不依赖 `@fastgpt/service`、`@fastgpt/web`、Next.js 或具体 project。
- `@fastgpt/service` 和服务端 project 可以依赖 `@fastgpt/dal`。
- `@fastgpt/global` 只提供稳定类型、schema、常量和纯函数，不反向依赖 DAL。
- 前端代码不得引用 DAL。
- pro 专属数据实现不得上移到开源根仓库；它们遵守同一 DAL 约束，但保留在 `pro` 子模块。

## 3. 职责边界

### 3.1 DAL 负责

- Redis、MongoDB、Vector DB 等数据源的连接配置解析、连接生命周期和 driver 适配。
- key、collection、index、TTL、序列化格式及版本兼容。
- 查询、写入、删除、分页、原子更新、幂等和并发一致性。
- Mongoose Model、Vector driver 等持久化实现；对应迁移阶段批准前仍保留原位置。
- 面向 Redis 的 Cache，例如 token、二维码登录状态、团队向量计数。
- BullMQ 队列的数据合同、job 投递、scheduler、状态查询和 Queue/Worker binding。
- Cache 层明确的 miss、错误、fail-open/fail-closed 和 read-through 策略。
- 与数据访问直接相关的健康检查、指标、脱敏日志和优雅关闭。
- 为测试提供 Cache class 和窄 adapter 注入点。

### 3.2 DAL 不负责

- HTTP/API 参数解析、响应格式和状态码映射。
- 用户、团队或资源权限判断。
- 工作流节点和应用用例编排。
- 调用第三方业务 SDK、发送通知或执行支付副作用。
- 多个 Repository/Cache 之间的应用事务编排；真正需要同一数据库事务时除外。
- 把底层 client 作为业务公共 API 暴露。
- 用通用 Repository/Cache 基类、registry 或 capability 系统提前统一不同存储。

### 3.3 “业务进入 DAL”的准确含义

允许进入 DAL 的业务是“持久化或缓存数据语义”，例如：

- Dingtalk access token 的 key、有效期安全窗口、缓存 miss 和 single-flight。
- Wechat QR 登录数据的 schema、JSON codec、TTL 和损坏数据处理。
- 团队向量计数的缓存 key、deadline、回源触发条件和 best-effort 失效。
- Session hash 字段、TTL、扫描和损坏记录清理。

不允许进入 DAL 的业务是应用流程，例如：

- 获取 Dingtalk token 时如何构造 HTTP 请求、解释供应商业务错误。
- Wechat 登录确认后更新哪个 Mongo 文档、是否启动轮询。
- Vector DB 写入成功后还需要触发哪些工作流或通知。

Repository 或 Cache 可以接收 callback 实现 read-through 或 single-flight，但 callback 只是注入的数据来源；它们不得直接 import 第三方 client 或所属业务 service。

## 4. 分层模型

```text
API / Worker / Workflow
          |
          v
Application Service（权限、流程、跨仓储协调）
          |
          v
Repository / Cache（数据合同、持久化或缓存策略）
          |
          v
Backend Adapter（Redis/Mongo/Vector 协议与错误映射）
          |
          v
Runtime / Driver（连接、配置、健康、关闭）
```

依赖只能向下。Repository/Cache 可以组合同一聚合所需的数据源，但不能调用上层 Application Service。

## 5. 目录设计

Redis 迁移完成后的首个目标结构：

```text
packages/dal/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── redis/
│   ├── index.ts
│   ├── types.ts
│   ├── adapter.ts
│   ├── runtime/
│   │   ├── config.ts
│   │   ├── connection.ts
│   │   ├── errors.ts
│   │   ├── keyspace.ts
│   │   ├── operation.ts
│   │   ├── parse.ts
│   │   ├── policy.ts
│   │   ├── schema.ts
│   │   ├── shutdown.ts
│   │   ├── timeout.ts
│   │   └── validation.ts
│   ├── bullmq/
│   │   ├── index.ts
│   │   ├── binding.ts
│   │   ├── names.ts
│   │   ├── types.ts
│   │   ├── constants.ts
│   │   ├── context.ts
│   │   ├── close.ts
│   │   ├── listeners.ts
│   │   ├── queue-manager.ts
│   │   ├── worker-manager.ts
│   │   ├── runtime.ts
│   │   └── services/
│   │       ├── index.ts
│   │       ├── appDelete.ts
│   │       ├── collectionUpdate.ts
│   │       ├── datasetDelete.ts
│   │       ├── datasetSync.ts
│   │       ├── evaluation.ts
│   │       ├── s3FileDelete.ts
│   │       ├── skillCreate.ts
│   │       ├── skillDelete.ts
│   │       ├── teamDelete.ts
│   │       └── wechat.ts
│   └── caches/
│       ├── index.ts
│       ├── dailyActiveDedupe.ts
│       ├── dingtalkAccessToken.ts
│       ├── fixedWindowRateLimit.ts
│       ├── lease.ts
│       ├── outLinkStream.ts
│       ├── session.ts
│       ├── streamResume.ts
│       ├── systemVersion.ts
│       ├── teamPoint.ts
│       ├── teamQpm.ts
│       ├── teamVectorCount.ts
│       ├── wechatPollingFailure.ts
│       ├── wechatQrLogin.ts
│       └── workflowStopSignal.ts
└── test/
    └── redis/
```

未来目录只作为边界保留，不在本轮创建空模块：

```text
packages/dal/mongo/
packages/dal/vector/
```

禁止提前创建没有生产消费者的抽象、空目录或统一 driver API。Redis、MongoDB、Vector DB 的事务和查询语义不同，只有出现稳定的真实重复后才抽取共同 contract。

### 5.1 pro 所有权

`pro` 是独立子模块。pro 专属 Redis Cache 使用与 shared DAL 相同的分层，但保留代码所有权：

```text
pro/admin/src/dal/redis/caches/
├── index.ts
├── wecomAccessToken.ts
└── wecomSuiteTicket.ts
```

pro Redis Cache 可以依赖 `@fastgpt/dal/redis/adapter` 和公开类型，不得依赖 `@fastgpt/service/common/redis`。shared DAL 不得反向依赖 pro。

## 6. 命名规则

- package 名固定为 `@fastgpt/dal`。
- Redis 面向业务数据的新增类型统一使用 `*Cache`，不再新增 Redis `*Store`；MongoDB 等其他存储沿用各自专项设计中的命名。
- 现有 `*Store` 在迁入 DAL 的同一阶段改名，直接更新生产和测试引用；不创建长期转发文件。
- `Runtime` 只表示进程级连接与生命周期。
- `Adapter` 只表示对具体 driver 的窄协议封装，不表达业务能力。
- Redis 跨层共享的 logger、key brand 和协议结果类型集中在 `redis/types.ts`；Cache 专属 Options、Schema 和业务结果仍留在各自 Cache 文件。
- `Entity` 继续用于现有 DDD 目录中的基础数据访问函数；是否迁入 DAL 在 MongoDB 专项设计中决定。

Redis Cache 不要求统一基类。每个 Cache 只暴露业务需要的方法和类型。

## 7. 初始化和进程状态

DAL 是库，不直接读取 `serviceEnv`，也不 import service logger。应用入口负责注入环境绑定：

```ts
configureRedisRuntime({
  redisUrl: serviceEnv.REDIS_URL,
  logger: getLogger(LogCategories.INFRA.REDIS)
});
```

要求：

- 配置必须在 health check、BullMQ 初始化或第一次业务访问之前完成。
- 重复传入相同配置是幂等操作；运行中传入不同配置必须显式失败，不能静默切换 Redis。
- logger 使用 DAL 定义的最小 port，只包含实际需要的方法和结构化 metadata。
- 测试通过 factory 注入 runtime、adapter 或 Repository/Cache，不修改生产全局状态。
- Next.js 热重载需要复用进程状态时，由 DAL 自己维护单一 runtime context；不得继续增加多个零散 `global.*` 字段。
- runtime context 可以内部使用 `Map` 按 data source/instance id 管理资源，但 Map 不作为公共业务 API。
- Redis Runtime 的热重载状态统一由 DAL context 的 `Map` 持有，不再使用 `global.redisClient` 等散落全局字段。

## 8. 导出边界

当前使用明确子路径，而不是从 package 根入口导出所有能力：

| 入口 | 允许消费者 | 内容 |
| --- | --- | --- |
| `@fastgpt/dal/redis` | instrumentation、service | 初始化、health、close、稳定错误类型 |
| `@fastgpt/dal/redis/caches` | application service/API | 业务 Cache class 实例和合同类型 |
| `@fastgpt/dal/redis/runtime` | BullMQ 等基础设施 adapter | 连接角色 factory、snapshot、close hook |
| `@fastgpt/dal/redis/bullmq` | BullMQ 基础设施和业务队列 services | Queue/Worker runtime、生命周期、队列合同和 BullMQ 类型 |
| `@fastgpt/dal/redis/bullmq/services/*` | 需要单独引用某个队列合同的 service/project | `XxxMQService` class、singleton 和对应 job data type |
| `@fastgpt/dal/redis/adapter` | shared/pro Cache 实现和测试 | Cache 驱动的 Redis adapter 与 logical key 类型 |
| `@fastgpt/dal/redis/types` | DAL 内部和测试 | logger、metrics、key brand 和协议结果类型 |

限制：

- physical key helper 和 physical command client 不从 `@fastgpt/dal/redis` 根入口导出。
- BullMQ 入口导出 runtime、binding、队列名、业务队列 services 和必要的 BullMQ 类型/错误；raw Redis connection factory 与对象级生命周期不向业务 processor 暴露。
- 业务调用方不得引用 `runtime` 或 `adapter`。
- `adapter` 只随真实 Repository/Cache 需求增加命令，不能演变成 ioredis 镜像。
- package 根 `@fastgpt/dal` 暂不建立全量 barrel，避免加载无关 driver 和形成隐式耦合。

## 9. 错误和降级所有权

错误分为两层：

- Runtime/Adapter 错误：配置非法、连接失败、deadline、结果未知、Redis 返回值非法。
- Repository/Cache 错误合同：miss 如何表达、是否 fail-open、是否回源、损坏数据如何处理。

Application Service 负责把 Repository/Cache 错误映射成 HTTP、工作流或产品行为。DAL 错误不得依赖 Next.js response、全局业务错误码或 UI 文案。

涉及认证、权限、计费和限流的 fail-open/fail-closed 必须逐 Repository/Cache 冻结，不能定义一个包级默认值。

## 10. 测试策略

- DAL 单元测试放在 `packages/dal/test/`，只测试 DAL 实现。
- Repository/Cache 测试覆盖 key、TTL、codec、miss、错误和并发合同。
- Adapter 测试使用窄 client fake，验证命令参数、返回校验、deadline 和重试策略。
- Redis 原子性、SCAN、Stream 和并发语义必须由指定的 Redis 7.2 integration test 证明。
- `test/mocks/common/redis.ts` 是 service 层全局测试夹具，只用于 service facade/调用方回归，不作为 DAL integration client 复用；它不实现真实 Redis 的 Lua、SCAN glob、Stream blocking 和事务调度语义。
- DAL adapter/Repository/Cache 的协议和错误分支使用窄 fake client 补齐；只有真实 Redis 7.2 才能作为 integration 证据，不能把 mock client 测试标记为 integration。
- service/project 测试只验证调用和应用语义，不重复 mock 完整 ioredis。
- 每个迁移阶段只运行受影响的定向测试；全量测试留到全部迁移完成前运行。

## 11. 分阶段路线

### DAL-R1：package 与 Redis kernel

- [x] 创建 `@fastgpt/dal` package、TypeScript 和 Vitest 配置。
- [x] 迁移 Redis config、runtime、keyspace、operation、validation 和最小 adapter。
- [x] 用配置/logger 注入消除 DAL 对 service 的依赖。
- [x] 保留 service legacy facade，更新 BullMQ 和内部基础设施依赖。
- [x] 保持全部物理 key、连接角色和运行时行为不变。
- [x] 使用单一 DAL runtime context 管理默认 Redis Runtime，删除 `global.redisRuntime`。
- [x] DAL 5 个定向测试文件 81 项通过，Statements 98.97%、Branches 96.95%。

本阶段已实现并通过 review gate，DAL-R2 已基于该边界开始迁移。

### DAL-R2：shared Redis Cache

- [x] 将 Dingtalk access token、Team vector count、Wechat QR login 迁入 `@fastgpt/dal/redis/caches`。
- [x] `Store` 改名为 `Cache`，一次性更新生产调用方和测试。
- [x] 删除 `packages/service/common/redis/stores`，不保留转发文件。
- [x] service logger 改为窄 port 注入，Team timeout 改为 DAL 内部纯实现。
- [x] 3 个 Cache 测试保持 key、TTL、codec、错误和并发合同；对应 service/app 调用方测试通过。

本阶段已实现并通过 review gate，DAL-R2P 已基于相同边界完成 pro Cache 搬迁。

### DAL-R2P：pro Redis Cache

- [x] 将 Wecom access token 与 suite ticket 移入 `pro/admin/src/dal/redis/caches`。
- [x] `Store` 改名为 `Cache`，更新 provider、suite 和 event 调用方及测试。
- [x] 直接依赖 `@fastgpt/dal/redis/adapter`，删除 pro service Store 目录且不保留转发文件。
- [x] Pro Cache 与调用方定向测试 36 项通过，Cache 全维度覆盖率均为 100%。
- [x] Pro Cache 文件、调用方和旧 Store 静态扫描通过。
- [x] Pro typecheck 通过，未发现 Redis 改动引入的类型错误。

本阶段已实现并通过 review gate，DAL-R3C 已基于 shared DAL adapter 开始剩余 Cache 迁移。

### DAL-R3C：Daily Active Dedupe

- [x] adapter 增加真实 Cache 驱动的 `setIfAbsent`，使用单条 `SET NX EX`。
- [x] 新增 `DailyActiveDedupeCache`，保持 UTC 日期、历史物理 key、值 `1` 和 86400 秒 TTL。
- [x] Redis 首次声明返回 true、重复返回 false；Redis 故障记录降级日志并 fail-open。
- [x] tracking 调用方不再使用 legacy `GET -> SET`，Mongo event 内容与 plus-edition guard 保持不变。
- [x] DAL 3 个单元测试文件 39 项、service 1 个文件 4 项、Redis 7.2.14 integration 1 项通过。
- [x] Cache 全维度覆盖率 100%，64 个真实并发请求只有 1 个获得声明权。

本阶段已实现并通过 review gate，DAL-R3D 已继续迁移 System Version。

### DAL-R3D：System Version

- [x] 新增 `SystemVersionCache`，保持 `fastgpt:VERSION_KEY:${key}` 与子 key、UUID value 和永久 TTL 合同。
- [x] 首次读取使用 Redis 7.2 的单条 `SET NX GET` 原子返回已有值或初始化值；错误 fail-closed。
- [x] `id='*'` 完整分页 SCAN 后使用单条 multi-key `DEL` 删除已发现的子 key，保留 base key 和相邻前缀。
- [x] `packages/service/common/cache` 不再获取 Redis client 或拼物理 key，只保留进程内缓存协调 facade。
- [x] DAL 6 个精确单测文件 108 项、service 1 个文件 16 项、Redis 7.2.14 integration 2 项通过。
- [x] adapter 数字参数使用 Zod `safeParse` 严格校验且不 coercion，Zod issue 统一映射为稳定 Redis 参数错误。
- [x] Runtime config 使用 Zod 校验原始 URL 与解析后的 protocol/host/port/db，保留 `URL` 和 credential parser。
- [x] 真实 Redis 64 并发首次读取只返回一个永久版本；512 个子 key 经多页 SCAN 后全部删除。

本阶段已实现并通过定向验证与 review。

### DAL-R4A：Fixed Window Rate Limit 与 Team QPM

- `FixedWindowRateLimitCache` 负责历史 `frequency:${type}:${scope}` logical key 的固定窗口计数；adapter 使用一次 `INCR + EXPIRE NX + TTL` `MULTI/EXEC`，不允许把空或畸形响应当作计数 `0`。
- Cache 返回 `allowed`、`currentCount`、`remaining`、`ttlSeconds` 和 `resetAt`；`limit` 与 `windowSeconds` 必须是正安全整数。
- Redis 执行错误、超时或结果未知均向上抛出；service/API 限流入口统一映射为 fail-closed，不能因为 Redis 故障放行认证或团队请求。
- `TeamQpmCache` 只负责 `cache:team_qpm_limit:${teamId}` 的字符串 codec、1 小时 TTL、读取、写入和删除；套餐查询与 `CHAT_MAX_QPM` fallback 仍由 service 完成。
- 继续使用 `fastgpt:` 物理前缀，但所有新 Cache 只接收 logical key，由 DAL adapter 负责显式转换；不把 physical key 传回 legacy command client。
- 不迁移 Mongo `authFrequencyLimit`；Team Point、Pending Payment 和其他 Redis Cache 已在各自阶段独立完成。

本阶段已完成 adapter/Cache 单测、限流与 wallet 调用方定向测试、可用时 Redis 7.2 并发 integration test、typecheck、精确 lint 和 legacy raw client 扫描。

### DAL-R4B：Team Point cache 双 key 一致性

- 新增 `TeamPointCache`，拥有 `cache:team_point_surplus:${teamId}` 与 `cache:team_point_total:${teamId}` 两个历史 logical key，两个 key 的 TTL 都保持 60 秒。
- 成对读取使用一个 `MULTI/EXEC`；只有两个值都存在且是有限数字时才返回缓存，partial hit、损坏值、Redis 读取失败统一返回 miss，交给 service 回源 Mongo。
- 成对刷新使用一个 `MULTI/EXEC`，两个 `SET PX` 要么都进入同一事务，要么由 Cache 记录降级；不再用两个独立 Promise 写入造成半更新窗口。
- surplus 增量使用 `INCRBYFLOAT + EXPIRE NX` 同一事务，缺失 key 也获得 TTL；`0` 增量不创建 key。增量、刷新和清理均为 best-effort，不覆盖钱包 Mongo 主流程。
- 清理使用 adapter 的单条 multi-key `DEL`；Cache 不暴露 physical key，也不依赖 legacy cache helper。
- Pending Payment、Session、Lease 和其他 wallet Cache 已在各自阶段完成，不复用 Team Point 的实现合同。

本阶段已实现并通过定向验证与 review；Redis 7.2 integration 在未配置 `REDIS_INTEGRATION_URL` 时按测试策略跳过。

### DAL-R4C：Pending Payment 协调状态

- 仅迁移现有企业微信待支付订单指针，不把普通微信/支付宝的 Mongo 定时查单误建成 Redis 状态机。
- Cache 保持历史 logical key `wecom:pending_order:${teamId}`、物理 key `fastgpt:wecom:pending_order:${teamId}`、订单号字符串 value 和 7 天 TTL。
- Redis 只承担“创建新企微订单前取消旧订单”和“支付成功回调清理”的协调缓存，账单和支付结果仍以 Mongo/企微回调为事实来源。
- 读取 miss 或 Redis 错误都按 `null` 处理并允许继续创建订单；写入和清理失败只记录 OTel error，不阻断创建订单或支付回调。
- 不引入跨 cron worker 的 claim、lease、续租或幂等支付处理；这些语义属于后续独立阶段，避免把当前单值协调缓存扩展成未验证的支付状态机。

本阶段已实现并通过定向验证与 review。

### DAL-R4D：Session Cache

- 保持历史 logical key `session:${sessionId}`、物理 key `fastgpt:session:${sessionId}`、hash 字段和值格式，以及 7 天 TTL。
- Session 写入通过一个 Redis 事务同时完成 hash 写入和 `EXPIRE`，避免 hash 已写入但没有过期时间的窗口；写入错误 fail-closed。
- 认证读取只返回完整且可解析的 typed session；miss、损坏字段和损坏记录清理后的结果统一由 service 映射为未授权；Redis 读取错误继续 fail-closed。
- 删除 API 只接收 session ID 或 user ID + whitelist，Cache 内部完成 logical key 构造和分页扫描，不把物理 key 返回给 service，也不再出现 `session:session:*`。
- 用户批量注销保留 whitelist 语义；登录数超限清理由 service 传入上限，Cache 提供 typed session records，后台清理失败只记录日志，不阻塞新 session 创建。

本阶段已实现并通过定向验证与 review。

### DAL-R4E：Lease Cache

- 仅迁移 Agent Sandbox 初始化锁；Mongo `timerLock` 不属于本阶段。
- 保持历史 logical key `lock:${key}`、物理 key `fastgpt:lock:${key}`，value 仍为随机 token；获取使用 `SET NX PX`，TTL 和续租间隔必须是正安全整数。
- 续租和释放使用 token 校验的原子 Redis 脚本；adapter 只暴露 typed lease operations，不向 service 暴露 `eval` 或物理 key。
- 获取失败、Redis 获取异常和租约丢失均 fail-closed；续租/释放错误只按租约状态记录 warning，不能误删其他持有者的锁。
- Agent Sandbox 保留现有 `createAgentSandboxInitializingError()` 映射；Stop Signal、Stream 和其他 lock/cache 调用不在本阶段迁移。

本阶段已实现并通过定向验证与 review。

### DAL-R4F：Workflow Stop Signal Cache

- 迁移 workflow 与 auxiliary generation 共用的运行态停止标记，不迁移前端 AbortController 或 Mongo timer lock。
- 保持 logical key `agent_runtime_stopping:${sourceType}:${sourceId}:${chatId}`、物理 key `fastgpt:agent_runtime_stopping:${sourceType}:${sourceId}:${chatId}`、value `1` 和 60 秒 TTL。
- `set` 使用单次带 TTL 字符串写入，Redis 错误向上抛出；`isStopping` 读取错误按 false 处理，避免 Redis 故障阻断主工作流；`clear` 删除失败只记录 warning/error，不覆盖工作流结果。
- Cache 内部负责参数校验和 logical key 构造；service 保留 `waitForWorkflowComplete` 轮询编排，不再获取 Redis client 或拼接 key。
- workflow 与 auxiliary generation 使用同一数据合同，清理和读取不会产生两套停止状态。

本阶段已实现并通过定向验证与 review。

### DAL-R5A：Stream Resume Cache

- 仅迁移 `packages/service/core/chat/resume.ts` 的 Redis 持久化协议；OutLink Stream、Wechat polling counter、Mongo timer lock 和前端 AbortController 不属于本阶段。
- 保持 `stream:resume:data:*`、`stream:resume:unavailable:*`、`stream:resume:active:*` logical key、自动添加 `fastgpt:` 物理前缀、生成中 TTL、完成后短 TTL、active/unavailable JSON 格式和原有 SSE 消费协议。
- Cache/adapter 收拢 `XADD`、`XRANGE`、`XREAD BLOCK`、镜像清理、TTL touch 和状态读写；service 业务逻辑不再获取 command/physical client、不再解析 Redis Stream 原始返回结构，运行时 factory 仅在 service binding 中注入。
- blocking reader 由 DAL Runtime 创建并在 Cache 的 `finally` 中释放；Redis 关闭期间不会遗留请求级 blocking connection。
- 内存水位检查仍由 service 保留，因为它属于请求是否创建镜像的运行策略；HTTP/SSE 编排、终止事件判断和 response 生命周期不进入 DAL。

本阶段已实现并通过定向验证与 review。

### DAL-R5B：OutLink Stream Cache

- 迁移 Wechat/Wecom OutLink 共用的字符串响应缓存，不迁移 Redis Stream Resume、前端轮询或通道加密协议。
- 保持 logical key `cache:streamResponse:${streamId}`、物理 key `fastgpt:cache:streamResponse:${streamId}`、原始字符串 value、初始化 120 秒 TTL、内容/结束标记 60 秒 TTL 和 `[DONE]` 协议。
- Cache 收拢 key 构造、原子 `APPEND + EXPIRE`、读取和删除；service/pro 调用方不再使用 legacy cache helper 或拼接 cache key。
- `APPEND + EXPIRE` 使用同一 Redis 事务，避免追加成功但 TTL 设置失败而留下无期限响应；追加错误继续向上抛出，读取和删除保持原有错误传播语义。
- 不改变空值、结束标记、响应加密、SSE/Wechat/Wecom 编排；Wechat polling failure counter 留到 DAL-R5C。

本阶段已完成实现并通过定向验证与 review。

### DAL-R5C：Wechat Polling Failure Counter Cache

- 迁移 Wechat polling worker 的连续失败计数，不迁移 BullMQ job 状态、退避调度或 Mongo OutLink 状态。
- 保持 logical key `cache:wechat:publish:failures:${shareId}`、物理 key `fastgpt:cache:wechat:publish:failures:${shareId}`、整数 value 和 300 秒 TTL。
- `increment` 使用单一 `INCRBY + EXPIRE NX` 事务，多个 worker 并发失败时不丢失计数；首次创建 key 建立 TTL，已有 key 只保留原 TTL。
- 成功轮询仍写入 `0` 并刷新 300 秒 TTL；达到阈值后的清理仍显式删除 key。Redis 错误继续向上抛出，保持 worker 失败/退避语义。
- Cache 内部负责 shareId 校验和 key 构造；worker 不再读取、解析或拼接 Redis cache key。

本阶段已完成实现并通过定向验证与 review。

### DAL-R6A：Legacy Cache/Scan Facade Cleanup

- 删除已无生产调用方的 `packages/service/common/redis/cache.ts`、`scan.ts` 及其旧定向测试。
- 删除仅为 `scan.ts` 提供 Runtime 绑定的 service `adapter.ts`，避免保留无消费者的迁移期入口；DAL 自有 adapter 和 Cache 不受影响。
- 从 `@fastgpt/service/common/redis` 移除 `getAllKeysByPrefix` 导出；runtime、BullMQ、health、Stream Resume 绑定保持不变。
- 不改变任何 Redis logical/physical key、TTL、value、错误传播或连接生命周期合同。

本阶段已完成实现并通过定向验证与 review。

### DAL-R6B：Stream Resume Binding Cleanup

- `packages/service/core/chat/resume.ts` 只依赖 DAL Stream Resume Cache，不再创建 service-side adapter，也不再读取 `getGlobalRedisConnection`、physical client 或 Runtime factory。
- Redis `INFO MEMORY` 由 DAL adapter 以 typed `server.memoryInfo` operation 执行，统一返回解析、超时和 operation error；Stream Resume service 继续保留内存压力缓存、阈值和 fail-open 编排。
- blocking connection 由 DAL 默认 adapter/Runtime 创建并由 Cache 生命周期管理；业务层不接触 raw client，原有 XREAD、SSE 和连接释放合同保持不变。
- 测试 Redis factory 按 command 与 blocking/worker 角色模拟独立连接，避免测试 mock 掩盖真实连接边界。

本阶段已完成实现并通过定向验证与 review。

### DAL-R6C：Service Redis Facade Narrowing

- 从 `@fastgpt/service/common/redis` 删除无生产消费者的 physical client、blocking factory、connection snapshot、DAL error/key 转发和 queue/worker barrel 导出。
- 从 service runtime binding 删除对应的 physical/blocking/snapshot helper；BullMQ queue/worker factory 已由 DAL-R6E 接管，health/close 入口保持不变。
- 迁移期 `getGlobalRedisConnection` 与 `global.redisClient` 接管仅在该阶段暂存，已由 DAL-R6D 的 hot-reload/legacy client 清理移除。
- 不改变 Cache、Redis key/TTL/value、BullMQ connection role 或 Runtime close 合同。

本阶段已完成实现并通过定向验证与 review。

### DAL-R6D：Legacy Global Client Removal

- 删除 Runtime 的 `legacy-command` role、隐式 `keyPrefix=fastgpt:`、`existingCommandClient` 接管参数和 `getLegacyCommandConnection`，所有 command 连接均只服务 DAL adapter 的显式 physical key 操作。
- 删除 service `getGlobalRedisConnection`、`global.redisClient` 类型声明及 orphan client 清理；`@fastgpt/service/common/redis` 已删除，health/close 和 BullMQ 生命周期均由 DAL 管理。
- 测试夹具改为持有模块级共享 mock client，测试清理和断言通过 DAL Runtime 的 command connection 完成，不再初始化或依赖全局 Redis client。
- 不改变 Cache 的 logical key、物理 `fastgpt:` 前缀、TTL、value、错误降级、BullMQ 生命周期或 Runtime 有序关闭合同；app/admin health/shutdown 绑定已改为直接调用 DAL。

本阶段已完成实现、通过代码 review，并已提交根仓库和 `pro` 子模块。

### DAL-R6E：BullMQ DAL adapter

- `RedisBullMQRuntime` class 持有 Queue/Worker registry，使用 DAL Runtime 的 queue/worker connection factory；service 只保留 QueueNames、业务默认 Worker 配置和 facade。
- 进程级 BullMQ context 只通过 DAL 私有 symbol 复用，并以 `Map<ResourceId, Runtime>` 管理资源；不新增散落的 global state 字段。
- Queue/Worker 的基础连接由 Runtime registry 持有；BullMQ Worker 内部创建的 blocking duplicate 由 `worker.close()` 释放，before-close hook 在 Runtime 关闭连接前先关闭 BullMQ 对象。
- 关闭时先清空 registry，按 Worker -> Queue 顺序限时关闭；`closed`/`paused` 恢复策略受 lifecycle options 与 runtime state 约束，shutdown 后不会重新创建 Worker。
- graceful close 超时或失败时调用 BullMQ 对象级 `disconnect()`，只移除 Queue/Worker 的 adapter-owned listener，避免 blocking duplicate connection 残留；Worker 异常重启会恢复业务方 listener，并保留 `once` 语义。
- Queue/Worker 构造失败会释放已创建的 Runtime connection；关闭超时或异常只记录 warning，并继续关闭其他资源。
- service 不再依赖 `bullmq` package 或 service Redis facade；队列名、job data、processor、重试和保留策略不变。
- service BullMQ facade 进一步拆为 `binding.ts`、`names.ts`、`types.ts` 和纯导出 `index.ts`；binding 以 `BullMQBinding` class + `bullMQ` singleton 暴露，`getBullMQRuntimeState`、`closeBullMQConnections`、`ConnectionOptions` 及无关的 `delay` 转发已删除，生命周期统一由 DAL Redis Runtime 管理。

本阶段已完成实现并通过 DAL/service 定向测试与 typecheck。

### DAL-R6G：BullMQ 业务合同收拢

- BullMQ 业务合同迁移到 `packages/dal/redis/bullmq/services/`，集中维护 queue/worker 获取、enqueue、scheduler、job 状态和各队列 data type；不再保留 `packages/service/common/bullmq`。
- 每个队列合同使用独立的 `XxxMQService` class，并导出一个默认 `xxxMQService` singleton；Queue 只在方法调用时懒加载，构造函数可注入 `BullMQBinding` 以便隔离测试或替换运行时。
- `core`、`support` 原路径只保留薄业务入口，processor 仍由领域模块注入；DAL queue service 不承载 Mongo、VectorDB、S3 或工作流 processor 实现。
- DAL `redis/bullmq` 同时提供 Redis Runtime 连接、Queue/Worker 生命周期、shutdown guard 和队列数据访问语义，不依赖 service 业务模块。
- 当前版本不改变队列名、jobId、重试/保留策略、Redis key/value/TTL 或业务失败处理。

本阶段已完成实现，等待 review。

### DAL-R6H：BullMQ 目录归属统一

- 删除 `packages/service/common/bullmq` 的 binding、类型和测试；生产代码统一从 `@fastgpt/dal/redis/bullmq` 获取 QueueNames、job data、processor 类型和 `XxxMQService`。
- DAL package 增加 `@fastgpt/global` workspace 依赖及 `redis/bullmq/services/*` 子路径 export；DAL 不反向依赖 service。
- `projects/app/src/service/common/bullmq` 与 `pro/admin/src/service/common/bullmq` 仅保留应用级 worker 初始化和领域 processor 编排，不属于可复用队列合同，因此不迁移。
- service 领域目录继续提供薄入口，负责注入 Mongo、S3、VectorDB 和工作流 processor；队列合同、job 状态和调度规则统一由 DAL BullMQ services 管理。

本阶段已完成实现，等待 review。

### DAL-R6F：Shutdown、metrics 与 facade 收口

- `RedisRuntime` 提供连接/health/shutdown metrics port；metrics recorder 失败只记录 warning，不影响生命周期。
- app/admin instrumentation 显式配置 DAL Runtime 并注册 SIGTERM/SIGINT shutdown hook；重复信号只触发一次 close，失败以非零退出码结束。
- health 入口迁移到 `@fastgpt/dal/redis`，删除 service Redis facade、旧 runtime binding、global client 类型和旧 mock；全仓生产代码不再直接使用 raw ioredis 或 BullMQ。

本阶段已完成实现并通过定向验证；全量测试按约定暂缓。

### DAL-R6：Redis 7.2 集成验证

- 新增 kernel integration suite，覆盖显式 `fastgpt:` physical key、无 glob 泄漏的分页 SCAN、`SET NX GET` 并发、Lua lease acquire/renew/release token 校验，以及 Stream `XADD`、`XRANGE`、`XREAD BLOCK` 和 blocking connection 释放。
- Redis integration suite 要求 `REDIS_INTEGRATION_URL` 指向 Redis 7.2 或更高版本；当前环境使用 Redis 7.4.10 验证，kernel 用例与既有四个 Cache integration 文件共 5 个文件、11 项通过。
- 未改变任何 Cache logical key、physical key、TTL、value 或错误合同；本阶段只增加真实 Redis 回归证据。

本阶段已完成实现并通过定向验证与 review。

### DAL-R6 收尾状态

- Redis 7.2 integration、进程级 shutdown hook、Redis metrics、BullMQ adapter 和 BullMQ 业务 services 收口均已完成。
- raw ioredis、旧 Store、service Redis adapter、service Redis facade、global Redis client 和手工 physical key 的生产代码静态扫描已清零。
- 全量测试仍按用户约定暂缓；后续只在用户明确允许时执行。

当前设计在 Redis 治理完成后结束，不继续扩展 MongoDB 或 Vector DB。

## 12. 验收标准

- workspace 中存在职责明确的 `@fastgpt/dal`，且不依赖 service/project/pro。
- Redis 连接、adapter 和 shared Cache 最终不再位于 `@fastgpt/service`。
- application service 只依赖 Cache，不获取 Redis client 或拼 physical key。
- pro 专属 Cache 保留在 pro，但只依赖 shared DAL 基础能力。
- 数据格式、物理 key、TTL 和故障语义在纯迁移阶段保持兼容。
- DAL 没有 capability registry、通用 Cache 基类或未使用的预制能力。
- 当前验收范围仅包含 Redis DAL，不包含 MongoDB 或 Vector DB。

## 13. 已确认与待确认

已确认：

1. package 名使用 `@fastgpt/dal`。
2. DAL 同时容纳数据基础设施、持久化业务 Repository 和 Redis Cache。
3. 当前只继续 Redis，不迁移 MongoDB 和 Vector DB。
4. capability 层收缩为 Repository/Cache 驱动的最小 adapter。

后续专项确认：无。当前只继续 Redis 收尾。
