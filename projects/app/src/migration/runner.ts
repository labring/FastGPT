import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import { systemMigrationDefaultTiming, systemMigrationIndependentConcurrency } from './constants';
import {
  LeaseCache,
  RedisLeaseWaitTimeoutError,
  type RedisLeaseContext
} from '@fastgpt/dal/redis/caches/lease';
import {
  SystemMigrationFailedRecordsSchema,
  SystemMigrationFailureInputSchema,
  SystemMigrationProgressInputSchema,
  SystemMigrationResultDataSchema
} from '@fastgpt/global/migration/schema';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import {
  claimMigrationLease,
  completeMigration,
  ensureMigrationStates,
  failMigration,
  getMigrationFailedRecords,
  getMigrationStates,
  isMigrationLeaseActive,
  renewMigrationLease,
  saveMigrationCheckpoint,
  saveMigrationFailedRecords,
  saveMigrationProgress
} from './entity';
import {
  systemMigrations,
  type SystemMigration,
  type SystemMigrationContext,
  type SystemMigrationLogger
} from './registry';
import { createSystemMigrationPlan } from './plan';
import type { SystemMigrationStateSchemaType } from './mongoSchema';
import { assertMigrationCheckpointSize, normalizeMigrationFailure } from './utils';

type SystemMigrationTiming = {
  [Key in keyof typeof systemMigrationDefaultTiming]: number;
};

type SystemMigrationExecutionOutcome = 'succeeded' | 'failed' | 'interrupted';

export type SystemMigrationRunnerStore = {
  ensureStates: typeof ensureMigrationStates;
  getStates: (migrationIds: string[]) => Promise<SystemMigrationStateSchemaType[]>;
  getFailedRecords: typeof getMigrationFailedRecords;
  claimLease: typeof claimMigrationLease;
  renewLease: typeof renewMigrationLease;
  isLeaseActive: typeof isMigrationLeaseActive;
  saveCheckpoint: typeof saveMigrationCheckpoint;
  saveFailedRecords: typeof saveMigrationFailedRecords;
  saveProgress: typeof saveMigrationProgress;
  complete: typeof completeMigration;
  fail: typeof failMigration;
};

/** 默认生产存储；测试通过注入同形 store 精确模拟 lease 竞争和失权。 */
const defaultStore: SystemMigrationRunnerStore = {
  ensureStates: ensureMigrationStates,
  getStates: getMigrationStates,
  getFailedRecords: getMigrationFailedRecords,
  claimLease: claimMigrationLease,
  renewLease: renewMigrationLease,
  isLeaseActive: isMigrationLeaseActive,
  saveCheckpoint: saveMigrationCheckpoint,
  saveFailedRecords: saveMigrationFailedRecords,
  saveProgress: saveMigrationProgress,
  complete: completeMigration,
  fail: failMigration
};

// 各 App 节点使用相同 key 竞争名额；任务自身的所有权仍由 Mongo lease + runId 保护。
const independentMigrationLease = new LeaseCache();

export class SystemMigrationLeaseLostError extends Error {
  constructor(message = 'System migration lease is no longer active', options?: ErrorOptions) {
    super(message, options);
    this.name = 'SystemMigrationLeaseLostError';
  }
}

/** context.fail 已经持久化错误，用专用异常退出任务，避免 catch 再次覆盖 lastError。 */
class SystemMigrationFailureReportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SystemMigrationFailureReportedError';
  }
}

/** 支持 AbortSignal 的轮询等待，runner 停止或 lease 丢失时无需等满间隔。 */
const delay = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new SystemMigrationLeaseLostError());
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(new SystemMigrationLeaseLostError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });

const createMigrationLogger = ({
  logger,
  migrationId,
  runId,
  runnerId
}: {
  logger: SystemMigrationLogger;
  migrationId: string;
  runId: string;
  runnerId: string;
}): SystemMigrationLogger => {
  // 任务脚本无需重复拼装定位字段，且所有日志都能关联到一次具体 lease。
  const metadata = (value?: Record<string, unknown>) => ({
    ...value,
    migrationId,
    runId,
    runnerId
  });

  return {
    info: (message, value) => logger.info(message, metadata(value)),
    warn: (message, value) => logger.warn(message, metadata(value)),
    error: (message, value) => logger.error(message, metadata(value))
  };
};

/**
 * 创建一个可注入存储和时序的迁移执行器。
 * 执行器在单进程内防重入，Mongo lease + runId fencing 保证任务互斥，Redis lease 限制独立任务集群并发。
 */
export const createSystemMigrationRunner = ({
  migrations = systemMigrations,
  runnerId = `${hostname()}:${process.pid}:${randomUUID()}`,
  timing,
  store = defaultStore,
  logger = getLogger(LogCategories.SYSTEM),
  createRunId = randomUUID
}: {
  migrations?: readonly SystemMigration[];
  runnerId?: string;
  timing?: Partial<SystemMigrationTiming>;
  store?: SystemMigrationRunnerStore;
  logger?: SystemMigrationLogger;
  createRunId?: () => string;
} = {}) => {
  const resolvedTiming: SystemMigrationTiming = {
    ...systemMigrationDefaultTiming,
    ...timing
  };
  let started = false;
  let stopped = false;
  let runnerAbortController = new AbortController();
  const activeAbortControllers = new Set<AbortController>();
  const loggedFailures = new Set<string>();
  const { startupMigrations, backgroundMigrations } = createSystemMigrationPlan(migrations);
  const startupIds = new Set(startupMigrations.map((migration) => migration.id));
  let startupCompleted = startupIds.size === 0;
  let backgroundEnabled = startupCompleted;

  /** 每个节点针对同一次失败只输出一组错误与人工处理提示，避免轮询刷屏。 */
  const logObservedFailure = (
    migration: SystemMigration,
    state: SystemMigrationStateSchemaType
  ) => {
    const failureKey = `${migration.id}:${state.lastError?.runId ?? 'unknown'}`;
    if (loggedFailures.has(failureKey)) return;

    loggedFailures.add(failureKey);
    logger.error('System migration failure observed from another App node', {
      migrationId: migration.id,
      runnerId,
      lastError: state.lastError
    });
    logger.warn(
      startupIds.has(migration.id)
        ? 'Startup migration failed; App nodes remain not ready'
        : 'System migration failed; only dependent migrations will wait',
      {
        migrationId: migration.id,
        runnerId,
        requiredAction: startupIds.has(migration.id)
          ? 'Fix the migration error and restart the lease-owning App node'
          : 'Fix the failed records and retry the migration from the admin page'
      }
    );
  };

  /** 构造所有有状态写入均带 fencing 的任务上下文。 */
  const executeMigration = async ({
    migration,
    claimedState,
    concurrencyLease
  }: {
    migration: SystemMigration;
    claimedState: SystemMigrationStateSchemaType;
    concurrencyLease?: RedisLeaseContext;
  }): Promise<SystemMigrationExecutionOutcome> => {
    const runId = claimedState.runId;
    if (!runId) {
      logger.error('Claimed system migration has no runId', {
        migrationId: migration.id,
        runnerId
      });
      return 'interrupted';
    }

    const migrationLogger = createMigrationLogger({
      logger,
      migrationId: migration.id,
      runId,
      runnerId
    });
    const abortController = new AbortController();
    activeAbortControllers.add(abortController);
    let currentCheckpoint = claimedState.checkpoint;
    const progressStepKeys = new Set(migration.progressSteps.map((step) => step.key));
    const progressState = new Map(
      (claimedState.progress ?? []).map((progress) => [progress.key, progress])
    );
    let currentProgressKey = claimedState.progress?.find(
      (progress) => progress.status === SystemMigrationStatusEnum.running
    )?.key;
    let leaseLost = false;
    let heartbeatStopped = false;
    let heartbeatPromise: Promise<void> | undefined;

    const loseLease = (message: string, error?: unknown) => {
      if (leaseLost) return;
      leaseLost = true;
      abortController.abort();
      migrationLogger.warn(message, error ? { error } : undefined);
    };

    const runFencedMutation = async (mutation: () => Promise<boolean>) => {
      // 停止后 lease 可能尚未到期，但本地执行者不能再开始新的批次或状态写入。
      if (abortController.signal.aborted) throw new SystemMigrationLeaseLostError();
      try {
        concurrencyLease?.assertValid();
        if (!(await mutation())) {
          loseLease('System migration lease was lost');
          throw new SystemMigrationLeaseLostError();
        }
      } catch (error) {
        if (error instanceof SystemMigrationLeaseLostError) throw error;
        loseLease('Unable to verify system migration lease', error);
        throw new SystemMigrationLeaseLostError('Unable to verify system migration lease', {
          cause: error
        });
      }
    };

    /** 每条错误记录必须归属静态声明的阶段，避免写入页面无法展示的数据。 */
    const parseFailedRecordSnapshot = (input: unknown) => {
      const failedRecords = SystemMigrationFailedRecordsSchema.parse(input);
      const undeclaredFailedRecord = failedRecords.find(
        (record) => !progressStepKeys.has(record.stageKey)
      );
      if (undeclaredFailedRecord) {
        throw new Error(
          `System migration ${migration.id} reported a failed record for undeclared progress step: ${undeclaredFailedRecord.stageKey}`
        );
      }
      return failedRecords;
    };

    const context: SystemMigrationContext = {
      migrationId: migration.id,
      runId,
      signal: abortController.signal,
      getCheckpoint: async (schema) =>
        currentCheckpoint === undefined ? undefined : schema.parse(currentCheckpoint),
      getFailedRecords: () => store.getFailedRecords(migration.id),
      reportFailedRecords: async (input) => {
        const failedRecords = parseFailedRecordSnapshot(input);
        await runFencedMutation(() =>
          store.saveFailedRecords({ migrationId: migration.id, runId, failedRecords })
        );
      },
      saveCheckpoint: async (checkpoint) => {
        assertMigrationCheckpointSize(checkpoint);
        await runFencedMutation(() =>
          store.saveCheckpoint({ migrationId: migration.id, runId, checkpoint })
        );
        currentCheckpoint = checkpoint;
      },
      reportProgress: async (input) => {
        const progress = SystemMigrationProgressInputSchema.parse(input);
        if (!progressStepKeys.has(progress.key)) {
          throw new Error(
            `System migration ${migration.id} reported undeclared progress step: ${progress.key}`
          );
        }
        await runFencedMutation(() =>
          store.saveProgress({ migrationId: migration.id, runId, progress })
        );
        progressState.set(progress.key, {
          ...progress,
          updatedAt: new Date()
        });
        if (
          progress.status === SystemMigrationStatusEnum.running &&
          progress.key !== currentProgressKey
        ) {
          currentProgressKey = progress.key;
          migrationLogger.info('System migration progress stage changed', {
            progressKey: progress.key,
            current: progress.current,
            total: progress.total
          });
        }
        if (
          progress.status === SystemMigrationStatusEnum.succeeded &&
          currentProgressKey === progress.key
        ) {
          currentProgressKey = undefined;
        }
      },
      assertActive: async () => {
        await runFencedMutation(() => store.isLeaseActive({ migrationId: migration.id, runId }));
      },
      fail: async (input) => {
        // 先持久化再抛出专用异常；若此时失去 lease，runFencedMutation 会转成失权错误。
        const parsedError = SystemMigrationFailureInputSchema.parse(input);
        const error =
          parsedError.failedRecords === undefined
            ? parsedError
            : {
                ...parsedError,
                failedRecords: parseFailedRecordSnapshot(parsedError.failedRecords)
              };
        await runFencedMutation(() =>
          store.fail({
            migrationId: migration.id,
            runId,
            stageKey: currentProgressKey,
            error
          })
        );
        throw new SystemMigrationFailureReportedError(error.message);
      },
      logger: migrationLogger
    };

    const heartbeat = async () => {
      if (heartbeatStopped || leaseLost) return;

      try {
        const renewed = await store.renewLease({
          migrationId: migration.id,
          runId,
          leaseDurationMs: resolvedTiming.leaseDurationMs,
          allowFailed: startupIds.has(migration.id)
        });
        if (!renewed) {
          loseLease('System migration heartbeat lost its lease');
        }
      } catch (error) {
        loseLease('System migration heartbeat could not verify its lease', error);
      }
    };

    const heartbeatTimer = setInterval(() => {
      // Mongo 响应慢时不并发续租，避免同一 runId 堆积 heartbeat 请求。
      if (heartbeatPromise) return;
      heartbeatPromise = heartbeat().finally(() => {
        heartbeatPromise = undefined;
      });
    }, resolvedTiming.heartbeatIntervalMs);

    const stopHeartbeat = async () => {
      heartbeatStopped = true;
      clearInterval(heartbeatTimer);
      await heartbeatPromise;
    };

    // 多个独立任务可能并发运行，停止或失权时每个任务都必须停止自己的 heartbeat。
    abortController.signal.addEventListener('abort', () => void stopHeartbeat(), { once: true });

    // 共享名额失效后立即停止 Mongo 续租，并通知脚本结束，不能继续占用业务执行权。
    const onConcurrencyLeaseLost = () =>
      loseLease('System migration concurrency lease was lost', concurrencyLease?.signal.reason);
    concurrencyLease?.signal.addEventListener('abort', onConcurrencyLeaseLost, { once: true });
    if (concurrencyLease?.signal.aborted) onConcurrencyLeaseLost();

    let executionStartedAt = Date.now();

    try {
      if (abortController.signal.aborted) return 'interrupted';
      if (migration.delay && resolvedTiming.delayMs > 0) {
        migrationLogger.info('System migration execution delayed by configuration', {
          delayMs: resolvedTiming.delayMs
        });
        await delay(resolvedTiming.delayMs, abortController.signal);
      }

      executionStartedAt = Date.now();
      migrationLogger.info('System migration execution started');

      // 先校验任务返回值，再与 succeeded 一起提交，避免提前暴露尚未成功的结果。
      const result = SystemMigrationResultDataSchema.optional().parse(await migration.run(context));
      const incompleteProgressStep = migration.progressSteps.find(
        (step) => progressState.get(step.key)?.status !== SystemMigrationStatusEnum.succeeded
      );
      if (incompleteProgressStep) {
        throw new Error(
          `System migration ${migration.id} returned before completing progress step: ${incompleteProgressStep.key}`
        );
      }
      // 提交成功状态前排空续租请求；若提交失败，启动链仍需恢复续租并等待人工处理。
      heartbeatStopped = true;
      await heartbeatPromise;

      if (abortController.signal.aborted) return 'interrupted';

      concurrencyLease?.assertValid();
      const completed = await store.complete({ migrationId: migration.id, runId, result });
      if (!completed) {
        loseLease('System migration completed after its lease was lost');
        return 'interrupted';
      }

      migrationLogger.info('System migration execution succeeded', {
        durationMs: Date.now() - executionStartedAt,
        // 最终结果同时写入 Mongo 和结构化日志，便于页面展示与终端排障相互核对。
        result
      });
      return 'succeeded';
    } catch (error) {
      if (abortController.signal.aborted || error instanceof SystemMigrationLeaseLostError) {
        return 'interrupted';
      }
      if (error instanceof SystemMigrationFailureReportedError) {
        migrationLogger.error('System migration reported a failure', {
          message: error.message,
          durationMs: Date.now() - executionStartedAt
        });
      } else {
        try {
          const failed = await store.fail({
            migrationId: migration.id,
            runId,
            stageKey: currentProgressKey,
            error: normalizeMigrationFailure(error)
          });
          if (!failed) {
            loseLease('System migration failed after its lease was lost');
            return 'interrupted';
          }
        } catch (writeError) {
          loseLease('Unable to persist system migration failure', writeError);
          return 'interrupted';
        }
        migrationLogger.error('System migration execution failed', {
          error,
          durationMs: Date.now() - executionStartedAt
        });
      }

      // 两种明确失败共用人工恢复提示；heartbeat 和中止监听统一在 finally 清理。
      loggedFailures.add(`${migration.id}:${runId}`);
      if (startupIds.has(migration.id)) {
        heartbeatStopped = false;
        migrationLogger.warn('Startup migration failed; App nodes remain not ready', {
          requiredAction: 'Fix the migration error and restart the lease-owning App node'
        });
        // 失败事实仍可被其他节点观察；owner 活着时持续续租，不自动重放业务写入。
        await new Promise<void>((resolve) => {
          if (abortController.signal.aborted) return resolve();
          abortController.signal.addEventListener('abort', () => resolve(), { once: true });
        });
        return 'interrupted';
      }
      migrationLogger.warn('System migration failed; only dependent migrations will wait', {
        requiredAction: 'Fix the failed records and retry the migration from the admin page'
      });
      return 'failed';
    } finally {
      await stopHeartbeat();
      concurrencyLease?.signal.removeEventListener('abort', onConcurrencyLeaseLost);
      activeAbortControllers.delete(abortController);
    }
  };

  /**
   * 每个队列单独防重入和探活，长任务或 delay 只占用自己的队列。
   * 依赖状态仍从主库读取，普通任务可以等待已注册的独立前置任务成功。
   */
  const createQueue = (queueMigrations: readonly SystemMigration[], startup = false) => {
    const migrationIds = [
      ...new Set(
        queueMigrations.flatMap((migration) => [migration.id, ...(migration.dependsOn ?? [])])
      )
    ];
    let scanTimer: ReturnType<typeof setInterval> | undefined;
    let scanGeneration = 0;
    let tickPromise: Promise<void> | undefined;

    /**
     * 同一队列始终串行执行；独立任务使用各自的单任务队列，互不等待。
     * 后台失败只阻止显式依赖；启动链失败持续等待 owner 重启后的过期接管。
     */
    const runQueue = async (): Promise<boolean> => {
      while (!stopped) {
        const states = await store.getStates(migrationIds);
        const stateMap = new Map(states.map((state) => [state._id, state]));
        let migration: SystemMigration | undefined;
        let hasActiveDependencies = false;

        for (const item of queueMigrations) {
          const state = stateMap.get(item.id);
          if (state?.status === SystemMigrationStatusEnum.succeeded) continue;
          // waiting 只接受管理员显式入队；已触发的手动任务仍使用正常 lease 接管机制。
          if (state?.status === SystemMigrationStatusEnum.waiting || (!state && item.manual))
            continue;

          // 执行前再次校验显式依赖，覆盖旧节点已入队或绕过入口的情况；前置未成功不能执行。
          const incompleteDependencies = item.dependsOn?.filter(
            (id) => stateMap.get(id)?.status !== SystemMigrationStatusEnum.succeeded
          );
          if (incompleteDependencies?.length) {
            // 独立前置任务可能仍在另一个队列执行，保留探活才能在其成功后自动推进。
            hasActiveDependencies ||= incompleteDependencies.some((id) => {
              const status = stateMap.get(id)?.status;
              return (
                status === SystemMigrationStatusEnum.pending ||
                status === SystemMigrationStatusEnum.running
              );
            });
            continue;
          }

          if (state?.status === SystemMigrationStatusEnum.failed) {
            logObservedFailure(item, state);
            // 失败只阻止显式依赖它的任务，其他可执行任务继续。
            if (!startup) continue;
          }

          migration = item;
          break;
        }
        // 仍有其他队列中的前置任务执行时保留探活；仅等待人工操作时停止扫描。
        if (!migration) return hasActiveDependencies;

        /** 先取得共享名额再领取任务，避免排队期间持有未执行任务的 Mongo lease。 */
        const claimAndExecute = async (
          concurrencyLease?: RedisLeaseContext
        ): Promise<SystemMigrationExecutionOutcome | 'unclaimed'> => {
          if (stopped) return 'interrupted';
          concurrencyLease?.assertValid();
          const claimedState = await store.claimLease({
            migrationId: migration.id,
            runId: createRunId(),
            leaseDurationMs: resolvedTiming.leaseDurationMs,
            allowFailed: startup
          });
          // stop 或共享名额丢失可能发生在 claim 期间，不能再开始业务执行。
          if (stopped) return 'interrupted';
          concurrencyLease?.assertValid();
          if (!claimedState) return 'unclaimed';
          return executeMigration({ migration, claimedState, concurrencyLease });
        };

        const outcome = await (async () => {
          // 被提升到启动链的独立前置串行执行，不竞争后台 Redis 名额。
          if (startup || !migration.independent) return claimAndExecute();
          try {
            return await independentMigrationLease.withConcurrency({
              key: 'system-migration:independent',
              label: `system-migration:${migration.id}`,
              concurrency: systemMigrationIndependentConcurrency,
              ttlMs: resolvedTiming.leaseDurationMs,
              renewIntervalMs: resolvedTiming.heartbeatIntervalMs,
              waitTimeoutMs: resolvedTiming.scanIntervalMs,
              retryIntervalMs: 1_000,
              signal: runnerAbortController.signal,
              fn: claimAndExecute
            });
          } catch (error) {
            // 额度占满属于等待，不把任务置为失败；下轮扫描继续竞争，Redis 故障则上报。
            if (error instanceof RedisLeaseWaitTimeoutError) return 'unclaimed';
            throw error;
          }
        })();
        if (outcome === 'interrupted' || outcome === 'unclaimed') return !stopped;
      }

      return false;
    };

    /** 清除空闲扫描器；显式 stop 还会额外终止当前任务。 */
    const pauseScanning = () => {
      if (!scanTimer) return;
      clearInterval(scanTimer);
      scanTimer = undefined;
    };

    /** 仅在存在 pending/running 时保留分钟级扫描器。 */
    const ensureScanTimer = () => {
      if (scanTimer || stopped) return;
      scanTimer = setInterval(() => void tick(), resolvedTiming.scanIntervalMs);
    };

    /** 合并重叠 tick；队列无需自动推进时停止扫描，扫描异常则保留下一轮探活。 */
    const tick = () => {
      // stop 后仍允许调用方等待已有执行和共享名额释放，但不再启动新扫描。
      if (tickPromise) return tickPromise;
      if (stopped) return Promise.resolve();

      const generation = scanGeneration;
      tickPromise = runQueue()
        .then((shouldKeepScanning) => {
          // retry 可能在本轮扫描期间重新唤醒 runner；旧快照不能关闭新一轮定时器。
          if (!shouldKeepScanning && generation === scanGeneration) pauseScanning();
        })
        .catch((error) => {
          if (stopped) return;
          logger.error('System migration scan failed', { runnerId, error });
        })
        .finally(() => {
          tickPromise = undefined;
        });
      return tickPromise;
    };

    /**
     * 重新启动空闲扫描器并立即扫描。若唤醒发生在旧 tick 内，旧 tick 完成后再读一次最新状态。
     */
    const wake = () => {
      if (stopped) return Promise.resolve();
      scanGeneration += 1;
      ensureScanTimer();
      const hadActiveTick = tickPromise !== undefined;
      const activeTick = tick();
      return hadActiveTick ? activeTick.then(() => tick()) : activeTick;
    };

    return { tick, wake, stop: pauseScanning };
  };

  const startupQueue =
    startupMigrations.length > 0 ? createQueue(startupMigrations, true) : undefined;
  const queuedMigrations = backgroundMigrations.filter((migration) => !migration.independent);
  const backgroundQueues = [
    ...(queuedMigrations.length > 0 ? [createQueue(queuedMigrations)] : []),
    ...backgroundMigrations
      .filter((migration) => migration.independent)
      .map((migration) => createQueue([migration]))
  ];
  const activeQueues = () =>
    backgroundEnabled ? backgroundQueues : startupQueue ? [startupQueue] : [];
  /** 所有队列同时唤醒，普通队列的运行状态不能延迟独立任务的首次执行或重试。 */
  const wake = async () => {
    await Promise.all(activeQueues().map((queue) => queue.wake()));
  };

  return {
    runnerId,
    hasBlockingMigrations: startupIds.size > 0,
    tick: async () => {
      await Promise.all(activeQueues().map((queue) => queue.tick()));
    },
    wake,
    /** 初始化状态并立即扫描；只有仍需自动推进或接管时才保留分钟级探活。 */
    start: async () => {
      if (started) return;
      started = true;
      stopped = false;
      runnerAbortController = new AbortController();
      await store.ensureStates(migrations);
      void wake();
    },
    /** 所有节点只依据启动链的持久化成功状态放行；读取失败、缺失和明确失败均继续等待。 */
    waitForBlockingMigrations: async () => {
      if (startupCompleted) return;
      logger.info('Waiting for startup migration chain', {
        runnerId,
        migrationIds: [...startupIds]
      });
      while (!stopped) {
        try {
          const states = await store.getStates([...startupIds]);
          if (stopped) break;
          const stateMap = new Map(states.map((state) => [state._id, state]));
          for (const migration of startupMigrations) {
            const state = stateMap.get(migration.id);
            if (state?.status === SystemMigrationStatusEnum.failed)
              logObservedFailure(migration, state);
          }
          if (
            startupMigrations.every(
              (migration) =>
                stateMap.get(migration.id)?.status === SystemMigrationStatusEnum.succeeded
            )
          ) {
            startupCompleted = true;
            logger.info('Startup migration chain completed', { runnerId });
            return;
          }
        } catch (error) {
          logger.warn('Unable to read startup migration states; App remains not ready', {
            runnerId,
            error
          });
        }
        await delay(resolvedTiming.blockingPollIntervalMs, runnerAbortController.signal);
      }
      throw new SystemMigrationLeaseLostError('Runner stopped before startup migrations completed');
    },
    /** 调用方完成本节点模型缓存重载及业务初始化后，才允许后台迁移开始竞争 lease。 */
    startBackgroundMigrations: () => {
      if (!startupCompleted) throw new Error('Startup migrations have not completed');
      if (backgroundEnabled || stopped) return;
      startupQueue?.stop();
      backgroundEnabled = true;
      void wake();
    },
    /** 停止本节点扫描和 heartbeat；当前任务通过 AbortSignal 配合退出。 */
    stop: () => {
      stopped = true;
      runnerAbortController.abort();
      startupQueue?.stop();
      backgroundQueues.forEach((queue) => queue.stop());
      activeAbortControllers.forEach((controller) => controller.abort());
    }
  };
};

export type SystemMigrationRunner = ReturnType<typeof createSystemMigrationRunner>;

declare global {
  var systemMigrationRunner: SystemMigrationRunner | undefined;
}

/** 启动当前进程唯一的生产迁移执行器。 */
export const startSystemMigrationRunner = async (): Promise<SystemMigrationRunner> => {
  if (!global.systemMigrationRunner) {
    global.systemMigrationRunner = createSystemMigrationRunner();
    await global.systemMigrationRunner.start();
  }
  return global.systemMigrationRunner;
};

/** 管理员重置失败任务后唤醒当前 API 节点；实际执行仍需正常竞争 Mongo lease。 */
export const wakeSystemMigrationRunner = (): void => {
  void global.systemMigrationRunner?.wake();
};
