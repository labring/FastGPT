# 系统升级任务管理设计

## 1. 背景

FastGPT 当前存在多个需要管理员手动调用 API 或运行脚本的数据升级任务。任务的入口、执行状态、并发控制和进度展示不统一，升级过程中主要依赖操作人员阅读版本说明并手动判断是否需要执行。

本设计从未来新增的升级任务开始建立统一执行框架，不接管、不推断也不补录任何历史升级脚本。

## 2. 目标

1. 使用静态数组声明任务，普通任务按数组顺序串行执行，独立任务分别自动执行。
2. 所有迁移在后台运行，不参与 HTTP readiness 或 worker、cron、watch 的启动判定。
3. Mongo 状态表记录每个任务最新状态，错误表逐条保存坏数据；任务通过统一 Context 报告进度、checkpoint、错误和最终结果。
4. 每个任务使用独立的 Mongo lease 与 runId fencing，多个节点竞争时只允许一个有效持有者。
5. 进程退出后接管过期的 running；明确 failed 不自动重试，由管理员修复后重置。
6. 独立任务不等待普通队列的执行、延迟或失败，也不等待其他独立任务。
7. 保持幂等、滚动升级兼容、错误数据边界和局部测试约束。

## 3. 非目标

1. 除首个 `20260903_migrate_legacy_system_models` 模型接管任务外，不迁移或登记 v4.16.3 及以前已有的一次性历史升级脚本。
2. 不提供任意脚本代码上传或在线执行能力。
3. 不提供跳过任务、强制标记成功、回滚或删除任务状态的管理操作。
4. 不承诺 exactly-once。系统保证的是单 lease 执行权和 at-least-once 恢复，业务副作用仍必须幂等。
5. 不在状态表保存完整日志时间线或错误数量。状态表只保存各阶段最新快照、成功后的最终结果和最近一次错误；逐条错误明细进入独立集合，列表所需数量实时聚合，详细过程进入现有结构化日志系统。
6. 不支持需要停止旧版本节点、全站维护窗口或破坏旧版本兼容性的自动迁移。

## 4. 术语

- **Migration / 升级任务**：一次可独立标识、可重复执行的数据或结构升级函数。
- **Registry / 注册表**：按执行顺序排列的静态任务数组。
- **Runner / 执行器**：扫描注册表、竞争 lease、构造上下文并调度普通队列与独立任务的后台组件。
- **Lease / 租约**：MongoDB 中有时限的任务执行权。
- **Run ID**：每次成功获取 lease 后生成的随机 ID，同时作为执行批次标识和 fencing token。
- **Runner ID**：标识一次 Node.js 进程实例，仅用于排查，例如 `hostname:pid:bootId`。
- **Checkpoint**：分批任务决定异常恢复位置的可选持久化游标，不等同于面向管理员的进度文案；全量重跑任务不需要 checkpoint。
- **Independent / 独立任务**：不依赖任何其他迁移，先竞争集群共享的并发名额，再竞争自身 lease；最多 3 个独立任务并发。
- **Dependency / 前置依赖**：dependsOn 声明任务执行前必须成功的全部前置；失败只阻止依赖它的任务，失败任务本身仍只能由管理员重试。

## 5. 第一性原理与核心约束

### 5.1 调度模式与前置依赖

| 模式 | 配置 | 行为 |
| --- | --- | --- |
| 普通自动 | 默认 | 进入普通串行队列 |
| 延迟自动 | `delay: true` | 取得 lease 后等待配置时长，期间占用普通队列 |
| 手动触发 | `manual: true` | `waiting` 被管理员改为 `pending` 后进入普通队列 |
| 独立执行 | `independent: true` | 每个任务单独调度，不受普通队列顺序约束；集群共享 3 个并发名额 |

所有队列均在后台运行。普通队列按注册顺序执行，跳过 waiting、已成功任务和前置尚未成功的任务。失败项始终跳过，不暂停其他无依赖任务；通过 dependsOn 直接或间接依赖失败项的任务仍等待全部前置成功。不再提供 onFailure 或 stop/continue 配置。

独立任务与 `manual`、`delay`、非空 `dependsOn` 互斥。普通任务允许依赖更早注册的独立任务，其尚为 pending/running 时普通队列保留探活，成功后自动推进；失败时等待管理员重试。

启动阻塞模式已移除。原成员角色清理采用独立模式，旧系统模型迁移保持普通自动模式；保留任务 ID、顺序与函数，已成功状态不重跑。

### 5.2 Lease 不是幂等替代品

框架提供的是 at-least-once，而不是 exactly-once。分批任务可能在“业务数据已更新、checkpoint 尚未保存”之间退出，接管节点会从旧 checkpoint 重放同一批；全量任务在退出后会重放整个任务。因此无论采用哪种恢复策略，实际重放范围都必须允许重复执行。

### 5.3 自动迁移必须兼容滚动升级

迁移与新旧版本的业务流量并发执行，因此所有自动任务必须兼容当前版本和至少前一个版本：

- 优先新增字段、集合和索引，不直接删除旧结构；
- 读取使用 `newValue ?? oldValue`；
- 过渡期按需要双写；
- 数据回填完成并跨版本稳定后，再在后续版本单独清理；
- 需要全站停机的破坏性操作不进入自动注册表。

### 5.4 注册表必须只追加

为保证滚动升级期间不同版本节点看到相同前缀：

- 已发布任务只能在数组尾部追加；
- 已发布任务 ID、相对顺序、函数语义、调度模式和依赖不可修改；
- 不允许复用或删除已发布 ID；
- 启动时校验任务 ID 唯一；
- 新版本注册表必须是旧版本注册表的有序超集。

## 6. 总体架构

```text
┌──────────────────────── FastGPT App 节点 A/B/C ─────────────────────────┐
│ instrumentation-node                                                   │
│   ├─ startSystemMigrationRunner()                                      │
│   │    ├─ 存在 pending/running 时每分钟扫描未完成任务                    │
│   │    ├─ Mongo 原子竞争 lease                                          │
│   │    ├─ 持有者每 15 秒续租                                            │
│   │    └─ 按任务策略断点续跑或幂等全量重跑                              │
│   ├─ 普通队列串行，独立任务共享 Redis 并发名额（集群 3 个）               │
│   └─ 不等待迁移完成，继续启动 worker/cron/watch 与 HTTP 服务                │
│                                                                        │
│ projects/app 管理页 ── GET 状态列表 ─┐                                 │
└──────────────────────────────────────┼── system_migration_states        │
                                       └─────────────────────────────────┘
```

### 6.1 模块归属

迁移执行框架和任务全部归属 App，不进入 service 的 DDD 业务目录；前后端共同使用的状态枚举、Zod Schema 和 API 类型放在 global：

```text
packages/global/migration/
  constants.ts       状态枚举和公共输入上限
  schema.ts          Zod 运行结构及 API 传输结构

projects/app/src/migration/
  constants.ts       Runner 时序常量
  mongoSchema.ts     迁移状态与错误数据的 Mongo Schema 和 Model
  entity.ts          原子 claim、heartbeat、进度、完成、失败
  registry.ts        静态任务数组及注册表校验
  runner.ts          普通队列与独立任务调度、lease 生命周期
  service.ts         状态列表、失败重试和手动入队
  tasks/README.md          新任务编写约束
  tasks/<version>/<task-id>/         每个生产升级任务的自包含目录
    index.ts               任务入口
    service.ts / utils.ts  仅属于该迁移的执行与转换逻辑
```

App 接入与管理员页面：

```text
projects/app/src/instrumentation-node.ts
projects/app/src/pages/api/admin/migrations/list.ts
projects/app/src/web/common/system/migrations/api.ts
projects/app/src/pages/admin/migration.tsx
projects/app/src/pageComponents/admin/config/Migration.tsx
projects/app/src/pageComponents/admin/AdminContainer.tsx
```

测试：

```text
projects/app/test/migration/registry.test.ts
projects/app/test/migration/runner.test.ts
projects/app/test/migration/service.test.ts
projects/app/test/instrumentation-node.test.ts（只验证接入边界，若现有模块可隔离）
projects/app/test/...（API 和页面可测逻辑）
```

模型迁移任务 `20260903_migrate_legacy_system_models` 按普通队列执行，负责把旧
`system_models` 数据迁移到 `ai_models`。mock 任务只存在于测试和本地集成脚本，
防止测试数据升级逻辑进入真实部署。

## 7. 注册表协议

```ts
type SystemMigration = {
  /** 发布后永久唯一，不允许修改或复用。 */
  id: string;
  /** 首次引入该任务的 FastGPT 版本，仅用于展示。 */
  version: string;
  /** 管理端展示 key，只存在于静态注册表。 */
  nameKey: string;
  descriptionKey: string;
  resultKey: string;
  /** 按展示和执行顺序声明阶段；key 永久稳定，labelKey 只存在于代码。 */
  progressSteps: readonly { key: string; labelKey: string }[];
  /** 自动独立执行，不受普通队列顺序约束，集群共享 3 个并发名额；与 manual、delay、非空 dependsOn 互斥。 */
  independent?: boolean;
  manual?: boolean;
  dependsOn?: readonly string[];
  /**
   * 是否在获得租约后延迟执行。
   * 为 true 时，Runner 根据环境变量 SYSTEM_MIGRATION_DELAY_SECONDS（秒）延迟执行。
   * 仅用于普通自动任务；与 manual、independent 互斥。
   */
  delay?: boolean;
  run: (context: SystemMigrationContext) => Promise<MigrationResult | void>;
};

export const systemMigrations = [] satisfies readonly SystemMigration[];
```

数组下标派生展示顺序，不在任务中重复存储 `order`，避免两个顺序来源不一致。

推荐 ID 格式：

```text
YYYYMMDD_short_semantic_name
```

ID 不使用单纯版本号，避免同一版本包含多个任务时冲突。

## 8. Mongo 状态模型

集合名称：

```text
system_migration_states
```

每个任务仅一条状态记录，`_id` 直接使用任务 ID：

```ts
type SystemMigrationState = {
  _id: string;
  status: 'waiting' | 'pending' | 'running' | 'failed' | 'succeeded';

  runId?: string;
  heartbeatAt?: Date;
  leaseExpireAt?: Date;

  checkpoint?: Record<string, unknown>;
  progress?: Array<{
    key: string;
    status: 'pending' | 'running' | 'failed' | 'succeeded';
    params?: Record<string, string | number | boolean | null>;
    current?: number;
    total?: number;
    error?: {
      message: string;
      stageKey?: string;
      runId: string;
      createdAt: Date;
    };
    updatedAt: Date;
  }>;
  result?: Record<string, string | number | boolean | null>;

  lastError?: {
    message: string;
    stageKey?: string;
    runId: string;
    createdAt: Date;
  };
  startedAt?: Date;
  lastStartedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};
```

约束：

- 只依赖 MongoDB 自带的 `_id` 唯一索引，不额外创建索引；
- 静态标题、描述、版本、顺序和调度模式不写入 Mongo，避免代码与数据库元数据漂移；
- 状态表不保存错误数据数组或数量，文档大小与坏数据数量无关；
- `lastError` 只描述最近一次明确失败；
- 节点被 SIGKILL、OOM 或机器断电时无法可靠写错误，记录保持 `running + 过期 lease` 供接管；
- checkpoint、progress 和 result 分离：checkpoint 用于正确恢复，progress 按注册表声明的阶段 key 保存各阶段最新状态，result 只表示成功终态的最终产出；
- 阶段名称只来自静态 `progressSteps[].labelKey`；Mongo 不持久化客户端文案，列表接口合并未上报阶段为 `pending`；
- Runner 只允许脚本上报已声明阶段，按 key 覆盖对应阶段，并在普通异常或 `context.fail` 时把错误归属到当前 `running` 阶段；所有声明阶段均为 `succeeded` 后任务才可成功；
- Runner 校验任务返回的 result，并与 `succeeded` 在同一次 fenced 状态更新中写入；新一轮执行开始时清除旧 result。

错误数据保存到独立集合：

```text
system_migration_failed_records
```

每条坏数据对应一条文档：

```ts
type SystemMigrationFailedRecord = {
  migrationId: string;
  runId: string;
  stageKey: string;
  data: Record<string, string | number | boolean | null>;
  reason: {
    message: string;
  };
  createdAt: Date;
};
```

集合通过 `{ migrationId, stageKey }` 索引支持阶段聚合、详情查询和成功清理。列表按当前注册表中的任务 ID 一次聚合错误集合，生成任务级和阶段级 `failedRecordCount`，不在状态表维护可能漂移的冗余计数。错误数组不限制总条数或总字节数；单条 data/reason 仍限制为有限标量字段，避免一条记录携带完整正文、凭证或超大对象。

## 9. 状态机

```text
waiting（仅 manual） --管理员执行--> pending --claim--> running --成功--> succeeded
                                     ^                 |
                                     |                 +--明确错误--> failed
                                     +------管理员重试---------------+
                                                       |
                                                       +--lease 过期--> running（新 runId）
```

`succeeded` 是终态。`failed` 不能续租或直接 claim，即使旧 lease 已过期也必须由管理员重置。

## 10. Lease 协议

### 10.1 时间参数

默认值：

```text
scan interval       60 秒
heartbeat interval  15 秒
lease duration      90 秒
```

必须满足：

```text
heartbeat interval < lease duration / 3
```

时间计算优先使用 MongoDB 服务端 `$$NOW`，避免不同 App 宿主机时钟偏差。

### 10.2 初始化状态

每个节点在启动 runner 时对当前注册表执行 `bulkWrite + $setOnInsert`，为不存在的任务创建状态：手动任务为 `waiting`，其他任务为 `pending`。多个节点并发初始化依靠 `_id` 唯一性保持幂等。

### 10.3 选择任务

普通任务组成一个串行队列，每个独立任务组成一个单任务队列。每个队列独立扫描、防重入和维护空闲定时器：

- 跳过 succeeded 和 waiting；依赖未成功时跳过任务，但不把依赖视为成功。
- failed 不自动 claim，跳过后继续后续可执行项；只有显式依赖未成功前置的任务等待。
- pending 尝试 claim，running 等待持有者或在 lease 过期后接管。
- 普通队列不能越过正在执行或延迟中的普通任务；独立任务不受此限制。
- 只有等待管理员操作或所有任务成功时停止对应队列的扫描；依赖其他队列 pending/running 的任务继续探活。

### 10.4 原子 claim

claim 使用单条 `findOneAndUpdate`，过滤条件只接受：

```text
status = pending
或
status = running 且 leaseExpireAt <= Mongo $$NOW
```

更新内容：

- `status = running`；
- 生成全新的 `runId`；
- 写入 `lastStartedAt`、`heartbeatAt`；
- `leaseExpireAt = $$NOW + 90 秒`；
- 第一次执行时写入 `startedAt`。

只有返回更新后文档的节点获得执行权。

### 10.5 续租

heartbeat 更新必须同时匹配：

```text
_id + status = running + runId + leaseExpireAt > $$NOW
```

匹配失败说明当前执行器已经失去 lease。runner 立即：

1. 标记本地 `leaseLost`；
2. abort 上下文的 `AbortSignal`；
3. 禁止保存新 checkpoint、进度、失败或成功状态；
4. 不执行后续任务。

### 10.6 Fencing

以下所有状态写入都必须匹配当前 `runId` 和尚未过期的 lease：

- heartbeat；
- checkpoint；
- progress；
- failed；
- succeeded。

旧执行器即使恢复，也不能覆盖新执行器的状态。

Fencing 只能保护迁移状态表，不能自动保护其他业务集合。因此迁移函数在每个批次前应调用 `context.assertActive()`，业务写入必须幂等。

## 11. Runner 算法

### 11.1 节点启动

Mongo、Redis、S3、VectorDB、基础配置和模型运行时就绪后创建 Runner，原子初始化状态并同时唤醒所有队列。`start()` 不等待任务执行完成，instrumentation 继续启动 worker、cron、watch 并结束注册。

任务状态不决定 App readiness；数据库不可用等基础初始化错误仍按原初始化流程处理。旧系统模型迁移任务保留自身的缓存刷新阶段，业务模型缓存继续按现有运行期机制刷新。

### 11.2 队列隔离

每个队列维护自己的 tick Promise、扫描定时器和唤醒代次。普通任务与每个独立任务可并发执行；同一任务在单进程内防重入，跨节点通过 Mongo lease 互斥。独立任务还需通过 Redis LeaseCache.withConcurrency 获取共享名额，集群上限固定为 3；普通队列不占额度。任何一个队列的长任务、延迟或失败都不阻止其他队列扫描。

管理员重试会同时唤醒各队列；旧扫描结束时不能取消新唤醒的定时器。执行中的 tick 不会重复进入同一任务。Runner 停止时取消所有队列定时器，并中止每一个活跃任务的 AbortSignal 和 heartbeat；不能只保存一个当前 controller。

### 11.3 独立任务共享并发

所有 App 节点使用同一逻辑 key `system-migration:independent`，复用 Redis `LeaseCache.withConcurrency` 原子竞争 3 个名额。普通队列不占额度，等待名额不保证 FIFO。

- 先取得共享名额，再竞争任务 Mongo lease；等待期间不领取新任务。首次执行保留 pending，过期接管前保留原 running 与恢复数据。
- 共享租约默认 90 秒过期、15 秒续租，与任务 lease 使用同一 Runner timing。执行完成、明确失败或未领取到 Mongo lease 时释放名额。
- 等待超时只结束本轮扫描，下轮继续竞争，不标记 failed；Redis 获取失败不放行业务执行。
- 共享租约失效时中止任务信号并停止 Mongo heartbeat；状态与 checkpoint 保留，等待任务 lease 过期后接管。脚本必须响应 signal，并在业务批次前调用 assertActive。
- Runner 停止时取消名额等待，通知所有活跃任务中止；进程异常退出后由 TTL 回收名额。

### 11.4 完成与恢复

成功时要求所有声明阶段均为 succeeded，校验返回值后原子提交 succeeded 与最终结果并清理错误明细。普通队列继续下一项；独立任务仅完成自身。

明确失败统一停止 heartbeat 并等待管理员重试，重启进程不重试 failed。进程中断或失权保留 running，由过期接管恢复。恢复时保留 checkpoint、progress、lastError 和失败快照。

## 12. Migration Context

```ts
type SystemMigrationContext = {
  migrationId: string;
  runId: string;
  signal: AbortSignal;

  getCheckpoint: <T>(schema: ZodType<T>) => Promise<T | undefined>;
  getFailedRecords: () => Promise<MigrationFailedRecord[]>;
  reportFailedRecords: (failedRecords: MigrationFailedRecord[]) => Promise<void>;
  saveCheckpoint: (checkpoint: Record<string, unknown>) => Promise<void>;
  reportProgress: (progress: MigrationProgressInput) => Promise<void>;
  assertActive: () => Promise<void>;
  fail: (error: MigrationFailureInput) => Promise<never>;

  logger: {
    info: (message: string, metadata?: Record<string, unknown>) => void;
    warn: (message: string, metadata?: Record<string, unknown>) => void;
    error: (message: string, metadata?: Record<string, unknown>) => void;
  };
};
```

上下文规则：

- `reportProgress` 使用 `{ key, status, params?, current?, total? }` 按阶段 key 更新，只允许脚本上报 `running` 或 `succeeded`；失败状态由 Runner 统一写入；
- 注册表必须先声明全部 `progressSteps`。列表接口据此补齐尚未上报的 `pending` 阶段，并把 Mongo 中的阶段状态、错误和异常数据数量合并返回；
- `progress.params` 只允许有限数量的标量，限制 key/value 长度和整体 BSON 大小；
- `getCheckpoint` 要求调用方提供 Zod schema，数据库中的异常 checkpoint 作为内部错误处理；
- `getFailedRecords` 供任务按需读取上次明确失败留下的坏数据；脚本在继续 checkpoint 后的新数据前，应先重试这些已被跳过的记录；
- `reportFailedRecords` 供任务使用，按批替换当前完整未解决错误快照。状态更新时间和错误明细在同一事务中完成，并受 runId fencing 保护；
- `saveCheckpoint` 在每个幂等批次完成且对应错误快照成功上报后调用。错误快照先于 checkpoint，保证两次调用之间退出时只会重放该批，不会永久跳过坏数据；
- logger 自动附带 `migrationId/runId/runnerId`；
- `fail` 在同一事务中写入唯一 `lastError`、把相关阶段标记为失败、替换独立错误集合并将任务改为 `failed`，然后抛出框架内部终止错误；各阶段异常数据数量由列表查询聚合；
- Runner 捕获的普通异常不携带 `failedRecords`，因此只更新 `lastError` 和失败状态，保留任务之前即时上报的错误快照；只有脚本显式携带 `failedRecords`（包括空数组）时才替换或清空快照；
- runner 捕获普通未处理异常后，也通过同一个失败写入路径生成 `lastError`，避免代码遗漏 `context.fail` 后被当成节点崩溃无限自动重试；
- OOM、SIGKILL、机器断电等无法进入 catch 的异常终止依靠 lease 过期恢复，不生成失败记录。

任务函数可以返回有限标量的业务参数对象作为最终结果。Runner 校验后把参数与 `succeeded` 原子提交；列表接口使用注册表的 `resultKey` 组装展示 DTO，确保 Mongo 不保存 i18n key，且客户端不会看到尚未成功的结果。没有需要展示的最终产出时返回 `void`。

## 13. 升级任务编写规范

每个新任务必须满足：

1. **幂等**：完整任务和任意批次可以重复执行。
2. **明确恢复策略**：任务必须选择“分批断点续跑”或“幂等全量重跑”，不能在恢复时隐式切换语义。
3. **受控资源**：数据量较大或执行时间不可控时必须分批，禁止一次加载无界全表或执行无法中断的超长操作；只有数据量确定较小且整次写入可保持原子、确定、幂等时才允许全量重跑。
4. **可取消**：分批任务在批次之间检查 `signal.aborted` 或调用 `assertActive()`；全量任务至少在关键写入前和后续阶段前检查执行权。
5. **向前兼容**：默认只新增，不直接删除旧字段、旧集合或旧索引。
6. **确定性**：分批任务的 checkpoint 排序字段必须稳定，例如 `_id`，避免 offset 分页在并发写入时跳项；全量任务相同输入必须产生相同结果。
7. **有限进度与错误数据**：进度只上报可序列化的小对象；任务的失败记录只保存定位数据所需的有限标量摘要和逐条原因，不写凭证、完整正文或错误栈。
8. **显式校验**：迁移结束前验证完成条件，验证失败不得标记成功。
9. **禁止外部不可重放副作用**：发送消息、扣费等操作若不可避免，必须使用业务幂等键。
10. **发布后不可修改语义**：已发布任务需要修复时追加新的修复任务，不原地改变旧任务行为。

### 13.1 分批断点续跑

适用于数据量较大、无法在单个短事务中完成或需要逐批跳过坏数据的任务。推荐顺序：

```text
assertActive
读取 failedRecords，建立完整未解决错误快照并优先重试
读取 checkpoint 后的一批新数据
执行幂等写入
校验该批结果
错误快照变化时 reportFailedRecords(完整快照)
saveCheckpoint + reportProgress
```

`reportFailedRecords` 使用完整快照替换语义，不逐条 append，也不能只上传当前批次。进程在业务写入、错误快照和 checkpoint 之间退出时，该批会被重新执行；幂等业务写入保证重放安全，错误先于 checkpoint 则保证坏数据不会被游标跳过。快照之后若发生普通异常，Runner 保留已上报明细。扫描结束仍有错误时，`context.fail` 再携带相同最终快照进入失败状态。

### 13.2 幂等全量重跑

适用于数据量确定较小、能够快速完成且全量结果由权威源确定的任务。管理员重试和节点重启接管仍会保留框架状态，但脚本可以忽略 checkpoint，每次重新执行完整流程：

```text
assertActive
读取完整权威源
在修改目标前完成全部修复与校验
原子写入完整结果
assertActive
刷新缓存或执行后续校验
```

全量重跑任务不得保存没有真实恢复意义的 checkpoint。如果需要先清空目标数据，必须同时满足：

- 目标数据完全由权威源派生，不包含需要保留的用户增量；
- 不删除权威源或回滚依据；
- 清空与完整重建位于同一事务，失败时旧目标仍然可用；
- 重复执行以及源数据修复后再次执行都会得到确定结果。

模型迁移采用“不保存 checkpoint 的幂等全量扫描”：每次获准执行时都读取完整旧
`system_models`。仅存在于旧表的模型沿用旧 `_id` 新增；同名目标模型保留已经被业务引用的目标 `_id`，
其余字段以 canonical 化后的旧表配置完整替换；仅存在于目标表的模型保留。这样既不会使已有 modelId
失效，也不会让启动阶段自动预装的同名模板配置覆盖升级前的用户模型设置。system 默认配置同样不作为
执行标记：已有且仍有效的槽位优先，旧表默认标记只补齐缺失或失效槽位。是否执行完全由升级状态和
lease 决定，重复执行会得到相同结果。最终结果分别展示旧表记录数、新表最终 system 模型数和已经在
新表中落位的去重旧模型数；同名替换仍计为迁移成功。

## 14. 错误与恢复

`context.fail`、普通异常、checkpoint 解析失败或完成校验失败均进入 failed。Runner 保存有限的 lastError，停止 heartbeat，不会因节点重启或 lease 过期自动重试；队列跳过失败项并继续其他可执行任务，仅直接或间接依赖失败项的任务等待。

进程无法执行 catch 时状态保留 running，lease 过期后由一个节点以新 runId 接管。管理员修复数据或配置后点击重试，原子将 failed 改为 pending 并移除旧所有权，再通过正常 lease 竞争执行。

两种入口均保留 checkpoint、progress、lastError 和错误明细。分批任务先重试错误快照再断点续跑；全量任务按固定策略完整重跑。成功后才清理错误数据；普通 throw 保留之前上报的最新快照，context.fail 显式携带 failedRecords 时才替换。pending、running、waiting、succeeded 不允许通过重试 API 重置。

## 15. 管理员 API

管理员 API 使用 root 鉴权、parseApiInput 和响应 Zod 校验；OpenAPI 契约位于 packages/global/openapi/admin/system/migrations。

### 15.1 获取列表

```text
GET /api/admin/migrations/list
```

- 使用 `authSystemAdmin` 校验 root 管理员；
- 无请求业务参数，不创建空入参 Schema；
- 将静态注册表与 Mongo 状态合并，并从错误集合一次聚合任务和阶段的 `failedRecordCount`，不在高频轮询中传输明细数组；
- Mongo 状态缺失按注册模式原子初始化，manual 为 waiting，其余为 pending；
- 使用 Zod response schema 校验返回值。

响应包含：

```text
id, version, order, nameKey, descriptionKey, independent,
status, progress, result, lastError, failedRecordCount,
heartbeatAt, leaseExpireAt,
startedAt, lastStartedAt, completedAt, updatedAt
```

不向客户端返回 checkpoint 和当前 lease 的顶层 runId，避免泄露内部迁移数据和误导管理员手动操作。`lastError.runId` 作为最近一次失败的有限追踪字段保留，便于与终端日志关联。

### 15.2 重试失败任务

```text
POST /api/admin/migrations/retry
body: { migrationId: string }
```

- 使用 `authSystemAdmin` 校验 root 管理员并通过 `parseApiInput` 校验 body；
- 仅把 `failed` 状态原子重置为 `pending`；
- 重置成功后立即唤醒处理该 API 的本节点 runner，再通过正常 lease 竞争执行；若该节点在重置后、
  获得 lease 前异常退出，任务保持 `pending`，后续节点启动时仍会发现它。

### 15.3 按需读取失败明细

```text
GET /api/admin/migrations/failedRecords?migrationId=...&stageKey=...
```

页面只在管理员点击某个失败阶段的错误数量时调用该接口，从独立错误集合读取该任务、该阶段的记录。列表每 10 秒轮询；全部任务成功后停止自动轮询。列表会聚合错误集合中的任务和阶段数量，但不传输错误正文。

## 16. 管理员页面

路径：

```text
/admin/migration
```

导航名称：`版本升级`，归入系统配置区域附近。

### 16.1 页面与交互

管理端按倒序展示注册任务及版本、说明、状态、全部阶段进度和最终结果。独立任务展示“独立模式”标记，不承诺卡片顺序就是其执行顺序。

- 列表每 10 秒刷新，全部 succeeded 后停止；离开页面停止轮询。
- 所有 failed 任务均显示重试按钮，waiting 显示首次执行按钮。
- 失败提示未依赖该任务的升级任务可以继续；所有失败任务均保留单独重试入口。
- running 且 lease 过期时展示等待接管，不能把它误报为正常运行。
- 失败阶段展示异常数据数量；管理员按需打开只读 JSON Editor 查看定位字段及原因。
- 页面不展示、也不从迁移状态推断 App readiness。
- 页面沿用 Chakra tokens 与移动端布局，静态文案使用 system_migration namespace。

### 16.2 i18n

页面固定文案、任务名称、任务描述、进度和最终结果均使用注册表中由 `i18nT(...)` 标记的 i18n key：

```ts
t(progress.labelKey, progress.params)
t(result.key, result.params)
```

数据库不保存任何 i18n key。错误状态和错误明细只保存经过裁剪的原始 `message`，页面直接展示它；成功结果只保存业务参数，由列表接口与注册表 `resultKey` 合并。

主仓现有语言目录为 `zh-CN`、`zh-Hant`、`en`、`ko-KR`。新增独立 `system_migration.json` namespace，并同步四种语言，避免继续扩大 `common.json`。

## 17. 日志与可观测性

每个 runner 日志自动携带：

```text
migrationId, runId, runnerId, status
```

必须记录：

- claim 成功；
- 接管过期 lease；
- heartbeat 丢失执行权；
- 进度阶段切换；
- 成功及耗时；
- 明确失败；

高频 heartbeat 不逐次记录 info，避免日志噪音；只记录续租失败。

状态表用于当前视图，现有结构化日志用于过程追踪。第一版不新增 migration events 集合。

## 18. 关键竞争与故障场景

| 场景 | 预期结果 |
| --- | --- |
| 多节点 claim 同一 pending | 只有一个 lease 持有者 |
| 普通队列长任务、延迟或任务失败 | 独立任务立即竞争共享名额，取得后竞争自身 lease |
| 一个独立任务长期运行或失败 | 其他独立任务和普通队列继续调度 |
| 多节点执行多个独立任务 | 集群最多占用 3 个共享名额，普通队列不占额度 |
| 共享名额占满或 Redis 不可用 | 不领取新任务，不将等待标记为失败 |
| 共享租约失效 | 中止任务并停止 Mongo 续租，保留断点等待过期接管 |
| 普通任务依赖运行中的独立任务 | 保留探活，前置成功后执行 |
| 明确失败且 lease 过期 | 不续租、不自动 claim，等待管理员重试 |
| running 持有者退出 | 保留断点，过期后由一个节点接管 |
| 旧持有者恢复 | runId 与 lease 校验拒绝其状态写入 |
| 业务提交后、checkpoint 前退出 | 重放同一幂等批次 |
| stop 发生在 claim 期间 | 不启动业务函数，保留 running 等待过期接管 |
| Runner 停止 | 所有活跃任务均收到中止信号且停止 heartbeat |

## 19. 测试方案

使用现有隔离 Mongo 测试框架，覆盖注册参数互斥、多节点 lease 竞争、普通串行顺序、独立任务不等待普通长任务/延迟/失败、集群共享 3 个名额、额度等待与 Redis 故障、共享租约失效、依赖完成后自动推进、失败不自动接管、管理员重试、checkpoint 与失败快照恢复、旧 runId 拒写、停止时取消等待与全部活跃执行，以及 API 鉴权和校验。Runner 测试复用真实 LeaseCache 生命周期，仅替换 Redis 原子脚本边界；Redis 租约本身沿用 DAL 局部测试验证。

只运行本次改动和受影响的 migration、API、管理页派生逻辑局部测试，以及 App typecheck、相关 ESLint 和 diff 检查；最终验收前不主动运行全量测试。

## 20. 安全边界

- 管理接口仅允许 root 管理员；
- 客户端不能提交 checkpoint、progress、result 或迁移状态；
- checkpoint、progress、result、错误字符串和单条错误数据限制体积；错误数据数组不受状态文档大小限制；
- 日志不得输出业务数据正文、凭证或连接串；
- 迁移集成测试只操作测试框架创建的隔离数据库；
- 不修改部署 `.yml/.yaml`。迁移与业务并发运行，兼容性和幂等性由脚本明确保证。

## 21. 已知取舍

1. 过期 running 的最坏接管时间约为剩余 lease 加 60 秒扫描间隔；仅剩终态或人工操作时停止对应队列探活。
2. 独立模式使用 Redis 共享并发租约，集群上限为 3。等待名额时不领取新的 Mongo lease；完成、失败或未领取到任务 lease 后释放名额。Redis 故障时保留原任务状态，不放行执行。
3. 所有迁移均不阻塞业务启动，业务必须能处理回填尚未完成的数据，不能把是否 ready 当作迁移完成标志。
4. 状态表不保存事件历史，完整时间线依赖结构化日志；业务写入的安全仍依赖幂等与批次事务。
5. 滚动升级期间，旧 Runner 可能仍按原顺序获取相同任务的 Mongo lease，且不遵守新共享额度。任务互斥仍有效；集群并发上限和依赖调度语义需在全部节点升级后统一生效。

## 22. TODO

- [x] 调研 App instrumentation、Mongo、现有迁移、日志、管理端和测试基础设施
- [x] 编写需求与技术设计文档
- [x] 确认管理页面位于 `projects/app`，普通异常写入单条 lastError
- [x] 新增共享状态枚举、Zod schema 和类型
- [x] 新增 Mongo migration state schema/entity
- [x] 实现静态注册表与校验
- [x] 实现 context、lease、heartbeat、fencing 和 runner
- [x] App instrumentation 启动后台 Runner，业务启动不等待迁移
- [x] 实现状态列表 service
- [x] 实现 projects/app list API
- [x] 实现 projects/app 版本升级页面、导航与轮询
- [x] 补齐四种语言 i18n
- [x] 编写 runner/service/API/UI 单元测试
- [x] 编写真实 Mongo 多节点 mock 集成测试
- [x] 编写并运行本地集成脚本
- [x] 运行受影响的局部测试、typecheck 和 lint
- [x] 审查安全、并发、启动顺序、索引、API 校验、i18n 和未提交差异
- [x] 在升级 runner 前初始化模型运行时；旧系统模型迁移完成后再次发布最新模型缓存
- [x] 所有失败任务不自动重试，支持管理员重试 API
- [x] 移除启动阻塞模式，增加独立任务调度、互斥校验和管理端标记
- [x] 移除全队列失败暂停，以显式依赖约束成功前提
- [x] 将已确认的七个任务切换为独立模式，增加集群共享 3 个并发名额
- [x] 保存失败数据，并在按需加载的 JSON Editor 弹窗中展示逐条原因
- [x] 将失败数据拆到独立集合，成功后按 migrationId 清理

## 23. 已确认决策

1. 启动阻塞模式已删除，所有任务均后台执行；原任务 ID 和顺序保持稳定，历史 succeeded 不重跑，历史 failed 由管理员重试。
2. 普通任务共享串行队列，失败后继续后续可执行项。成功前提全部由 dependsOn 表达：模型权限、知识库、评测和应用模型引用回填依赖旧系统模型迁移；资源快照依赖应用模型引用回填，索引重建状态依赖旧版训练任务迁移。
3. 七个独立任务为成员角色清理、资源创建时间回填、历史订单字段回填、知识库标签升级、成员名设置标记回填、沙箱团队归属回填和目录祖先路径回填。只切换调度模式，不改变业务函数和恢复策略；与 manual、delay、非空 dependsOn 互斥。
4. 独立任务集群共享 3 个 Redis 并发名额，先取得名额再领取 Mongo lease；异常、停止和恢复规则见 11.3。普通队列不占额度。
5. 普通和独立任务复用相同的 Mongo lease、Context、重试、断点和错误报告。明确失败停止 heartbeat，由管理员重试；进程中断留下的 running 可过期接管，两者均保留恢复数据。
6. 不增加事件集合、不记录执行次数、不提供强制成功或让管理员临时切换恢复策略的入口。
