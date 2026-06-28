# Sandbox 归档流程简化方案

## 背景

Sandbox 归档主要用于降低长时间未活跃资源的运行成本，同时服务 Skill Edit runtime 升级场景。
归档恢复频率较低，本阶段不追求跨进程强一致补偿，只保留必要状态，优先降低实现复杂度。

## 目标

1. 定时冷归档和 runtime 升级归档各自保留业务入口。
2. 底层归档流程复用同一套 zip、上传 S3、进入远端删除阶段、删除远端资源、标记 archived 逻辑。
3. DB 不记录细粒度 step，只记录归档状态和错误信息。
4. 两类归档在进入 `deleting` 前失败都标记 `failed`，由监控和人工检查处理。
5. `archived` 明确定义为 S3 archive 已保存且后续启动必须走 restore；远端删除失败或结果不确定也可以在超时后收敛为 `archived`。
6. 归档阶段不主动删除 S3 archive；安全优先，冗余对象后续由生命周期或人工清理。
7. 通过同一个定时任务清理长时间卡住的归档状态：`archiving` 清理标记，`deleting` 收敛为 `archived`。

## 状态模型

`metadata.archive` 只保留以下字段。落地时需要同步更新
`packages/service/core/ai/sandbox/type.ts` 的 `SandboxArchiveStateSchema` 和 archive 字段结构：

```ts
{
  state: 'archiving' | 'deleting' | 'archived' | 'failed' | 'restoring',
  startedAt?: Date,
  deleteStartedAt?: Date,
  archivedAt?: Date,
  failedAt?: Date,
  error?: string
}
```

不记录细粒度 `step`。`deleting` 是删除收尾中的短暂状态，不是调试用步骤：
进入 `deleting` 后表示 S3 archive 已保存、远端删除已经开始或结果不再可信。真实用户启动可以直接按 S3 archive 恢复；
stale cleanup 超时后把它收敛为 `archived`，不再长期等待人工修复。
其他具体执行到哪一步仍通过日志排查。

`metadata.archive.startedAt` 同时作为轻量归档 attempt token。所有只属于某一轮归档任务的写操作都必须带
`metadata.archive.startedAt = archivingDoc.metadata.archive.startedAt` 条件，包括：

- `tryMarkSandboxDeleting`
- `markSandboxArchived`
- `markSandboxArchiveFailed`
- `clearSandboxArchiveState`
- timeout fallback
- active check skipped 的清理

这样不需要新增 `attemptId`，也能避免 stale cleanup 清掉旧 `archiving` 后，新一轮归档被旧任务误推进到
`deleting/failed/archived`。stale cleanup 对 `deleting -> archived` 是批量收敛，不属于某一轮归档任务的迟到写。

## 对外业务入口

### 定时冷归档

```ts
archiveSandboxResource(resource, inactiveBefore);
```

claim 条件：

```ts
{
  provider,
  sandboxId,
  status: SandboxStatusEnum.stopped,
  lastActiveAt: { $lt: inactiveBefore },
  'metadata.archive.state': { $exists: false }
}
```

claim 成功后写入：

```ts
{
  'metadata.archive.state': 'archiving',
  'metadata.archive.startedAt': new Date()
}
```

claim 失败表示记录已不存在、已被抢占、已恢复活跃或状态已变化，直接跳过，不算失败。

### Skill Edit runtime 升级归档

```ts
startSandboxRuntimeUpgradeArchive(resource);
```

claim 条件：

```ts
{
  provider,
  sandboxId,
  lastActiveAt: expectedLastActiveAt,
  $or: [
    { 'metadata.archive.state': { $exists: false } },
    { 'metadata.archive.state': 'failed' }
  ]
}
```

claim 成功后写入：

```ts
{
  'metadata.archive.state': 'archiving',
  'metadata.archive.startedAt': new Date()
}
```

`expectedLastActiveAt` 来自 getStatus/trigger 时选中的实例记录，也可以通过传入完整 `resource` 得到。
claim 必须带 `lastActiveAt` CAS，避免基于旧状态页上下文抢占已经变化的实例。

升级归档 claim 阶段不修改 Mongo `status`，保留记录原状态。`archiving` 本身表示旧 runtime 已被升级流程接管，
运行态入口会被 archive state 阻塞；真实远端资源仍可能处于 running，直到归档流程删除远端资源。

因为升级归档不提前写 `status: stopped`，`markSandboxArchived` 的 CAS 条件不能再要求
`status: SandboxStatusEnum.stopped`。归档成功后再统一把 Mongo `status` 写成 `stopped`，表示旧远端资源已经删除。

同时需要更新 `packages/global/openapi/core/ai/skill/api.ts` 的 `SkillRuntimeArchiveStateSchema`，
加入 `deleting`，否则 `getSkillEditRuntimeStatus` 返回值会和 OpenAPI schema/type 不一致。

## 公共归档流程

底层公共流水线只处理已经 claim 成功的 `archivingDoc`：

```ts
runSandboxArchiveFlow({
  archivingDoc,
  inactiveBefore
});
```

流程：

1. 连接或启动 sandbox。
2. 确保 sandbox 内存在 `zip` 命令。
3. 打包 workspace。
4. 上传 S3 archive。
5. 原子执行删除远端前确认，并将 Mongo 从 `archiving` 推进到 `deleting`。
6. 删除远端 sandbox 资源；opensandbox volume 删除失败只记录日志，不阻断归档。
7. 标记 Mongo 为 `archived`。

`archived` 通常在第 6 步成功后写入；如果进入 `deleting` 后节点崩溃或 provider 删除结果不确定，
stale cleanup 也可以在超时后把记录收敛为 `archived`。这个语义和 Skill Edit runtime status 保持一致：
`archived` 表示 S3 archive 可恢复，下一次启动必须走 restore。

### 进入 deleting

上传 S3 后、删除远端资源前，通过一个原子方法完成二次确认和状态推进：

```ts
tryMarkSandboxDeleting(archivingDoc, {
  inactiveBefore
});
```

定时归档传 `inactiveBefore`，升级归档不传。该方法的 filter：

```ts
{
  provider,
  sandboxId,
  'metadata.archive.state': 'archiving',
  'metadata.archive.startedAt': archivingDoc.metadata.archive.startedAt,
  lastActiveAt: archivingDoc.lastActiveAt,
  ...(inactiveBefore
    ? {
        $expr: {
          $lt: ['$lastActiveAt', inactiveBefore]
        }
      }
    : {})
}
```

update：

```ts
{
  'metadata.archive.state': 'deleting',
  'metadata.archive.deleteStartedAt': new Date()
}
```

如果 `matchedCount === 0`：

- 不删除远端资源。
- 不删除刚上传的 S3 archive。
- 返回 skipped，不标记 `failed`。
- 如果要清理 archive state，只能调用 `clearSandboxArchiveState`，且 filter 必须是同一轮
  `metadata.archive.state = archiving` + `metadata.archive.startedAt = archivingDoc.metadata.archive.startedAt`。
  若状态已经变成 `deleting/archived/failed`，或已被 stale cleanup 后的新一轮 claim 成新的 `archiving`，
  旧任务不能清理。

只检查 `lastActiveAt`，不额外校验 `sourceType/sourceId`。

`tryMarkSandboxDeleting` 成功后才允许删除远端资源。

进入 `deleting` 后，timeout fallback 和归档失败处理都不能把它清成 `failed` 或 unset。
如果删除远端 sandbox 或后续标记 `archived` 失败，只更新 `metadata.archive.error` 并报警，保留
`deleting`；同一个 stale cleanup 定时任务在超过 15 分钟后把它收敛为 `archived`。
普通 app/chat 真实启动遇到 `deleting` 时直接按 S3 archive 走恢复流程。

opensandbox volume 删除失败不阻塞归档成功，保持当前实现语义：只记录错误日志，仍允许继续标记
`archived`。原因是 workspace archive 已经保存，远端 sandbox 已删除，volume 残留只带来资源冗余，
不应让用户恢复路径长期 busy。

### 临时拉起资源清理

归档可能在第 1 步把原本 `status = stopped` 的 sandbox 临时拉起，用于 zip workspace。
进入 `deleting` 前如果失败或 skipped，需要 best-effort stop 这个临时拉起的远端资源：

```ts
if (archivingDoc.status === SandboxStatusEnum.stopped && latest.lastActiveAt === archivingDoc.lastActiveAt) {
  await sandbox.stop().catch(logOnly);
  await markSandboxResourceStopped(archivingDoc).catch(logOnly);
}
```

如果 `lastActiveAt` 已变化，说明用户请求可能已经接管该 sandbox，不能 stop。
进入 `deleting` 后不执行临时 stop，后续按删除远端资源、stale cleanup 收敛或真实用户恢复处理。

### 标记 archived

S3 上传成功、进入 `deleting` 成功、删除远端资源成功后，标记 Mongo：

```ts
{
  status: SandboxStatusEnum.stopped,
  'metadata.archive.state': 'archived',
  'metadata.archive.archivedAt': new Date(),
  ...currentRuntimeImage
}
```

`markSandboxArchived` 必须带 `metadata.archive.state = deleting` 和
`metadata.archive.startedAt = archivingDoc.metadata.archive.startedAt`、`lastActiveAt = archivingDoc.lastActiveAt`
条件，不能要求 `status = stopped`，否则 runtime upgrade 在 claim 阶段保持原状态后无法进入 `archived`。
`matchedCount === 0` 表示记录状态已经被其他流程修改；
此时远端删除已经执行或结果不确定，不能再做远端动作，也不能删除 S3 archive，只记录错误到 `deleting`。
后续由 stale cleanup 收敛为 `archived`，启动时统一从 S3 restore。

## 状态转移和失败处理

`failed` 只表示归档尝试在进入 `deleting` 前失败，不表示 sandbox 不可启动。进入 `deleting` 前，
除 active check skipped 外，任意步骤失败都标记：

```ts
{
  'metadata.archive.state': 'failed',
  'metadata.archive.failedAt': new Date(),
  'metadata.archive.error': errorMessage
}
```

S3 处理集中遵循下表；归档流程不主动删除 S3 archive。

| 事件 | Mongo 更新 | 远端动作 | S3 动作 |
| --- | --- | --- | --- |
| claim 成功 | `state=archiving, startedAt=now` | 无 | 无 |
| zip/upload 前失败 | 同一轮 `archiving -> failed` | 若临时拉起则 best-effort stop | 无 |
| upload 后、进入 deleting 前失败 | 同一轮 `archiving -> failed` | 若临时拉起则 best-effort stop | 保留 archive |
| `tryMarkSandboxDeleting` CAS 失败 | 同一轮 `archiving` 可清理为 unset；其他状态只 skipped | 不删除；若临时拉起则 best-effort stop | 保留 archive |
| `tryMarkSandboxDeleting` 成功 | 同一轮 `archiving -> deleting` | 可以删除远端 | 保留 archive |
| 进入 deleting 后失败 | 保持同一轮 `deleting`，只更新 `error` | 不再重复删除；等待 stale cleanup 收敛 | 保留 archive |
| delete remote 成功 | 同一轮 `deleting -> archived` | opensandbox volume 删除失败只 log | 保留 archive |
| timeout 时仍 archiving | 同一轮 `archiving -> failed` | 若临时拉起则 best-effort stop | 保留 archive |
| timeout 时已 deleting | 保持同一轮 `deleting`，只更新 `error` | 不主动 stop/delete；等待 stale cleanup 收敛 | 保留 archive |

进入 `deleting` 后不能再把记录标记为 `failed`。此时远端删除已经开始或结果不可信，`failed` 会被普通运行态清理并继续启动，
可能导致绕过 S3 archive 恢复。进入 `deleting` 后如果 `markSandboxArchived` 失败，只记录错误并保持 `deleting`；
stale cleanup 超时后统一把它改成 `archived`。由于 `archived/deleting` 启动都会从 S3 restore，即使旧远端残留也不会丢数据。

定时归档和升级归档都使用同一失败策略。除 active check skipped 外，失败记录由监控发现，
人工检查处理，本阶段不提供自动补偿和 admin 重试入口。

所有终态更新仍需带 state 条件，避免 stale cleanup 后迟到任务覆盖状态：

```ts
// 标记 archived
{
  provider,
  sandboxId,
  'metadata.archive.state': 'deleting',
  'metadata.archive.startedAt': archivingDoc.metadata.archive.startedAt,
  lastActiveAt: archivingDoc.lastActiveAt
}

// 标记 failed
{
  provider,
  sandboxId,
  'metadata.archive.state': 'archiving',
  'metadata.archive.startedAt': archivingDoc.metadata.archive.startedAt
}
```

## Timeout

归档整体使用 10 分钟 timeout，必须包住 connect、ensure zip、zip、upload、mark deleting、delete remote、
mark archived 全流程。实现上用整体 `Promise.race` 或等价 wrapper，不是复用单个 sandbox command timeout。
单个 command timeout 可以继续保留，但不能替代整体 timeout。

timeout 后不删除 S3 archive，并按当前 state 分支处理。

timeout fallback 必须先查询当前 archive state：

- 仍是同一轮 `archiving`：带 `startedAt` CAS 标记 `failed`，记录超时错误；若临时拉起则 best-effort stop。
- 已是同一轮 `deleting`：不能标记 `failed`，只能带 `startedAt` CAS 更新 `error` 并报警，等待迟到任务自然完成或 stale cleanup 收敛。
- 已是 `archived/restoring` 或 archive state 已清理：不再写入。

不使用 DB step 或 attemptId。超时后的迟到任务允许自然结束，但删除远端资源前必须先完成
`archiving -> deleting` CAS；如果 timeout fallback 已经把记录改成 `failed`，迟到任务不能继续删除远端资源。
由于归档恢复频率低，本阶段接受极少数 `deleting` 在 15 分钟内继续显示 upgrading。

## Stale archive cleanup

新增一个定时任务，每 10 分钟执行一次：

```ts
clearStaleArchivingSandboxes(new Date());
```

同一个定时任务处理两类超时状态，阈值都是 `subMinutes(now, 15)`。

`archiving` 清理条件：

```ts
{
  'metadata.archive.state': 'archiving',
  'metadata.archive.startedAt': { $lt: startedBefore }
}
```

`archiving` 处理动作：

```ts
{
  $unset: {
    'metadata.archive': ''
  }
}
```

`deleting` 清理条件：

```ts
{
  'metadata.archive.state': 'deleting',
  $or: [
    { 'metadata.archive.deleteStartedAt': { $lt: startedBefore } },
    {
      'metadata.archive.deleteStartedAt': { $exists: false },
      'metadata.archive.startedAt': { $lt: startedBefore }
    }
  ]
}
```

`deleting` 处理动作：

```ts
{
  $set: {
    status: SandboxStatusEnum.stopped,
    'metadata.archive.state': 'archived',
    'metadata.archive.archivedAt': new Date()
  },
  $unset: {
    'metadata.archive.deleteStartedAt': '',
    'metadata.archive.failedAt': '',
    'metadata.archive.error': ''
  }
}
```

语义：

- 每 10 分钟扫描一次，处理超过 15 分钟的 `archiving` 和 `deleting`。
- 15 分钟 = 10 分钟归档整体 timeout + 5 分钟 grace，避免和正常 timeout fallback 同时抢状态。
- 认为这类记录通常来自节点异常重启、归档进程未能执行 timeout fallback、或 DB 更新失败。
- `archiving` 清理后记录可被后续定时归档重新 claim。
- `deleting` 收敛为 `archived`，后续启动从 S3 restore；即使旧远端资源残留，也由恢复流程清空工作目录后解压归档包。
- 不删除 S3 archive；可能残留冗余对象。
- 不主动 stop/delete 远端资源，避免在状态不明确时误删用户资源。
- 迟到任务如果后续继续执行，终态更新会因 state 条件不满足而失败。
- 迟到任务如果还没进入 `deleting`，删除前 CAS 会因 state 条件不满足而停止。

## Restore 和状态解释

`restoreArchivedSandboxBeforeUse` 按 state 解释即可：

- `archiving`：进入同一套等待循环；60 秒内变成 `archived` 就继续恢复，否则抛 `SandboxArchiveStateError('archiving')`。
- `deleting`：已经有 S3 archive，真实用户启动直接按 `archived` 一样抢占为 `restoring` 并恢复，不再二次删除远端资源。
- `archived`：可恢复。
- `failed`：只在显式允许的真实用户启动路径中清理 `metadata.archive` 并按普通启动流程继续，不触发 S3 恢复，也不报 busy。
  不用 `sourceType` 推断真实用户启动，`getSandboxClient` 增加显式选项
  `failedArchivePolicy: 'throw' | 'clearAndContinue'`。
  普通用户请求可传 `clearAndContinue`；keepalive/proxy、后台保活、只读状态检查必须传或默认 `throw`，
  避免后台保活重新拉起归档失败资源。
  Skill Edit status 仍展示 `upgradeRequired` 和 `lastError`，用户可以重新点击升级归档。
- `restoring`：busy。

`archived` 表达“S3 archive 已保存，下一次启动必须从 S3 restore”。它不再强绑定“旧远端一定删除成功”。
如果旧远端残留，恢复流程会先清空工作目录再解压 S3 archive，不会丢失归档数据。

`assertSandboxNotArchivedOrBusy` 用于 `restoreArchived: false` 的 keepalive/proxy 路径，不能清理任何 archive state。
它必须识别并抛出对应 state：

- `archiving` -> `SandboxArchiveStateError('archiving')`
- `deleting` -> `SandboxArchiveStateError('deleting')`
- `archived` -> `SandboxArchiveStateError('archived')`
- `restoring` -> `SandboxArchiveStateError('restoring')`
- `failed` -> `SandboxArchiveStateError('failed')`

这样 `upsertRunningSandboxInstance` 因存在 archive state 返回 null 后，不会退化成泛化的
`SandboxArchiveStateError('archiving')`，也不会让后台保活绕过 failed 清理策略。

`getSkillEditRuntimeStatus`：

- `archiving` 返回 `upgrading`。
- `deleting` 返回 `upgrading` 并继续轮询；超时后由 stale cleanup 转成 `archived`，下一次状态查询返回 `readyToInit`。
- `failed` 返回 `upgradeRequired` 并展示 `lastError`。
- `archived` 一律返回 `readyToInit`，不因 runtime image 过期返回 `upgradeRequired`。
  archived 表示 S3 archive 可恢复；init/restore 应使用当前 runtime createConfig 新起 sandbox 并恢复工作区。
  如果需要同步 Mongo 里的 runtime image，可在 archived 状态下更新 metadata image 后继续 `readyToInit`，不能再触发二次归档。

## 定时归档批量流程

```text
1. createSandboxResourcesToArchiveCursor({ inactiveBefore, providers })
2. cursor 返回 provider/sandboxId/_id 等轻量候选
3. 并发 5 调 `archiveSandboxResource(resource, inactiveBefore)`
4. claim 失败计为 skipped，不作为 failure
5. tryMarkSandboxDeleting CAS 失败也计为 skipped，不作为 failure
6. 执行失败才计入 failures
```

结果类型需要区分 `success/skipped/failed`。`skipped` 包括 claim 失败、二次确认失败、同一轮
`startedAt` 不匹配等正常并发结果，不能混进 `failures` 告警。

## Stale cleanup 定时任务落点

新增独立 timer id：

```ts
TimerIdEnum.clearStaleArchivingSandboxes = 'clearStaleArchivingSandboxes'
```

cron 注册：

```text
*/10 * * * *
```

锁配置：

```ts
checkTimerLock({
  timerId: TimerIdEnum.clearStaleArchivingSandboxes,
  lockMinuted: 9
});
```

实现落点：

- `packages/service/common/system/timerLock/constants.ts`：新增 timer id。
- `packages/service/core/ai/sandbox/application/cron.ts`：注册 stale cleanup cron。
- `packages/service/core/ai/sandbox/application/archive.ts`：新增 `clearStaleArchivingSandboxes` 业务入口，同步处理 stale `archiving/deleting`。
- `packages/service/core/ai/sandbox/infrastructure/instance/repository.ts`：新增按 `metadata.archive.startedAt` 清理 stale `archiving`、按 `metadata.archive.deleteStartedAt` 收敛 stale `deleting` 的 repository 方法。
- `packages/service/test/core/ai/sandbox/service/cron.test.ts`：覆盖 cron 注册、timer lock 和业务入口调用。
- archive/repository 测试：覆盖 stale cleanup filter、未超时 `deleting` 不处理、超时 `deleting` 转 `archived`。

需要新增索引：

```ts
SandboxInstanceSchema.index({
  'metadata.archive.state': 1,
  'metadata.archive.startedAt': 1
});
SandboxInstanceSchema.index({
  'metadata.archive.state': 1,
  'metadata.archive.deleteStartedAt': 1
});
```

理由：stale cleanup 查询按 `metadata.archive.state + metadata.archive.startedAt/deleteStartedAt` 扫描，
现有 `{ status, lastActiveAt, 'metadata.archive.state' }` 索引不能有效支持该查询。

## 需要接受的简化风险

1. DB 不记录 step，失败后只能通过日志判断具体失败阶段。
2. timeout 后迟到任务可能继续执行；极少数状态竞态交给人工修复。
3. `deleting` 超时后会被标记为 `archived`；如果旧远端实际残留，后续真实启动会从 S3 restore 覆盖工作区，但可能留下远端资源冗余。
4. `markSandboxArchived` 不再用 `status` 做 CAS，只依赖 archive state、startedAt 和 lastActiveAt；状态竞争需要靠 `archiving -> deleting` CAS 防住。
5. `failed` 不阻塞真实用户启动；如果误把“已进入 deleting”的记录写成 failed，会有绕过恢复的风险。
6. active check skipped 或失败场景可能残留 S3 archive，需要对象存储生命周期或人工清理。

## TODO

1. 调整 archive state schema，新增不可逆阶段 `deleting/deleteStartedAt`，但不新增细粒度 step。
   - 更新 `packages/service/core/ai/sandbox/type.ts` 的 `SandboxArchiveStateSchema` 和 archive schema。
   - 更新 `packages/global/openapi/core/ai/skill/api.ts` 的 `SkillRuntimeArchiveStateSchema`。
   - 更新 `packages/service/core/ai/sandbox/infrastructure/instance/schema.ts`，新增 archive state + startedAt 索引。
2. 新增定时归档 claim 方法和升级归档 claim 方法；升级 claim 不修改 `status`，并带 `lastActiveAt` CAS。
3. 所有归档状态写入补 `metadata.archive.startedAt` CAS，使用 startedAt 作为轻量 attempt token。
4. 保留 `archiveSandboxResource` 和 `startSandboxRuntimeUpgradeArchive` 两个业务入口。
5. 简化公共归档流水线，统一 ensure zip、zip、upload、tryMarkSandboxDeleting、delete remote、mark archived，并放宽 `markSandboxArchived` 的 `status` filter。
6. 调整失败处理：进入 `deleting` 前的两类归档失败标记 `failed`；进入 `deleting` 后不得落 `failed`。
7. 进入 `deleting` 前失败或 skipped 时，若原记录是 stopped 且 lastActiveAt 未变化，best-effort stop 临时拉起的远端资源。
8. 调整普通运行态对 `failed` 的处理，引入 `failedArchivePolicy: 'throw' | 'clearAndContinue'`；`assertSandboxNotArchivedOrBusy` 必须对 `failed/deleting` 抛对应 state。
9. 新增 stale archive 定时清理任务、timer id 和 cron lock；同一入口清理 `archiving` 并把超时 `deleting` 转成 `archived`。
10. 调整 restore 和 Skill Edit status 对 `failed/archiving/deleting/archived` 的解释；`deleting` 真实启动直接恢复，Skill Edit 状态保持 `upgrading`。
11. 归档执行增加整体 10 分钟 timeout wrapper，fallback 更新也带 startedAt CAS。
12. 调整 archive result 类型，区分 `success/skipped/failed`，claim/CAS skipped 不计入 failures。
13. 更新 archive service、repository、runtime restore、Skill Edit status、cron、stale cleanup 测试；覆盖 opensandbox volume 删除失败不阻塞 archived、startedAt CAS、临时拉起失败后 stop、整体 timeout。
