import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  SystemMigrationFailurePolicyEnum,
  SystemMigrationStatusEnum
} from '@fastgpt/global/migration/constants';
import {
  getMigrationFailedRecordCounts,
  getMigrationFailedRecords,
  resetFailedMigration
} from '@/migration/entity';
import { createSystemMigrationRunner, type SystemMigrationRunnerStore } from '@/migration/runner';
import type { SystemMigration, SystemMigrationLogger } from '@/migration/registry';
import {
  MongoSystemMigrationFailedRecord,
  MongoSystemMigrationState,
  type SystemMigrationStateSchemaType
} from '@/migration/mongoSchema';

const logger: SystemMigrationLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

const createMigration = (
  id: string,
  run: SystemMigration['run'],
  blockStartup = false,
  progressSteps: SystemMigration['progressSteps'] = [],
  onFailure = SystemMigrationFailurePolicyEnum.stop
): SystemMigration => ({
  id,
  version: '4.17.0',
  nameKey: `system_migration:migrations.${id}.name`,
  descriptionKey: `system_migration:migrations.${id}.description`,
  resultKey: `system_migration:migrations.${id}.result`,
  progressSteps,
  blockStartup,
  onFailure,
  run
});

describe('system migration runner', () => {
  const migrationIdPattern = /^20260903_runner_/;

  beforeEach(async () => {
    vi.clearAllMocks();
    await Promise.all([
      MongoSystemMigrationState.deleteMany({ _id: migrationIdPattern }),
      MongoSystemMigrationFailedRecord.deleteMany({ migrationId: migrationIdPattern })
    ]);
  });

  it('runs the registry serially while multiple nodes compete for every lease', async () => {
    const order: string[] = [];
    const migrations = [
      createMigration(
        '20260903_runner_serial_first',
        async (context) => {
          order.push('first:start');
          expect(await context.getCheckpoint(z.object({ cursor: z.number() }))).toBeUndefined();
          await context.reportProgress({
            key: 'test_progress',
            status: SystemMigrationStatusEnum.running,
            current: 1,
            total: 2
          });
          await context.reportProgress({
            key: 'test_progress',
            status: SystemMigrationStatusEnum.succeeded,
            current: 2,
            total: 2
          });
          await context.saveCheckpoint({ cursor: 10 });
          order.push('first:end');
          return { migratedCount: 1 };
        },
        false,
        [
          {
            key: 'test_progress',
            labelKey: 'system_migration:migrations.example.progress'
          }
        ]
      ),
      createMigration(
        '20260903_runner_serial_second',
        async () => {
          order.push('second');
        },
        true
      ),
      createMigration('20260903_runner_serial_third', async () => {
        order.push('third');
      })
    ];
    const firstRunner = createSystemMigrationRunner({
      migrations,
      runnerId: 'runner-a',
      timing: { scanIntervalMs: 10_000 },
      logger
    });
    const secondRunner = createSystemMigrationRunner({
      migrations,
      runnerId: 'runner-b',
      timing: { scanIntervalMs: 10_000 },
      logger
    });

    try {
      await Promise.all([firstRunner.start(), secondRunner.start()]);
      await Promise.all([firstRunner.tick(), secondRunner.tick()]);

      expect(order).toEqual(['first:start', 'first:end', 'second', 'third']);
      const states = await MongoSystemMigrationState.find({
        _id: { $in: migrations.map((migration) => migration.id) }
      })
        .sort({ _id: 1 })
        .lean();
      expect(states).toHaveLength(3);
      expect(states.every((state) => state.status === SystemMigrationStatusEnum.succeeded)).toBe(
        true
      );
      expect(states.find((state) => state._id.endsWith('serial_first'))?.checkpoint).toEqual({
        cursor: 10
      });
      expect(states.find((state) => state._id.endsWith('serial_first'))?.result).toEqual({
        migratedCount: 1
      });
      expect(logger.info).toHaveBeenCalledWith(
        'System migration execution succeeded',
        expect.objectContaining({
          migrationId: '20260903_runner_serial_first',
          result: { migratedCount: 1 }
        })
      );
    } finally {
      firstRunner.stop();
      secondRunner.stop();
    }
  });

  it('continues with later migrations after a non-blocking failure configured to continue', async () => {
    const failedTask = vi.fn(async () => {
      throw new Error('bad source record');
    });
    const laterTask = vi.fn();
    const migrations = [
      createMigration(
        '20260903_runner_continue_after_failure',
        failedTask,
        false,
        [],
        SystemMigrationFailurePolicyEnum.continue
      ),
      createMigration('20260903_runner_run_after_failure', laterTask)
    ];
    const runner = createSystemMigrationRunner({
      migrations,
      timing: { scanIntervalMs: 10_000 },
      logger
    });

    try {
      await runner.start();
      await vi.waitFor(async () => {
        const states = await MongoSystemMigrationState.find({
          _id: { $in: migrations.map((migration) => migration.id) }
        }).lean();
        expect(states.find((state) => state._id === migrations[0].id)?.status).toBe(
          SystemMigrationStatusEnum.failed
        );
        expect(states.find((state) => state._id === migrations[1].id)?.status).toBe(
          SystemMigrationStatusEnum.succeeded
        );
      });
      expect(failedTask).toHaveBeenCalledTimes(1);
      expect(laterTask).toHaveBeenCalledTimes(1);

      await runner.tick();
      expect(failedTask).toHaveBeenCalledTimes(1);
      expect(laterTask).toHaveBeenCalledTimes(1);
    } finally {
      runner.stop();
    }
  });

  it('holds a failed lease until the owner stops, then allows exactly one takeover', async () => {
    let executions = 0;
    let failFirstExecution: (() => void) | undefined;
    const firstExecutionCanFail = new Promise<void>((resolve) => {
      failFirstExecution = resolve;
    });
    const laterTask = vi.fn();
    const migrations = [
      createMigration(
        '20260903_runner_retry_failed',
        async () => {
          executions += 1;
          if (executions === 1) {
            await firstExecutionCanFail;
            throw new Error('temporary migration failure');
          }
        },
        true
      ),
      createMigration('20260903_runner_retry_later', laterTask)
    ];
    const runner = createSystemMigrationRunner({
      migrations,
      runnerId: 'runner-retry',
      timing: {
        scanIntervalMs: 10,
        heartbeatIntervalMs: 10,
        leaseDurationMs: 80,
        blockingPollIntervalMs: 10
      },
      logger
    });
    const observerRunner = createSystemMigrationRunner({
      migrations,
      runnerId: 'runner-observer',
      timing: {
        scanIntervalMs: 10,
        heartbeatIntervalMs: 10,
        leaseDurationMs: 80,
        blockingPollIntervalMs: 10
      },
      logger
    });
    let restartedRunner: ReturnType<typeof createSystemMigrationRunner> | undefined;

    try {
      await runner.start();
      await vi.waitFor(() => expect(executions).toBe(1));
      await observerRunner.start();
      failFirstExecution?.();
      await vi.waitFor(async () => {
        expect((await MongoSystemMigrationState.findById(migrations[0].id).lean())?.status).toBe(
          SystemMigrationStatusEnum.failed
        );
      });

      const failedState = await MongoSystemMigrationState.findById(migrations[0].id).lean();
      expect(failedState).toMatchObject({
        status: SystemMigrationStatusEnum.failed,
        lastError: {
          message: 'temporary migration failure'
        }
      });
      expect(executions).toBe(1);
      expect(laterTask).not.toHaveBeenCalled();

      await observerRunner.tick();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(executions).toBe(1);
      expect(laterTask).not.toHaveBeenCalled();
      const failedRunnerLogs = vi
        .mocked(logger.error)
        .mock.calls.filter(([message]) => message.includes('System migration'))
        .map(([, metadata]) => metadata?.runnerId);
      expect(new Set(failedRunnerLogs)).toEqual(new Set(['runner-retry', 'runner-observer']));
      const pausedRunnerLogs = vi
        .mocked(logger.warn)
        .mock.calls.filter(([message]) => message.includes('blocking nodes will remain not ready'))
        .map(([, metadata]) => metadata?.runnerId);
      expect(new Set(pausedRunnerLogs)).toEqual(new Set(['runner-retry', 'runner-observer']));

      runner.stop();
      observerRunner.stop();
      // failed 是终态，重启节点只执行一次即时扫描；等待旧 lease 过期后再启动才能接管。
      await new Promise((resolve) => setTimeout(resolve, 100));
      restartedRunner = createSystemMigrationRunner({
        migrations,
        runnerId: 'runner-after-restart',
        timing: {
          scanIntervalMs: 10,
          heartbeatIntervalMs: 10,
          leaseDurationMs: 80,
          blockingPollIntervalMs: 10
        },
        logger
      });
      await restartedRunner.start();
      await vi.waitFor(
        async () => {
          expect((await MongoSystemMigrationState.findById(migrations[0].id).lean())?.status).toBe(
            SystemMigrationStatusEnum.succeeded
          );
        },
        { timeout: 2_000 }
      );

      const retriedState = await MongoSystemMigrationState.findById(migrations[0].id).lean();
      expect(retriedState).toMatchObject({
        status: SystemMigrationStatusEnum.succeeded
      });
      expect(retriedState).not.toHaveProperty('lastError');
      expect(executions).toBe(2);
      await vi.waitFor(() => expect(laterTask).toHaveBeenCalledTimes(1));
    } finally {
      runner.stop();
      observerRunner.stop();
      restartedRunner?.stop();
    }
  });

  it('resumes from the checkpoint and exposes prior failed records after an admin retry', async () => {
    let executions = 0;
    const migration = createMigration(
      '20260903_runner_context_failure',
      async (context) => {
        executions += 1;
        await context.reportProgress({
          key: 'migrating',
          status: SystemMigrationStatusEnum.running
        });
        if (executions === 1) {
          expect(await context.getFailedRecords()).toEqual([]);
          const failedRecords = [
            {
              stageKey: 'migrating',
              data: { recordId: 'example-1' },
              reason: { message: 'missing modelId' }
            }
          ];
          // 错误快照先于 checkpoint 持久化，进程在两次调用之间退出也只会重放该批。
          await context.reportFailedRecords(failedRecords);
          await context.saveCheckpoint({ lastId: 'example-2' });
          await context.fail({
            message: 'example validation failed',
            failedRecords
          });
        }

        expect(await context.getCheckpoint(z.object({ lastId: z.string() }))).toEqual({
          lastId: 'example-2'
        });
        expect(await context.getFailedRecords()).toEqual([
          {
            stageKey: 'migrating',
            data: { recordId: 'example-1' },
            reason: { message: 'missing modelId' }
          }
        ]);
        await context.reportProgress({
          key: 'migrating',
          status: SystemMigrationStatusEnum.succeeded
        });
      },
      false,
      [
        {
          key: 'migrating',
          labelKey: 'system_migration:migrations.example.migrating'
        }
      ]
    );
    const runner = createSystemMigrationRunner({
      migrations: [migration],
      timing: { scanIntervalMs: 10_000 },
      logger
    });

    let retryRunner: ReturnType<typeof createSystemMigrationRunner> | undefined;
    try {
      await runner.start();
      await vi.waitFor(async () => {
        expect((await MongoSystemMigrationState.findById(migration.id).lean())?.status).toBe(
          SystemMigrationStatusEnum.failed
        );
        // 测试环境不启用 Mongo 事务，需等状态和独立错误明细都完成写入。
        await expect(getMigrationFailedRecordCounts([migration.id])).resolves.toEqual([
          { migrationId: migration.id, stageKey: 'migrating', count: 1 }
        ]);
      });

      const state = await MongoSystemMigrationState.findById(migration.id).lean();
      expect(state?.lastError).toMatchObject({
        stageKey: 'migrating',
        message: 'example validation failed'
      });
      expect(state?.lastError).not.toHaveProperty('key');
      expect(state?.lastError).not.toHaveProperty('params');
      await expect(getMigrationFailedRecords(migration.id)).resolves.toMatchObject([
        {
          stageKey: 'migrating',
          data: { recordId: 'example-1' },
          reason: { message: 'missing modelId' }
        }
      ]);
      const [storedFailedRecord] = await getMigrationFailedRecords(migration.id);
      expect(storedFailedRecord?.reason).toEqual({ message: 'missing modelId' });

      await new Promise((resolve) => setTimeout(resolve, 100));
      await runner.tick();
      expect(executions).toBe(1);
      expect((await MongoSystemMigrationState.findById(migration.id).lean())?.status).toBe(
        SystemMigrationStatusEnum.failed
      );

      await expect(resetFailedMigration(migration.id)).resolves.toBe(true);
      retryRunner = createSystemMigrationRunner({
        migrations: [migration],
        timing: { scanIntervalMs: 10_000 },
        logger
      });
      await retryRunner.start();
      await vi.waitFor(async () => {
        expect((await MongoSystemMigrationState.findById(migration.id).lean())?.status).toBe(
          SystemMigrationStatusEnum.succeeded
        );
      });
      expect(executions).toBe(2);
      await vi.waitFor(async () => {
        await expect(getMigrationFailedRecords(migration.id)).resolves.toEqual([]);
      });
    } finally {
      runner.stop();
      retryRunner?.stop();
    }
  });

  it('prevents a blocking migration from accessing failed record details', async () => {
    const migration = createMigration(
      '20260903_runner_blocking_failed_records',
      async (context) => {
        await context.reportProgress({
          key: 'migrating',
          status: SystemMigrationStatusEnum.running
        });
        await context.fail({
          message: 'blocking migration failure',
          failedRecords: [
            {
              stageKey: 'migrating',
              data: { recordId: 'record-1' },
              reason: { message: 'invalid source data' }
            }
          ]
        });
      },
      true,
      [
        {
          key: 'migrating',
          labelKey: 'system_migration:migrations.example.migrating'
        }
      ]
    );
    const runner = createSystemMigrationRunner({
      migrations: [migration],
      timing: { scanIntervalMs: 10_000 },
      logger
    });

    try {
      await runner.start();
      await vi.waitFor(async () => {
        expect((await MongoSystemMigrationState.findById(migration.id).lean())?.status).toBe(
          SystemMigrationStatusEnum.failed
        );
      });

      const state = await MongoSystemMigrationState.findById(migration.id).lean();
      expect(state?.lastError?.message).toContain('cannot access failed record details');
      await expect(getMigrationFailedRecordCounts([migration.id])).resolves.toEqual([]);
      await expect(getMigrationFailedRecords(migration.id)).resolves.toEqual([]);
    } finally {
      runner.stop();
    }
  });

  it('prevents a blocking migration from reading failed record details', async () => {
    const migration = createMigration(
      '20260903_runner_blocking_read_failed_records',
      async (context) => {
        await context.getFailedRecords();
      },
      true
    );
    const runner = createSystemMigrationRunner({
      migrations: [migration],
      timing: { scanIntervalMs: 10_000 },
      logger
    });

    try {
      await runner.start();
      await vi.waitFor(async () => {
        expect((await MongoSystemMigrationState.findById(migration.id).lean())?.status).toBe(
          SystemMigrationStatusEnum.failed
        );
      });
      expect(
        (await MongoSystemMigrationState.findById(migration.id).lean())?.lastError?.message
      ).toContain('cannot access failed record details');
    } finally {
      runner.stop();
    }
  });

  it('leaves a stopped owner running until another node takes over the expired lease', async () => {
    let executions = 0;
    const migration = createMigration(
      '20260903_runner_crash_takeover',
      async (context) => {
        executions += 1;
        if (executions === 1) {
          await context.saveCheckpoint({ firstBatchCompleted: true });
          await new Promise<void>((resolve) =>
            context.signal.addEventListener('abort', () => resolve(), { once: true })
          );
          return;
        }
        expect(
          await context.getCheckpoint(z.object({ firstBatchCompleted: z.literal(true) }))
        ).toEqual({ firstBatchCompleted: true });
        await context.saveCheckpoint({ recovered: true });
      },
      true
    );
    const timing = {
      scanIntervalMs: 10,
      heartbeatIntervalMs: 15,
      leaseDurationMs: 80,
      blockingPollIntervalMs: 10
    };
    const firstRunner = createSystemMigrationRunner({
      migrations: [migration],
      runnerId: 'runner-crashed',
      timing,
      logger
    });
    const takeoverRunner = createSystemMigrationRunner({
      migrations: [migration],
      runnerId: 'runner-takeover',
      timing,
      logger
    });

    try {
      await firstRunner.start();
      await vi.waitFor(async () => {
        const state = await MongoSystemMigrationState.findById(migration.id).lean();
        expect(state).toMatchObject({
          status: SystemMigrationStatusEnum.running
        });
      });

      firstRunner.stop();
      await takeoverRunner.start();
      await takeoverRunner.waitForBlockingMigrations();

      const state = await MongoSystemMigrationState.findById(migration.id).lean();
      expect(state).toMatchObject({
        status: SystemMigrationStatusEnum.succeeded,
        checkpoint: { recovered: true }
      });
      expect(executions).toBe(2);
    } finally {
      firstRunner.stop();
      takeoverRunner.stop();
    }
  });

  it('keeps polling blocking states after a transient Mongo read failure', async () => {
    const migration = createMigration('20260903_runner_poll_recovery', async () => undefined, true);
    const now = new Date();
    const getStates = vi
      .fn<SystemMigrationRunnerStore['getStates']>()
      .mockRejectedValueOnce(new Error('temporary read failure'))
      .mockResolvedValueOnce([
        {
          _id: migration.id,
          status: SystemMigrationStatusEnum.succeeded,
          createdAt: now,
          updatedAt: now
        }
      ]);
    const store: SystemMigrationRunnerStore = {
      ensureStates: vi.fn(),
      getStates,
      getFailedRecords: vi.fn(),
      claimLease: vi.fn(),
      renewLease: vi.fn(),
      isLeaseActive: vi.fn(),
      saveCheckpoint: vi.fn(),
      saveFailedRecords: vi.fn(),
      saveProgress: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn()
    };
    const runner = createSystemMigrationRunner({
      migrations: [migration],
      timing: { blockingPollIntervalMs: 1 },
      store,
      logger
    });

    try {
      expect(runner.hasBlockingMigrations).toBe(true);
      await expect(runner.waitForBlockingMigrations()).resolves.toBeUndefined();
      expect(getStates).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        'Unable to read blocking system migration states; polling will continue',
        expect.objectContaining({ error: expect.any(Error) })
      );
    } finally {
      runner.stop();
    }
  });

  it('pauses terminal-state scans and resumes them when explicitly woken', async () => {
    vi.useFakeTimers();
    const migration = createMigration('20260903_runner_idle_scan', async () => undefined);
    const now = new Date();
    let status: SystemMigrationStatusEnum = SystemMigrationStatusEnum.succeeded;
    const getStates = vi.fn<SystemMigrationRunnerStore['getStates']>(async () => [
      {
        _id: migration.id,
        status,
        createdAt: now,
        updatedAt: now
      }
    ]);
    const store: SystemMigrationRunnerStore = {
      ensureStates: vi.fn(),
      getStates,
      getFailedRecords: vi.fn(),
      claimLease: vi.fn(async () => null),
      renewLease: vi.fn(),
      isLeaseActive: vi.fn(),
      saveCheckpoint: vi.fn(),
      saveFailedRecords: vi.fn(),
      saveProgress: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn()
    };
    const runner = createSystemMigrationRunner({
      migrations: [migration],
      timing: { scanIntervalMs: 10 },
      store,
      logger
    });

    try {
      await runner.start();
      await runner.tick();
      expect(getStates).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(100);
      expect(getStates).toHaveBeenCalledTimes(1);

      status = SystemMigrationStatusEnum.running;
      await runner.wake();
      expect(getStates).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(10);
      expect(getStates).toHaveBeenCalledTimes(3);

      status = SystemMigrationStatusEnum.failed;
      await vi.advanceTimersByTimeAsync(10);
      expect(getStates).toHaveBeenCalledTimes(4);

      await vi.advanceTimersByTimeAsync(100);
      expect(getStates).toHaveBeenCalledTimes(4);
    } finally {
      runner.stop();
      vi.useRealTimers();
    }
  });

  it('does not let an old terminal scan cancel a concurrent wake', async () => {
    vi.useFakeTimers();
    const migration = createMigration('20260903_runner_concurrent_wake', async () => undefined);
    const now = new Date();
    let resolveFirstScan: ((states: SystemMigrationStateSchemaType[]) => void) | undefined;
    const firstScan = new Promise<SystemMigrationStateSchemaType[]>((resolve) => {
      resolveFirstScan = resolve;
    });
    const runningState: SystemMigrationStateSchemaType = {
      _id: migration.id,
      status: SystemMigrationStatusEnum.running,
      createdAt: now,
      updatedAt: now
    };
    const getStates = vi
      .fn<SystemMigrationRunnerStore['getStates']>()
      .mockReturnValueOnce(firstScan)
      .mockResolvedValue([runningState]);
    const store: SystemMigrationRunnerStore = {
      ensureStates: vi.fn(),
      getStates,
      getFailedRecords: vi.fn(),
      claimLease: vi.fn(async () => null),
      renewLease: vi.fn(),
      isLeaseActive: vi.fn(),
      saveCheckpoint: vi.fn(),
      saveFailedRecords: vi.fn(),
      saveProgress: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn()
    };
    const runner = createSystemMigrationRunner({
      migrations: [migration],
      timing: { scanIntervalMs: 10 },
      store,
      logger
    });

    try {
      await runner.start();
      const wakePromise = runner.wake();
      resolveFirstScan?.([
        {
          _id: migration.id,
          status: SystemMigrationStatusEnum.succeeded,
          createdAt: now,
          updatedAt: now
        }
      ]);
      await wakePromise;
      expect(getStates).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(10);
      expect(getStates).toHaveBeenCalledTimes(3);
    } finally {
      runner.stop();
      vi.useRealTimers();
    }
  });
});
