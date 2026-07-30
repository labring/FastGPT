# DAL Redis 重构与迁移设计

> 上位设计：[FastGPT Data Access Layer 设计](../dal/data-access-layer.md)
>
> 状态：Redis Cache、Runtime、BullMQ 基础设施和 BullMQ 业务队列 services 已完成当前一版重构；当前等待 DAL-R6H review。全量测试按约定暂不执行。

## 1. 目标

将 Redis 从 `@fastgpt/service` 中完整收口到 `@fastgpt/dal`，形成以下稳定依赖：

```text
业务 API / Worker / Service
          |
          v
Redis Cache（key、TTL、codec、缓存和错误合同）
          |
          v
最小 Redis Adapter（命令、physical key、deadline、返回校验）
          |
          v
Redis Runtime（配置、连接角色、健康检查、生命周期）
          |
          v
       ioredis
```

最终业务代码只依赖 Cache。BullMQ 等基础设施集成通过 `redis/bullmq` 使用 DAL Runtime 的受限连接 factory，但不能把 raw client 传给业务。

## 2. 范围与非目标

本设计覆盖：

- 创建 `@fastgpt/dal` package 并迁移 Redis kernel。
- Redis URL、连接角色、runtime context、健康检查和优雅关闭。
- logical/physical key、legacy `keyPrefix` 和 SCAN 兼容。
- 最小 adapter、operation policy、错误和返回值校验。
- shared/pro Redis Cache 的归属和迁移。
- 全仓 Redis 业务调用方、测试、观测和 legacy 清理。

本设计不覆盖：

- MongoDB 或 Vector DB 的代码迁移。
- Redis Cluster、Sentinel、读写分离和跨实例路由。
- 大规模 key rename 或数据格式升级。
- BullMQ 业务队列合同与 Redis Queue/Worker 生命周期统一归属 DAL；由 `packages/dal/redis/bullmq/services` 维护。应用侧只保留 processor 编排和 worker 初始化。
- 为未来命令预建 capability、Lua registry 或通用 Cache 基类。

## 3. 当前问题

当前 Redis kernel、shared/pro Cache、BullMQ adapter、BullMQ 业务 services、Runtime 治理和 service facade 收口均已完成，剩余工作只包括本阶段 review 以及按约定暂缓的全量测试：

- Runtime、adapter、BullMQ adapter、BullMQ services 和 Cache 已位于 `packages/dal/redis`，package exports 额外开放 `redis/bullmq/services/*` 子路径。
- app/admin instrumentation 负责读取 `serviceEnv` 并向 DAL 注入 logger/metrics；DAL 本身不依赖 service。
- shared 业务能力已迁入 `@fastgpt/dal`；pro Wecom Cache 位于 `pro/admin/src/dal` 并直接依赖 shared DAL adapter。
- 业务层已不再持有 raw Redis client；health、close 和进程 shutdown 均由 DAL 提供，队列合同集中在 `redis/bullmq/services`，service 只保留领域 processor 和应用级 worker 初始化。
- 测试已删除 `global.redisRuntime` 和 `global.redisClient`，只保留显式注入的共享 mock client。

已确认不能恢复的旧方向：公共 `string/hash/counter/stream` capability 和没有生产消费者的 script registry。Cache 是稳定业务边界，adapter 只按实际命令增长。

### 3.1 已知正确性债务

以下是迁移前确认的正确性债务，已由对应 Cache、Runtime 和定向测试处理，作为兼容性回归记录保留：

- Session 使用 typed codec 和 logical key 删除，不再产生 `session:session:*`。
- 固定窗口、Team Point 和 polling counter 对事务返回做完整校验，Redis 结果异常不会被解释为成功。
- OutLink 字符串流的 `APPEND + EXPIRE` 在同一事务中执行，避免追加后遗留无 TTL key。
- System version 使用 `SET NX GET` 原子初始化，wildcard 删除只作用于分页 SCAN 得到的子 key。
- Stream Resume 的 XREAD/XRANGE、blocking connection 和返回解析均收拢到 DAL Cache。
- 所有新代码使用显式 physical key；Runtime 不设置 `keyPrefix`，业务层不再混用 logical/physical key。

### 3.2 剩余 Redis 治理面

| 治理项 | 当前形式 | 后续动作 |
| --- | --- | --- |
| Redis 7.2 integration | kernel 与 Cache integration suite | 已覆盖 Redis 7.2+ 的 key、SCAN、Lua、Stream、事务和并发；未配置环境时按测试策略跳过 |
| 进程生命周期 | DAL Runtime + app/admin instrumentation | 已接入 SIGTERM/SIGINT shutdown hook、close deadline 和 metrics |
| service facade | health/close 已迁移到 DAL | service Redis facade、legacy client 和旧 adapter 已删除 |
| BullMQ | DAL `redis/bullmq` runtime、binding 和业务 queue services；应用只保留 processor 编排 | Queue/Worker registry、duplicate 生命周期、Worker -> Queue 关闭顺序、超时、shutdown guard 和队列合同已收拢 |

## 4. 目标目录与导出

shared：

```text
packages/dal/redis/
├── index.ts
├── types.ts
├── adapter.ts
├── runtime/
│   ├── index.ts
│   ├── config.ts
│   ├── connection.ts
│   ├── errors.ts
│   ├── keyspace.ts
│   ├── operation.ts
│   ├── parse.ts
│   ├── policy.ts
│   ├── schema.ts
│   ├── shutdown.ts
│   ├── timeout.ts
│   └── validation.ts
├── bullmq/
│   ├── index.ts
│   ├── binding.ts
│   ├── names.ts
│   ├── types.ts
│   ├── constants.ts
│   ├── context.ts
│   ├── close.ts
│   ├── listeners.ts
│   ├── queue-manager.ts
│   ├── worker-manager.ts
│   ├── runtime.ts
│   └── services/
│       ├── index.ts
│       ├── appDelete.ts
│       ├── collectionUpdate.ts
│       ├── datasetDelete.ts
│       ├── datasetSync.ts
│       ├── evaluation.ts
│       ├── s3FileDelete.ts
│       ├── skillCreate.ts
│       ├── skillDelete.ts
│       ├── teamDelete.ts
│       └── wechat.ts
└── caches/
    ├── index.ts
    ├── dailyActiveDedupe.ts
    ├── dingtalkAccessToken.ts
    ├── fixedWindowRateLimit.ts
    ├── lease.ts
    ├── outLinkStream.ts
    ├── session.ts
    ├── streamResume.ts
    ├── systemVersion.ts
    ├── teamPoint.ts
    ├── teamQpm.ts
    ├── teamVectorCount.ts
    ├── wechatPollingFailure.ts
    ├── wechatQrLogin.ts
    └── workflowStopSignal.ts
```

pro：

```text
pro/admin/src/dal/redis/caches/
├── index.ts
├── wecomAccessToken.ts
├── wecomPendingOrder.ts
└── wecomSuiteTicket.ts
```

导出规则：

- `@fastgpt/dal/redis`：配置入口、health、close 和稳定错误类型。
- `@fastgpt/dal/redis/caches`：业务 Cache。
- `@fastgpt/dal/redis/types`：跨 Cache/Runtime 共享的 logger、key brand 和协议结果类型。
- `@fastgpt/dal/redis/runtime`：只给 BullMQ、instrumentation 和迁移期基础设施使用。
- `@fastgpt/dal/redis/bullmq`：BullMQ Queue/Worker runtime、队列名、业务队列 services 和必要类型；只接收 DAL Redis Runtime 与 logger，不暴露 raw connection factory。
- `@fastgpt/dal/redis/bullmq/services/*`：可单独引用某个 `XxxMQService` 及其 job data type；主入口仍是默认消费方式。
- BullMQ DAL 内部按 context、runtime、Queue manager、Worker manager、listener ownership、close helper 和 services 拆分；`index.ts` 只做稳定公共导出，避免生命周期实现与公共类型互相耦合。
- `@fastgpt/dal/redis/adapter`：只给 shared/pro Cache 实现和对应测试使用。
- physical key/client helper 不从 Redis 根入口导出。
- `@fastgpt/service/common/redis` 已删除；应用通过 `@fastgpt/dal/redis` 和 `@fastgpt/dal/redis/runtime` 使用 health/configuration/shutdown 入口。

## 5. Runtime 设计

### 5.1 配置与初始化

`RedisRuntime` class 接收显式依赖：

```ts
type RedisRuntimeOptions = {
  redisUrl: string;
  logger?: RedisRuntimeLogger;
  clientFactory?: RedisClientFactory;
};
```

`@fastgpt/dal` 不读取 `serviceEnv`。app/admin instrumentation 在初始化阶段绑定 `serviceEnv.REDIS_URL`、logger 和 metrics，再调用 DAL 配置入口；service BullMQ 只读取已经配置的 Runtime。

logger port 只保留 `info/warn/error(message, metadata?)`。默认 logger 必须无副作用且不得输出敏感配置，测试可以注入 fake。

### 5.2 进程级 context

DAL 内部维护一个跨 Next.js 热重载复用的 runtime context，不继续扩展零散 `global.redisRuntime` 字段。context 内部可使用 Map：

```text
DalRuntimeContext
└── resources: Map<ResourceId, RuntimeResource>
    └── redis:default -> RedisRuntime
```

要求：

- 同一 resource id 只能有一个 open runtime。
- 相同配置重复初始化返回同一实例。
- 不同配置不能静默覆盖，必须先显式 close。
- close 从 Map 移除的只能是本次关闭的同一实例，防止并发替换误删。
- 热重载只复用 DAL context 中的 Runtime；不再维护 `global.redisClient` 等 Redis client 全局字段。

DAL-R1 已迁移 singleton 行为，并由测试覆盖热重载复用、重复 close 和配置冲突；当前唯一事实来源是 DAL runtime context。

### 5.3 连接角色

| role | 用途 | 约束 |
| --- | --- | --- |
| `command` | adapter 普通操作 | 无 keyPrefix；有 deadline；禁止自动重放未完成命令 |
| `blocking` | `XREAD BLOCK` | 专用连接；必须注册、限时和释放 |
| `queue` | BullMQ Queue | 连接由 Runtime 创建，对象生命周期由 BullMQ adapter 管理 |
| `worker` | BullMQ Worker | `maxRetriesPerRequest=null`；shutdown 后禁止重启 |

关闭顺序固定为：

1. 执行 before-close hook，先关闭 BullMQ Worker/Queue 对象及其内部 duplicate connection。
2. 关闭 blocking connection。
3. 关闭 worker/queue 原始 connection。
4. 关闭 command connection。
5. 每一步有 deadline，超时后强制 disconnect。

### 5.4 Keyspace

新代码显式构造：

```text
fastgpt:<namespace>:<version?>:<encoded-segment>...
```

规则：

- Cache 使用 logical key；adapter 内部转 physical key。
- segment 使用 RFC3986 编码，不能让 `* ? [ ] \\` 影响 SCAN glob。
- 历史 key 通过受限的 `asRedisLogicalKey` 保持格式，不对既有 segment 重新编码。
- SCAN 只返回 FastGPT keyspace 内的 logical key。
- 第一轮迁移不修改任何既有物理 key、TTL 和 value 格式。

## 6. Adapter 与错误

Adapter 不提供 ioredis 镜像或 raw client。它只按真实 Cache 的需求提供显式操作（字符串、事务、hash、Lua、Stream、SCAN 和 memory info），统一完成 logical -> physical key、deadline、返回校验和错误映射；不存在独立 capability registry。

新增命令必须和一个真实 Cache 在同一阶段进入，并补齐：

- logical -> physical key 转换。
- 输入校验。
- ioredis 返回值校验。
- command deadline。
- 是否可重试和 timeout 后结果是否未知。
- Cache 级故障合同测试。

不提供 raw `call/eval`，不允许调用方自行声明 operation 可重试。原子脚本紧邻具体 Cache 实现；只有出现真实复用后才抽取。

错误基类使用 `RedisOperationError`，至少包含 `code`、`operation`、`role`、`outcome` 和 `cause`，不包含完整 key/token。Cache 再决定 miss、回源或 fail-open/fail-closed。

测试边界固定为两层：DAL adapter/Cache 的协议和错误分支使用窄 fake client；真实 Redis 7.2 integration 才用于验证 Lua 执行、SCAN glob、Stream blocking、事务和并发原子性。service 的 `test/mocks/common/redis.ts` 只作为 service 调用方测试夹具，不复用为 DAL integration client。

## 7. Cache 合同

现有与计划中的 Cache：

| Cache | 物理 key/value | 故障与并发合同 | 状态 |
| --- | --- | --- | --- |
| `DingtalkAccessTokenCache` | `fastgpt:cache:dataset:dingtalk:accessToken:${appKey}:${secretHash}`；token；动态 TTL | Redis fail-open；上游错误传播；进程内 single-flight | DAL-R2 已迁入 shared DAL |
| `TeamVectorCountCache` | `fastgpt:cache:team_vector_count:${teamId}`；decimal；1800 秒 | 3 秒后回源；写/失效 best-effort | DAL-R2 已迁入 shared DAL |
| `WechatQrLoginCache` | `fastgpt:cache:publish:wechat:qrcode:${outLinkId}:${tmbId}`；QR JSON；480 秒 | miss 返回 expired；错误和损坏数据 fail-closed | DAL-R2 已迁入 shared DAL |
| `WecomAccessTokenCache` | provider/suite 两个历史 key；token；`expires_in - 10` 秒 | Redis/上游错误 fail-closed；不新增 single-flight | DAL-R2P 已迁入 pro DAL |
| `WecomSuiteTicketCache` | `fastgpt:wecom:suite_ticket`；永久 string | 外部事件覆盖写入；缺失/读写错误 fail-closed | DAL-R2P 已迁入 pro DAL |
| `DailyActiveDedupeCache` | `fastgpt:cache:dailyUserActive:${uid}_${date}`；`1`；86400 秒 | `SET NX EX`；Redis 故障 fail-open | DAL-R3C 已迁入 shared DAL |
| `SystemVersionCache` | `fastgpt:VERSION_KEY:*`；UUID；永久 | `SET NX GET` 原子初始化；错误 fail-closed；wildcard 只删子 key | DAL-R3D 已迁入 shared DAL |
| `FixedWindowRateLimitCache` | 现有 frequency key | 原子计数；按调用方冻结 fail-closed | 已迁入 DAL |
| `SessionCache` | `fastgpt:session:*` hash + TTL | 原子写/过期；损坏记录清理 | 已迁入 DAL |
| `LeaseCache` | `fastgpt:lock:*` | token 校验续租/释放；sandbox fail-closed | 已迁入 DAL |
| `WorkflowStopSignalCache` | 现有 stopping key | workflow/auxiliary 共享协议 | 已迁入 DAL |
| `StreamResumeCache` | `fastgpt:stream:resume:*` | blocking connection 和 memory pressure 合同 | 已迁入 DAL |
| `OutLinkStreamCache` | 现有 cache string | 原子 append+TTL；保持消费协议 | 已迁入 DAL |

Cache 可以拥有 key、TTL、codec、single-flight、read-through callback 和数据访问 deadline。权限、HTTP、Mongo 业务更新、供应商 SDK 和跨 Cache 用例留在 service/project。

## 8. 已完成历史阶段

### Phase 1：Runtime 与 Keyspace

- [x] 严格 Redis URL parser，拒绝 query/hash 和非法端口/db。
- [x] 拆分 legacy-command 与 physical command，消除双前缀入口。
- [x] typed keyspace、RFC3986 segment 和 glob-safe scan。
- [x] BullMQ 使用 queue/worker factory，关闭对象池并增加 shutdown guard。
- [x] Runtime 有序限时关闭、健康检查 deadline 和 blocking registry。
- [x] app/admin health check 接入和定向回归测试。
- [x] 提交：`9a6814a48`。

### Phase 2：历史 capability 实现

- [x] 曾实现 string/hash/counter/scan/stream capability、operation policy 和 script registry。
- [x] 完成定向测试和 review。
- [x] 提交：`edc68252d`。

### Phase 3A：Dingtalk 与 Team Vector Count

- [x] 保持物理 key、TTL、single-flight、回源和 best-effort 合同。
- [x] 4 个定向测试文件共 74 项通过。
- [x] 提交：`7f41c8711`。

### Phase 3B1：Wechat QR Login

- [x] 保持历史 JSON/TTL，增加 typed codec 和损坏数据错误。
- [x] 3 个定向测试文件共 20 项通过。
- [x] 提交：`0fcd10e0d`。

### Phase 3B2：Wecom Cache 前置迁移

- [x] pro Wecom access token、pending order 和 suite ticket Cache 已实现。
- [x] provider/suite/event 调用方已迁移，业务接口保持不变。
- [x] 5 个定向测试文件共 29 项通过，相关实现覆盖率 100%。
- [x] 前置实现已由 DAL-R2P 迁入 pro DAL 并完成改名。
- [x] DAL-R2P 已通过 review 并完成 pro 独立提交。

### Phase 2R：capability 收缩

- [x] capability 收缩为按真实 Cache 驱动的最小 adapter，不提供预制 capability registry。
- [x] shared/pro Store 改为注入 adapter。
- [x] 删除无生产消费者的 hash/counter/stream/atomic/script registry。
- [x] 错误命名由 capability 收缩为 operation。
- [x] 167 项唯一定向测试通过；adapter、operation 和 5 个 Store 全维度覆盖率 100%。
- [x] 已通过 review，并作为后续 DAL-R1 的基础。

## 9. 后续迁移阶段

每个阶段完成后停止编码，等待代码 review；review 通过后再提交并进入下一阶段。

### DAL-R0：review gate

- [x] 确认 Phase 2R 的最小 adapter 方向，不恢复 capability 或 script registry。
- [x] 确认 Phase 3B2 pro Store 的数据合同和 pro 所有权。
- [x] Phase 2R、Phase 3B2 已纳入后续 DAL 阶段提交边界。

### DAL-R1：package 与 Redis kernel

- [x] 创建 `packages/dal`、package manifest、tsconfig 和 Vitest 配置。
- [x] 迁移 runtime/config/keyspace/errors/operation/validation/adapter 及其测试。
- [x] 注入 redis URL 和 logger，确保 DAL 对 service/project/pro 零依赖。
- [x] 建立单一进程级 DAL runtime context，兼容 Next.js 热重载。
- [x] 初期保留 `@fastgpt/service/common/redis` legacy facade，后续 DAL-R6F 已删除该 facade；未增加旧深路径转发文件。
- [x] 初期由 service runtime binding 连接 BullMQ，后续 DAL-R6E 已将 Queue/Worker 生命周期收拢到 DAL。
- [x] 迁移期间保持连接角色、物理 key 和行为兼容；DAL-R6D 已删除 global legacy client。
- [x] 根测试环境通过公开 `configureRedisRuntime` 注入内存 client，不再写入 `global.redisRuntime`。
- [x] DAL 5 个文件 81 项、service 11 个文件 123 项、pro 5 个文件 29 项、app 5 个文件 34 项定向测试通过。
- [x] DAL 与 app typecheck 通过；pro 仅剩 3 个与本次 Redis 改动无关的既有类型错误。

本阶段已实现并通过 review gate，DAL-R2 已基于该 package 边界完成 shared Cache 搬迁。

### DAL-R2：shared Cache

- [x] 将 3 个 shared Store 迁入 `@fastgpt/dal/redis/caches`。
- [x] 改名为 `DingtalkAccessTokenCache`、`TeamVectorCountCache`、`WechatQrLoginCache`。
- [x] 更新所有生产和测试 import，删除 service stores 目录，不保留转发文件。
- [x] service logger 改为窄 port 注入，global `withTimeout` 改为 DAL 内部纯实现。
- [x] DAL 4 个文件 47 项、service 2 个文件 55 项、app 2 个文件 11 项定向测试通过。
- [x] 三个 Cache 的 statements/lines/functions 覆盖率均为 100%，Cache 分支合计 95%。
- [x] DAL 与 app typecheck、16 个本阶段文件的精确 ESLint、旧 shared Store 静态扫描通过。

本阶段已实现并通过 review gate，DAL-R2P 已基于该 Cache 边界完成 pro 搬迁。

### DAL-R2P：pro Cache

- [x] 在 pro 内建立 `src/dal/redis/caches`。
- [x] 迁移并改名 Wecom Cache，直接依赖 `@fastgpt/dal` adapter。
- [x] 更新 provider、suite、event 生产调用方和对应测试。
- [x] 删除 pro service Redis Store 目录，不保留转发文件。
- [x] Pro Cache 与调用方定向测试 36 项通过，Cache 全维度覆盖率均为 100%。
- [x] Pro Cache 文件、调用方、旧 Store 和反向依赖静态扫描通过。
- [x] Pro typecheck 通过，未发现 Redis 改动引入的类型错误。

本阶段已实现并通过 review gate，DAL-R3C 已基于 shared DAL adapter 开始剩余 Cache 迁移。

### DAL-R3C：Daily Active Dedupe

- [x] adapter 随 Cache 加入 `setIfAbsent`，不恢复通用 string capability。
- [x] `string.setIfAbsent` 只执行一次，超时 outcome 为 unknown；严格校验 `OK | null` 返回。
- [x] 使用 `SET NX EX` 代替 `GET -> SET`，保持 UTC 日期、历史 key、值 `1` 和 86400 秒 TTL。
- [x] 保持 tracking Redis fail-open，降级时记录 warning；Mongo event 与错误传播合同不变。
- [x] DAL 3 个单元测试文件 39 项、service 1 个文件 4 项定向测试通过。
- [x] `DailyActiveDedupeCache` statements/branches/functions/lines 均为 100%。
- [x] Redis 7.2.14 integration test 通过，64 个并发请求只有 1 个获得首次声明结果。
- [x] DAL 与 app typecheck、10 个本阶段文件精确 ESLint、legacy cache 引用扫描通过。

本阶段已实现并通过 review gate，DAL-R3D 已继续迁移 System Version。

### DAL-R3D：System Version

- [x] adapter 新增 Cache 驱动的 `getOrSet` 与 `deleteMany`，不恢复 capability 层。
- [x] adapter 数字参数使用 Zod `safeParse` 严格校验，不做 coercion，并统一映射为稳定的 `RedisInvalidArgumentError`。
- [x] Runtime config 使用 Zod 校验原始 URL 和派生字段，不做 coercion，并保持 `RedisConfigurationError` 合同。
- [x] `string.getOrSet` 使用单条 `SET NX GET`，只执行一次，超时 outcome 为 unknown。
- [x] `string.deleteMany` 是无返回值依赖的幂等删除，瞬时错误允许重试一次并严格校验删除数量。
- [x] 新增 `SystemVersionCache`，保持历史 base/child key、UUID value 和永久 TTL。
- [x] `id='*'` 完成全部 SCAN 页后用单条 multi-key `DEL` 删除子 key，base key 与相邻前缀不受影响。
- [x] service cache facade 不再依赖 raw Redis、legacy scan 或物理 key，API 与进程内缓存行为保持不变。
- [x] DAL 6 个精确单测文件 108 项、service 1 个文件 16 项通过；`SystemVersionCache`、numeric validation 与 config 全维度覆盖率 100%。
- [x] Redis 7.2.14 integration 2 项通过：64 并发初始化只得到一个永久版本，512 个子 key 经多页 SCAN 后全部删除。
- [x] DAL 与 app typecheck、15 个相关文件精确 ESLint、legacy System Version Redis 引用扫描通过。

本阶段已实现并通过 review；本轮未运行全量测试。

### DAL-R4A：Fixed Window Rate Limit 与 Team QPM

- `FixedWindowRateLimitCache` 使用 `frequency:${type}:${scope}` logical key，保持 `fastgpt:` 物理前缀；窗口首次请求通过 `INCR + EXPIRE NX` 建立，随后由同一事务读取 `TTL`。
- adapter 对 `MULTI/EXEC` 做完整结构校验：必须有 `INCR`、`EXPIRE`、`TTL` 三个结果，计数和 TTL 必须为非负/有效整数；`null`、空数组、错误 tuple 或非法数字均转换为稳定 Redis 错误，不能 allow。
- Cache 输出 `allowed/currentCount/remaining/ttlSeconds/resetAt`；`limit` 与 `windowSeconds` 采用正安全整数校验。
- service 的认证限流和 Team QPM 限流统一 fail-closed；Redis 错误由 service 记录并映射到现有业务拒绝行为。
- `TeamQpmCache` 仅迁移 `cache:team_qpm_limit:${teamId}` 的读写删除与 3600 秒 TTL；套餐回源、默认 `CHAT_MAX_QPM` 和 Mongo 查询留在 wallet service。
- 不迁移 Mongo `authFrequencyLimit`；Team Point、Pending Payment 已在各自 Cache 阶段完成；不新增通用 capability 或 raw Redis 公共入口。

### DAL-R4：关键一致性 Cache

- Fixed window rate limit 与 team QPM 配置。
- Team point cache 与双 key 一致性。
- Pending payment 协调状态，编码前先冻结故障/回源/并发合同。
- Session、Lease 和 Workflow Stop Signal。
- 每个能力独立子阶段 review，不批量实现。

### DAL-R4B：Team Point cache 双 key 一致性

- 保持 `cache:team_point_surplus:${teamId}`、`cache:team_point_total:${teamId}` 和 60 秒 TTL 不变。
- 成对 GET、成对 SET 和 surplus `INCRBYFLOAT + EXPIRE NX` 都通过 adapter 的事务命令完成；空/畸形事务结果不得被当作成功。
- partial hit、非法数字和 Redis 读错误回源 Mongo；写、增量、清理错误只记录 warning，钱包主流程继续使用 Mongo 结果。
- 清除使用单条 multi-key `DEL`；wallet service 删除 `getRedisCache/setRedisCache/incrValueToCache` 和手工 cache key。

本阶段已实现并通过定向验证与 review；Redis 7.2 integration 在未配置 `REDIS_INTEGRATION_URL` 时按测试策略跳过。

### DAL-R4C：Pending Payment 协调状态

- 当前生产 Redis 状态仅是企业微信每团队一个待支付订单号：`wecom:pending_order:${teamId}`，物理 key 保持 `fastgpt:wecom:pending_order:${teamId}`。
- value 仍为企微 `orderId` 字符串，TTL 保持 7 天；Cache 通过 shared adapter 显式添加物理前缀，不经过 legacy command client。
- 创建企微订单前读取并取消旧订单，创建成功后写入新订单号；支付成功回调清理该指针。Mongo 账单和企微回调仍是事实来源。
- Redis 读取错误按 miss/fail-open，写入和清理错误 best-effort 记录 OTel error；不把普通微信/支付宝定时查单改造成 Redis claim/lease。
- 本阶段不实现 worker claim、租约续期、回调幂等状态机或支付结果缓存，后续若确有多 worker 协调需求另行冻结合同。

本阶段已实现并通过定向验证与 review。

### DAL-R4D：Session Cache

- 保持 `session:${sessionId}` logical key、`fastgpt:session:${sessionId}` 物理 key、`userId/teamId/tmbId/isRoot/createdAt/ip` hash 协议和 7 天 TTL。
- adapter 新增真实 Cache 驱动的 hash 读写：hash 写入与 `EXPIRE` 在单个 `MULTI/EXEC` 中完成；hash 读取严格校验 Redis 返回结构。
- `SessionCache.get` 对 miss、字段缺失、非法布尔/时间值返回 `undefined`；损坏记录尝试删除并记录错误；Redis 读错误向上抛出，认证入口保持 fail-closed。
- 用户扫描只通过 logical prefix 返回 typed session records；批量注销在 Cache 内构造 key，白名单按 session ID 比较，修复历史 `session:session:*` 删除漏洞。
- 登录数限制仍由 service 读取 `MAX_LOGIN_SESSION`，Cache 只负责扫描、解码和批量删除；后台清理失败记录 warning，不阻断新 session。

本阶段已实现并通过定向验证与 review。

### DAL-R4E：Lease Cache

- 当前只迁移 Agent Sandbox 初始化锁，Mongo `timerLock` 保持原实现，不混入 Redis Lease。
- 保持 logical key `lock:${key}`、物理 key `fastgpt:lock:${key}`、随机 token value 和毫秒 TTL；获取使用 `SET NX PX`。
- 续租和释放由 DAL adapter 内部执行 token 校验脚本并严格校验 `0/1` 返回；service 不再获取 Redis client、调用 `eval` 或拼物理 key。
- 获取失败、获取异常和租约丢失继续 fail-closed；释放为 best-effort，不能删除 token 不匹配的后续持有者租约。
- 保留 `RedisLeaseUnavailableError`、`RedisLeaseLostError`、`RedisLeaseAcquireError` 语义及 Agent Sandbox 的初始化错误映射。

本阶段已实现并通过定向验证与 review。

### DAL-R4F：Workflow Stop Signal Cache

- 当前 Redis 停止状态由 workflow status 写入、workflow dispatch 轮询、auxiliary generation 读取，三者迁移到同一个 Cache。
- 保持 logical key `agent_runtime_stopping:${sourceType}:${sourceId}:${chatId}`、物理 key `fastgpt:agent_runtime_stopping:${sourceType}:${sourceId}:${chatId}`、`1` value 和 60 秒 TTL。
- 写入 Redis 错误继续 fail-closed 并交给 `/v2/chat/stop`；读取错误按 `false` 降级；清理失败 best-effort 记录日志。等待完成的 timeout/pollInterval 仍由 service 编排。
- Cache 负责 source 参数校验和 key 构造，业务层不再调用 `getGlobalRedisConnection`、`GET/SET/DEL` 或手工拼 key。
- 不迁移 Stream Resume、前端 AbortController、Mongo timer lock 或其他通用 cache。

本阶段已实现并通过定向验证与 review。

### DAL-R5：流式 Cache

- Stream Resume 的业务协议和 blocking 生命周期。
- Wechat/Wecom outLink stream 的原子 append+TTL。
- Wechat polling failure counter 的多 worker 竞态修复。
- 第一轮保持现有字符串消费协议，不顺带改为 Redis Stream。

#### DAL-R5A：Stream Resume

- 仅迁移 `core/chat/resume.ts` 的 Stream Resume Redis 访问；OutLink Stream 和 polling counter 留在后续子阶段。
- Cache 保持三个历史 logical key、物理前缀、TTL、JSON state 和 `raw` field 协议，收拢镜像清理、`XADD`、`XRANGE`、`XREAD BLOCK` 及 Stream 返回校验；service binding 只负责注入 command/blocking factory，业务逻辑不再解析 raw Redis 返回。
- blocking connection 由 DAL Runtime 创建，Cache 在 `finally` 中释放；service 仍负责内存水位、SSE writer、终止事件和 HTTP response 生命周期。
- 本阶段已完成实现并通过 review，随后继续完成 R5B/R5C。

#### DAL-R5B：OutLink Stream

- 迁移 `support/outLink/runtime/utils.ts` 的 `streamResponse:*` 字符串缓存，以及 pro Wecom polling handler 的读取/删除。
- 逻辑 key 固定为 `cache:streamResponse:${streamId}`，物理 key 固定为 `fastgpt:cache:streamResponse:${streamId}`；保持空值 120 秒、追加内容和 `[DONE]` 60 秒 TTL。
- Cache 负责 key 构造和 `APPEND + EXPIRE` 事务；调用方只接触 `streamId`、字符串 value 和 typed miss，不再导入 `getRedisCache`、`appendRedisCache`、`delRedisCache`。
- 仍保持字符串拼接协议，不把该缓存改造成 Redis Stream；Wechat polling failure counter 单独进入 R5C。
- 本阶段已完成实现并通过 review。

#### DAL-R5C：Wechat Polling Failure Counter

- 迁移 `support/outLink/wechat/mq.ts` 的连续失败计数读改写、成功重置和阈值清理。
- 逻辑 key 固定为 `cache:wechat:publish:failures:${shareId}`，物理 key 固定为 `fastgpt:cache:wechat:publish:failures:${shareId}`，TTL 固定 300 秒。
- Cache 使用 `INCRBY + EXPIRE NX` 事务保证多 worker 递增不丢失；成功重置仍是带 TTL 的字符串 `0`，阈值后删除继续由 worker 编排。
- 不改变 API 错误判断、Mongo 状态更新、BullMQ 失败退避和续链逻辑；Redis 错误继续进入现有 worker failed 路径。
- 本阶段已完成并通过 review。

#### DAL-R6A：Legacy Cache/Scan Facade Cleanup

- 删除无生产调用方的 `common/redis/cache.ts`、`common/redis/scan.ts` 及旧 scan 定向测试。
- 删除仅供 scan facade 使用的 `common/redis/adapter.ts`，并移除 `getAllKeysByPrefix` 公共导出。
- runtime、health 和 Stream Resume 均改为直接使用 DAL 入口；BullMQ connection factory 随后由 DAL-R6E 接管，不改变运行时连接、key、TTL 或错误合同。
- 本阶段已完成并通过 review。

#### DAL-R6B：Stream Resume Binding Cleanup

- `core/chat/resume.ts` 改为直接使用 DAL Stream Resume Cache，移除 service-side adapter、`getGlobalRedisConnection`、`getPhysicalRedisConnection`、blocking factory 和 Runtime release 绑定。
- DAL adapter 新增 typed `server.memoryInfo` operation，负责 `INFO MEMORY` 解析和 operation timeout；service 只保留内存压力阈值、缓存和 fail-open 策略。
- blocking connection 继续由 DAL Runtime 创建，并由 Stream Resume Cache 在 `finally` 中释放；不改变 Stream key、TTL、XREAD、SSE 或错误合同。
- 本阶段已完成并通过 review。

#### DAL-R6C：Service Redis Facade Narrowing

- `common/redis/index.ts` 在本阶段收窄，随后由 DAL-R6F 删除；移除无生产消费者的 raw-client、blocking、snapshot、DAL error/key 转发及 queue/worker barrel 导出。
- `common/redis/runtime.ts` 的 health/close binding 随后迁移到 DAL；BullMQ queue/worker factory 已由 DAL-R6E 接管。
- `global.redisClient` 与 legacy command 生命周期在 DAL-R6D 已清理，测试 mock 改为显式注入。
- 本阶段已完成并通过 review。

#### DAL-R6D：Legacy Global Client Removal

- 删除 Runtime 的 `legacy-command` role、隐式 `keyPrefix=fastgpt:`、`existingCommandClient` 接管参数和 `getLegacyCommandConnection`，所有 command 连接均只服务 DAL adapter 的显式 physical key 操作。
- 删除 service `getGlobalRedisConnection`、`global.redisClient` 类型声明及 orphan client 清理；service Redis facade 随后已删除，health/close 和 BullMQ 生命周期均由 DAL 管理。
- 测试夹具改为模块级共享 mock client，测试清理和断言通过 DAL Runtime 的 command connection 完成，不再初始化或依赖全局 Redis client。
- 不改变 Cache 的 logical key、物理 `fastgpt:` 前缀、TTL、value、错误降级、BullMQ 生命周期或 Runtime 有序关闭合同；app/admin health/shutdown 已直接调用 DAL。

本阶段已完成实现、通过代码 review，并已提交根仓库和 `pro` 子模块。

#### DAL-R6E：BullMQ DAL adapter

- 将 Queue/Worker registry、创建和生命周期迁移到 `@fastgpt/dal/redis/bullmq` 的 `RedisBullMQRuntime` class。
- 进程级 BullMQ context 只通过 DAL 私有 symbol 复用，并以 `Map<ResourceId, Runtime>` 管理资源；不新增 `global.bullMQRuntimeState` 等散落字段。
- DAL 使用 Runtime 的 queue/worker connection factory；BullMQ Worker 内部 duplicate connection 由 Worker/Queue close 在 Redis Runtime before-close hook 中先释放。
- 关闭时先清空 registry，再按 Worker -> Queue 顺序限时关闭；Worker 的 closed/paused 自动恢复策略受运行状态和显式 lifecycle options 约束，shutdown 后禁止重启。
- graceful close 超时或失败时调用 BullMQ 对象级 `disconnect()`，只移除 Queue/Worker 的 adapter-owned listener，避免 blocking duplicate connection 残留；Worker 异常重启会快照并恢复业务方的 `completed/failed/ready` 等 listener（保留 `once` 语义）。
- service 保留 `QueueNames`、processor 类型入口、业务 worker 默认项和 `BullMQBinding` facade；service 不再直接依赖 `bullmq` 或暴露 Redis connection factory。
- service facade 只保留 `BullMQBinding`/`bullMQ`、`QueueNames`、必要类型和 `UnrecoverableError`；生命周期状态/关闭兼容入口与通用 `delay` 已移除。
- 不改变队列名、job data、processor、重试/保留策略和业务调用方；不迁移队列业务编排。
- DAL BullMQ runtime 13 项、service facade 4 项定向测试通过；DAL typecheck、`git diff --check` 和 service raw BullMQ import 扫描通过。

本阶段已实现并通过 review。

#### DAL-R6G：BullMQ 业务合同收拢

- `packages/dal/redis/bullmq/binding.ts` 改为 `BullMQBinding` class，并导出进程级 `bullMQ` 实例；binding 不缓存 DAL Runtime，避免 Redis Runtime 重配后复用旧实例。
- 新增 `packages/dal/redis/bullmq/services/`，集中维护队列 data type、queue/worker binding、enqueue、scheduler 和 job 状态操作；删除 `packages/service/common/bullmq`。
- 队列业务合同按 `AppDeleteMQService`、`DatasetSyncMQService` 等独立 class 组织，并导出默认 singleton；Queue/Worker 通过方法懒加载，class 构造函数可注入 `BullMQBinding`，不在模块加载阶段创建连接。
- app、dataset、skill、team、S3、evaluation、collection 和 Wechat 的领域 processor/数据库/对象存储逻辑仍留在原领域目录；原入口只保留薄调用包装或 processor 注入，降低迁移面。
- 不改变队列名、job data、jobId、重试/保留策略、Redis key 或业务错误合同；DAL 不新增任何 service 业务依赖。

本阶段已实现，等待 review。

#### DAL-R6H：BullMQ 目录归属统一

- `@fastgpt/dal/redis/bullmq` 作为 BullMQ 唯一公共入口，导出 `BullMQBinding`、`QueueNames`、`XxxMQService`、job data type 和 BullMQ 类型；需要时可通过 `redis/bullmq/services/*` 单独引用。
- service package 删除 BullMQ 直接依赖和旧 facade；`packages/service` 只依赖 DAL 的 BullMQ 合同，领域 processor 仍由 service/project 实现。
- `projects/app/src/service/common/bullmq` 和 `pro/admin/src/service/common/bullmq` 仅承担应用启动时的 worker 注册，不属于 DAL 可复用数据合同，继续保留在各应用边界。
- DAL 增加 `@fastgpt/global` workspace 依赖，确保 `DatasetStatusEnum` 等稳定业务常量由底层 package 直接解析，仍不反向依赖 service。

本阶段已实现，等待 review。

#### DAL-R6F：Shutdown、Metrics 与 facade 收口

- `RedisRuntime` 接收可选 metrics port，记录连接创建/关闭/错误、health 结果和 shutdown 耗时；metrics recorder 异常只记录 warning，不影响 Redis 生命周期。
- `registerRedisRuntimeShutdown` 由 app/admin instrumentation 显式注册 SIGTERM/SIGINT listener，保证幂等 close、关闭失败使用非零 exit code，library import 不产生进程副作用。
- app/admin 在初始化早期直接配置 DAL Runtime；service BullMQ 直接读取已配置的 DAL Runtime，不再依赖 service Redis runtime binding。
- health 入口改为 `@fastgpt/dal/redis`，删除 `packages/service/common/redis` 及其 facade 测试和旧 mock；Cache、队列名、job 配置、physical key、TTL、value 和错误合同不变。
- 已完成 raw ioredis/bullmq、旧 service Redis facade、service adapter 和手工 physical Redis key 的生产代码扫描；仅 DAL Runtime/integration test 保留底层依赖。

本阶段已实现并通过限定验证；全量测试按用户约定暂未运行。

### DAL-R6：清理与上线治理

- Redis 7.2+ key/SCAN/Lua/Stream/并发集成验证已完成：kernel suite 与既有四个 Cache integration 文件共 5 个文件、11 项通过。
- 接入进程级 shutdown hook 和 Redis metrics。
- 完成 raw ioredis、旧 Store、service Redis adapter 和手工 physical key 的最终静态清零。
- 将 health/close 迁移到 DAL，删除剩余 service facade binding。
- 先通过定向测试，最后运行全量测试。

## 10. Tasks

### 架构与 package

- [x] D-01：确认 package 名为 `@fastgpt/dal`。
- [x] D-02：确认 DAL 包含数据基础设施和持久化业务 Cache。
- [x] D-03：确认当前只迁移 Redis，MongoDB/Vector DB 另行设计。
- [x] D-04：确认 shared/pro 双归属和禁止 DAL 依赖 service。
- [x] D-05（DAL-R1）：创建 package、配置和受限子路径入口。
- [x] D-06（DAL-R1）：建立配置/logger 注入和单一 runtime context。

### Runtime 与 adapter

- [x] R-01：严格 URL parser、连接角色、registry、health 和有序 close。
- [x] R-02：logical/physical key 隔离、RFC3986 编码和安全 SCAN。
- [x] R-03：BullMQ 对象级关闭与 shutdown guard。
- [x] R-04（Phase 2R）：最小 adapter 和 operation error。
- [x] R-05（DAL-R1）：迁移 kernel 到 DAL 并保留 service legacy facade。
- [x] R-08（DAL-R6D）：删除 legacy command role、global client 和 service raw-client 兼容入口。
- [x] R-06：增加真实 Redis 7.2 的 key、SCAN、Lua、Stream 和并发测试。
- [x] R-09（DAL-R6E）：将 BullMQ adapter、对象级 close、生命周期 guard 和 service 类型边界收拢到 DAL。
- [x] R-10（DAL-R6G）：BullMQ binding class 化并将队列业务合同集中到 DAL。
- [x] R-11（DAL-R6H）：删除 service BullMQ facade，将 `XxxMQService`、job data 和 QueueNames 收拢到 `packages/dal/redis/bullmq`。
- [x] R-07：接入进程级 shutdown hook 和 metrics，并在 app/admin instrumentation 早期配置 Runtime。

### Cache

- [x] P-01：Dingtalk、Team Vector Count、Wechat QR Store 前置实现。
- [x] P-02：pro Wecom Store 前置实现，已由 DAL-R2P 迁移吸收。
- [x] P-03（DAL-R2）：迁移/改名 shared Cache。
- [x] P-04（DAL-R2P）：迁移/改名 pro Cache。
- [x] P-05（DAL-R3C）：Daily Active Dedupe。
- [x] P-06（DAL-R3D）：System Version。
- [x] P-07A（DAL-R4A）：Fixed Window Rate Limit 与 Team QPM。
- [x] P-07B（DAL-R4B）：Team Point cache 与双 key 一致性。
- [x] P-07C（DAL-R4C）：Pending Payment 协调状态。
- [x] P-08：Session、Lease、Stop Signal。
- [x] P-08A（DAL-R4D）：Session Cache。
- [x] P-08B（DAL-R4E）：Lease Cache 与 Agent Sandbox 初始化锁。
- [x] P-08C（DAL-R4F）：Workflow Stop Signal Cache 与 workflow/auxiliary 调用方。
- [x] P-09：Stream Resume、OutLink Stream、polling counter。
- [x] P-09A（DAL-R5A）：Stream Resume Cache 与 service 调用方。
- [x] P-09B（DAL-R5B）：OutLink Stream Cache 与 Wechat/Wecom 调用方。
- [x] P-09C（DAL-R5C）：Wechat polling failure counter Cache 与 worker 调用方。

### 测试与清理

- [x] T-01：Phase 1/2/3A/3B1 定向测试。
- [x] T-02：Phase 2R 共 167 项唯一定向测试和关键模块 100% 覆盖率。
- [x] T-03：Phase 3B2 共 29 项定向测试和相关实现 100% 覆盖率。
- [x] T-04（DAL-R1）：DAL kernel/facade/BullMQ/health/resume 定向测试。
- [x] T-05（DAL-R2）：shared Cache 和调用方定向测试。
- [x] T-05P（DAL-R2P）：pro Cache 和调用方定向测试。
- [x] T-05C（DAL-R3C）：Daily Active 单元测试与 Redis 7.2 并发 integration test。
- [x] T-05D（DAL-R3D）：System Version 单元测试与 Redis 7.2 并发/SCAN integration test。
- [x] T-05A（DAL-R4A）：限流 adapter/Cache、service 调用方与 Redis 7.2 并发 integration test（integration 因环境变量缺失跳过）。
- [x] T-05B（DAL-R4B）：Team Point adapter/Cache、wallet 调用方与 Redis 7.2 一致性 integration test（integration 因环境变量缺失跳过）。
- [x] T-05C（DAL-R4C）：企微 Pending Payment Cache、创建订单/支付回调调用方与 pro 定向测试。
- [x] T-05E（DAL-R4D）：Session adapter/Cache、认证与注销调用方定向测试。
- [x] T-05F（DAL-R4E）：Lease adapter/Cache 与 Agent Sandbox 调用方定向测试。
- [x] T-05G（DAL-R4F）：Stop Signal Cache 与 workflow/auxiliary 调用方定向测试。
- [x] T-05H（DAL-R5A）：Stream Resume adapter/Cache 与 service 调用方定向测试。
- [x] T-05I（DAL-R5B）：OutLink Stream adapter/Cache 与 Wechat/Wecom 调用方定向测试。
- [x] T-05J（DAL-R5C）：failure counter adapter/Cache 与 Wechat worker 定向测试。
- [x] T-05K（DAL-R6A）：legacy cache/scan facade 清理与过期引用扫描。
- [x] T-05L（DAL-R6B）：memory operation、Stream Resume Cache 与 app/service 定向测试。
- [x] T-05M（DAL-R6C）：service Redis facade narrowing、BullMQ/health 定向测试与入口扫描。
- [x] T-05N（DAL-R6D）：legacy global client removal、Runtime role policy、调用方与测试夹具定向测试。
- [x] T-05O（DAL-R6）：Redis 7.2 kernel 与 Cache integration 定向测试。
- [x] T-05Q（DAL-R6E）：DAL BullMQ lifecycle 13 项、service BullMQ facade 4 项定向测试。
- [x] T-05R（DAL-R6G）：BullMQ services、Wechat worker、App delete queue 定向测试。
- [x] T-05S（DAL-R6H）：DAL BullMQ binding/services、service/app/pro 调用方和旧路径静态扫描定向验证。
- [x] T-06：静态扫描 raw ioredis、旧 Store、service Redis adapter 和手工 physical key；生产业务代码无残留。
- [x] T-07A：迁移 health/close 到 DAL、删除 service Redis facade、更新 app/admin instrumentation 和测试夹具。
- [ ] T-07B：运行全量测试（按用户约定暂不执行）。

## 11. 每阶段验收模板

每个阶段 review 前必须提供：

1. 本阶段改变的目录和依赖方向。
2. 明确未改变的物理 key、TTL、value 和错误合同。
3. 新增/删除的公共入口。
4. 运行的定向测试、静态检查和结果。
5. 尚未运行的测试及残余风险。
6. `git diff --check` 和过期 import/raw Redis 扫描结果。

## 12. 总体验收标准

- `@fastgpt/dal` 不依赖 service/project/pro。
- shared Redis Runtime、adapter、Cache 全部归属 DAL。
- pro Cache 保留 pro 所有权并依赖 shared DAL。
- 业务只依赖 Cache，不拼 key、不选择 Redis 命令、不获得 raw client。
- 迁移前后物理 key、TTL、value 和已冻结的故障合同兼容。
- 非幂等操作没有隐式重放，timeout 的 unknown outcome 可识别。
- BullMQ duplicate、blocking connection 和普通 command 都能有序限时关闭。
- capability registry、通用 Cache/Cache 基类和无消费者预制能力不再出现。
- 最终清零业务层 ioredis、旧 Store、service Redis adapter 和 service Redis facade；health/close 归属 DAL。

## 13. 回滚策略

- 每个 DAL 阶段独立提交，shared 与 pro 分开提交。
- DAL-R1 只移动 kernel 并保留 facade；出现问题可回滚 import/package，不涉及数据迁移。
- DAL-R2/R2P 保持原 key/value/TTL，回滚不需要批量改 key。
- 行为修复（例如 `SET NX EX`）必须单独列出，不能伪装成纯目录迁移。
- 不采用长期双写；临时兼容分支必须在对应阶段明确删除时间。

## 14. 待后续阶段确认

1. Session、计费额度和限流分别采用何种 Redis 故障策略，不能用统一默认值代替。
2. Pending payment 在 Redis 不可用时是否拒绝创建、是否允许从账单回源，以及 team 级并发策略。
3. CI 是否提供 Redis 7.2 integration service；若不能，需要批准可重复的本地/容器测试方式。
