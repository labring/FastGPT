# 流恢复服务重启生成态快速重置设计

## 背景

服务崩溃或重启时，正在生成的对话可能来不及把 `chatGenerateStatus` 从 `generating` 写回 `done`。如果只依赖历史的 30 分钟清理，侧栏和恢复逻辑会在较长时间内继续认为该会话还在生成，用户需要等待很久才能恢复正常状态。

流恢复的 stream 模式会持续向 Redis stream 写入数据，并通过心跳维持连接。因此可以把 Redis stream 的最近活动时间作为更精确的“服务是否还在持续生成”的依据。

## 问题分析

1. 旧清理逻辑只看 `MongoChat.updateTime` 是否超过 30 分钟，修正速度慢。
2. 服务重启后，Mongo 里的 `generating` 状态可能残留，但 Redis stream 不再有新数据或心跳。
3. 如果直接把 cron 改成频繁扫描 Mongo updateTime，仍然无法区分“正常长耗时生成”和“异常中断”。
4. Redis 可能短暂异常，不能因为 Redis 读失败就误把正在生成的会话改成 done。

## 最终方案

### 1. Redis 记录 stream activity

流恢复写入 Redis stream 时，同步刷新 `stream:resume:active:{teamId}:{appId}:{chatId}`。

activity key 记录：

- `updatedAt`

写入策略跟 stream TTL touch 绑定，不对每个 chunk 都强制写 Redis，而是按既有 touch 间隔刷新，避免额外压力。

### 2. 2 分钟无活动视为异常中断

新增 `STREAM_RESUME_INACTIVE_MS = 2 * 60 * 1000`。

`cleanStaleGeneratingChats` 先筛选生成态且 `updateTime` 早于 2 分钟前的会话，再读取 Redis activity：

- activity 不存在：视为 stale。
- activity 存在但 `now - updatedAt > 2min`：视为 stale。
- activity 仍新鲜：跳过，认为生成仍活跃。

这里的 2 分钟基于 stream 模式每分钟会推送心跳的前提，给一次心跳延迟留出缓冲。

### 3. 保留 30 分钟 Mongo 兜底

当会话 `updateTime` 已超过 30 分钟时，直接按旧逻辑修正为 done。

兜底作用：

- Redis activity key 被提前清理或不存在时，长期异常仍能被修正。
- Redis 读异常时，不会立刻误判短时生成会话。

### 4. Redis 异常时跳过快速修正

如果读取 Redis activity 抛错，本轮清理记录 warn，并停止依赖 Redis 的快速判定；只保留 30 分钟兜底修正。

这样 Redis 短暂不可用时，不会把真实仍在生成的会话误改成 done。

### 5. cron 调整为每分钟

清理任务从每 5 分钟调整为每 1 分钟，锁时间同步缩短为 1 分钟。

由于候选查询先限制 `generating` 且 `updateTime < now - 2min`，再按候选逐个检查 Redis activity，频率提升主要用于缩短异常恢复时间，不是全量高频扫描。

## 涉及文件

- `packages/service/core/chat/resume.ts`
  - 增加 `keyOfActive`。
  - 增加 `STREAM_RESUME_INACTIVE_MS`。
  - stream 写入时刷新 active state。
  - stream 完成后同步缩短 stream key 和 active key TTL。
  - 清理 mirror key 时删除 active key。
  - 暴露 `getStreamResumeActiveState` 与 `isStreamResumeActiveStale`。
- `packages/service/core/chat/cleanStaleGeneratingChats.ts`
  - 从 30 分钟 updateTime 单条件清理，改为 Redis activity 快速判定 + 30 分钟兜底。
  - 返回 `modifiedCount`、`inactiveCount`、`fallbackCount`，便于观察修正来源。
- `projects/app/src/service/common/system/cron.ts`
  - 清理任务执行频率从 5 分钟改为 1 分钟。
  - 定时锁从 4 分钟改为 1 分钟。
- `projects/app/test/api/core/chat/resume.test.ts`
  - 覆盖 stream mirror active key 刷新。
- `projects/app/test/service/core/chat/cleanStaleGeneratingChats.test.ts`
  - 覆盖 active stale、active fresh、Redis 异常、30 分钟兜底等分支。

## 验证点

1. stream 写入会刷新 active key。
2. active 超过 2 分钟未更新时，`generating` 会话被修正为 `done`。
3. active 仍新鲜时，不修正生成态。
4. Redis 读取异常时，不执行 2 分钟快速修正。
5. 超过 30 分钟的旧会话仍能通过兜底逻辑修正。

## TODO

- [x] stream resume 写入时刷新 Redis activity
- [x] stale cleaner 使用 activity 判断 2 分钟无更新
- [x] Redis 异常时保留 30 分钟兜底
- [x] cron 调整为每分钟执行
- [x] 增加 resume active key 测试
- [x] 增加 stale cleaner 分支测试
