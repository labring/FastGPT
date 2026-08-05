# FastGPT Data Access Layer 设计

> 状态：Redis Runtime、Adapter、Cache 和 BullMQ 数据合同已迁入 `@fastgpt/dal`。
> 本文是 DAL/Redis 的唯一架构事实来源，只描述稳定边界、当前合同和发布约束，不记录阶段性任务与测试快照。

## 1. 决策与范围

FastGPT 使用独立 workspace package `@fastgpt/dal` 承载数据访问基础设施和持久化语义：

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

当前迁移范围仅包含 Redis 和依赖 Redis 的 BullMQ。MongoDB、Vector DB 不在本轮范围内，也不会因为 Redis 迁移完成而自动进入 DAL。

依赖约束：

- DAL 可以依赖 `@fastgpt/global`，不得依赖 service、web、Next.js 或具体 project。
- service 和服务端 project 可以依赖 DAL；前端代码不得引用 DAL。
- shared DAL 不得反向依赖 `pro`；Pro 专属 Cache 保留在 `pro/admin/src/dal`。
- DAL 不向业务代码暴露 raw Redis client、physical key helper 或通用 driver registry。

## 2. 职责边界

| DAL 负责 | DAL 不负责 |
| --- | --- |
| 数据源配置解析、连接角色和生命周期 | HTTP 参数、响应格式和状态码 |
| key、TTL、codec、索引和兼容规则 | 用户、团队和资源权限 |
| 原子更新、幂等、分页和并发一致性 | 工作流、通知、支付和第三方 SDK 编排 |
| Cache miss、损坏数据和故障降级合同 | 跨 Cache/Repository 的应用事务 |
| BullMQ job data、队列合同和 Queue/Worker binding | Mongo processor、S3 删除、模型调用等领域副作用 |
| 数据访问相关的 health、metrics 和 close | 将底层 client 作为业务公共 API |

“业务进入 DAL”只表示持久化语义进入 DAL。例如 token 的 key 和 TTL、Session hash 字段、二维码 JSON codec、限流计数原子性可以进入 Cache；供应商请求、登录成功后的 Mongo 更新和 HTTP 错误文案仍留在 service/project。

## 3. 分层模型

```text
API / Worker / Workflow
          |
          v
Application Service（权限、流程、跨仓储协调）
          |
          v
Repository / Cache（数据合同和降级策略）
          |
          v
Backend Adapter（Redis 协议、key 转换和错误映射）
          |
          v
Runtime / Driver（连接、配置、健康和关闭）
```

依赖只能向下。Cache 可以接收 callback 实现 read-through 或 single-flight，但不能 import 上层业务 service 或第三方 client。

## 4. 代码所有权与导出

```text
packages/dal/
├── redis/
│   ├── adapter.ts
│   ├── runtime/
│   ├── caches/
│   └── bullmq/
│       └── services/
└── test/
    ├── redis/
    └── integrations/redis/

pro/admin/src/dal/redis/caches/
```

| 入口 | 内容和允许消费者 |
| --- | --- |
| `@fastgpt/dal/redis` | App instrumentation 和 service 使用的 configure、health、close、稳定错误类型 |
| `@fastgpt/dal/redis/runtime` | BullMQ 和 instrumentation 使用的连接角色、snapshot、close hook |
| `@fastgpt/dal/redis/adapter` | shared/pro Cache 实现和测试使用的 Redis 协议封装 |
| `@fastgpt/dal/redis/caches` | Application service 使用的业务 Cache 和合同类型 |
| `@fastgpt/dal/redis/bullmq` | Queue/Worker runtime、队列名、业务服务和必要 BullMQ 类型 |
| `@fastgpt/dal/redis/bullmq/services/*` | 需要单独引用队列合同的 service/project |
| `@fastgpt/dal/redis/types` | DAL 内部 logger、metrics 和协议结果类型 |

package 根不建立全量 barrel。业务调用方不得直接引用 runtime 或 adapter；adapter 只随真实 Cache 需求增加命令，不应演变成 ioredis 镜像。

## 5. Redis Runtime

### 5.1 配置与进程状态

DAL 不读取 `serviceEnv`。App/Pro instrumentation 在首次 Redis 使用前注入 URL、logger 和 metrics：

```ts
configureRedisRuntime({
  redisUrl: serviceEnv.REDIS_URL,
  logger,
  metrics: createRedisRuntimeMetrics()
});
```

同一配置重复初始化必须幂等；运行中传入不同配置必须失败。Next.js 热重载复用 DAL 私有 context 中的同一 Runtime，不再维护 `global.redisClient` 等零散状态。

当前 URL parser 支持 `redis:`、`rediss:`、无协议 host 和 Unix socket；拒绝未知协议、query、fragment、非法端口和非法 database。该严格行为属于部署兼容性变化，不能描述成纯目录迁移。

### 5.2 连接角色

| Role | 用途 | 合同 |
| --- | --- | --- |
| `command` | Adapter 普通命令 | 无隐式 keyPrefix；命令有 deadline |
| `blocking` | `XREAD BLOCK` | 独占连接；Cache 必须在 `finally` 中释放 |
| `queue` | BullMQ Queue | Runtime 创建连接，Queue 对象管理生命周期 |
| `worker` | BullMQ Worker | `maxRetriesPerRequest=null`；shutdown 后禁止重启 |

关闭顺序为 Worker、Queue、blocking、worker/queue connection、command connection。每层应有 deadline，超时后才允许强制 disconnect。

进程信号只能有一个退出所有者。DAL 可以参与资源关闭，但不得在 Next.js 尚未完成 HTTP drain、listener cleanup 和 tracing flush 时提前结束进程。Worker 默认应等待 active job，只有超过关闭预算才强制终止。

### 5.3 Keyspace

- Cache 只接收 logical key，Adapter 统一转换为 `fastgpt:` physical key。
- 新 key 的动态 segment 使用 RFC3986 编码，不能影响 SCAN glob。
- 历史 key 使用受限 logical-key 包装保持既有格式，不重新编码。
- SCAN 只返回 FastGPT keyspace 内的 logical key。
- 未明确批准的数据迁移不得修改既有 physical key、TTL 或 value codec。

### 5.4 Operation 语义

| Mode | 最大尝试 | Timeout outcome | 使用场景 |
| --- | ---: | --- | --- |
| `read` | 2 | failed | GET、SCAN、XRANGE、INFO |
| `idempotent-write` | 2 | unknown | 重复执行不改变最终状态的写入 |
| `uncertain-write` | 1 | unknown | INCR、APPEND、租约获取等不可安全重放操作 |

默认单次 operation deadline 为 3 秒。Timeout 只能终止调用方等待，不能取消已发往 Redis 的命令；`unknown` 结果必须由上层按 token、幂等键或 TTL 处理，不能当作“未执行”。

## 6. Adapter 与 Cache

Adapter 负责 logical/physical key 转换、参数验证、Redis 返回值验证、operation policy 和稳定错误映射。每个新增操作必须有真实 Cache 消费者，并同时冻结输入、输出、deadline、重试和 unknown-outcome 语义。

Cache 拥有 key、TTL、codec、miss、read-through、single-flight 和故障策略。HTTP/API 层负责把 Cache 错误转换成产品响应。认证、计费和限流不得使用包级统一 fail-open/fail-closed 默认值。

### 6.1 Shared Cache 合同

| Cache | 核心数据合同 | 故障/并发合同 |
| --- | --- | --- |
| `DingtalkAccessTokenCache` | token；动态 TTL | Redis fail-open；上游错误传播；进程内 single-flight |
| `TeamVectorCountCache` | decimal；1800 秒 | 读取超时回源；写入和失效 best-effort |
| `WechatQrLoginCache` | QR JSON；480 秒 | miss 表示过期；损坏数据和 Redis 错误 fail-closed |
| `DailyActiveDedupeCache` | `1`；86400 秒 | `SET NX EX` 原子声明；Redis 故障 fail-open |
| `SystemVersionCache` | UUID；永久 | 原子初始化；错误 fail-closed；wildcard 只删除子 key |
| `FixedWindowRateLimitCache` | count 和剩余 TTL | 原子固定窗口；Redis 错误由调用方 fail-closed |
| `TeamQpmCache` | positive integer；1 小时 | 损坏值按 miss；Redis 错误传播 |
| `TeamPointCache` | total/surplus 双 key；60 秒 | 成对读写；异常回源 Mongo；写入 best-effort |
| `SessionCache` | hash；7 天 | hash 与 TTL 原子写；损坏记录清理 |
| `LeaseCache` | token；调用方 TTL | `SET NX PX`；token 校验续租/释放；业务 fail-closed |
| `WorkflowStopSignalCache` | `1`；60 秒 | 写入错误传播；读取/清理降级 |
| `StreamResumeCache` | stream、active/unavailable state | blocking reader、内存压力和终态 TTL 合同 |
| `OutLinkStreamCache` | string；初始 120 秒、内容 60 秒 | `APPEND + EXPIRE` 原子写；保持 `[DONE]` 协议 |
| `WechatPollingFailureCache` | integer；300 秒 | 原子递增；TTL 从首次失败开始，不随失败刷新 |

### 6.2 Pro Cache 合同

| Cache | 核心合同 |
| --- | --- |
| `WecomAccessTokenCache` | provider/suite 历史 key；`expires_in - 10` TTL；错误 fail-closed |
| `WecomSuiteTicketCache` | 永久 string；缺失或 Redis 错误 fail-closed |
| `WecomPendingOrderCache` | team order id；7 天；读取 fail-open，写入/清理 best-effort |

## 7. BullMQ 边界

DAL 维护 Queue/Worker runtime、连接 binding、队列名、job data、jobId、重试/保留策略和 scheduler/status 操作。领域 processor 仍由 service/project 注入，DAL 不依赖 Mongo、S3、Vector DB 或第三方 API。

当前队列服务：

```text
AppDeleteMQService             DatasetDeleteMQService
TeamDeleteMQService            SkillCreateMQService
SkillDeleteMQService           DatasetSyncMQService
EvaluationMQService            CollectionUpdateMQService
S3FileDeleteMQService          WechatMQService
```

Queue/Worker 通过方法懒创建；service class 可以注入 `BullMQBinding` 测试，不在模块加载时连接 Redis。Worker 异常恢复必须保留业务 listener，shutdown 状态下不得重启。

队列合同变化必须显式记录。当前迁移包含两项有意修正：S3 jobId 加入 bucket 并编码，Collection Update 清理历史终态 job 并增加重试。它们不属于“jobId、重试和保留策略完全不变”。

## 8. 兼容性与业务变化

无需 Redis 数据迁移的前提是历史 physical key 和 value codec 保持可读。下面这些行为不能被“架构迁移”描述覆盖：

| 能力 | 当前变化 |
| --- | --- |
| Daily Active | GET/SET 改为原子 NX；Redis 故障从丢事件改为继续记录 |
| Team QPM/Fixed Window | Redis 或 QPM 查询失败时拒绝请求，而不是继续放行或透传异常 |
| Team Point | Redis 从钱包强依赖改为可回源缓存 |
| Wechat failure counter | 滑动 300 秒改为从首次失败开始的固定窗口 |
| Redis operation | 普通操作增加统一 deadline 和有限重试 |
| Startup | App/Pro 显式 PING Redis，Redis 不可用时启动失败 |
| Configuration | 过去被忽略的 URL query、fragment 和非法 db 现在阻止启动 |
| S3/Collection queues | jobId、重试或终态保留合同发生修正 |

Session、System Version wildcard、Dingtalk token、Team Vector Count、QR Login、Stop Signal、OutLink Stream、Sandbox Preview 和正常 Stream Resume 路径在有效数据与可用 Redis 下保持原业务合同；并发、损坏数据或慢 Redis 分支的增强仍应单独测试。

## 9. 发布审查门槛

发布前必须证明：

- Next.js 与 DAL 只有一个进程退出所有者，存量 HTTP 请求和 active job 不会被提前截断。
- Lease acquire 的 `unknown` 结果不会留下无人执行却持续 3 至 11 分钟的孤儿锁。
- Collection Update 的 best-effort enqueue 不会产生未处理 Promise rejection。
- 团队 QPM 超限仍保持既有 `UserError` API 合同，除非明确批准 breaking change。
- `@fastgpt/dal` 单元测试进入常规 CI；Redis 7.2 integration 覆盖 Lua、SCAN、Stream、事务和真实并发。
- 全量测试、raw ioredis/BullMQ import 扫描、physical key 扫描和 `git diff --check` 有可追溯结果。

测试分层：DAL fake-client 单测验证协议与错误分支；Redis 7.2 integration 验证服务端语义；service/project 测试验证业务降级与 API 合同，不重复模拟完整 ioredis。

## 10. Observability 与回滚

Redis Runtime、BullMQ lifecycle 和 Cache 降级日志必须使用稳定消息和低基数 metadata。具体 SigNoz 查询、阈值和降噪规则见 [SigNoz Redis / BullMQ 告警](../redis/signoz-redis-alerts.md)。

回滚依赖以下约束：

- shared 与 Pro 变更保持可独立回退。
- physical key、value codec 和兼容 TTL 不变时，回滚无需批量迁移数据。
- 行为修复必须单独列出，不能伪装成目录移动。
- 不采用长期双写；临时 facade 必须有明确删除边界。
- Node、Scalar、Zod、ioredis 和 lockfile 等无关依赖升级应与 DAL 迁移拆分，避免扩大回滚面。
