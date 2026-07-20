# Mongo + Redis Durable Saga 库与 Sandbox 生命周期重构

状态：实现完成
最后核对：2026-07-20

## 1. 结论

保留 Mongo + Redis 路线，但调整原方案后才能进入实现：

- 新建私有 workspace 包 `@fastgpt-sdk/durable-saga`，核心不依赖 FastGPT、Mongo、Redis、BullMQ
  或具体 Zod 类型；独立开源授权需要单独法务决策，不能只在 package.json 中声明。
- Mongo Driver 是持久状态、checkpoint、fencing、reservation 和恢复时间的权威。
- Redis LeaseProvider 只降低并发执行概率并传播取消信号，不是提交凭证。
- 单 `concurrencyKey` 改成多 `reservationKeys`；Sandbox 持久 reservation 收窄到 lifecycle key，
  source key 只作为初始化 advisory lease，避免一个 blocked 用户阻塞整个 App。
- Activity 强制声明副作用策略，崩溃后由框架自动进入 replay/reconcile/blocked，不能只靠超时隔离。
- 增加 Mongo heartbeat 和 execution token/epoch；Redis 与 Mongo 任一续期失效都停止执行。
- 每个步骤支持事务性领域投影，Saga checkpoint 与 Sandbox status 在同一事务提交。
- FastGPT Adapter 默认使用 BullMQ 做即时/延迟 wake-up，但 Mongo polling 始终负责补漏。
- 第一版不实现自动补偿、强制 supersede、DAG、Signal、Child Workflow 或完整 replay。
- Sandbox 生命周期只使用 Saga mutator 单轨执行，不提供 feature flag 分流。

当前设计目标准确收敛为：

> 一个具备独立库边界、线性 checkpoint、at-least-once Activity、支持多资源 reservation、
> reconcile-first 和事务性领域投影的 Durable Saga Core。

## 2. 背景

重构前，provision、stop、archive、restore、provider migration、delete 和 Legacy migration
分别编排 Provider、Volume、S3、Mongo 与 Redis，缺少统一的 checkpoint 和恢复协议，主要问题包括：

- phase 为自由字符串，步骤输出和版本没有统一校验。
- Redis heartbeat 与 Mongo heartbeat 没有统一生命周期。
- stale takeover 只能依赖各流程自行判断隔离窗口。
- Provider migration 等复合流程需要重复嵌套另一条状态机。
- crash after effect before checkpoint 的不确定结果没有统一 reconcile 协议。
- recovery 目前只覆盖部分过渡态。

## 3. 目标与非目标

### 3.1 第一版目标

- 仅使用 FastGPT 已有 MongoDB 和 Redis，不新增服务。
- 相同 Saga ID 幂等启动；同 ID 不同输入显式冲突。
- 多个资源键在 Mongo transaction 中原子 reservation。
- Redis 多 key lease 按稳定顺序获取，避免死锁。
- 每次执行使用随机 token 和单调 epoch fencing。
- 已 checkpoint 步骤不主动重放；未 checkpoint Activity 按副作用策略恢复。
- 支持 retry、backoff、timeout、heartbeat、reconcile 和人工 blocked。
- 支持 definition version、manifest signature 和旧版本注册。
- 支持步骤级 output schema、纯状态 apply 和事务性领域 project。
- 支持 Mongo polling recovery、手工 retry/query 和持久诊断事件。
- 提供 memory driver、manual clock 和 fault injection 测试工具。

### 3.2 第一版非目标

- 不实现任意 DAG、循环、BPMN 或可视化编辑器。
- 不实现 Temporal 式完整 Event History replay。
- 不实现跨服务命令/应答和 Transactional Outbox 消息总线。
- Core 不依赖 BullMQ，也不把 Queue job、attempt 或结果作为持久事实。
- 不使用 BullMQ Flow、Queue state 或 stalled 状态表达 Saga 步骤状态。
- 不实现自动 compensation；Sandbox 第一版全部 forward recovery。
- 不实现立即 supersede；旧 Activity 未静默前不能让新 Saga 占用相同 reservation。
- 不承诺 Provider exactly-once，也不把 `assertExecutionActive` 描述成远端 fencing。

## 4. 参考实现与直接结论

设计参考以下宽松许可证项目和官方语义：

- Temporal（MIT）：Workflow 与非确定性 Activity 分离，Activity 可能重复执行并要求幂等。
- Durable Task Framework（MIT）：持久结果、恢复和版本化编排。
- DBOS TypeScript（MIT）：Workflow ID 幂等，按步骤 ID checkpoint，schema 只要求 `parse`。
- Dapr（Apache-2.0）：持久 Workflow 和按资源 ID 串行访问。
- XState（MIT）：纯 transition、持久 snapshot 和执行环境分离。
- Eventuate Tram Sagas（Apache-2.0）：orchestration、outbox 和 idempotent consumer。
- MongoDB：单文档 CAS 原子；跨文档一致性依赖 replica set transaction。
- Redis：随机 token、TTL、token 校验续期/释放；lease 过期不能阻止旧进程继续运行。

直接结论：

1. 框架保证 durable at-least-once，不虚构 exactly-once。
2. Redis 只承担执行协调；Mongo token 决定谁能 checkpoint。
3. 隔离时间本身不能确定远端结果，必须配合幂等、reconcile 或人工处理。
4. Saga 是执行进度权威；Sandbox `status` 是业务可用性投影，两者通过 transaction 保持一致。
5. 领域 transaction hook 只能执行 Mongo 操作，禁止任何外部 I/O。

参考资料：

- <https://docs.temporal.io/activities>
- <https://docs.temporal.io/encyclopedia/retry-policies>
- <https://learn.microsoft.com/en-us/azure/durable-task/common/durable-task-orchestrations>
- <https://docs.dbos.dev/architecture>
- <https://stately.ai/docs/persistence>
- <https://eventuate.io/docs/manual/eventuate-tram/latest/about-eventuate-tram.html>
- <https://docs.bullmq.io/guide/jobs/stalled>
- <https://docs.bullmq.io/patterns/idempotent-jobs>
- <https://docs.bullmq.io/guide/jobs/job-ids>
- <https://www.mongodb.com/docs/manual/core/write-operations-atomicity/>
- <https://www.mongodb.com/docs/drivers/node/current/crud/transactions/>
- <https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/>

## 5. 库分层

```text
sdk/durable-saga/
  src/core/
    definition.ts       definition/step/schema/retry/effect 类型
    state.ts            纯状态转换和不变量
    error.ts            conflict/retryable/blocked 等错误
    registry.ts         显式 registry 和 manifest signature
  src/runtime/
    engine.ts           start/run/retry/query
    engine.ts           同时实现执行 slice、heartbeat、timeout、reconcile 和 recovery
    ports.ts            Store/Lease/Clock/Id/Observer 端口
  src/testing/
    memoryDriver.ts
    manualClock.ts
    faultInjector.ts
```

```text
packages/service/common/durableSaga/
  schema.ts             Mongoose 持久结构
  entity.ts             Mongo Driver 原子命令
  transaction.ts        专用 transaction runner
  redisLease.ts         LeaseProvider adapter
  bullmqWakeup.ts       WakeupScheduler 与只按 sagaId/revision 运行的 Worker
  recovery.ts           进程内合并的 Mongo polling 补漏 adapter
```

```text
packages/service/core/ai/sandbox/application/lifecycle/
  definitions.ts        Sandbox Saga definitions
  legacyDefinition.ts   冻结 Legacy group 外层 Saga
  service.ts            registry、engine、worker、poller 与 aggregate 路由
```

`@fastgpt-sdk/durable-saga` 不得 import：

- `mongoose`、`mongodb`、`ioredis`、`bullmq`。
- FastGPT logger、env、timer lock 或业务类型。
- 具体 Zod 类型。
- 模块级全局 registry 或单例连接。

Schema 使用结构化最小接口，直接兼容 Zod：

```typescript
type RuntimeSchema<T> = {
  parse(value: unknown): T;
};
```

## 6. 核心端口

```typescript
type DurableSagaStore<TTransaction> = {
  start(params: StartCommand<TTransaction>): Promise<StartResult>;
  load(sagaId: string): Promise<DurableSagaSnapshot | null>;
  claimExecution(params: ClaimCommand): Promise<ClaimResult>;
  startStep(params: StartStepCommand): Promise<CommitResult>;
  commitStep(params: CommitStepCommand<TTransaction>): Promise<CommitResult>;
  scheduleRetry(params: RetryCommand): Promise<CommitResult>;
  block(params: BlockCommand): Promise<CommitResult>;
  heartbeat(params: HeartbeatCommand): Promise<boolean>;
  complete(params: CompleteCommand<TTransaction>): Promise<CommitResult>;
  findDue(params: FindDueCommand): Promise<readonly SagaCandidate[]>;
};

type LeaseProvider = {
  withLeases<T>(
    keys: readonly string[],
    run: (lease: ExecutionLease) => Promise<T>
  ): Promise<T>;
};

type WakeupScheduler = {
  schedule(params: {
    sagaId: string;
    expectedRevision: number;
    runAt: Date;
  }): Promise<void>;
};

type SagaClock = { now(): Date };
type SagaIdGenerator = { nextId(): string };
type SagaObserver = { onEvent(event: SagaRuntimeEvent): void | Promise<void> };
```

`TTransaction` 对 core 是 opaque generic。Mongo Driver 使用 `ClientSession`，memory driver 使用自己的
事务对象。`WakeupScheduler` 是可选运行时端口；memory runtime 可直接执行，FastGPT 默认注入 BullMQ。
Mongo reservation collection 和 partial index 属于 Driver 实现细节，不进入公共 API。

Registry 必须显式创建、注册、seal 和注入 Engine。重复 `name@version` 或相同版本不同 manifest
signature 直接报错，不能使用全局 Map 静默覆盖。

## 7. Definition 与 Step API

```typescript
const archiveSandboxSaga = defineSaga({
  name: 'sandbox.archive',
  version: 1,
  input: ArchiveInputSchema,
  state: ArchiveStateSchema,
  steps: [
    defineStep({
      id: 'archive-uploaded',
      output: ArchiveRefSchema,
      effect: {
        type: 'reconcileRequired',
        isolationMs: 45 * 60_000,
        reconcile: reconcileArchiveUpload
      },
      timeoutMs: 15 * 60_000,
      retry: archiveRetryPolicy,
      execute: uploadArchive,
      apply: ({ state, output }) => ({ ...state, archive: output }),
      project: projectArchiveUploaded
    })
  ]
});
```

Activity runtime：

```typescript
type SagaActivityRuntime<Input, State> = {
  sagaId: string;
  definitionVersion: number;
  executionEpoch: number;
  stepId: string;
  stepAttempt: number;
  idempotencyKey: string;
  input: Input;
  state: State;
  signal: AbortSignal;
  assertExecutionActive(): Promise<void>;
};
```

步骤副作用策略必须显式声明：

```typescript
type EffectPolicy<Output> =
  | { type: 'idempotent' }
  | {
      type: 'reconcileRequired';
      isolationMs: number;
      reconcile(runtime: SagaActivityRuntime<unknown, unknown>): Promise<
        | { type: 'applied'; output: Output }
        | { type: 'notApplied' }
        | { type: 'pending'; retryAfterMs: number }
      >;
    }
  | { type: 'manual' };
```

规则：

- `output.parse` 成功后才能 checkpoint。
- `apply` 是同步纯函数，返回完整新 state；禁止模糊 shallow merge。
- 新 state 必须再次经过 state schema 校验。
- `project` 与 checkpoint 在同一 Driver transaction 中执行。
- `project` 只允许使用 transaction 做数据库操作，且必须可被事务 callback 安全重试。
- 步骤幂等键固定为 `hash(sagaId, stepId, direction)`，不能包含 attempt。
- `when` 条件如需支持，只能是基于 input/state 的同步纯函数。

## 8. 持久状态

### 8.1 Saga Snapshot

```typescript
type DurableSagaSnapshot = {
  sagaId: string;
  name: string;
  version: number;
  manifestSignature: string;
  inputHash: string;
  reservationKeys: string[];
  status:
    | 'pending'
    | 'running'
    | 'waiting'
    | 'blocked'
    | 'completed'
    | 'failed';
  input: unknown;
  state: unknown;
  nextStepIndex: number;
  executionEpoch: number;
  currentStep?: {
    stepId: string;
    phase: 'started' | 'uncertain';
    executeAttempts: number;
    reconcileAttempts: number;
    idempotencyKey: string;
    startedAt: Date;
    takeoverNotBefore: Date;
    lastError?: SerializedSagaError;
  };
  execution?: {
    token: string;
    epoch: number;
    heartbeatAt: Date;
  };
  nextRunAt?: Date;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
};
```

只保留 `nextStepIndex`，不再同时保存 `cursor + completedSteps`。已完成输出通过 state 表达；第一版
没有 compensation，因此不需要 completed stack。

### 8.2 状态语义

- `pending`：等待执行，持有 reservations。
- `running`：某 execution token 正在执行，持有 reservations。
- `waiting`：等待自动重试/reconcile，持有 reservations。
- `blocked`：需要人工 retry/resolve，持有 reservations。
- `completed`：领域 terminal transaction 完成后释放 reservations。
- `failed`：只有领域 `onFailure` 已投影到明确终态时才允许释放；否则必须使用 `blocked`。

某个进程缺少 definition/version 时只跳过并报警，不能自动把 Saga 写成 terminal failed。确认版本已
永久下线后，管理员才能将其置为 blocked 或执行迁移。

### 8.3 Mongo Driver collections

FastGPT Mongo Driver 默认使用：

- `durable_saga_instances`
- `durable_saga_reservations`

Reservation 每个资源键一条：

```typescript
type DurableSagaReservation = {
  _id: string;
  ownerSagaId: string;
};
```

启动事务原子占用所有去重、排序后的 reservation；terminal transaction 只按 ownerSagaId 释放。
stale execution 只能接管同一个 Saga，绝不能靠 TTL 释放 reservation。

运行事件只通过 observer 输出日志/指标，不再维护无人消费的持久事件集合，避免每个 checkpoint 增加
事务写放大。

## 9. 执行、heartbeat 与不确定结果

### 9.1 启动

1. 调用方提供唯一 command/sagaId；同一资源可重复 stop，因此不能只按 sandboxId + definition。
2. 校验 definition、manifest、input 和 inputHash。
3. Driver transaction 内解析 reservationKeys、原子占用 reservation、调用 `initialize(tx)` 并创建 Saga。
4. 相同 sagaId + 相同 inputHash 返回 existing；相同 sagaId + 不同 inputHash 报 conflict。
5. reservation 被其他 active Saga 占用时返回 conflict，不提供立即 supersede。
6. transaction 成功后 best-effort 调用 WakeupScheduler；调度失败不回滚已经提交的 Saga。
7. 必须同步等待结果的入口仍可直接调用 `engine.run(sagaId)`，但后台流程默认交给 Worker。

### 9.2 执行 guard

1. 按稳定顺序获取全部 Redis leases。
2. Mongo CAS 生成随机 execution token，并 `$inc execution.epoch`。
3. 启动 Mongo heartbeat loop，更新条件必须包含 sagaId + running + token。
4. Redis lease 丢失时停止 Mongo heartbeat，并 abort Activity signal。
5. Mongo heartbeat 连续失败超过 grace period时停止 Redis 续租，并 abort Activity signal。
6. waiting/blocked/terminal 必须清空 execution。
7. recovery 只能 CAS heartbeat 已 stale 的原 token；旧 token 不能 checkpoint。

不持久化 Redis `leaseExpiresAt`，避免把应用时钟推算值伪装成 Redis 权威事实。支持外部 fencing 的
Provider 可以额外消费单调 execution epoch；不支持时仍依赖幂等/reconcile。

### 9.3 Step 恢复

- 新步骤先事务写 `currentStep.phase=started` 和 `takeoverNotBefore`，再执行 effect。
- execute 成功后校验 output，纯 apply 生成新 state，transaction 同时执行 project、推进 index、
  清空 currentStep。
- 进程退出、timeout、lease 丢失或 heartbeat stale 时，started 自动视为 uncertain。
- `idempotent`：到达安全接管时间后使用相同幂等键重试。
- `reconcileRequired`：隔离后必须先 reconcile；applied 走正常 commit，notApplied 才重放 execute，
  pending 继续 waiting。
- `manual`：进入 blocked，禁止自动重放。

`timeoutMs` 必须传播 AbortSignal；不能取消底层请求的 SDK 不得仅用 `Promise.race` 宣称任务终止。
若既不幂等也无法 reconcile，effect 必须声明 manual。

## 10. Transaction 规则

不能直接复用现有 `mongoSessionRun`。Mongo Driver 新增专用 transaction runner：

- 基于官方 `session.withTransaction()` 或完整实现 error label 协议。
- 仅 `TransientTransactionError` 重试整个 callback。
- `UnknownTransactionCommitResult` 重试 commit，不能盲目重跑业务 callback。
- 使用 primary、majority write concern，并限制 transaction 时间。
- 随机 saga/token ID 在 callback 外生成。
- terminal transaction 重入时识别已提交结果，按幂等成功返回。
- initialize/project/terminal hook 只能访问同一 Mongo transaction，禁止日志、Provider、Redis、S3、
  Queue 等外部可见副作用；Observer 事件统一在 commit 后触发。

## 11. Wake-up、Recovery 与运维 API

BullMQ 的职责仅是唤醒，不是持久工作流引擎：

- Job payload 只包含 `sagaId + expectedRevision`，Worker 必须重新读取 Mongo。
- Job ID 使用 `hash(sagaId, expectedRevision, runAt)`，避免冒号和同 revision 重复入队。
- pending Saga 立即入队；waiting Saga 使用 delayed job 接近 `nextRunAt` 唤醒。
- stale/deduplicated/delayed job 到达时，如果 revision、status 或 nextRunAt 已变化，Worker 直接 no-op。
- BullMQ stalled job 可能被重新投递；重复 Worker 由 Redis leases 和 Mongo token/CAS 收敛。
- 业务 retry/backoff 只写 Mongo；BullMQ attempts 仅用于短暂的 Worker/Redis/加载故障，不能形成第二套
  业务重试策略。
- Queue 完成/失败结果、attemptsMade 和 job retention 不进入 Saga 查询或恢复判断。
- 确定性 job 完成或最终失败后立即移除，保证 Mongo revision 未变化时 polling 可以再次添加同一 jobId。

FastGPT Mongo polling adapter 每分钟补漏：

- 启动时先扫描一次，之后按周期扫描。
- 固定 batch、稳定排序、进程内并发上限。
- 扫描 pending、到期 waiting 和 stale running，并直接 inline claim/run。
- Mongo 已提交但 Queue 入队失败、Redis Queue 数据丢失或 job 被提前清理时，poller 不依赖 BullMQ
  仍可恢复执行。
- poller 在进程内合并重叠扫描；跨进程重复扫描由幂等 jobId 和 Mongo claim 收敛。

因此 BullMQ 提高的是恢复延迟、`nextRunAt` 调度精度、吞吐和负载隔离，不提高 exactly-once 或领域
状态准确性。即使完全移除 Queue，Mongo polling 仍能恢复，只是最坏唤醒延迟退化到扫描周期。

公共运维 API：

- `engine.get(sagaId)`
- `engine.run(sagaId)`
- `engine.resolveBlocked(sagaId, { expectedRevision, resolution })`
- `engine.recoverDue({ limit, concurrency })`

Blocked 恢复使用 `retryReconcile` 或人工确认的 `confirmNotApplied`，禁止布尔参数直接清除不确定步骤。

## 12. Sandbox Binding

Saga 是执行权威，Sandbox status 是业务投影。Sandbox 暂时保存：

```typescript
type SandboxActiveSaga = {
  sagaId: string;
  type: SandboxLifecycleType;
};
```

所有领域 initialize/project/terminal 更新必须匹配 `activeSaga.sagaId`。关键行为映射：

| Saga | Durable steps / project | 必须保留的现有语义 |
| --- | --- | --- |
| stop | providerStopped | lastActiveAt CAS；重复 stop 周期使用新 commandId |
| archive | archiveUploaded -> providerDeleted | Provider 删除后只允许 forward completion |
| restore | archiveInstalled -> archiveCleanupEnqueued | 清理先进入持久删除队列 checkpoint，再发布 running |
| providerMigration | targetValidated -> archive steps -> providerSwitched | 删除旧资源前先验证目标 Provider 配置 |
| provision | providerEnsured -> published | source 初始化 lease + lifecycle reservation，发布前不可用 |
| delete | providerDeleted -> volumeDeleted -> archiveDeleteScheduled -> recordDeleted | lifecycle reservation；领域记录删除与 Saga terminal 同事务 |
| legacyMigration | frozen group outer step + per-record phase | 输入 manifest 固定顺序，record CAS 由 targetSagaId/manifest/index fencing |

Restore 与 Delete 都只 checkpoint “持久删除任务已入队”，不虚构同步物理删除完成。Restore publish
running 前必须先提交该 checkpoint，observer 不再承载业务清理。

`upstreamId` 是 Adapter 返回并可持久化的 opaque handle，用于跨进程稳定重绑定同一个上游资源，
不要求等同于 FastGPT `sandboxId` 或 Provider 的某种统一物理 ID。OpenSandbox 中它取 `info.id`；
Sealos wire DTO 的 `upstreamID` 是独立的 create 参数，不属于这个持久化契约。

OpenSandbox create 不能只依赖 sessionId 查询第一条。接入 provision/restore 前必须：

- metadata 写入 sagaId + step idempotency key。
- 把 Adapter 返回的 opaque handle 持久化为 `metadata.upstreamId`。
- reconcile 处理零条、一条和多条匹配，多条不能静默取第一条。
- 运行态和生命周期优先使用 Mongo 持久化的 `upstreamId`；相同 durable marker 的重复实例按
  createdAt/id 选择 canonical 并删除其余实例。
- 归档删除上游资源或切换 Provider 后，在 terminal transaction 中清除失效的 `upstreamId`。

Source 删除继续使用旧 source Redis lease。新 Saga 的 initialize 也在同 key 内执行并在 Mongo
transaction 中复核 source 存活；执行 slice 只持 lifecycle lease。删除遇到 transitional
`activeSaga` 时必须 join/resume 原 Saga，只有其完成并且 delete Saga terminal completed 后才可返回，
pending/blocked/unmanaged transitional 状态一律向上报错，禁止静默硬删 source。

## 13. 单轨切换与 Legacy 迁移

`upstream/main` 没有发布过 v2 lifecycle runner 或中间状态。新版本直接使用 Durable Saga 单轨运行，
也不提供环境变量回退路径。

正式存量只有 `agent_sandbox_instances` Legacy 集合。管理员 4160 migration 默认 dry-run，真实执行时：

1. 全表校验 Legacy 数据。
2. 按 Skill 或 App 用户冻结确定性 manifest。
3. 通过正常 `engine.start()` 执行 Legacy Workspace migration Saga。
4. 每条 Workspace 安装并清理完成后删除对应 Legacy 记录。
5. 全组完成后才发布 `agent_sandbox_instances_v2` running aggregate。

运行时、SDK 和启动流程只处理由当前 definition 正常启动的 Saga snapshot。

## 14. 测试要求

### 14.1 SDK Core

- 纯状态转换表和非法转换。
- RuntimeSchema 输入、输出和新 state 校验。
- sagaId 相同输入返回 existing，不同 inputHash 冲突。
- manifest signature 和重复 registry 注册。
- retry/backoff/timeout/reconcile/manual blocked。
- fake clock，测试禁止真实 sleep。
- TypeScript `expectTypeOf` 验证 definition 推导。

### 14.2 Driver conformance

memory driver 与 Mongo driver 跑同一套 contract：

- 多 reservation 原子占用和 owner 条件释放。
- 两个 Engine 并发 claim，旧 token/epoch 无法提交。
- heartbeat 更新、丢失和 stale takeover。
- transaction rollback、TransientTransactionError、UnknownTransactionCommitResult。
- stepStarted 后每个持久边界故障注入。
- active/blocked Saga 不被 TTL 删除；terminal tombstone 默认也永久保留。
- Mongo commit 成功但 BullMQ schedule 失败，polling 能补投。
- BullMQ 重复/stalled job 只有一个 execution token 可以提交。
- 旧 delayed job 的 expectedRevision 不匹配时 no-op。
- Queue 数据清空后 active Saga 仍能从 Mongo 恢复。
- BullMQ attempts 不绕过 Mongo nextRunAt 和业务 RetryPolicy。

Mongo 测试必须使用真实 `MongoMemoryReplSet`，不能使用当前绕过 transaction 的全局 mock。

### 14.3 Sandbox 回归

- stop 与 keepalive lastActiveAt CAS。
- archive 上传后 crash、Provider 删除后 crash。
- restore 安装后 crash，S3 cleanup 入队 checkpoint 早于 running 发布。
- providerMigration 全程同一 reservations，逐步 status 投影。
- source delete 与 provision initialize 的同 source Redis lease 竞争，以及 transitional Saga join。
- 重复 stop -> provision -> stop 使用不同 commandId。
- OpenSandbox 重复 session 零/一/多匹配 reconcile。
- 所有过渡态均有 matching activeSaga。
- delete 对 pending/blocked/unmanaged transitional 状态 fail-closed。
- Legacy 全部 Workspace 安装前不发布 running。

## 15. 实施顺序

1. 定稿 SDK ports、状态转换、effect/reconcile 和 manifest。
2. 实现 `sdk/durable-saga` core/runtime/testing，并跑 memory contract。
3. 实现 Mongo Driver、专用 transaction runner、Redis LeaseProvider 和真实事务 contract。
4. 实现 BullMQ WakeupScheduler/Worker、heartbeat、Mongo polling adapter 和 observer。
5. 依次实现 stop、archive、restore、provider migration、provision、delete binding。
6. 把 Legacy target claim/publish 合并进 frozen manifest Saga。
7. 将所有生命周期入口直接接入 Saga runtime，不增加环境变量分流。
8. 最后运行相关类型检查、局部测试和仓库全量测试。

## 16. 已确认决策

1. 新增具备可抽取边界的私有 `sdk/durable-saga`，采用 core/driver/adapter/binding 四层；独立发布
   和授权另行决策。
2. Mongo Driver 使用 `instances/reservations` 两个 collection，并把 replica set transaction
   作为硬要求。
3. BullMQ 作为 FastGPT 默认 wake-up adapter、Mongo polling 作为权威补漏；第一版不做自动
   compensation 和立即 supersede。
4. Sandbox lifecycle 直接切换为单轨 Saga，不存在已发布 v2 runner 的存量接管。
5. terminal Saga tombstone 永久保留以维持 sagaId 幂等；运行事件仅通过 observer 输出。

## 17. TODO

- [x] 审计当前 Sandbox lifecycle、lease、CAS、stale recovery 和测试。
- [x] 核对 Temporal、Durable Task、DBOS、Dapr、XState、Eventuate、Mongo、Redis。
- [x] 使用三个独立 Agent 审查 Sandbox 回归、分布式正确性和库边界。
- [x] 修订多 reservation、heartbeat、reconcile、blocked、事务和迁移协议。
- [x] 确认第 16 节五项决策。
- [x] 实现 SDK Core/Runtime/Testing，并达到 90% statements / lines 覆盖阈值。
- [x] 实现 Mongo Driver/Redis LeaseProvider/BullMQ Wakeup/Mongo Polling Adapter。
- [x] 将全部 Sandbox aggregate mutator 收敛到单一 Saga 路由。
- [x] 实现并局部回归 stop/archive/restore/provider migration/provision/delete。
- [x] 使用冻结 manifest 外层 Saga 接入 Legacy per-record checkpoint。
- [x] 提供 blocked query/revision-fenced resolution 服务能力。
- [x] 完成仓库全量测试（workspace 串行执行，避免共用 Mongo 测试环境竞争）。
- [x] 全部生命周期入口接入 Saga runtime。
- [x] 完成单轨版本的局部与仓库全量回归。
- [x] 复查依赖与导出图，删除未消费能力、重复进度状态和未发布兼容层。
- [x] 清理重复、实现细节化和失去对应能力的测试，保持行为覆盖率不下降。
