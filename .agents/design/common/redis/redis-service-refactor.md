# DAL Redis 重构与迁移设计

> 上位设计：[FastGPT Data Access Layer 设计](../dal/data-access-layer.md)
>
> 状态：Phase 1、Phase 2、Phase 3A、Phase 3B1 已提交；Phase 3B2、Phase 2R、DAL-R1、DAL-R2、DAL-R2P、DAL-R3C、DAL-R3D、DAL-R4A、DAL-R4B、DAL-R4C、DAL-R4D 与 DAL-R4E 已实现并通过定向测试，当前等待 DAL-R4E 代码 review。Stop Signal 和 Stream Repository 尚未迁移。

## 1. 目标

将 Redis 从 `@fastgpt/service` 中完整收口到 `@fastgpt/dal`，形成以下稳定依赖：

```text
业务 API / Worker / Service
          |
          v
Redis Repository（key、TTL、codec、缓存和错误合同）
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

最终业务代码只依赖 Repository。BullMQ 等基础设施集成可以依赖 Runtime 的受限连接 factory，但不能把 raw client 传给业务。

## 2. 范围与非目标

本设计覆盖：

- 创建 `@fastgpt/dal` package 并迁移 Redis kernel。
- Redis URL、连接角色、runtime context、健康检查和优雅关闭。
- logical/physical key、legacy `keyPrefix` 和 SCAN 兼容。
- 最小 adapter、operation policy、错误和返回值校验。
- shared/pro Redis Repository 的归属和迁移。
- 全仓 Redis 业务调用方、测试、观测和 legacy 清理。

本设计不覆盖：

- MongoDB 或 Vector DB 的代码迁移。
- Redis Cluster、Sentinel、读写分离和跨实例路由。
- 大规模 key rename 或数据格式升级。
- BullMQ 业务队列重新设计。
- 为未来命令预建 capability、Lua registry 或通用 Repository 基类。

## 3. 当前问题

当前 Redis kernel、首批 shared Repository 与 pro Repository 已按所有权完成迁移，但 legacy 调用面尚未完成收口：

- Runtime 与最小 adapter 已位于 `packages/dal/redis`，并通过 package exports 限制为四个公共子路径。
- service runtime binding 仍负责读取 `serviceEnv`、注入 logger 和接管 `global.redisClient`；DAL 本身已经不依赖 service。
- shared 业务能力已迁入 `@fastgpt/dal`；pro Wecom Repository 位于 `pro/admin/src/dal` 并直接依赖 shared DAL adapter。
- legacy cache、lock、scan 和 raw client 仍与新 Repository 并存。
- 测试已删除 `global.redisRuntime`，但仍依赖迁移期 `global.redisClient` 和手写 ioredis mock。

已确认不能恢复的旧方向：公共 `string/hash/counter/stream` capability 和没有生产消费者的 script registry。Repository 是稳定业务边界，adapter 只按实际命令增长。

### 3.1 已知正确性债务

以下问题已经从生产路径推导确认，必须进入对应 Repository 的回归测试，不能在目录迁移时遗忘：

- Session 解码失败时可能把已经带 `session:` 的 key 再次格式化，实际删除 `session:session:*`；删除流程还存在未 await 重试结果的问题。
- 固定窗口限流在 `MULTI/EXEC` 返回空或异常结构时可能把计数解释为 0，不同限流入口的 Redis 故障策略也不一致。
- outLink 字符串流使用 `APPEND` 后再 `EXPIRE`，中间失败会留下无 TTL key；每个 chunk 刷新 TTL 还可能无限延长生命周期。
- System version 使用 `GET -> SET` 初始化，多实例可能生成不同版本值；wildcard 删除语义与旧注释不一致。
- Stream Resume 的 blocking connection 已进入 Runtime registry，但业务协议仍直接承担 raw Redis 返回解析，尚未形成 Repository 边界。
- legacy cache/lock/scan 仍依赖 ioredis `keyPrefix`，而 Stream、SCAN 和 `CALL` 的前缀行为不同，logical/physical key 混用风险尚未完全清零。

### 3.2 剩余 legacy 调用面

| 调用面 | 当前形式 | 后续归属 |
| --- | --- | --- |
| `common/redis/cache.ts` | 通用 get/set/del/append/incr | 按真实业务拆入 Repository，最终删除 |
| `common/redis/lock.ts` | SET NX PX + Lua | `LeaseRepository` |
| `common/cache/index.ts` | version key + scan/delete | `SystemVersionRepository` |
| 两套 frequency limit | API helper 与 system helper 各自事务 | `FixedWindowRateLimitRepository` |
| `support/user/session.ts` | hash、expire、scan | `SessionRepository` |
| `core/chat/resume.ts` | physical client + Stream 命令 | `StreamResumeRepository` |
| workflow/auxiliary stop | 通用 string cache | `WorkflowStopSignalRepository` |
| outLink stream/polling | append string、状态计数 | `OutLinkStreamRepository` |
| wallet/QPM/pending payment | 通用 cache 和直接 client | 各自专用 Repository，先冻结一致性合同 |
| BullMQ | Runtime queue/worker connection | 保留基础设施 adapter，不进入业务 Repository |

## 4. 目标目录与导出

shared：

```text
packages/dal/redis/
├── index.ts
├── adapter.ts
├── runtime/
│   ├── index.ts
│   ├── config.ts
│   ├── connection.ts
│   ├── errors.ts
│   ├── keyspace.ts
│   ├── operation.ts
│   └── validation.ts
└── repositories/
    ├── index.ts
    ├── dingtalkAccessToken.ts
    ├── teamVectorCount.ts
    └── wechatQrLogin.ts
```

pro：

```text
pro/admin/src/dal/redis/repositories/
├── index.ts
├── wecomAccessToken.ts
└── wecomSuiteTicket.ts
```

导出规则：

- `@fastgpt/dal/redis`：配置入口、health、close 和稳定错误类型。
- `@fastgpt/dal/redis/repositories`：业务 Repository。
- `@fastgpt/dal/redis/runtime`：只给 BullMQ、instrumentation 和迁移期基础设施使用。
- `@fastgpt/dal/redis/adapter`：只给 shared/pro Repository 实现和对应测试使用。
- physical key/client helper 不从 Redis 根入口导出。
- `@fastgpt/service/common/redis` 只在迁移期保留 legacy facade，不能新增调用方。

## 5. Runtime 设计

### 5.1 配置与初始化

Runtime factory 接收显式依赖：

```ts
type RedisRuntimeOptions = {
  redisUrl: string;
  logger?: RedisRuntimeLogger;
  clientFactory?: RedisClientFactory;
  existingCommandClient?: RedisClient;
};
```

`@fastgpt/dal` 不读取 `serviceEnv`。迁移期间由 service facade 绑定 `serviceEnv.REDIS_URL` 和 `LogCategories.INFRA.REDIS`；最终由 app/admin instrumentation 在初始化阶段调用 DAL 配置入口。

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
- legacy `global.redisClient` 仅在迁移 facade 中读取和清理，不进入新公共 API。

DAL-R1 已迁移 singleton 行为，并由测试覆盖热重载复用、重复 close 和配置冲突；当前唯一事实来源是 DAL runtime context。

### 5.3 连接角色

| role | 用途 | 约束 |
| --- | --- | --- |
| `legacy-command` | 未迁移调用方的 logical key 命令 | 暂时保留 `keyPrefix=fastgpt:`；physical key 禁止进入 |
| `command` | adapter 普通操作 | 无 keyPrefix；有 deadline；禁止自动重放未完成命令 |
| `blocking` | `XREAD BLOCK` | 专用连接；必须注册、限时和释放 |
| `queue` | BullMQ Queue | 连接由 Runtime 创建，对象生命周期由 BullMQ adapter 管理 |
| `worker` | BullMQ Worker | `maxRetriesPerRequest=null`；shutdown 后禁止重启 |

关闭顺序固定为：

1. 执行 before-close hook，先关闭 BullMQ Worker/Queue 对象及其内部 duplicate connection。
2. 关闭 blocking connection。
3. 关闭 worker/queue 原始 connection。
4. 关闭 command/legacy-command connection。
5. 每一步有 deadline，超时后强制 disconnect。

### 5.4 Keyspace

新代码显式构造：

```text
fastgpt:<namespace>:<version?>:<encoded-segment>...
```

规则：

- Repository 使用 logical key；adapter 内部转 physical key。
- segment 使用 RFC3986 编码，不能让 `* ? [ ] \\` 影响 SCAN glob。
- 历史 key 通过受限的 `asRedisLogicalKey` 保持格式，不对既有 segment 重新编码。
- SCAN 只返回 FastGPT keyspace 内的 logical key。
- 第一轮迁移不修改任何既有物理 key、TTL 和 value 格式。

## 6. Adapter 与错误

当前最小 adapter 仅包含：

- `get`
- `set`
- `delete`
- `iterateByPrefix`

新增命令必须和一个真实 Repository 在同一阶段进入，并补齐：

- logical -> physical key 转换。
- 输入校验。
- ioredis 返回值校验。
- command deadline。
- 是否可重试和 timeout 后结果是否未知。
- Repository 级故障合同测试。

不提供 raw `call/eval`，不允许调用方自行声明 operation 可重试。原子脚本紧邻具体 Repository 实现；只有出现真实复用后才抽取。

错误基类使用 `RedisOperationError`，至少包含 `code`、`operation`、`role`、`outcome` 和 `cause`，不包含完整 key/token。Repository 再决定 miss、回源或 fail-open/fail-closed。

## 7. Repository 合同

现有与计划中的 Repository：

| Repository | 物理 key/value | 故障与并发合同 | 状态 |
| --- | --- | --- | --- |
| `DingtalkAccessTokenRepository` | `fastgpt:cache:dataset:dingtalk:accessToken:${appKey}:${secretHash}`；token；动态 TTL | Redis fail-open；上游错误传播；进程内 single-flight | DAL-R2 已迁入 shared DAL |
| `TeamVectorCountRepository` | `fastgpt:cache:team_vector_count:${teamId}`；decimal；1800 秒 | 3 秒后回源；写/失效 best-effort | DAL-R2 已迁入 shared DAL |
| `WechatQrLoginRepository` | `fastgpt:cache:publish:wechat:qrcode:${outLinkId}:${tmbId}`；QR JSON；480 秒 | miss 返回 expired；错误和损坏数据 fail-closed | DAL-R2 已迁入 shared DAL |
| `WecomAccessTokenRepository` | provider/suite 两个历史 key；token；`expires_in - 10` 秒 | Redis/上游错误 fail-closed；不新增 single-flight | DAL-R2P 已迁入 pro DAL |
| `WecomSuiteTicketRepository` | `fastgpt:wecom:suite_ticket`；永久 string | 外部事件覆盖写入；缺失/读写错误 fail-closed | DAL-R2P 已迁入 pro DAL |
| `DailyActiveDedupeRepository` | `fastgpt:cache:dailyUserActive:${uid}_${date}`；`1`；86400 秒 | `SET NX EX`；Redis 故障 fail-open | DAL-R3C 已迁入 shared DAL |
| `SystemVersionRepository` | `fastgpt:VERSION_KEY:*`；UUID；永久 | `SET NX GET` 原子初始化；错误 fail-closed；wildcard 只删子 key | DAL-R3D 已迁入 shared DAL |
| `FixedWindowRateLimitRepository` | 现有 frequency key | 原子计数；按调用方冻结 fail-closed | 待关键能力阶段 |
| `SessionRepository` | `fastgpt:session:*` hash + TTL | 原子写/过期；损坏记录清理 | 待关键能力阶段 |
| `LeaseRepository` | `fastgpt:lock:*` | token 校验续租/释放；sandbox fail-closed | 待关键能力阶段 |
| `WorkflowStopSignalRepository` | 现有 stopping key | workflow/auxiliary 共享协议 | 待关键能力阶段 |
| `StreamResumeRepository` | `fastgpt:stream:resume:*` | blocking connection 和 memory pressure 合同 | 待流式阶段 |
| `OutLinkStreamRepository` | 现有 cache string | 原子 append+TTL；保持消费协议 | 待流式阶段 |

Repository 可以拥有 key、TTL、codec、single-flight、read-through callback 和数据访问 deadline。权限、HTTP、Mongo 业务更新、供应商 SDK 和跨 Repository 用例留在 service/project。

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

### Phase 3B2：Wecom Repository 前置迁移

- [x] pro Wecom access token 和 suite ticket Store 已实现。
- [x] provider/suite/event 调用方已迁移，业务接口保持不变。
- [x] 5 个定向测试文件共 29 项通过，相关实现覆盖率 100%。
- [x] 前置实现已由 DAL-R2P 迁入 pro DAL 并完成改名。
- [ ] DAL-R2P 待代码 review 和 pro 独立提交。

### Phase 2R：capability 收缩

- [x] capability 收缩为 `get/set/delete/iterateByPrefix` 最小 adapter。
- [x] shared/pro Store 改为注入 adapter。
- [x] 删除无生产消费者的 hash/counter/stream/atomic/script registry。
- [x] 错误命名由 capability 收缩为 operation。
- [x] 167 项唯一定向测试通过；adapter、operation 和 5 个 Store 全维度覆盖率 100%。
- [ ] 待代码 review；通过前不进入 DAL-R1。

## 9. 后续迁移阶段

每个阶段完成后停止编码，等待代码 review；review 通过后再提交并进入下一阶段。

### DAL-R0：review gate

- [x] 确认 Phase 2R 的最小 adapter 方向，不恢复 capability 或 script registry。
- [x] 确认 Phase 3B2 pro Store 的数据合同和 pro 所有权。
- [ ] Phase 2R、Phase 3B2 尚未分别提交；需与 DAL-R1 review 后的提交边界一并处理。

### DAL-R1：package 与 Redis kernel

- [x] 创建 `packages/dal`、package manifest、tsconfig 和 Vitest 配置。
- [x] 迁移 runtime/config/keyspace/errors/operation/validation/adapter 及其测试。
- [x] 注入 redis URL 和 logger，确保 DAL 对 service/project/pro 零依赖。
- [x] 建立单一进程级 DAL runtime context，兼容 Next.js 热重载。
- [x] 保留 `@fastgpt/service/common/redis` legacy facade，内部委托 DAL；未增加旧深路径转发文件。
- [x] BullMQ 统一依赖迁移期 service runtime binding，由该 binding 配置 DAL 并注册 before-close hook。
- [x] 保持现有连接角色、全局 legacy client 接管、物理 key 和行为不变。
- [x] 根测试环境通过公开 `configureRedisRuntime` 注入内存 client，不再写入 `global.redisRuntime`。
- [x] DAL 5 个文件 81 项、service 11 个文件 123 项、pro 5 个文件 29 项、app 5 个文件 34 项定向测试通过。
- [x] DAL 与 app typecheck 通过；pro 仅剩 3 个与本次 Redis 改动无关的既有类型错误。

本阶段已实现并通过 review gate，DAL-R2 已基于该 package 边界完成 shared Repository 搬迁。

### DAL-R2：shared Repository

- [x] 将 3 个 shared Store 迁入 `@fastgpt/dal/redis/repositories`。
- [x] 改名为 `DingtalkAccessTokenRepository`、`TeamVectorCountRepository`、`WechatQrLoginRepository`。
- [x] 更新所有生产和测试 import，删除 service stores 目录，不保留转发文件。
- [x] service logger 改为窄 port 注入，global `withTimeout` 改为 DAL 内部纯实现。
- [x] DAL 4 个文件 47 项、service 2 个文件 55 项、app 2 个文件 11 项定向测试通过。
- [x] 三个 Repository 的 statements/lines/functions 覆盖率均为 100%，Repository 分支合计 95%。
- [x] DAL 与 app typecheck、16 个本阶段文件的精确 ESLint、旧 shared Store 静态扫描通过。

本阶段已实现并通过 review gate，DAL-R2P 已基于该 Repository 边界完成 pro 搬迁。

### DAL-R2P：pro Repository

- [x] 在 pro 内建立 `src/dal/redis/repositories`。
- [x] 迁移并改名 Wecom Repository，直接依赖 `@fastgpt/dal` adapter。
- [x] 更新 provider、suite、event 生产调用方和对应测试。
- [x] 删除 pro service Redis Store 目录，不保留转发文件。
- [x] 5 个定向测试文件 29 项通过，两个 Repository 全维度覆盖率均为 100%。
- [x] 11 个本阶段文件精确 ESLint、旧 Store 和反向依赖静态扫描通过。
- [x] pro typecheck 未新增错误，仍只有 chatHome、chatAgentHelper、evaluation 3 个既有错误。

本阶段已实现并通过 review gate，DAL-R3C 已基于 shared DAL adapter 开始剩余 Repository 迁移。

### DAL-R3C：Daily Active Dedupe

- [x] adapter 随 Repository 加入 `setIfAbsent`，不恢复通用 string capability。
- [x] `string.setIfAbsent` 只执行一次，超时 outcome 为 unknown；严格校验 `OK | null` 返回。
- [x] 使用 `SET NX EX` 代替 `GET -> SET`，保持 UTC 日期、历史 key、值 `1` 和 86400 秒 TTL。
- [x] 保持 tracking Redis fail-open，降级时记录 warning；Mongo event 与错误传播合同不变。
- [x] DAL 3 个单元测试文件 39 项、service 1 个文件 4 项定向测试通过。
- [x] `DailyActiveDedupeRepository` statements/branches/functions/lines 均为 100%。
- [x] Redis 7.2.14 integration test 通过，64 个并发请求只有 1 个获得首次声明结果。
- [x] DAL 与 app typecheck、10 个本阶段文件精确 ESLint、legacy cache 引用扫描通过。

本阶段已实现并通过 review gate，DAL-R3D 已继续迁移 System Version。

### DAL-R3D：System Version

- [x] adapter 新增 Repository 驱动的 `getOrSet` 与 `deleteMany`，不恢复 capability 层。
- [x] adapter 数字参数使用 Zod `safeParse` 严格校验，不做 coercion，并统一映射为稳定的 `RedisInvalidArgumentError`。
- [x] Runtime config 使用 Zod 校验原始 URL 和派生字段，不做 coercion，并保持 `RedisConfigurationError` 合同。
- [x] `string.getOrSet` 使用单条 `SET NX GET`，只执行一次，超时 outcome 为 unknown。
- [x] `string.deleteMany` 是无返回值依赖的幂等删除，瞬时错误允许重试一次并严格校验删除数量。
- [x] 新增 `SystemVersionRepository`，保持历史 base/child key、UUID value 和永久 TTL。
- [x] `id='*'` 完成全部 SCAN 页后用单条 multi-key `DEL` 删除子 key，base key 与相邻前缀不受影响。
- [x] service cache facade 不再依赖 raw Redis、legacy scan 或物理 key，API 与进程内缓存行为保持不变。
- [x] DAL 6 个精确单测文件 108 项、service 1 个文件 16 项通过；`SystemVersionRepository`、numeric validation 与 config 全维度覆盖率 100%。
- [x] Redis 7.2.14 integration 2 项通过：64 并发初始化只得到一个永久版本，512 个子 key 经多页 SCAN 后全部删除。
- [x] DAL 与 app typecheck、15 个相关文件精确 ESLint、legacy System Version Redis 引用扫描通过。

本阶段已实现，等待代码 review；本轮未运行全量测试，也未开始后续 Repository 子阶段。

### DAL-R4A：Fixed Window Rate Limit 与 Team QPM

- `FixedWindowRateLimitRepository` 使用 `frequency:${type}:${scope}` logical key，保持 `fastgpt:` 物理前缀；窗口首次请求通过 `INCR + EXPIRE NX` 建立，随后由同一事务读取 `TTL`。
- adapter 对 `MULTI/EXEC` 做完整结构校验：必须有 `INCR`、`EXPIRE`、`TTL` 三个结果，计数和 TTL 必须为非负/有效整数；`null`、空数组、错误 tuple 或非法数字均转换为稳定 Redis 错误，不能 allow。
- Repository 输出 `allowed/currentCount/remaining/ttlSeconds/resetAt`；`limit` 与 `windowSeconds` 采用正安全整数校验。
- service 的认证限流和 Team QPM 限流统一 fail-closed；Redis 错误由 service 记录并映射到现有业务拒绝行为。
- `TeamQpmRepository` 仅迁移 `cache:team_qpm_limit:${teamId}` 的读写删除与 3600 秒 TTL；套餐回源、默认 `CHAT_MAX_QPM` 和 Mongo 查询留在 wallet service。
- 不在本阶段迁移 Mongo `authFrequencyLimit`、Team Point、Pending Payment；不新增通用 capability 或 raw Redis 公共入口。

### DAL-R4：关键一致性 Repository

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

本阶段已实现并通过定向验证，等待代码 review；Redis 7.2 integration 已编写但因未配置 `REDIS_INTEGRATION_URL` 跳过。

### DAL-R4C：Pending Payment 协调状态

- 当前生产 Redis 状态仅是企业微信每团队一个待支付订单号：`wecom:pending_order:${teamId}`，物理 key 保持 `fastgpt:wecom:pending_order:${teamId}`。
- value 仍为企微 `orderId` 字符串，TTL 保持 7 天；Repository 通过 shared adapter 显式添加物理前缀，不经过 legacy command client。
- 创建企微订单前读取并取消旧订单，创建成功后写入新订单号；支付成功回调清理该指针。Mongo 账单和企微回调仍是事实来源。
- Redis 读取错误按 miss/fail-open，写入和清理错误 best-effort 记录 OTel error；不把普通微信/支付宝定时查单改造成 Redis claim/lease。
- 本阶段不实现 worker claim、租约续期、回调幂等状态机或支付结果缓存，后续若确有多 worker 协调需求另行冻结合同。

本阶段已实现，等待代码 review；Session、Lease、Stop Signal 和 Stream 仍未开始。

### DAL-R4D：Session Repository

- 保持 `session:${sessionId}` logical key、`fastgpt:session:${sessionId}` 物理 key、`userId/teamId/tmbId/isRoot/createdAt/ip` hash 协议和 7 天 TTL。
- adapter 新增真实 Repository 驱动的 hash 读写：hash 写入与 `EXPIRE` 在单个 `MULTI/EXEC` 中完成；hash 读取严格校验 Redis 返回结构。
- `SessionRepository.get` 对 miss、字段缺失、非法布尔/时间值返回 `undefined`；损坏记录尝试删除并记录错误；Redis 读错误向上抛出，认证入口保持 fail-closed。
- 用户扫描只通过 logical prefix 返回 typed session records；批量注销在 Repository 内构造 key，白名单按 session ID 比较，修复历史 `session:session:*` 删除漏洞。
- 登录数限制仍由 service 读取 `MAX_LOGIN_SESSION`，Repository 只负责扫描、解码和批量删除；后台清理失败记录 warning，不阻断新 session。

本阶段已实现并通过定向验证，当前停在代码 review；Lease、Stop Signal 和 Stream 仍未开始。

### DAL-R4E：Lease Repository

- 当前只迁移 Agent Sandbox 初始化锁，Mongo `timerLock` 保持原实现，不混入 Redis Lease。
- 保持 logical key `lock:${key}`、物理 key `fastgpt:lock:${key}`、随机 token value 和毫秒 TTL；获取使用 `SET NX PX`。
- 续租和释放由 DAL adapter 内部执行 token 校验脚本并严格校验 `0/1` 返回；service 不再获取 Redis client、调用 `eval` 或拼物理 key。
- 获取失败、获取异常和租约丢失继续 fail-closed；释放为 best-effort，不能删除 token 不匹配的后续持有者租约。
- 保留 `RedisLeaseUnavailableError`、`RedisLeaseLostError`、`RedisLeaseAcquireError` 语义及 Agent Sandbox 的初始化错误映射。

本阶段已实现并通过定向验证，当前停在代码 review；Stop Signal 和 Stream 仍未开始。

### DAL-R5：流式 Repository

- Stream Resume 的业务协议和 blocking 生命周期。
- Wechat/Wecom outLink stream 的原子 append+TTL。
- Wechat polling failure counter 的多 worker 竞态修复。
- 第一轮保持现有字符串消费协议，不顺带改为 Redis Stream。

### DAL-R6：清理与上线治理

- 删除 service Redis facade、legacy cache/lock/scan 和 `global.redisClient`。
- 生产代码除 DAL/BullMQ integration 外清零 ioredis、raw call 和 physical key。
- 补齐 metrics、进程 shutdown hook、故障演练和 Redis 7.2 integration test。
- 局部测试通过后最后运行全量测试。

## 10. Tasks

### 架构与 package

- [x] D-01：确认 package 名为 `@fastgpt/dal`。
- [x] D-02：确认 DAL 包含数据基础设施和持久化业务 Repository。
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
- [ ] R-06：增加真实 Redis 7.2 的 key、SCAN、Lua、Stream 和并发测试。
- [ ] R-07：接入进程级 shutdown hook 和 metrics。

### Repository

- [x] P-01：Dingtalk、Team Vector Count、Wechat QR Store 前置实现。
- [x] P-02：pro Wecom Store 前置实现，已由 DAL-R2P 迁移吸收。
- [x] P-03（DAL-R2）：迁移/改名 shared Repository。
- [x] P-04（DAL-R2P）：迁移/改名 pro Repository。
- [x] P-05（DAL-R3C）：Daily Active Dedupe。
- [x] P-06（DAL-R3D）：System Version。
- [x] P-07A（DAL-R4A）：Fixed Window Rate Limit 与 Team QPM。
- [x] P-07B（DAL-R4B）：Team Point cache 与双 key 一致性。
- [x] P-07C（DAL-R4C）：Pending Payment 协调状态。
- [ ] P-08：Session、Lease、Stop Signal。
- [x] P-08A（DAL-R4D）：Session Repository。
- [x] P-08B（DAL-R4E）：Lease Repository 与 Agent Sandbox 初始化锁。
- [ ] P-09：Stream Resume、OutLink Stream、polling counter。

### 测试与清理

- [x] T-01：Phase 1/2/3A/3B1 定向测试。
- [x] T-02：Phase 2R 共 167 项唯一定向测试和关键模块 100% 覆盖率。
- [x] T-03：Phase 3B2 共 29 项定向测试和相关实现 100% 覆盖率。
- [x] T-04（DAL-R1）：DAL kernel/facade/BullMQ/health/resume 定向测试。
- [x] T-05（DAL-R2）：shared Repository 和调用方定向测试。
- [x] T-05P（DAL-R2P）：pro Repository 和调用方定向测试。
- [x] T-05C（DAL-R3C）：Daily Active 单元测试与 Redis 7.2 并发 integration test。
- [x] T-05D（DAL-R3D）：System Version 单元测试与 Redis 7.2 并发/SCAN integration test。
- [x] T-05A（DAL-R4A）：限流 adapter/Repository、service 调用方与 Redis 7.2 并发 integration test（integration 因环境变量缺失跳过）。
- [x] T-05B（DAL-R4B）：Team Point adapter/Repository、wallet 调用方与 Redis 7.2 一致性 integration test（integration 因环境变量缺失跳过）。
- [x] T-05C（DAL-R4C）：企微 Pending Payment Repository、创建订单/支付回调调用方与 pro 定向测试。
- [x] T-05E（DAL-R4D）：Session adapter/Repository、认证与注销调用方定向测试。
- [x] T-05F（DAL-R4E）：Lease adapter/Repository 与 Agent Sandbox 调用方定向测试。
- [ ] T-06：静态扫描禁止新增 raw client、service Redis adapter 和旧 Store import。
- [ ] T-07：最终删除 legacy mock/入口并运行全量测试。

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
- shared Redis Runtime、adapter、Repository 全部归属 DAL。
- pro Repository 保留 pro 所有权并依赖 shared DAL。
- 业务只依赖 Repository，不拼 key、不选择 Redis 命令、不获得 raw client。
- 迁移前后物理 key、TTL、value 和已冻结的故障合同兼容。
- 非幂等操作没有隐式重放，timeout 的 unknown outcome 可识别。
- BullMQ duplicate、blocking connection 和普通 command 都能有序限时关闭。
- capability registry、通用 Cache/Repository 基类和无消费者预制能力不再出现。
- 最终清零 `getGlobalRedisConnection`、业务层 ioredis 和 service Redis facade。

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
