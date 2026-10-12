import { serviceEnv } from '@fastgpt/service/env';

/**
 * 所有分批系统迁移的统一读取批大小。
 * 环境变量在 serviceEnv 边界被校验为 50～1000 的整数，未配置时为 100。
 */
export const systemMigrationBatchSize = serviceEnv.SYSTEM_MIGRATION_BATCH_SIZE;

/**
 * 配置了 delay 的系统迁移任务的延迟执行时长（毫秒）。
 * 来自 serviceEnv.SYSTEM_MIGRATION_DELAY_SECONDS。
 */
export const systemMigrationDelayMs = serviceEnv.SYSTEM_MIGRATION_DELAY_SECONDS * 1000;

/**
 * Runner 的默认探活参数。
 * heartbeat 必须显著短于 lease，给瞬时网络抖动留出重试窗口；阻塞轮询只读状态，
 * 因此可以比全局扫描更频繁，让等待启动的节点尽快进入 ready。
 */
export const systemMigrationDefaultTiming = {
  scanIntervalMs: 60_000,
  heartbeatIntervalMs: 15_000,
  leaseDurationMs: 90_000,
  blockingPollIntervalMs: 2_000,
  delayMs: systemMigrationDelayMs
} as const;
