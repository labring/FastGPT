import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import {
  SystemMigrationFailurePolicyEnum,
  SystemMigrationStatusEnum
} from '@fastgpt/global/migration/constants';
import { systemMigrationDefaultTiming } from './constants';
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
  type SystemMigrationLogger,
  validateSystemMigrationRegistry
} from './registry';
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

export class SystemMigrationLeaseLostError extends Error {
  constructor(message = 'System migration lease is no longer active', options?: ErrorOptions) {
    super(message, options);
    this.name = 'SystemMigrationLeaseLostError';
  }
}

/** context.fail 已经持久化错误，用专用异常退出任务，避免 catch 再次覆盖 lastError。 */
class SystemMigrationFailureReportedError extends Error {
  constructor() {
    super('System migration failure was reported');
    this.name = 'SystemMigrationFailureReportedError';
  }
}

/** 支持 AbortSignal 的轮询等待，runner 停止或 lease 丢失时无需等满间隔。 */
const delay = (milliseconds: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new SystemMigrationLeaseLostError());
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(new SystemMigrationLeaseLostError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', onAbort, { once: true });
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
 * 执行器在单进程内防重入，并依赖 Mongo lease + runId fencing 实现跨节点互斥。
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
  const activeAbortControllers = new Set<AbortController>();
  const loggedFailures = new Set<string>();

  validateSystemMigrationRegistry(migrations);

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
      migration.independent
        ? 'Independent system migration failed; other migrations are unaffected'
        : migration.onFailure === SystemMigrationFailurePolicyEnum.continue
          ? 'System migration failed; following queued migrations may continue'
          : 'System migration failed; following queued migrations are paused',
      {
        migrationId: migration.id,
        runnerId,
        onFailure: migration.onFailure,
        requiredAction: 'Fix the failed records and retry the migration from the admin page'
      }
    );
  };

  /** 构造所有有状态写入均带 fencing 的任务上下文。 */
  const executeMigration = async (
    migration: SystemMigration,
    claimedState: SystemMigrationStateSchemaType
  ): Promise<SystemMigrationExecutionOutcome> => {
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

    const assertMutationSucceeded = (succeeded: boolean) => {
      if (!succeeded) {
        loseLease('System migration lease was lost');
        throw new SystemMigrationLeaseLostError();
      }
    };

    const runFencedMutation = async (mutation: () => Promise<boolean>) => {
      // 停止后 lease 可能尚未到期，但本地执行者不能再开始新的批次或状态写入。
      if (abortController.signal.aborted) throw new SystemMigrationLeaseLostError();
      try {
        assertMutationSucceeded(await mutation());
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
        throw new SystemMigrationFailureReportedError();
      },
      logger: migrationLogger
    };

    const heartbeat = async () => {
      if (heartbeatStopped || leaseLost) return;

      try {
        const renewed = await store.renewLease({
          migrationId: migration.id,
          runId,
          leaseDurationMs: resolvedTiming.leaseDurationMs
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

    let executionStartedAt = Date.now();

    try {
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
      await stopHeartbeat();

      if (leaseLost || abortController.signal.aborted) return 'interrupted';

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
      if (
        leaseLost ||
        abortController.signal.aborted ||
        error instanceof SystemMigrationLeaseLostError
      ) {
        await stopHeartbeat();
        return 'interrupted';
      }
      if (error instanceof SystemMigrationFailureReportedError) {
        loggedFailures.add(`${migration.id}:${runId}`);
        migrationLogger.error('System migration reported a failure', {
          durationMs: Date.now() - executionStartedAt
        });
        // 明确失败保持 failed 并停止续租，只能由管理员重置。
        migrationLogger.warn(
          migration.independent
            ? 'Independent system migration failed; other migrations are unaffected'
            : migration.onFailure === SystemMigrationFailurePolicyEnum.continue
              ? 'System migration failed; following queued migrations may continue'
              : 'System migration failed; following queued migrations are paused',
          {
            onFailure: migration.onFailure,
            requiredAction: 'Fix the failed records and retry the migration from the admin page'
          }
        );
        await stopHeartbeat();
        return 'failed';
      }

      const failure = normalizeMigrationFailure(error);
      try {
        const failed = await store.fail({
          migrationId: migration.id,
          runId,
          stageKey: currentProgressKey,
          error: failure
        });
        if (!failed) {
          loseLease('System migration failed after its lease was lost');
          return 'interrupted';
        }
        loggedFailures.add(`${migration.id}:${runId}`);
        migrationLogger.error('System migration execution failed', {
          error,
          durationMs: Date.now() - executionStartedAt
        });
        migrationLogger.warn(
          migration.independent
            ? 'Independent system migration failed; other migrations are unaffected'
            : migration.onFailure === SystemMigrationFailurePolicyEnum.continue
              ? 'System migration failed; following queued migrations may continue'
              : 'System migration failed; following queued migrations are paused',
          {
            onFailure: migration.onFailure,
            requiredAction: 'Fix the failed records and retry the migration from the admin page'
          }
        );
      } catch (writeError) {
        loseLease('Unable to persist system migration failure', writeError);
        await stopHeartbeat();
        return 'interrupted';
      }
      // 未通过 context.fail 抛出的普通异常也遵循相同失败策略。
      await stopHeartbeat();
      return 'failed';
    } finally {
      await stopHeartbeat();
      activeAbortControllers.delete(abortController);
    }
  };

  /**
   * 每个队列单独防重入和探活，长任务、delay 或 stop 失败只占用自己的队列。
   * 依赖状态仍从主库读取，普通任务可以等待已注册的独立前置任务成功。
   */
  const createQueue = (queueMigrations: readonly SystemMigration[]) => {
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
     * continue 只跳过已经失败的任务，不会自动重试它；管理员重置后仍按注册顺序重新处理。
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

          // 执行前再次校验依赖，覆盖旧节点已入队和绕过启动入口的任务；失败前置不会被 continue 绕过。
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
            if (item.onFailure === SystemMigrationFailurePolicyEnum.continue) {
              continue;
            }
            // stop 只暂停所在队列，不影响其他独立任务。
            return false;
          }

          migration = item;
          break;
        }
        // 仍有其他队列中的前置任务执行时保留探活；仅等待人工操作时停止扫描。
        if (!migration) return hasActiveDependencies;

        // claim 内部使用 Mongo 原子条件；这里读取到的 state 仅用于选任务，不作为执行权依据。
        const claimedState = await store.claimLease({
          migrationId: migration.id,
          runId: createRunId(),
          leaseDurationMs: resolvedTiming.leaseDurationMs
        });
        // stop 可能发生在 Mongo claim 期间；留下 running 状态供租约过期后接管。
        if (stopped) return false;
        if (!claimedState) {
          // pending/running 仍需探活，等待其他节点完成或租约过期后接管。
          return true;
        }

        const outcome = await executeMigration(migration, claimedState);
        if (outcome === 'interrupted') return !stopped;
        if (outcome === 'failed' && migration.onFailure === SystemMigrationFailurePolicyEnum.stop) {
          return false;
        }
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
      if (stopped) return Promise.resolve();
      if (tickPromise) return tickPromise;

      const generation = scanGeneration;
      tickPromise = runQueue()
        .then((shouldKeepScanning) => {
          // retry 可能在本轮扫描期间重新唤醒 runner；旧快照不能关闭新一轮定时器。
          if (!shouldKeepScanning && generation === scanGeneration) pauseScanning();
        })
        .catch((error) => {
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

  const queuedMigrations = migrations.filter((migration) => !migration.independent);
  const queues = [
    ...(queuedMigrations.length > 0 ? [createQueue(queuedMigrations)] : []),
    ...migrations
      .filter((migration) => migration.independent)
      .map((migration) => createQueue([migration]))
  ];
  /** 所有队列同时唤醒，普通队列的运行状态不能延迟独立任务的首次执行或重试。 */
  const wake = async () => {
    await Promise.all(queues.map((queue) => queue.wake()));
  };

  return {
    runnerId,
    tick: async () => {
      await Promise.all(queues.map((queue) => queue.tick()));
    },
    wake,
    /** 初始化状态并立即扫描；只有仍需自动推进或接管时才保留分钟级探活。 */
    start: async () => {
      if (started) return;
      started = true;
      stopped = false;
      await store.ensureStates(migrations);
      void wake();
    },
    /** 停止本节点扫描和 heartbeat；当前任务通过 AbortSignal 配合退出。 */
    stop: () => {
      stopped = true;
      queues.forEach((queue) => queue.stop());
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
