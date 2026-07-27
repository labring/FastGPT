# FastGPT Data Access Layer 设计

> 状态：架构方向与包名已确认；DAL-R1、DAL-R2、DAL-R2P、DAL-R3C、DAL-R3D、DAL-R4A、DAL-R4B、DAL-R4C 与 DAL-R4D 已完成实现并通过定向验证，当前等待 DAL-R4D 代码 review。Lease、Stop Signal、Stream 及其他 Repository 仍未开始迁移。

## 1. 决策

新增 workspace package：

```text
packages/dal/
package name: @fastgpt/dal
```

DAL（Data Access Layer）负责 FastGPT 的数据存储基础设施、持久化模型、持久化规则和 Repository 实现。它允许包含必要的业务数据语义，但不承载权限、API、工作流或外部服务编排。

本次只抽取 Redis。MongoDB 与 Vector DB 是否迁移、何时迁移，必须在 Redis 迁移稳定后分别设计和 review，不能借创建 DAL package 顺带搬迁。

## 2. 为什么采用 DAL package

当前 `@fastgpt/service` 同时包含应用服务、数据库连接、Redis 协议封装、业务缓存和 Repository。目录位置无法阻止业务直接获取 client，也无法阻止底层数据代码反向依赖 service。

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
- 面向业务数据的 Repository，例如 token、二维码登录状态、团队向量计数。
- Repository 层明确的 miss、错误、fail-open/fail-closed 和 read-through 策略。
- 与数据访问直接相关的健康检查、指标、脱敏日志和优雅关闭。
- 为测试提供 Repository factory 和窄 adapter 注入点。

### 3.2 DAL 不负责

- HTTP/API 参数解析、响应格式和状态码映射。
- 用户、团队或资源权限判断。
- 工作流节点和应用用例编排。
- 调用第三方业务 SDK、发送通知或执行支付副作用。
- 多个 Repository 之间的应用事务编排；真正需要同一数据库事务时除外。
- 把底层 client 作为业务公共 API 暴露。
- 用通用 Repository 基类、registry 或 capability 系统提前统一不同存储。

### 3.3 “业务进入 DAL”的准确含义

允许进入 DAL 的业务是“持久化业务语义”，例如：

- Dingtalk access token 的 key、有效期安全窗口、缓存 miss 和 single-flight。
- Wechat QR 登录数据的 schema、JSON codec、TTL 和损坏数据处理。
- 团队向量计数的缓存 key、deadline、回源触发条件和 best-effort 失效。
- Session hash 字段、TTL、扫描和损坏记录清理。

不允许进入 DAL 的业务是应用流程，例如：

- 获取 Dingtalk token 时如何构造 HTTP 请求、解释供应商业务错误。
- Wechat 登录确认后更新哪个 Mongo 文档、是否启动轮询。
- Vector DB 写入成功后还需要触发哪些工作流或通知。

Repository 可以接收 callback 实现 read-through 或 single-flight，但 callback 只是注入的数据来源；Repository 不得直接 import 第三方 client 或所属业务 service。

## 4. 分层模型

```text
API / Worker / Workflow
          |
          v
Application Service（权限、流程、跨仓储协调）
          |
          v
Repository（业务数据合同、持久化策略）
          |
          v
Backend Adapter（Redis/Mongo/Vector 协议与错误映射）
          |
          v
Runtime / Driver（连接、配置、健康、关闭）
```

依赖只能向下。Repository 可以组合同一聚合所需的数据源，但不能调用上层 Application Service。

## 5. 目录设计

Redis 迁移完成后的首个目标结构：

```text
packages/dal/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── redis/
│   ├── index.ts
│   ├── adapter.ts
│   ├── runtime/
│   │   ├── config.ts
│   │   ├── connection.ts
│   │   ├── errors.ts
│   │   ├── keyspace.ts
│   │   ├── operation.ts
│   │   └── validation.ts
│   └── repositories/
│       ├── index.ts
│       ├── dingtalkAccessToken.ts
│       ├── teamVectorCount.ts
│       └── wechatQrLogin.ts
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

`pro` 是独立子模块。pro 专属 Repository 使用与 shared DAL 相同的分层，但保留代码所有权：

```text
pro/admin/src/dal/redis/repositories/
├── index.ts
├── wecomAccessToken.ts
└── wecomSuiteTicket.ts
```

pro Repository 可以依赖 `@fastgpt/dal/redis/adapter` 和公开类型，不得依赖 `@fastgpt/service/common/redis`。shared DAL 不得反向依赖 pro。

## 6. 命名规则

- package 名固定为 `@fastgpt/dal`。
- 面向业务数据的新增类型统一使用 `Repository`，不再新增 `*Store`。
- 现有 `*Store` 在迁入 DAL 的同一阶段改名，直接更新生产和测试引用；不创建长期转发文件。
- `Runtime` 只表示进程级连接与生命周期。
- `Adapter` 只表示对具体 driver 的窄协议封装，不表达业务能力。
- `Entity` 继续用于现有 DDD 目录中的基础数据访问函数；是否迁入 DAL 在 MongoDB 专项设计中决定。

Repository 不要求统一基类。每个 Repository 只暴露业务需要的方法和类型。

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
- 测试通过 factory 注入 runtime、adapter 或 Repository，不修改生产全局状态。
- Next.js 热重载需要复用进程状态时，由 DAL 自己维护单一 runtime context；不得继续增加多个零散 `global.*` 字段。
- runtime context 可以内部使用 `Map` 按 data source/instance id 管理资源，但 Map 不作为公共业务 API。
- `global.redisClient` 仅作为迁移期 legacy client 接管入口，最终随 legacy command 删除。

## 8. 导出边界

计划使用明确子路径，而不是从 package 根入口导出所有能力：

| 入口 | 允许消费者 | 内容 |
| --- | --- | --- |
| `@fastgpt/dal/redis` | instrumentation、service | 初始化、health、close、稳定错误类型 |
| `@fastgpt/dal/redis/repositories` | application service/API | 业务 Repository 实例、factory 和合同类型 |
| `@fastgpt/dal/redis/runtime` | BullMQ 等基础设施 adapter | 连接角色 factory、snapshot、close hook |
| `@fastgpt/dal/redis/adapter` | shared/pro Repository 实现和测试 | 最小 Redis adapter 与 logical key 类型 |

限制：

- physical key helper 和 physical command client 不从 `@fastgpt/dal/redis` 根入口导出。
- 业务调用方不得引用 `runtime` 或 `adapter`。
- `adapter` 只随真实 Repository 需求增加命令，不能演变成 ioredis 镜像。
- package 根 `@fastgpt/dal` 暂不建立全量 barrel，避免加载无关 driver 和形成隐式耦合。

## 9. 错误和降级所有权

错误分为两层：

- Runtime/Adapter 错误：配置非法、连接失败、deadline、结果未知、Redis 返回值非法。
- Repository 错误合同：miss 如何表达、是否 fail-open、是否回源、损坏数据如何处理。

Application Service 负责把 Repository 错误映射成 HTTP、工作流或产品行为。DAL 错误不得依赖 Next.js response、全局业务错误码或 UI 文案。

涉及认证、权限、计费和限流的 fail-open/fail-closed 必须逐 Repository 冻结，不能定义一个包级默认值。

## 10. 测试策略

- DAL 单元测试放在 `packages/dal/test/`，只测试 DAL 实现。
- Repository 测试覆盖 key、TTL、codec、miss、错误和并发合同。
- Adapter 测试使用窄 client fake，验证命令参数、返回校验、deadline 和重试策略。
- Redis 原子性、SCAN、Stream 和并发语义必须由指定的 Redis 7.2 integration test 证明。
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

### DAL-R2：shared Redis Repository

- [x] 将 Dingtalk access token、Team vector count、Wechat QR login 迁入 `@fastgpt/dal/redis/repositories`。
- [x] `Store` 改名为 `Repository`，一次性更新生产调用方和测试。
- [x] 删除 `packages/service/common/redis/stores`，不保留转发文件。
- [x] service logger 改为窄 port 注入，Team timeout 改为 DAL 内部纯实现。
- [x] 3 个 Repository 测试保持 key、TTL、codec、错误和并发合同；对应 service/app 调用方测试通过。

本阶段已实现并通过 review gate，DAL-R2P 已基于相同边界完成 pro Repository 搬迁。

### DAL-R2P：pro Redis Repository

- [x] 将 Wecom access token 与 suite ticket 移入 `pro/admin/src/dal/redis/repositories`。
- [x] `Store` 改名为 `Repository`，更新 provider、suite 和 event 调用方及测试。
- [x] 直接依赖 `@fastgpt/dal/redis/adapter`，删除 pro service Store 目录且不保留转发文件。
- [x] 5 个定向测试文件 29 项通过，两个 Repository 全维度覆盖率均为 100%。
- [x] 11 个本阶段文件精确 ESLint 与旧 pro Store 静态扫描通过。
- [x] pro typecheck 未新增错误，仍只有 3 个与 Redis 无关的既有错误。

本阶段已实现并通过 review gate，DAL-R3C 已基于 shared DAL adapter 开始剩余 Repository 迁移。

### DAL-R3C：Daily Active Dedupe

- [x] adapter 增加真实 Repository 驱动的 `setIfAbsent`，使用单条 `SET NX EX`。
- [x] 新增 `DailyActiveDedupeRepository`，保持 UTC 日期、历史物理 key、值 `1` 和 86400 秒 TTL。
- [x] Redis 首次声明返回 true、重复返回 false；Redis 故障记录降级日志并 fail-open。
- [x] tracking 调用方不再使用 legacy `GET -> SET`，Mongo event 内容与 plus-edition guard 保持不变。
- [x] DAL 3 个单元测试文件 39 项、service 1 个文件 4 项、Redis 7.2.14 integration 1 项通过。
- [x] Repository 全维度覆盖率 100%，64 个真实并发请求只有 1 个获得声明权。

本阶段已实现并通过 review gate，DAL-R3D 已继续迁移 System Version。

### DAL-R3D：System Version

- [x] 新增 `SystemVersionRepository`，保持 `fastgpt:VERSION_KEY:${key}` 与子 key、UUID value 和永久 TTL 合同。
- [x] 首次读取使用 Redis 7.2 的单条 `SET NX GET` 原子返回已有值或初始化值；错误 fail-closed。
- [x] `id='*'` 完整分页 SCAN 后使用单条 multi-key `DEL` 删除已发现的子 key，保留 base key 和相邻前缀。
- [x] `packages/service/common/cache` 不再获取 Redis client 或拼物理 key，只保留进程内缓存协调 facade。
- [x] DAL 6 个精确单测文件 108 项、service 1 个文件 16 项、Redis 7.2.14 integration 2 项通过。
- [x] adapter 数字参数使用 Zod `safeParse` 严格校验且不 coercion，Zod issue 统一映射为稳定 Redis 参数错误。
- [x] Runtime config 使用 Zod 校验原始 URL 与解析后的 protocol/host/port/db，保留 `URL` 和 credential parser。
- [x] 真实 Redis 64 并发首次读取只返回一个永久版本；512 个子 key 经多页 SCAN 后全部删除。

本阶段已实现并通过定向验证，等待代码 review；review 前不进入下一个 Repository 子阶段。

### DAL-R4A：Fixed Window Rate Limit 与 Team QPM

- `FixedWindowRateLimitRepository` 负责历史 `frequency:${type}:${scope}` logical key 的固定窗口计数；adapter 使用一次 `INCR + EXPIRE NX + TTL` `MULTI/EXEC`，不允许把空或畸形响应当作计数 `0`。
- Repository 返回 `allowed`、`currentCount`、`remaining`、`ttlSeconds` 和 `resetAt`；`limit` 与 `windowSeconds` 必须是正安全整数。
- Redis 执行错误、超时或结果未知均向上抛出；service/API 限流入口统一映射为 fail-closed，不能因为 Redis 故障放行认证或团队请求。
- `TeamQpmRepository` 只负责 `cache:team_qpm_limit:${teamId}` 的字符串 codec、1 小时 TTL、读取、写入和删除；套餐查询与 `CHAT_MAX_QPM` fallback 仍由 service 完成。
- 继续使用 `fastgpt:` 物理前缀，但所有新 Repository 只接收 logical key，由 DAL adapter 负责显式转换；不把 physical key 传回 legacy command client。
- 不迁移 Mongo `authFrequencyLimit`、Team Point、Pending Payment 或其他 Redis 能力；每个能力独立 review。

本阶段 review gate 前必须完成：DAL adapter/Repository 单测、现有限流与 wallet 调用方定向测试、可用时 Redis 7.2 并发 integration test、typecheck、精确 lint 和 legacy raw client 扫描。

### DAL-R4B：Team Point cache 双 key 一致性

- 新增 `TeamPointRepository`，拥有 `cache:team_point_surplus:${teamId}` 与 `cache:team_point_total:${teamId}` 两个历史 logical key，两个 key 的 TTL 都保持 60 秒。
- 成对读取使用一个 `MULTI/EXEC`；只有两个值都存在且是有限数字时才返回缓存，partial hit、损坏值、Redis 读取失败统一返回 miss，交给 service 回源 Mongo。
- 成对刷新使用一个 `MULTI/EXEC`，两个 `SET PX` 要么都进入同一事务，要么由 Repository 记录降级；不再用两个独立 Promise 写入造成半更新窗口。
- surplus 增量使用 `INCRBYFLOAT + EXPIRE NX` 同一事务，缺失 key 也获得 TTL；`0` 增量不创建 key。增量、刷新和清理均为 best-effort，不覆盖钱包 Mongo 主流程。
- 清理使用 adapter 的单条 multi-key `DEL`；Repository 不暴露 physical key，也不依赖 legacy cache helper。
- 不迁移 Pending Payment、Session、Lease 或其他 wallet cache；本阶段 review 后再进入下一个子阶段。

本阶段已实现并通过定向验证，等待代码 review；Redis 7.2 integration 已编写但因未配置 `REDIS_INTEGRATION_URL` 跳过。

### DAL-R4C：Pending Payment 协调状态

- 仅迁移现有企业微信待支付订单指针，不把普通微信/支付宝的 Mongo 定时查单误建成 Redis 状态机。
- Repository 保持历史 logical key `wecom:pending_order:${teamId}`、物理 key `fastgpt:wecom:pending_order:${teamId}`、订单号字符串 value 和 7 天 TTL。
- Redis 只承担“创建新企微订单前取消旧订单”和“支付成功回调清理”的协调缓存，账单和支付结果仍以 Mongo/企微回调为事实来源。
- 读取 miss 或 Redis 错误都按 `null` 处理并允许继续创建订单；写入和清理失败只记录 OTel error，不阻断创建订单或支付回调。
- 不引入跨 cron worker 的 claim、lease、续租或幂等支付处理；这些语义属于后续独立阶段，避免把当前单值协调缓存扩展成未验证的支付状态机。

本阶段已实现，等待代码 review；未开始 Session、Lease、Stop Signal 或 Stream Repository。

### DAL-R4D：Session Repository

- 保持历史 logical key `session:${sessionId}`、物理 key `fastgpt:session:${sessionId}`、hash 字段和值格式，以及 7 天 TTL。
- Session 写入通过一个 Redis 事务同时完成 hash 写入和 `EXPIRE`，避免 hash 已写入但没有过期时间的窗口；写入错误 fail-closed。
- 认证读取只返回完整且可解析的 typed session；miss、损坏字段和损坏记录清理后的结果统一由 service 映射为未授权；Redis 读取错误继续 fail-closed。
- 删除 API 只接收 session ID 或 user ID + whitelist，Repository 内部完成 logical key 构造和分页扫描，不把物理 key 返回给 service，也不再出现 `session:session:*`。
- 用户批量注销保留 whitelist 语义；登录数超限清理由 service 传入上限，Repository 提供 typed session records，后台清理失败只记录日志，不阻塞新 session 创建。

本阶段已实现并通过定向验证，当前停在代码 review；Lease、Stop Signal 和 Stream 仍未开始。

### DAL-R4 后续：剩余 Redis Repository

- 按风险逐个迁移限流、session、lease、stream 等能力。
- 每个子阶段冻结数据合同，完成定向测试并等待 review。

### DAL-R4：legacy 清理与治理

- 删除 service Redis facade、legacy command、`global.redisClient` 和重复 mock。
- 清零业务层 raw ioredis、`getGlobalRedisConnection` 和手工 physical key。
- 完成集成测试、指标、故障演练和全量测试。

MongoDB 和 Vector DB 不属于上述阶段。它们分别新增设计、调用清单和迁移计划后才能开始。

## 12. 验收标准

- workspace 中存在职责明确的 `@fastgpt/dal`，且不依赖 service/project/pro。
- Redis 连接、adapter 和 shared Repository 最终不再位于 `@fastgpt/service`。
- application service 只依赖 Repository，不获取 Redis client 或拼 physical key。
- pro 专属 Repository 保留在 pro，但只依赖 shared DAL 基础能力。
- 数据格式、物理 key、TTL 和故障语义在纯迁移阶段保持兼容。
- DAL 没有 capability registry、通用 Repository 基类或未使用的预制能力。
- MongoDB/Vector DB 未经独立设计不会被顺带迁移。

## 13. 已确认与待确认

已确认：

1. package 名使用 `@fastgpt/dal`。
2. DAL 同时容纳数据基础设施和持久化业务 Repository。
3. 当前只继续 Redis，不迁移 MongoDB 和 Vector DB。
4. capability 层收缩为 Repository 驱动的最小 adapter。

后续专项确认：

1. MongoDB Model、entity 与 transaction helper 的最终边界。
2. Vector driver 与 embedding/application service 的拆分边界。
3. 是否需要跨 Redis/Mongo/Vector 的统一 observability contract；出现真实重复前不预建。
