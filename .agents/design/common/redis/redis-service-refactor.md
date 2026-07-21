# Redis 中间件服务重构讨论稿

> 状态：Phase 1 已完成并通过代码 review；Phase 2 尚未开始。
>
> 目标：先统一 Redis 的连接、key、原子操作、错误策略和业务能力边界，再决定是否分阶段迁移。本文基于当前仓库代码梳理，不代表已经批准的实现方案。

## 1. 结论先行

当前问题不是“Redis 工具函数太少”，而是四个层次混在一起：

1. ioredis 连接创建、重连、全局缓存和 BullMQ 连接配置混在一个 `index.ts`。
2. 通用命令封装与业务状态语义混在一起，业务代码可以直接拿到客户端并自行拼 key、选命令、定 TTL、吞错误。
3. 多个业务重复实现相同能力：固定窗口限流、字符串缓存、token 缓存、停止标记、流式结果缓存。
4. 重试、离线队列和原子性没有按命令语义治理，网络超时可能重放非幂等写操作。

建议采用“一个运行时、少量原子基础能力、多个业务仓储”的结构：

```text
业务 service / API
        |
        v
业务 Redis Store（Session、StreamResume、RateLimit、Lease、TokenCache ...）
        |
        v
窄接口的 Redis capability（string/hash/stream/scan/script）
        |
        v
Redis Runtime（配置、连接角色、keyspace、重试、超时、健康、关闭）
        |
        +--> ioredis command / blocking client
        +--> BullMQ queue / worker connection
```

业务层不再依赖 `getGlobalRedisConnection()`，也不允许把 ioredis client 作为公共 API 暴露。BullMQ 仍然保留自己的连接对象，但只能通过 Redis Runtime 的 `queue` / `worker` 角色创建。

## 2. 范围与非目标

### 2.1 本次重构范围

- Redis URL 解析、连接选项、重连、健康状态和优雅关闭。
- 全局 client、队列 client、worker client、阻塞读取 client 的角色边界。
- key 前缀、命名空间、key 构造、扫描和物理 key 兼容策略。
- 缓存、hash、计数器、固定窗口限流、租约、Redis Stream、Lua script 的基础能力。
- 当前所有 Redis 业务调用方的迁移入口和错误/降级策略。
- 单测 mock、Redis 7.2 集成测试、指标和日志。

### 2.2 暂不纳入

- Redis Cluster、Sentinel、读写分离和跨 Redis 实例路由；第一阶段按当前 standalone Redis 7.2 部署设计，但保留 Runtime 扩展点。
- 把 Mongo、S3 或 BullMQ 业务本身重新设计。
- 通过大规模 key rename 迁移历史数据；推荐保持现有物理 key，减少回滚风险。
- 让通用 Redis 层自动猜测业务降级策略；降级必须由业务 capability 声明。

## 3. 当前调用面清单

| 能力/位置 | 当前方式 | 当前 key/命令 | 主要问题 |
| --- | --- | --- | --- |
| `common/redis/index.ts` | `global.redisClient`、new Queue/Worker client | `keyPrefix=fastgpt:`；`SCAN` | 无统一生命周期；解析失败静默回退；日志可能带密码；原始 client 外泄 |
| `common/redis/cache.ts` | 通用 `get/set/del/append/incr` | `cache:*` | TTL 与序列化不成约定；`APPEND`、`INCRBYFLOAT` 被通用重试；append 与 expire 非原子 |
| `common/redis/lock.ts` | SET NX PX + Lua 续租/释放 | `lock:*` | 能力相对完整，但依赖全局 client；脚本、超时、连接角色未集中治理 |
| `common/cache/index.ts` | 版本 key + 进程内对象缓存 | `VERSION_KEY:*` | `GET -> SET` 初始化有竞态；扫描和删除依赖 keyPrefix 细节 |
| `common/api/frequencyLimit.ts` | 业务 API 内部 `MULTI INCR EXPIRE` | `frequency:*` | 与 enterprise auth 另有一套实现；直接写 HTTP 响应，基础能力不可复用 |
| `common/system/frequencyLimit/redisFixedWindow.ts` | 独立固定窗口 helper | 调用方传入完整 key | 计数返回信息不足；故障策略未声明 |
| `support/user/session.ts` | hash + expire + scan | `session:*` | `HMSET` 与 `EXPIRE` 非原子；删除/白名单比较容易混淆逻辑 key 与物理 key |
| `core/chat/resume.ts` | 直接 `CALL XADD/XRANGE/XREAD`、`duplicate()` | `stream:resume:*` | 手工拼物理前缀；阻塞连接未纳入连接注册；业务承担 Redis 协议解析 |
| workflow stop / auxiliary stop | 直接 string get/set/del | `agent_runtime_stopping:*` | 两个模块共享隐式协议，错误时静默返回 false |
| sandbox init | `withRedisLease` | `lock:agent-sandbox:init:*` | 调用方理解 Redis 锁错误类型和映射，边界可保留但应移入 capability |
| outLink stream | `APPEND` 字符串 + expire | `cache:*` | 非幂等重试可重复片段；重置、结束标记和 TTL 都是隐式协议 |
| Dingtalk/Wecom/Wechat | 直接 string cache | 多种业务前缀 | token、二维码、订单缓存重复写法；无统一单飞/TTL 约定 |
| wallet/vector/tracks | 依赖 `cache.ts` | 多种业务 key | 缓存失效、计数、source of truth 和 Redis 故障语义不一致 |
| BullMQ | 每个 queue/worker 各自创建连接 | BullMQ 自有 key 前缀 | 连接数量与关闭不可观测；与普通 Redis 运行时配置重复 |

测试还维护了一套手写 Redis mock。mock 只覆盖部分命令，不能真实模拟 keyPrefix、Stream、Lua、并发和 TTL 边界，导致“测试通过但生产 Redis 语义不同”的风险。

### 3.1 已确认的具体正确性问题

这些不是抽象架构担忧，而是当前代码路径可以直接推导出的行为问题，迁移时应纳入回归测试：

- `support/user/session.ts` 在 Session 解码失败时把已经带 `session:` 前缀的 `formatKey` 再传给 `delSession`，清理目标会变成 `session:session:...`，损坏记录可能残留。
- 同一文件的 `delSession` 没有 `await` 返回的 `retryFn`，调用方无法知道删除是否完成，重试失败还可能脱离主流程。
- `common/system/frequencyLimit/redisFixedWindow.ts` 在 `MULTI/EXEC` 返回空或异常结构时把计数当作 0，默认放行；它与 `common/api/frequencyLimit.ts` 的故障行为并不一致。
- `common/redis/cache.ts` 的 `appendRedisCache` 每个 chunk 都重新设置 TTL；长流只要持续有数据就会持续延长生命周期，而且 append 与 expire 之间存在无 TTL 窗口。
- `core/chat/resume.ts` 通过 `redis.duplicate()` 为每个阻塞恢复请求创建连接，当前没有并发上限、registry 计数或统一关闭入口。
- `core/chat/resume.ts`、`common/cache/index.ts` 等路径直接使用 `CALL` 或 pipeline，调用方必须自己知道 ioredis `keyPrefix` 何时生效，极易出现逻辑 key/物理 key 混用。
- `dailyUserActive` 等业务先 `GET` 再 `SET`，在多实例并发登录时不是一次性去重写入；这会放大统计重复问题。

## 4. 必须先解决的风险

### 4.1 配置与连接风险

- `REDIS_URL` 解析失败或协议不支持时回退到默认地址，可能连接到错误实例；应在启动阶段 fail-fast。
- 日志中的 `redisUrl` 可能包含 username/password；必须只记录 host、port、db、tls 和角色，不记录凭据。
- 当前 global、queue、worker 连接没有统一 registry，无法统计连接数量、关闭连接或判断哪个角色故障。
- `enableOfflineQueue=true` 与无限重连会让请求在 Redis 故障时长时间悬挂；HTTP 命令、队列生产和阻塞读取需要不同策略。
- `global.redisClient` 只适合 Next 开发热加载兼容，不应成为业务层契约。

### 4.2 key 与协议风险

- `keyPrefix` 对 `SCAN`、`CALL`、Pipeline 的行为容易被误读；当前代码因此手动拼 `fastgpt:`，形成物理 key 和逻辑 key 双轨。
- 业务 key 大多是裸字符串，缺少 namespace、版本和 segment 约束，新增调用很容易碰撞。
- `getAllKeysByPrefix` 只支持固定模式，且调用方需要知道它返回逻辑 key 还是物理 key。
- 现有 key 已被历史数据和多实例使用，直接改名会导致会话、缓存、流恢复和停止信号失效。

### 4.3 原子性与重试风险

- `retryFn` 包裹 `INCRBYFLOAT`、`APPEND` 等非幂等命令；响应超时但服务端已成功时，重试会重复增加或重复追加。
- `APPEND` 后再 `EXPIRE` 不是一个原子操作，中途故障会留下无 TTL key。
- Session 的 `HMSET` 后 `EXPIRE` 不是原子操作。
- Version key 的首次 `GET` 后 `SET` 存在并发生成不同版本值的竞态。
- daily active 等“先读后写”的去重逻辑不是 `SET NX`，多实例下会重复记录。
- 限流实现重复，且 Redis 命令失败时是否放行/拒绝由不同调用方隐式决定。

### 4.4 故障语义风险

Redis 不同用途不能共享一个“全部重试/全部吞错”策略。至少要区分：

| 能力 | 建议默认策略 | 原因 |
| --- | --- | --- |
| Session/auth | fail-closed | 不能在无法验证会话时放行 |
| Distributed lease | fail-closed | 不能在拿不到锁时无锁执行 |
| BullMQ enqueue/worker | fail-closed + 明确错误 | 丢任务比同步报告失败更危险 |
| 钱包/计费额度缓存 | 优先回源；无回源则 fail-closed | 不能把缓存故障变成超额消费 |
| QPM/enterprise auth 限流 | 默认 fail-closed，可按业务显式选择 | 防止限流失效导致成本和风控失守 |
| workflow stop signal | fail-open（继续执行）但记录 degraded 指标 | Redis 故障不能把所有请求永久阻塞 |
| stream resume mirror / outLink stream | fail-open，主响应继续 | 镜像是增强能力，不是主结果来源 |
| tracking/daily dedupe | fail-open | 统计重复的代价低于阻塞主业务 |
| 普通可回源 cache | miss + 回源 | Redis 只承担加速，不承担事实来源 |

上述是推荐默认值；涉及钱包、限流、认证的最终策略需要产品/运维确认。

## 5. 目标设计

### 5.1 Redis Runtime

建议新增 `packages/service/common/redis/runtime/`，职责只包括连接基础设施：

- `config.ts`：解析并校验 standalone Redis URL、Unix socket、`redis`/`rediss` 协议、db、端口和 TLS；query/hash（包括空值）直接拒绝，TLS/family 不允许从 URL query 传入。
- `connection.ts`：按 `legacy-command`、`command`、`blocking`、`queue`、`worker` 创建连接，维护 registry、状态事件、健康检查和有序限时关闭。
- `keyspace.ts`：显式构造物理 key，返回带类型的 `RedisKey`；新 segment 使用 RFC3986 编码，SCAN 对历史 key 的 glob 字符额外转义。
- `errors.ts`：把连接、超时、命令失败、不可用和 lease 错误映射为稳定错误类型。
- `metrics.ts`：按 role、capability、operation 记录延迟、错误、重试、连接数和降级次数，禁止把完整 key/token 写入指标。

连接角色建议如下：

| role | 用途 | 建议特性 |
| --- | --- | --- |
| `legacy-command` | 未迁移业务的逻辑 key 命令 | Phase 1 暂时保留 `keyPrefix=fastgpt:`；禁止物理 key 进入该 client |
| `command` | physical capability 的普通读写、脚本 | 无 `keyPrefix`；有界 command timeout；只对幂等操作做有限重试 |
| `blocking` | stream `XREAD BLOCK` | `maxRetriesPerRequest=null`；每个阻塞请求使用受 registry 管理的 duplicate/pool；必须有上限和关闭流程 |
| `queue` | BullMQ Queue/producer | 复用连接配置但不复用业务 client；队列 namespace 由 BullMQ 管理 |
| `worker` | BullMQ Worker | 保留 BullMQ 要求的 `maxRetriesPerRequest=null`；worker 重启由 BullMQ adapter 管理 |

Runtime 最终只对外暴露稳定 capability。Phase 1 的公共 Redis 入口只保留 deprecated legacy client 和基础设施 factory；physical command 与 keyspace helper 不从公共入口导出。

### 5.2 Keyspace 与兼容策略

推荐移除业务侧对 ioredis `keyPrefix` 的依赖，由 `keyspace` 显式构造：

```text
fastgpt:<namespace>:<version?>:<segment>...
```

迁移第一阶段保留当前物理 key：

- `cache:*`、`session:*`、`VERSION_KEY:*`、`lock:*`、`frequency:*`、`stream:resume:*` 等逻辑前缀不改名。
- `RedisKey` 统一在 Runtime 里加 `fastgpt:`，扫描返回逻辑 key，删除只能接受 `RedisKey`。
- Redis Stream 使用 typed `xadd/xrange/xread`，不再由业务自己手工拼 `FASTGPT_REDIS_PREFIX`。
- BullMQ 不强行套 `fastgpt:`，而是显式设置 BullMQ 自己的 `prefix`/namespace，避免污染业务 key。
- 新增或需要变更数据格式时使用 `v2` namespace，禁止在同一个 key 上无版本混写。

这样可以直接回滚代码，不需要双写所有历史 key，也不会因为 keyPrefix 细节不同而误删数据。

### 5.3 窄接口 capability，而不是万能 RedisService

不建议建立一个包含几十个 ioredis 方法的 `RedisService`。建议只提供业务确实需要的 capability：

- `StringStore`：`get`、`set`、`setIfAbsent`、`delete`、`getTtl`。
- `HashStore`：批量写字段、读对象、删除对象，写入和 TTL 可通过 transaction/script 一次完成。
- `CounterStore`：`increment`、`incrementFloat`，明确是否允许重试和是否需要 TTL。
- `ScanStore`：按 namespace 迭代逻辑 key，内部使用 `SCAN` 和批量 `UNLINK/DEL`。
- `StreamStore`：`append`、`readRange`、`readBlocking`、`trim/expire`，内部负责 Redis Stream 字段协议。
- `ScriptRegistry`：只允许登记有测试、有命名、有参数约束的 Lua script；禁止业务随意 `eval`。

业务能力再基于这些 capability 组织：

| 业务 Store | 负责的语义 |
| --- | --- |
| `SessionStore` | Session hash、TTL、用户会话扫描/清理、字段解码 |
| `SystemVersionStore` | 版本初始化、刷新、按前缀失效，保证首次初始化原子 |
| `FixedWindowRateLimiter` | 窗口计数、首次设置 TTL、当前值/剩余/重置时间；不写 HTTP response |
| `LeaseService` | 获取、续租、释放、丢锁错误和故障策略 |
| `WorkflowStopSignalStore` | workflow 与 auxiliary generation 共享同一停止协议 |
| `StreamResumeStore` | 聊天恢复镜像、memory pressure 保护、blocking read 生命周期 |
| `OutLinkStreamStore` | Wechat/Wecom 长轮询结果、reset/end 标记和原子 TTL |
| `TokenCache` | Dingtalk/Wecom/provider/suite/二维码等短字符串及 TTL |
| `TeamCacheStore` | vector count、wallet points、QPM 配置等可回源缓存 |

业务层只依赖对应 Store 的 type，不需要知道 Redis 命令、前缀或 serializer。

### 5.4 原子操作与重试规则

| 现状 | 目标操作 |
| --- | --- |
| hash 写入后单独 expire | `MULTI HSET EXPIRE EXEC` 或命名 Lua script |
| append 后单独 expire | 一个脚本完成 append + 仅必要时设置/刷新 TTL |
| version `GET -> SET` | `SET NX`，未成功时读取已有值 |
| daily dedupe `GET -> SET` | `SET NX EX`，返回是否首次写入 |
| 固定窗口 `INCR + EXPIRE NX` | capability 内统一实现并返回结构化结果 |
| 非幂等写操作套通用 retry | 默认不重试；必须提供 operation id/idempotency key 才能安全重试 |
| GET/SET/DEL 等有限重试 | 由 operation policy 显式声明次数和超时，不能隐式调用全局 `retryFn` |

连接重连是连接层职责，命令重试是 capability 职责，业务不再自行套 `retryFn`。

### 5.5 错误和降级协议

每个 Store 的方法要写清楚：返回 miss、抛出哪一类错误、是否允许 degraded。建议错误最少包含 `code`、`operation`、`role` 和 `cause`，不包含完整 token 或敏感 key。

业务 API 负责把 capability 错误映射为自己的业务错误；Redis 层不依赖 HTTP response、全局错误码或 Next.js 类型。

### 5.6 可观测性和生命周期

- 启动时由 instrumentation 显式执行 Redis health check，并根据启动策略决定是否阻断启动。
- 所有连接进入 registry，记录 role、createdAt、state、lastErrorAt；关闭时先通过 hook 关闭 BullMQ Worker/Queue，再按 blocking -> worker/queue -> command/legacy-command 顺序关闭 Runtime 连接，每一步都有 deadline。
- blocking client 在 HTTP close/abort、超时、正常结束、异常结束时都释放；连接数有上限告警。
- 日志采用 `LogCategories.INFRA.REDIS`，稳定消息 + 结构化字段；key 只记录 namespace、hash 或截断值。
- 指标至少包括：命令耗时/错误、重试次数、连接状态、缓存 hit/miss、限流拒绝、lease contention/lost、stream mirror degraded、blocking client 数。

## 6. 分阶段迁移设计

迁移以“物理 key 不变、每阶段可回滚”为约束。旧函数不作为长期兼容层；每迁移一组调用方就直接修改引用，确认无生产引用后删除旧导出。

### Phase 0：合同冻结与基线

- 固定当前 key 清单、TTL、序列化格式、错误/降级行为和 BullMQ namespace。
- 记录每类能力的调用量、P95、Redis error、连接数量基线。
- 给所有直接 client 调用建立清单，加入禁止新增 raw client 的检查。

### Phase 1：Runtime 与 Keyspace

- 实现 URL/config 校验、role factory、registry、health、close 和脱敏日志。
- 实现显式 `RedisKey`/namespace/scan，保留旧物理 key。
- 让 BullMQ 只依赖 `queue`/`worker` factory。
- 暂时保留旧业务封装，但禁止新代码引用 `getGlobalRedisConnection()`。

当前实施状态（2026-07-21）：

- [x] Runtime、严格 URL parser、role factory、registry、health、close API 已实现。
- [x] `legacy-command`（保留 `keyPrefix`）与无前缀 physical `command` 已拆分；公共 Redis 入口不再导出物理 key helper。
- [x] typed keyspace、RFC3986 segment 编码、glob 安全 SCAN pattern 和兼容 SCAN 已实现，现有物理 key 未变化。
- [x] BullMQ 已切换到 Runtime 的 queue/worker connection factory，并通过 before-close hook 先关闭 Queue/Worker，禁止 shutdown 期间自动重启。
- [x] BullMQ Queue/Worker pool、生命周期和 shutdown Promise 已收拢到单一进程级 context，并在 Next.js 热重载时复用。
- [x] Runtime close 已实现 blocking -> worker/queue -> command 的有序关闭、deadline、重复 close 幂等和遗留 global client 清理。
- [x] Stream Resume 的 `XADD/XRANGE/XREAD` 已切换到 physical command/blocking port，blocking client 纳入 Runtime registry。
- [x] app/admin instrumentation 已接入 Redis health check；健康检查具有独立 deadline。
- [x] 补充 Runtime、keyspace、scan、BullMQ、App health 和 Stream Resume 回归测试。
- [x] Phase 1 本轮修复已通过代码 review，可以在独立提交后进入 Phase 2。

Phase 1 为兼容未迁移的业务调用，legacy command client 仍保留 ioredis `keyPrefix`，但只从 `getGlobalRedisConnection()` 这个 legacy 入口获取。显式物理 key 只能在 Runtime 内部 physical port/capability 中使用，不能从公共 Redis 入口构造或传给 legacy client。后续业务 Store 迁移完成后再移除 legacy client，最终清理发生在 Phase 6。进程级 signal/shutdown hook 尚未接入，保留在 T-22b；显式调用 `closeRedisConnections()` 时的 BullMQ/Runtime 生命周期已经闭环。

### Phase 2：基础 capability 与 script registry

- 实现 string/hash/counter/scan/stream 的最小窄接口。
- 把 append+TTL、session hash+TTL、version init、lease renew/release 迁移为命名脚本或 transaction。
- 加入 operation policy，删除 Redis capability 内部对非幂等写的通用重试。

### Phase 3：低风险业务迁移

按风险从低到高迁移：

1. Dingtalk/Wecom/provider/suite/Wechat QR/token/pending order `TokenCache`。
2. vector count、tracking、普通 wallet cache `TeamCacheStore`。
3. `SystemVersionStore` 和 common cache。

每组迁移都保留原有物理 key，先做等价行为测试，再删除旧 cache helper 的调用。

### Phase 4：关键一致性能力

- 合并两套固定窗口限流为 `FixedWindowRateLimiter`，API 层只负责响应头和错误映射。
- 迁移 `SessionStore`，补充 session hash+TTL、并发创建、扫描清理和损坏数据测试。
- 迁移 `LeaseService`，保持 sandbox 的 fail-closed 语义和现有业务错误映射。
- 迁移 workflow/auxiliary 共用的 `WorkflowStopSignalStore`。

### Phase 5：流式能力

- 迁移 `StreamResumeStore`，消除手工 raw prefix 和业务层 `CALL`。
- 将 memory pressure、stale cleanup、blocking connection 的生命周期纳入 Store/Runtime。
- 迁移 Wechat/Wecom outLink stream；第一阶段保留字符串物理格式，用原子 append+TTL；不要同时改变消费协议。

### Phase 6：删除旧入口与上线治理

- 生产代码中除 Runtime/BullMQ adapter 外不再出现 `getGlobalRedisConnection`、`new Redis`、`redis.call`。
- 删除 `common/redis/cache.ts` 的泛化导出、全局 `redisClient` 类型和重复 mock；更新所有测试 import。
- 开启连接/命令/降级指标，完成灰度、故障演练和回滚检查。

## 7. Tasks（讨论通过后执行）

以下 tasks 是整体实现清单；已完成项反映当前 Phase 1 状态，未完成项不是本轮实现承诺。

### 需求与合同

- [ ] R-01：确认 standalone Redis 7.2 为第一阶段唯一支持拓扑，记录未来 Cluster/Sentinel 扩展边界。
- [ ] R-02：导出全仓 Redis key/TTL/serializer/调用方清单，建立物理 key 兼容表。
- [ ] R-03：逐项确认 session、计费缓存、限流、停止信号、stream mirror、tracking 的 fail-open/fail-closed 策略。
- [x] R-04：确认迁移期间保留 legacy `keyPrefix`，新增 physical port 隔离；BullMQ namespace 本阶段保持不变。

### Runtime 与基础能力

- [x] T-01：实现 Redis URL schema/parser，非法协议、非法 db、非法 TLS 参数直接失败，日志脱敏。
- [x] T-02：实现 legacy-command/command/blocking/queue/worker role factory、连接 registry、状态事件和有序 close API。
- [ ] T-03：实现 command timeout、offline queue、max retries 的 role policy，并定义可重试 operation allowlist。
- [x] T-04：实现 typed keyspace、namespace、逻辑/物理 key 转换、RFC3986 segment 编码和安全 scan iterator。
- [ ] T-05：实现 string/hash/counter/scan/stream 窄接口，禁止公共入口暴露 ioredis client。
- [ ] T-06：实现 script registry，补充 append+TTL、hash+TTL、version init、lease scripts 的参数和返回值校验。

### 业务迁移

- [ ] T-07：实现 `TokenCache`，迁移 Dingtalk/Wecom/provider/suite/二维码/订单缓存。
- [ ] T-08：实现 `TeamCacheStore`，迁移 vector、wallet、tracking 的可回源缓存。
- [ ] T-09：实现 `SystemVersionStore`，修复首次初始化竞态和批量失效扫描。
- [ ] T-10：实现并接入统一 `FixedWindowRateLimiter`，删除重复限流事务代码。
- [ ] T-11：实现 `SessionStore`，保持 hash 字段兼容并修复 hash+TTL 非原子写。
- [ ] T-12：实现 `LeaseService`，迁移 sandbox 并保持 fail-closed 和错误映射。
- [ ] T-13：实现 `WorkflowStopSignalStore`，迁移 workflow 与 auxiliary generation。
- [ ] T-14：实现 `StreamResumeStore`，在 Phase 1 physical port 迁移基础上继续收口业务协议和故障策略。
- [ ] T-15：实现 `OutLinkStreamStore`，保持 Wechat/Wecom 消费协议兼容并修复 append 重放风险。
- [x] T-16：改造 BullMQ adapter，只从 Runtime 获取 queue/worker connection，注册 before-close hook，关闭对象池并禁止 shutdown 重启。

### 测试、观测与清理

- [ ] T-17：为每个 capability 编写注入式 unit test，覆盖返回值、错误类型、TTL 和降级策略。
- [ ] T-18：新增 Redis 7.2 integration test，覆盖真实 keyPrefix 替代、SCAN、Lua、Stream、hash TTL、并发限流和租约竞争。
- [ ] T-19：新增连接故障/超时/恢复测试，验证非幂等写不被无条件重试、blocking connection 会释放。
- [ ] T-20：升级 test mock 或将业务测试改为 capability fake，禁止继续扩大手写 ioredis mock。
- [ ] T-21：补充 Redis metrics/logging，验证敏感信息不出现在日志和指标。
- [x] T-22a：接入 app/admin instrumentation 的 Redis health check，并使用独立 timeout。
- [ ] T-22b：接入进程级 graceful shutdown hook，确保框架退出路径调用 `closeRedisConnections()`。
- [ ] T-23：全仓静态检查 raw Redis import、`new Redis`、`redis.call`、`getGlobalRedisConnection` 的残留。
- [ ] T-24：删除旧入口、旧类型声明和无调用的兼容代码，运行 service/app/admin 局部测试后再跑完整测试。

## 8. 验收标准

- 非法 `REDIS_URL` 不会静默连接默认实例，日志不含密码/token。
- 普通业务不能直接获得 ioredis client；只有 Runtime 和 BullMQ adapter 能创建连接。
- key 构造、扫描、删除、Stream 读写不再依赖隐式 `keyPrefix` 或手工物理前缀。
- hash+TTL、append+TTL、version init、限流窗口和 lease 脚本在真实 Redis 上具备原子性测试。
- 非幂等命令不会被通用 retry 重放；幂等重试有明确上限、超时和指标。
- session、lease、queue、限流的故障策略与文档一致；stream mirror、stop signal、tracking 的降级有指标。
- blocking Redis 连接有上限、可观测、可关闭；进程退出不遗留连接。
- 迁移前后的物理 key 和消费协议兼容，回滚不需要批量改 key。
- `getGlobalRedisConnection`、业务层 `new Redis` 和业务层 `redis.call` 在生产代码中清零。

## 9. 回滚与数据兼容

- 第一阶段不改既有物理 key 和 hash/字符串/Stream 数据格式，回滚只需恢复调用方代码。
- 新数据结构必须使用新 namespace/version，不在旧 key 上混写新格式。
- 每个 Phase 单独发布，先观察 error rate、P95、连接数和业务拒绝率，再进入下一组。
- 如果新 capability 失败，允许在发布期间保留旧实现的直接调用作为临时分支，但不能新增依赖；稳定后立即删除，不建立永久转发文件。

## 10. 决策状态

已确认：Phase 1 只支持 standalone Redis 7.2；迁移期间保留 legacy `keyPrefix`，physical port 必须隔离；URL query/hash 严格拒绝；启动 instrumentation 执行有 deadline 的 Redis health check；BullMQ namespace 本阶段不变。

进入相关业务迁移阶段前仍需确认：

1. session、计费额度和限流在 Redis 故障时是否统一 fail-closed？如果不统一，需要明确到业务能力级别。
2. Wechat/Wecom outLink stream 第一阶段是否保持现有字符串协议，只修复原子性和重试；Redis Stream 协议迁移放到后续？
3. CI 是否可以提供 Redis 7.2 服务用于 integration test？如果不能，需要先批准一个可替代的测试运行方式。
