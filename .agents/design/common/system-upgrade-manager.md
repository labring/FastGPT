# 系统升级任务管理设计

## 1. 背景

FastGPT 当前存在多个需要管理员手动调用 API 或运行脚本的数据升级任务。任务的入口、执行状态、并发控制和进度展示不统一，升级过程中主要依赖操作人员阅读版本说明并手动判断是否需要执行。

本设计从未来新增的升级任务开始建立统一执行框架，不接管、不推断也不补录任何历史升级脚本。

## 2. 目标

1. 使用一个静态数组声明未来升级任务，数组顺序是唯一执行顺序。
2. 每个升级任务由独立函数实现，通过统一上下文上报进度和报告错误；需要分批恢复的任务可以保存 checkpoint，小规模原子任务允许全量重跑。
3. MongoDB 使用一张通用状态表记录每个任务的最新状态，另用错误数据表逐条保存坏数据和原因。
4. 多个 App 节点可以同时发现任务，但同一时间只有一个节点获得 lease 并执行当前任务。
5. lease 持有节点异常退出后，其他节点可以在 lease 过期后自动接管。
6. 所有任务严格串行，同一时刻只执行一个任务；当前任务失败后是否继续后续任务由静态 `onFailure` 策略决定。
7. 标记为 `blockStartup` 的任务未全部成功前，当前版本 App 节点不进入业务 ready：普通业务 API 和后台消费者保持关闭。
8. 阻塞任务失败后执行节点继续续租并永久 await，所有节点保持不 ready；修复并重启执行节点后，lease 过期接管路径恢复任务。
9. 非阻塞任务在 App 业务 ready 后继续后台执行；明确失败后不改变 ready，也不会被定时扫描自动重试，Runner 按 `onFailure` 决定暂停或跳过该任务继续后续项。
10. 管理员页面展示任务说明、顺序、阻塞属性、全部阶段状态、阶段错误和逐条失败数据；只允许在线重试非阻塞失败任务。
11. 通过单元测试和真实 MongoDB 集成测试验证并发、接管、顺序、启动阻塞、checkpoint 和失败 lease 恢复。

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
- **Runner / 执行器**：扫描注册表、竞争 lease、构造上下文并串行运行任务的后台组件。
- **Lease / 租约**：MongoDB 中有时限的任务执行权。
- **Run ID**：每次成功获取 lease 后生成的随机 ID，同时作为执行批次标识和 fencing token。
- **Runner ID**：标识一次 Node.js 进程实例，仅用于排查，例如 `hostname:pid:bootId`。
- **Checkpoint**：分批任务决定异常恢复位置的可选持久化游标，不等同于面向管理员的进度文案；全量重跑任务不需要 checkpoint。
- **Startup blocking / 阻塞启动**：`instrumentation-node` 一直等待；所有阻塞任务成功前，节点不 ready，HTTP 流量和后台消费者均不进入该节点。
- **Failure policy / 失败策略**：任务进入 `failed` 后，Runner 是停止后续队列还是跳过该任务继续执行；失败任务本身仍只能由管理员重试。

## 5. 第一性原理与核心约束

### 5.1 顺序、启动阻塞和失败策略是三个维度

注册表始终只有一个总顺序。`blockStartup` 只决定节点什么时候可以进入业务 ready；`onFailure` 只决定当前任务失败后是否暂停后续队列。无论采用哪种策略，Runner 同一时刻都只执行一个任务。

例如：

```text
A 非阻塞（未完成）
B 阻塞（未完成）
C 非阻塞（未完成）
```

当任务使用 `onFailure: 'stop'` 时实际行为为：

```text
A -> B -> App 业务 ready -> C
```

虽然 A 本身可以在线执行，但 B 位于它之后且必须在启动前完成，因此 A 也成为本次启动路径上的前置工作。这是采用单数组严格顺序后的明确取舍。

使用 `onFailure: 'continue'` 的非阻塞任务失败后保持 `failed`，Runner 跳过它继续后续任务；管理员重置该任务后，Runner 会重新按数组顺序处理它，已经成功的后续任务不会重跑。阻塞任务必须使用 `stop`，避免节点仍未 ready 时继续执行不必要的后续数据修改。

### 5.2 Lease 不是幂等替代品

框架提供的是 at-least-once，而不是 exactly-once。分批任务可能在“业务数据已更新、checkpoint 尚未保存”之间退出，接管节点会从旧 checkpoint 重放同一批；全量任务在退出后会重放整个任务。因此无论采用哪种恢复策略，实际重放范围都必须允许重复执行。

### 5.3 自动迁移必须兼容滚动升级

`blockStartup` 只能阻止当前版本的新 App 节点进入业务 ready，无法让已经运行的旧版本节点停止服务。因此所有自动任务必须兼容至少前一个版本：

- 优先新增字段、集合和索引，不直接删除旧结构；
- 读取使用 `newValue ?? oldValue`；
- 过渡期按需要双写；
- 数据回填完成并跨版本稳定后，再在后续版本单独清理；
- 需要全站停机的破坏性操作不进入自动注册表。

### 5.4 注册表必须只追加

为保证滚动升级期间不同版本节点看到相同前缀：

- 已发布任务只能在数组尾部追加；
- 已发布任务 ID、相对顺序、函数语义、`blockStartup` 和 `onFailure` 不可修改；
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
│   ├─ 阻塞任务完成前：instrumentation 持续 await，节点不 ready            │
│   └─ 阻塞任务完成后：启动 worker/cron/watch 并放行业务 API               │
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
  runner.ts          串行调度、lease 生命周期
  service.ts         状态列表和阻塞完成判断
  tasks/README.md          新任务编写约束
  tasks/<task-id>/         每个生产升级任务的自包含目录
    index.ts               任务入口
    service.ts / utils.ts  仅属于该迁移的执行与转换逻辑
```

App 接入与管理员页面：

```text
projects/app/src/instrumentation-node.ts
projects/app/src/pages/api/admin/migrations/list.ts
projects/app/src/web/common/system/migrations/api.ts
projects/app/src/pages/config/system/migrations.tsx
projects/app/src/pageComponents/config/ConfigContainer.tsx
projects/app/src/components/Layout/navbar.tsx
```

测试：

```text
projects/app/test/migration/registry.test.ts
projects/app/test/migration/runner.test.ts
projects/app/test/migration/service.test.ts
projects/app/test/instrumentation-node.test.ts（只验证接入边界，若现有模块可隔离）
projects/app/test/...（API 和页面可测逻辑）
```

首个生产任务为阻塞型 `20260903_migrate_legacy_system_models`，负责把旧
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
  /** 未成功时，当前版本 App 节点不能进入业务 ready。 */
  blockStartup: boolean;
  /** 失败后暂停队列，或跳过当前失败项继续后续任务。 */
  onFailure: 'stop' | 'continue';
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
  status: 'pending' | 'running' | 'failed' | 'succeeded';

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
      key?: string;
      params?: Record<string, string | number | boolean | null>;
      message: string;
      stageKey: string;
      runId: string;
      createdAt: Date;
    };
    updatedAt: Date;
  }>;
  result?: {
    key: string;
    params?: Record<string, string | number | boolean | null>;
  };

  lastError?: {
    key?: string;
    params?: Record<string, string | number | boolean | null>;
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
- 静态标题、描述、版本、顺序和阻塞属性不写入 Mongo，避免代码与数据库元数据漂移；
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
    key?: string;
    params?: Record<string, string | number | boolean | null>;
    message: string;
  };
  createdAt: Date;
};
```

集合通过 `{ migrationId, stageKey }` 索引支持阶段聚合、详情查询和成功清理。列表按当前注册表中的任务 ID 一次聚合错误集合，生成任务级和阶段级 `failedRecordCount`，不在状态表维护可能漂移的冗余计数。错误数组不限制总条数或总字节数；单条 data/reason 仍限制为有限标量字段，避免一条记录携带完整正文、凭证或超大对象。

## 9. 状态机

```text
     pending ── claim ──> running ── 成功 ──> succeeded
                            │
                            ├─ 阻塞任务明确错误 ──> failed + 持续续租/await
                            │                        │
                            │                        └─ 执行节点重启、lease 过期后接管
                            ├─ 非阻塞任务明确错误 ──> failed + 停止续租
                            │                        │
                            │                        └─ 管理员重置 pending 后重新竞争
                            │
                            └─ lease 过期 ──> running（新 runId 接管）
```

`succeeded` 是终态，管理 API 不允许重新执行成功任务。

## 10. Lease 协议

### 10.1 时间参数

默认值：

```text
scan interval       60 秒
heartbeat interval  15 秒
lease duration      90 秒
blocking poll        2 秒
```

必须满足：

```text
heartbeat interval < lease duration / 3
```

时间计算优先使用 MongoDB 服务端 `$$NOW`，避免不同 App 宿主机时钟偏差。

### 10.2 初始化状态

每个节点在启动 runner 时对当前注册表执行 `bulkWrite + $setOnInsert`，为不存在的任务创建 `pending` 状态。多个节点并发初始化依靠 `_id` 唯一性保持幂等。

### 10.3 选择任务

每轮扫描一次性读取注册表 ID 对应的状态，并按照静态数组找到第一个非 `succeeded` 任务：

- 阻塞任务 `failed` 且 lease 未过期：停止，错误节点仍存活并持续续租；
- 阻塞任务 `failed` 且 lease 已过期：执行节点已退出，尝试接管；
- 非阻塞任务 `failed`：停止队列，无论 lease 是否过期都不自动 claim，等待管理员触发重试；
- `running` 且 lease 未过期：停止，等待持有者；
- `pending`：尝试 claim；
- `running` 且 lease 已过期：尝试接管；
- 不允许扫描或 claim 后续任务。

### 10.4 原子 claim

claim 使用单条 `findOneAndUpdate`，过滤条件只接受：

```text
status = pending
或
status in (running, failed) 且 leaseExpireAt <= Mongo $$NOW
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
_id + status in (running, failed) + runId + leaseExpireAt > $$NOW
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

App 在主 Mongo、Redis、S3、VectorDB、基础配置和系统模型运行时缓存可用后，业务
cron/queue/watch 启动前创建 runner。升级脚本可以直接使用已加载的模型能力；若某个脚本
修改模型表，它必须在返回成功前重新发布模型缓存，保证数组中的后续脚本读取新状态：

```text
加载模型 Provider、模板、预装模型和运行时缓存
初始化注册表状态
启动当前节点并立即触发第一次扫描
存在 pending/running 时保留 60 秒扫描器
任务只剩 succeeded/failed 时停止
同步等待所有 blockStartup 任务 succeeded
启动 Mongo watch、BullMQ worker、cron 和训练队列
完成 instrumentation，节点才可 ready
```

`instrumentation-node` 同步等待阻塞迁移完成。阻塞期间 App 管理页面也不可访问；进度和失败原因必须通过日志观察。管理页面用于集群仍有其他 ready 节点时查看状态，以及升级完成后的追踪。

若注册表中没有未完成的阻塞任务，业务启动立即继续。非阻塞任务由扫描器继续后台串行执行；
任务只剩 `succeeded/failed` 终态后停止扫描，避免长期空轮询。

### 11.2 Readiness 边界

阻塞期间不开放 HTTP 控制面。Next.js 会等待 `instrumentation.register()` 返回，而 `register()` 会继续等待 `registerNodeInstrumentation()`；因此阻塞任务未完成时初始化 Promise 不会结束，节点不会进入可服务状态。这里不再额外维护进程级 global ready 标记或 API middleware 门禁，避免两套 readiness 状态产生漂移。

### 11.3 单节点防重入

除 Mongo lease 外，每个进程还有本地 `tickPromise`：

- 定时器触发时若上一轮仍在执行，复用或跳过本轮；
- 避免同一进程的启动立即扫描和分钟定时器重叠；
- Mongo lease 仍然是跨进程最终并发边界。

### 11.4 成功后的推进

lease 持有者成功完成当前任务后立即扫描下一个任务，不等待一分钟。其他节点仍按自己的扫描周期竞争；原持有者不享有下一任务的优先权。

### 11.5 阻塞等待

所有启动中的 App 节点每 2 秒读取阻塞任务状态：

- 所有 `blockStartup` 任务均为 `succeeded`：将本节点标记为业务 ready，并且只启动一次后台消费者；
- 任一阻塞任务为 `pending/running/failed` 或状态缺失：继续等待；
- Mongo 临时读取失败：记录告警并继续等待，不把未知状态视为成功。

阻塞迁移明确失败时，lease owner 在事务中只写入多节点协调所需的最小 `failed + lastError`，不写错误明细集合，随后继续 heartbeat 并永久 await。任务在抛出前按需通过 logger 输出具体诊断；所有等待节点观察到 `failed` 后都各自记录一次错误日志，明确输出任务 ID、最近错误和“修复后重启 App 节点”的操作要求，之后不重复刷屏。只要失败节点存活，lease 就不会过期，任何节点都无法自动重试；修复并重启该节点后，才复用 lease 过期接管路径恢复。其他节点完成任务后，所有等待节点最终都会解除业务阻塞。

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
- `getFailedRecords` 仅供非阻塞任务按需读取上次明确失败留下的坏数据；脚本在继续 checkpoint 后的新数据前，应先重试这些已被跳过的记录；阻塞任务调用时由 Context 拒绝；
- `reportFailedRecords` 仅供非阻塞任务使用，按批替换当前完整未解决错误快照。状态更新时间和错误明细在同一事务中完成，并受 runId fencing 保护；阻塞任务调用时由 Context 拒绝；
- `saveCheckpoint` 在每个幂等批次完成且对应错误快照成功上报后调用。错误快照先于 checkpoint，保证两次调用之间退出时只会重放该批，不会永久跳过坏数据；
- logger 自动附带 `migrationId/runId/runnerId`；
- `fail` 在同一事务中写入唯一 `lastError`、把相关阶段标记为失败、替换独立错误集合并将任务改为 `failed`，然后抛出框架内部终止错误；各阶段异常数据数量由列表查询聚合，阻塞任务通过 `fail` 携带错误明细会被 Context 拒绝；
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
7. **有限进度与错误数据**：进度只上报可序列化的小对象；阻塞任务将具体诊断写终端日志且不写失败明细；非阻塞任务的失败记录只保存定位数据所需的有限标量摘要和逐条原因，不写凭证、完整正文或错误栈。
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
`system_models`，但只把目标表缺失的 system 模型追加到 `ai_models`，不清空或更新已有模型。同名目标
模型完全跳过；仅存在于目标表的模型保留；仅存在于旧表的模型沿用旧 `_id` 新增。system 默认配置
同样不作为执行标记：已有且仍有效的槽位优先，旧表默认标记只补齐缺失或失效槽位。是否执行完全
由升级状态和 lease 决定，重复执行不会覆盖或重复新增模型。最终结果分别展示旧表记录数、新表最终
system 模型数和已经在新表中落位的去重旧模型数；同名目标虽不新增，但仍计为迁移成功。

## 14. 错误与恢复

### 14.1 明确错误

下列情况写入 `failed + lastError`：

- 任务调用 `context.fail(...)`；
- 任务抛出普通异常且 runner 仍然存活；
- checkpoint 解析失败；
- 完成校验失败。

`lastError` 是跨节点协调和失败状态展示所需的有限摘要，不是 Mongo 错误日志。阻塞任务不写 `failedRecords`，具体进度与诊断通过终端日志观察；非阻塞任务才按需保存供管理员查看和修复的逐条错误数据。

明确错误后不会自动重试当前任务：

- 阻塞任务保留 runId 和 lease，继续 heartbeat 并永久 await；所有节点保持不 ready；
- 非阻塞任务停止 heartbeat 并保持 `failed`，App 保持 ready；`onFailure: 'stop'` 暂停后续队列，`onFailure: 'continue'` 则让 Runner 跳过当前失败项继续扫描后续任务。

### 14.2 节点异常退出

进程无法执行 catch 时不写 `failed`。状态保持 `running`，lease 到期后任一存活节点可生成新 `runId` 接管。

### 14.3 阻塞任务修复后重启

阻塞 `failed` 不提供页面或 API 重试。恢复完全复用 lease 过期机制：

```text
修复问题 -> 重启失败的 App 节点 -> heartbeat 停止 -> lease 过期 -> 一个节点原子接管
```

- 保留 checkpoint；分批任务从最后成功批次继续，全量任务忽略 checkpoint 并完整重跑；
- 保留 `lastError` 供页面追踪最近问题，下一次错误覆盖它；
- 失败节点仍存活时 lease 持续有效，全部节点只能等待；
- 管理员修复代码、配置或数据后重启失败节点，使旧 lease 停止续租；
- lease 过期后，所有存活或新启动节点都可竞争，但原子 claim 保证只有一个执行。

### 14.4 非阻塞任务修复后重试

非阻塞任务失败时，管理员可以在页面查看 `lastError` 和逐条 `failedRecords`。修复坏数据、配置或代码后点击重试：

```text
failed -> 原子重置 pending 并释放旧 owner -> runner 重新竞争 lease -> 按任务既定策略恢复 -> 成功后删除错误数据
```

任务获得新 runId 后，管理员重置与过期 lease 接管使用完全相同的恢复语义：保留 checkpoint、progress、lastError 和错误明细。分批任务据此断点续跑，全量任务按其既定语义完整重跑；再次失败时原子替换为本次错误，完整成功后才清理错误数据。但非阻塞 `failed` 不会因节点重启自动执行，必须由管理员显式重置为 `pending`。重试接口不直接调用任务函数，也不绕过 lease。只允许静态注册表中 `blockStartup = false` 且数据库状态确实为 `failed` 的任务；阻塞任务、运行中任务和已成功任务均拒绝。

## 15. 管理员 API

该能力属于内部管理员升级功能，按 API 规范可豁免公开 OpenAPI 文档，但不豁免鉴权和 Zod 校验。

### 15.1 获取列表

```text
GET /api/admin/migrations/list
```

- 使用 `adminCert` 校验 root 管理员；
- 无请求业务参数，不创建空入参 Schema；
- 将静态注册表与 Mongo 状态合并，并从错误集合一次聚合任务和阶段的 `failedRecordCount`，不在高频轮询中传输明细数组；
- Mongo 状态缺失按 `pending` 返回；
- 使用 Zod response schema 校验返回值。

响应包含：

```text
id, version, order, nameKey, descriptionKey, blockStartup, onFailure,
status, progress, result, lastError, failedRecordCount,
heartbeatAt, leaseExpireAt,
startedAt, lastStartedAt, completedAt, updatedAt
```

不向客户端返回 checkpoint 和当前 lease 的顶层 runId，避免泄露内部迁移数据和误导管理员手动操作。`lastError.runId` 作为最近一次失败的有限追踪字段保留，便于与终端日志关联。

### 15.2 重试非阻塞失败任务

```text
POST /api/admin/migrations/retry
body: { migrationId: string }
```

- 使用 `adminCert` 校验 root 管理员并通过 `parseApiInput` 校验 body；
- 仅把非阻塞 `failed` 状态原子重置为 `pending`；
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
/system/migrations
```

导航名称：`版本升级`，归入系统配置区域附近。

### 16.1 页面任务

管理员需要在一个页面回答四个问题：

1. 当前是否存在阻塞系统启动的任务？
2. 当前是谁在执行哪个任务，lease 是否健康？
3. 每个任务执行到了哪里？
4. 失败的是哪些数据、每条为何失败，以及应重启节点还是在线重试？

### 16.2 视觉与布局

沿用 FastGPT 管理端 Chakra token，不引入新的字体或全局色板。页面的识别元素是“有序迁移轨道”：左侧顺序线表达严格串行，右侧卡片承载状态和进度，而不是使用通用数据大屏。

```text
┌─ 版本升级 ───────────────────────────────────────────────┐
│ 当前状态：后台执行 / 阻塞升级 / 全部完成                  │
│ 3 个任务 · 2 已完成 · 1 执行中                           │
├──────────────────────────────────────────────────────────┤
│ ● 1  任务名称                     [已完成] [阻塞启动]     │
│ │    版本、说明、完成时间                                 │
│ ● 2  任务名称                     [执行中]                │
│ │    阶段 1 [完成] · 阶段 2 ███████░░ 72% [执行中]       │
│ ○ 3  任务名称                     [等待中]                │
│      版本、说明                                            │
└──────────────────────────────────────────────────────────┘
```

交互：

- 页面每 10 秒刷新状态，全部任务成功后停止自动刷新；
- 离开页面自动停止轮询；
- 卡片按静态顺序展示全部阶段及其待执行、执行中、等待接管、完成或失败状态；阶段错误和异常数据数量归属到对应阶段；
- 每个失败阶段下方展示自己的错误数量；点击后打开 V2 弹窗，只加载该阶段并用只读 JSON Editor 展示逐条失败数据和原因；任务级重试按钮保持作用于整个任务；
- 非阻塞 `failed` 提供重试按钮，阻塞 `failed` 只提示修复后重启节点；
- `running` 但 lease 已过期时展示“等待接管”，不误报为正常执行；
- 空注册表展示“当前版本没有需要执行的升级任务”；
- 支持移动端单列布局和键盘焦点；
- 动画只用于进度变化，尊重 reduced motion。

### 16.3 i18n

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
- 阻塞等待开始和结束。

高频 heartbeat 不逐次记录 info，避免日志噪音；只记录续租失败。

状态表用于当前视图，现有结构化日志用于过程追踪。第一版不新增 migration events 集合。

## 18. 关键竞争与故障场景

| 场景 | 预期结果 |
|---|---|
| 三个节点同时 claim pending | 一个成功，两个返回未获取 |
| 持有者正常 heartbeat | 其他节点不接管 |
| 持有者 SIGKILL | 状态保持 running；过期后一个节点接管 |
| 旧持有者暂停后恢复 | runId/lease 条件阻止其更新状态 |
| 业务写入后、checkpoint 前退出 | 新持有者重放该幂等批次 |
| 阻塞任务明确异常 | 状态 failed，owner 续租，后续任务停止；全部保持 not ready |
| 修复后重启阻塞失败 owner | heartbeat 停止；lease 过期后只有一个节点接管 |
| 非阻塞任务明确异常 | 状态 failed，owner 停止续租；App 保持 ready，定时扫描不自动重试 |
| 管理员重试非阻塞失败任务 | 原子重置 pending 并保留运行状态；随后只有一个 runner 获得 lease，并按任务既定恢复策略执行 |
| 前一个任务 running | 所有节点都不得 claim 后一个任务 |
| 阻塞任务未完成 | 所有当前版本 App 节点停留在 instrumentation await，不 ready |
| 仅非阻塞任务未完成 | App 节点业务 ready，任务后台继续 |
| Mongo 暂时不可读 | 不认为任务成功；记录告警并继续探活 |
| 新旧 App 版本同时运行 | 新版本执行新增尾部任务；旧版本只认识共同前缀 |

## 19. 测试方案

### 19.1 纯单元测试

- 注册表拒绝重复 ID；
- 数组顺序决定下一个可执行任务，`onFailure: 'continue'` 的失败项会被跳过；
- 阻塞判断只在所有 `blockStartup` 任务成功后为 true；
- progress 参数大小、类型和 current/total 边界校验；
- 普通异常序列化和裁剪；
- 本地 tick 防重入；
- 阻塞 failed owner 继续续租时任何节点都不能 claim；
- 阻塞 failed lease 过期后只能有一个接管者；
- 非阻塞 failed 不会因 lease 过期被定时扫描自动重试，`continue` 策略允许后续任务执行；
- 只有非阻塞 failed 可由管理员重置，阻塞、pending、running、succeeded 均不可通过 API 重试。

### 19.2 Mongo 集成测试

使用项目现有 `mongodb-memory-server` replica set，创建多个注入 mock registry 的 runner：

1. 三节点并发 claim，断言同一脚本只存在一个有效 runId；
2. 三个 mock 任务严格按数组顺序运行；
3. 非阻塞、阻塞、非阻塞交错时，业务 readiness 在阻塞任务成功后解除；
4. 暂停 heartbeat 并推进时间，另一个 runner 接管；
5. 旧 runner 的 progress/checkpoint/success 写入因 runId 不匹配失败；
6. checkpoint 后模拟退出，接管后从 checkpoint 继续；
7. 非阻塞分批任务在 checkpoint 前及时替换完整错误快照，随后发生普通异常也不会清空已上报明细；明确失败在状态表保存本次 lastError，`stop` 暂停后续任务，`continue` 跳过失败项继执行；阻塞任务的错误明细读写会被 Context 拒绝；
8. 阻塞 failed owner 持续续租时不重试，停止 owner 后由过期 lease 接管并成功完成；
9. 只有非阻塞任务时业务 readiness 立即满足，但后台任务最终完成；
10. 非阻塞 failed 即使 lease 过期也不自动执行；管理员重置后保留 checkpoint 和错误数据，并按任务既定策略恢复；
11. 多次运行成功任务不会再次执行。

### 19.3 本地验证方式

不在仓库保留一次性迁移测试脚本。多节点竞争、事务、lease 接管、错误快照和 checkpoint
恢复统一通过 `projects/app/test/migration/` 下使用隔离 `mongodb-memory-server` replica set 的测试覆盖，
避免临时入口被误用于真实数据库。

### 19.4 管理端测试

- list API root 鉴权、静态/动态数据合并和响应校验；
- retry API root 鉴权、入参校验和仅限非阻塞 failed 的状态约束；
- 页面状态派生函数覆盖 pending/running/stale/failed/succeeded；
- i18n progress/error key 与 params 渲染、失败记录弹窗；

### 19.5 验证范围

开发期间只运行新测试和受影响的 instrumentation/admin 局部测试。用户最终验收前不主动运行全仓测试。

## 20. 安全边界

- 管理接口仅允许 root 管理员；
- 客户端不能提交 checkpoint、progress、result 或迁移状态；
- checkpoint、progress、result、错误字符串和单条错误数据限制体积；错误数据数组不受状态文档大小限制；
- 日志不得输出业务数据正文、凭证或连接串；
- 迁移集成测试只操作测试框架创建的隔离数据库；
- 不修改部署 `.yml/.yaml`。通过同步等待 instrumentation 控制节点启动完成，阻塞期间不启动业务消费者。

## 21. 已知取舍

1. 60 秒扫描使运行中节点异常后的最坏接管时间约为 `剩余 lease + 60 秒`；任务只剩成功或失败终态后扫描器停止。
   管理员重试会唤醒处理请求的节点；若该节点在其他节点均空闲时立即崩溃，可能需要再次点击重试或重启节点，
   这是为消除长期空轮询而接受的取舍。
2. 严格数组会让位于后续阻塞任务之前的旧后台任务也进入启动关键路径；若未来必须跳过无关任务，需要显式依赖图，而不是破坏数组顺序。
3. 阻塞任务失败时当前节点的 App 管理页同样不可访问，排障入口是结构化日志；若集群仍有其他 ready 节点，可从其他节点查看状态页，但仍不能在线重试阻塞任务。
4. 状态表没有事件历史，管理员页面只能看到各阶段最新快照、成功后的最终结果、最近错误和本次失败记录；完整时间线依赖结构化日志。
5. 不对任意业务写操作提供数据库级 fencing，正确性最终依赖任务幂等，以及分批 checkpoint 或全量原子重建策略。

## 22. TODO

- [x] 调研 App instrumentation、Mongo、现有迁移、日志、管理端和测试基础设施
- [x] 编写需求与技术设计文档
- [x] 确认管理页面位于 `projects/app`，普通异常写入单条 lastError
- [x] 新增共享状态枚举、Zod schema 和类型
- [x] 新增 Mongo migration state schema/entity
- [x] 实现静态注册表与校验
- [x] 实现 context、lease、heartbeat、fencing 和 runner
- [x] 接入 App instrumentation 同步阻塞与消费者延迟启动
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
- [x] 非阻塞失败任务不自动重试，增加管理员重试 API
- [x] 保存失败数据，并在按需加载的 JSON Editor 弹窗中展示逐条原因
- [x] 将失败数据拆到独立集合，成功后按 migrationId 清理

## 23. 已确认决策

1. 管理页面位于开源 `projects/app` 的 root 管理员配置区；阻塞失败只展示排障信息，非阻塞失败允许管理员修复后触发重试。
2. runner 捕获普通 `throw` 时写入唯一 `lastError` 并进入 `failed`，避免代码遗漏导致跨节点无限自动重试。
3. 首个生产任务是阻塞型旧系统模型迁移；执行资格只由升级状态和 lease 决定。
   任务不再从 `ai_models` 或 system 默认记录推断是否迁移过；每次执行都按模型名追加旧表独有
   模型。同名目标模型完全跳过，目标表独有模型不删除；已有有效默认槽位优先，旧表默认标记只
   补缺。所有 mock 任务仍只进入测试。
4. 不记录执行次数。阻塞任务明确失败后 owner 持续续租并永久等待，修复并重启 owner 后通过 lease 过期触发接管；非阻塞任务明确失败后停止续租并保持 `failed`，Runner 按静态 `onFailure` 暂停或继续后续任务，由管理员在页面重置为 `pending` 后再正常竞争 lease。
5. 不提供由管理员选择的“完全重新执行”模式。管理员重试和系统重启接管都保留现有状态，具体任务在发布时固定选择分批断点续跑或幂等全量重跑；非阻塞任务的错误明细在再次失败时替换，在完整成功时删除，阻塞任务不写错误明细。
