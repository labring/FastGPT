import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  SystemMigrationStatusEnum,
  systemMigrationLimits
} from '@fastgpt/global/migration/constants';
import { redisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import {
  getMigrationFailedRecordCounts,
  getMigrationFailedRecords,
  resetFailedMigration,
  enqueueManualMigration,
  claimMigrationLease,
  completeMigration,
  ensureMigrationStates,
  failMigration,
  getMigrationStates,
  isMigrationLeaseActive,
  renewMigrationLease,
  saveMigrationCheckpoint,
  saveMigrationFailedRecords,
  saveMigrationProgress
} from '@/migration/entity';
import { createSystemMigrationRunner, type SystemMigrationRunnerStore } from '@/migration/runner';
import type {
  SystemMigration,
  SystemMigrationContext,
  SystemMigrationLogger
} from '@/migration/registry';
import {
  MongoSystemMigrationState,
  type SystemMigrationStateSchemaType
} from '@/migration/mongoSchema';

const logger: SystemMigrationLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

const createMigration = (id: string, run: SystemMigration['run']): SystemMigration => ({
  id,
  version: '4.17.0',
  nameKey: `system_migration:migrations.${id}.name`,
  descriptionKey: `system_migration:migrations.${id}.description`,
  resultKey: `system_migration:migrations.${id}.result`,
  progressSteps: [],
  run
});

/** 默认仍使用真实 Mongo，仅替换各用例需要模拟的存储故障或调度时序。 */
const createStore = (
  overrides: Partial<SystemMigrationRunnerStore>
): SystemMigrationRunnerStore => ({
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
  fail: failMigration,
  ...overrides
});

describe('system migration runner', () => {
  const concurrencyTokens = new Map<string, { key: string; expiresAt: number }>();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    concurrencyTokens.clear();
    // 使用真实 LeaseCache 生命周期，只替换 Redis 原子脚本边界；所有 Runner 共享同一存储。
    vi.spyOn(redisCacheAdapter, 'evalScript').mockImplementation(
      async ({ script, keys = [], args = [] }) => {
        const key = String(keys[0]);
        const token = String(args[0]);
        const ttlMs = Number(args[1]);
        if (key.includes('concurrency-waiters:')) return 1;
        for (const [heldToken, lease] of concurrencyTokens) {
          if (lease.expiresAt <= Date.now()) concurrencyTokens.delete(heldToken);
        }
        if (script.includes('ZCARD')) {
          const occupied = [...concurrencyTokens.values()].filter(
            (lease) => lease.key === key
          ).length;
          if (occupied >= Number(args[2])) return 0;
          concurrencyTokens.set(token, { key, expiresAt: Date.now() + ttlMs });
          return 1;
        }
        const lease = concurrencyTokens.get(token);
        if (!lease || lease.key !== key) return 0;
        if (script.includes('ZSCORE')) {
          lease.expiresAt = Date.now() + ttlMs;
          return 1;
        }
        return Number(concurrencyTokens.delete(token));
      }
    );
  });

  it('prioritizes startup dependencies across nodes before enabling any background queue', async () => {
    const order: string[] = [];
    const recorded = (id: string) =>
      createMigration(`20260903_runner_${id}`, async () => {
        order.push(id);
      });
    const ordinary = recorded('unrelated');
    const prerequisite = { ...recorded('startup_base'), independent: true };
    const middle = { ...recorded('startup_middle'), dependsOn: [prerequisite.id] };
    const root = { ...recorded('startup_root'), blockStartup: true, dependsOn: [middle.id] };
    const independent = { ...recorded('background_independent'), independent: true };
    const migrations = [ordinary, prerequisite, middle, root, independent];
    const runners = ['owner', 'follower'].map((runnerId) =>
      createSystemMigrationRunner({ migrations, runnerId, logger })
    );
    try {
      expect(() => runners[0].startBackgroundMigrations()).toThrow(
        'Startup migrations have not completed'
      );
      await Promise.all(runners.map((runner) => runner.start()));
      await runners[0].start();
      await Promise.all(runners.map((runner) => runner.tick()));
      expect(order).toEqual(['startup_base', 'startup_middle', 'startup_root']);
      expect(redisCacheAdapter.evalScript).not.toHaveBeenCalled();
      await Promise.all(runners.map((runner) => runner.waitForBlockingMigrations()));
      await runners[0].waitForBlockingMigrations();
      expect(order).toHaveLength(3);
      runners.forEach((runner) => runner.startBackgroundMigrations());
      runners[0].startBackgroundMigrations();
      await Promise.all(runners.map((runner) => runner.tick()));
      expect(order.slice(3).sort()).toEqual(['background_independent', 'unrelated']);
      expect(concurrencyTokens.size).toBe(0);
      // 成功状态属于整个集群：后续节点启动不会重放已完成的启动写入。
      const laterNode = createSystemMigrationRunner({ migrations, logger });
      runners.push(laterNode);
      await laterNode.start();
      await laterNode.waitForBlockingMigrations();
      laterNode.startBackgroundMigrations();
      await laterNode.tick();
      expect(order).toHaveLength(5);
    } finally {
      runners.forEach((runner) => runner.stop());
      await Promise.all(runners.map((runner) => runner.tick()));
    }
  });

  it.each(['throw', 'reported', 'complete'] as const)(
    'holds a failed startup lease until the owner stops (%s)',
    async (failureType) => {
      let executions = 0;
      const blocked = createMigration('20260903_runner_failed_startup', async (context) => {
        executions += 1;
        if (executions === 1) {
          await context.saveCheckpoint({ cursor: 1 });
          if (failureType === 'complete') return;
          if (failureType === 'reported') await context.fail({ message: 'startup source invalid' });
          throw new Error('startup source invalid');
        }
        expect(await context.getCheckpoint(z.object({ cursor: z.number() }))).toEqual({
          cursor: 1
        });
      });
      blocked.blockStartup = true;
      const backgroundRun = vi.fn(async () => undefined);
      const migrations = [blocked, createMigration('20260903_runner_after_startup', backgroundRun)];
      const timing = {
        scanIntervalMs: 10,
        heartbeatIntervalMs: 10,
        leaseDurationMs: 2_000,
        blockingPollIntervalMs: 10
      };
      const owner = createSystemMigrationRunner({
        migrations,
        runnerId: 'startup-owner',
        timing,
        logger,
        store:
          failureType === 'complete'
            ? createStore({
                complete: vi
                  .fn(completeMigration)
                  .mockRejectedValueOnce(new Error('success state commit failed'))
              })
            : undefined
      });
      const follower = createSystemMigrationRunner({
        migrations,
        runnerId: 'startup-follower',
        timing,
        logger
      });
      const restarted = createSystemMigrationRunner({
        migrations,
        runnerId: 'startup-restarted',
        timing,
        logger
      });
      let ownerWait: Promise<PromiseSettledResult<void>[]> | undefined;
      let followerWait: Promise<void> | undefined;
      try {
        await owner.start();
        ownerWait = Promise.allSettled([owner.waitForBlockingMigrations()]);
        await vi.waitFor(async () => {
          expect(await MongoSystemMigrationState.findById(blocked.id).lean()).toMatchObject({
            status: SystemMigrationStatusEnum.failed
          });
        });
        const initialFailure = await MongoSystemMigrationState.findById(blocked.id).lean();
        await follower.start();
        await follower.tick();
        followerWait = follower.waitForBlockingMigrations();
        void followerWait.catch(() => undefined);
        // failed 后仍有 heartbeat，其他节点不能接管或重放，后台也不能提前开始。
        await vi.waitFor(async () => {
          const state = await MongoSystemMigrationState.findById(blocked.id).lean();
          expect(state!.heartbeatAt!.getTime()).toBeGreaterThan(
            initialFailure!.heartbeatAt!.getTime()
          );
        });
        expect(executions).toBe(1);
        expect(backgroundRun).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(
          'Startup migration failed; App nodes remain not ready',
          expect.objectContaining({ requiredAction: expect.stringContaining('restart') })
        );
        if (failureType === 'reported') {
          expect(logger.error).toHaveBeenCalledWith(
            'System migration reported a failure',
            expect.objectContaining({ message: 'startup source invalid' })
          );
        }

        owner.stop();
        await owner.tick();
        expect((await ownerWait)[0].status).toBe('rejected');
        // 精确模拟失败 owner 停止后的租约到期，不依赖真实等待两秒。
        await MongoSystemMigrationState.updateOne(
          { _id: blocked.id },
          { $set: { leaseExpireAt: new Date(0) } }
        );
        await restarted.start();
        await Promise.all([followerWait, restarted.waitForBlockingMigrations()]);
        expect(executions).toBe(2);
        expect(backgroundRun).not.toHaveBeenCalled();
        restarted.startBackgroundMigrations();
        await restarted.tick();
        expect(backgroundRun).toHaveBeenCalledTimes(1);
        expect(await MongoSystemMigrationState.findById(blocked.id).lean()).toMatchObject({
          status: SystemMigrationStatusEnum.succeeded,
          checkpoint: { cursor: 1 }
        });
      } finally {
        [owner, follower, restarted].forEach((runner) => runner.stop());
        await Promise.all([owner, follower, restarted].map((runner) => runner.tick()));
        await ownerWait;
        await followerWait?.catch(() => undefined);
      }
    }
  );

  it('keeps startup closed through transient read errors, missing states and observed failure', async () => {
    vi.useFakeTimers();
    const migration = {
      ...createMigration('20260903_runner_startup_poll', async () => undefined),
      blockStartup: true
    };
    const now = new Date();
    const getStates = vi
      .fn<SystemMigrationRunnerStore['getStates']>()
      .mockRejectedValueOnce(new Error('Mongo unavailable'))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          _id: migration.id,
          status: SystemMigrationStatusEnum.failed,
          createdAt: now,
          updatedAt: now
        }
      ])
      .mockResolvedValue([
        {
          _id: migration.id,
          status: SystemMigrationStatusEnum.succeeded,
          createdAt: now,
          updatedAt: now
        }
      ]);
    const runner = createSystemMigrationRunner({
      migrations: [migration],
      timing: { blockingPollIntervalMs: 10 },
      store: createStore({ getStates }),
      logger
    });
    let ready = false;
    try {
      const waiting = runner.waitForBlockingMigrations().then(() => {
        ready = true;
      });
      await vi.advanceTimersByTimeAsync(20);
      expect(ready).toBe(false);
      await vi.advanceTimersByTimeAsync(10);
      await waiting;
      expect(ready).toBe(true);
      expect(getStates).toHaveBeenCalledTimes(4);
      expect(logger.warn).toHaveBeenCalledWith(
        'Unable to read startup migration states; App remains not ready',
        expect.anything()
      );
    } finally {
      runner.stop();
      vi.useRealTimers();
    }
  });

  it('does not release startup when the runner stops during its final state read', async () => {
    const migration = {
      ...createMigration('20260903_runner_stopped_startup', async () => undefined),
      blockStartup: true
    };
    const now = new Date();
    const getStates = vi.fn(async () => {
      runner.stop();
      return [
        {
          _id: migration.id,
          status: SystemMigrationStatusEnum.succeeded,
          createdAt: now,
          updatedAt: now
        }
      ];
    });
    const runner = createSystemMigrationRunner({
      migrations: [migration],
      store: createStore({ getStates }),
      logger
    });
    await expect(runner.waitForBlockingMigrations()).rejects.toThrow('Runner stopped');
    // 已停止的等待也不能重新读取并放行，即使共享任务已经成功。
    await expect(runner.waitForBlockingMigrations()).rejects.toThrow('Runner stopped');
    expect(getStates).toHaveBeenCalledTimes(1);
    expect(() => runner.startBackgroundMigrations()).toThrow('have not completed');
  });

  it.each([
    { method: 'saveCheckpoint', throws: false },
    { method: 'saveCheckpoint', throws: true },
    { method: 'isLeaseActive', throws: false },
    { method: 'complete', throws: false },
    { method: 'fail', throws: false },
    { method: 'fail', throws: true },
    { method: 'renewLease', throws: false },
    { method: 'renewLease', throws: true }
  ] as const)(
    'preserves running state when $method cannot confirm ownership (throws: $throws)',
    async ({ method, throws }) => {
      const mutation = vi.fn(async () => {
        if (throws) throw new Error('storage unavailable');
        return false;
      });
      const migration = createMigration('20260903_runner_fenced_write', async (context) => {
        if (method === 'saveCheckpoint') await context.saveCheckpoint({ cursor: 1 });
        if (method === 'isLeaseActive') await context.assertActive();
        if (method === 'fail') throw new Error('business error');
        if (method === 'renewLease') {
          await new Promise<void>((resolve) =>
            context.signal.addEventListener('abort', () => resolve(), { once: true })
          );
        }
      });
      const runner = createSystemMigrationRunner({
        migrations: [migration],
        store: createStore({ [method]: mutation }),
        timing: { scanIntervalMs: 10_000, heartbeatIntervalMs: 10 },
        logger
      });
      try {
        await runner.start();
        await runner.tick();
        expect(mutation).toHaveBeenCalled();
        const state = await MongoSystemMigrationState.findById(migration.id).lean();
        expect(state).toMatchObject({ status: SystemMigrationStatusEnum.running });
        expect(state?.lastError).toBeUndefined();
        expect(state?.checkpoint).toBeUndefined();
      } finally {
        runner.stop();
        await runner.tick();
      }
    }
  );

  it.each([
    {
      name: 'undeclared progress',
      run: (context: SystemMigrationContext) =>
        context.reportProgress({ key: 'unknown', status: SystemMigrationStatusEnum.running }),
      error: 'undeclared progress step'
    },
    {
      name: 'undeclared failed records',
      run: (context: SystemMigrationContext) =>
        context.reportFailedRecords([
          { stageKey: 'unknown', data: { recordId: '1' }, reason: { message: 'bad data' } }
        ]),
      error: 'undeclared progress step'
    },
    {
      name: 'incomplete progress',
      run: async () => undefined,
      error: 'before completing progress step'
    },
    {
      name: 'invalid result',
      run: async () => ({ oversized: 'x'.repeat(systemMigrationLimits.maxDataStringLength + 1) }),
      error: 'Too big'
    }
  ])('fails a task that reports $name', async ({ name, run, error }) => {
    const migration = {
      ...createMigration('20260903_runner_invalid_output', run),
      progressSteps:
        name === 'invalid result' ? [] : [{ key: 'known', labelKey: 'system_migration:stage' }]
    };
    const runner = createSystemMigrationRunner({ migrations: [migration], logger });
    try {
      await runner.start();
      await runner.tick();
      const state = await MongoSystemMigrationState.findById(migration.id).lean();
      expect(state).toMatchObject({ status: SystemMigrationStatusEnum.failed });
      expect(state?.lastError?.message).toContain(error);
      expect(state?.result).toBeUndefined();
      expect(await getMigrationFailedRecords(migration.id)).toEqual([]);
    } finally {
      runner.stop();
      await runner.tick();
    }
  });

  it.each(['success', 'failure'] as const)(
    'shares three independent slots across nodes and releases a slot after %s',
    async (outcome) => {
      let active = 0;
      let peak = 0;
      let normalActive = 0;
      const finish = new Map<string, () => void>();
      let finishId: string | undefined;
      const migrations = Array.from({ length: 8 }, (_, index) => ({
        ...createMigration(`20260903_runner_limited_${index}`, async (context) => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise<void>((resolve) => {
            finish.set(context.migrationId, resolve);
            context.signal.addEventListener('abort', () => resolve(), { once: true });
          });
          active -= 1;
          if (context.migrationId === finishId && outcome === 'failure') {
            throw new Error('independent task failed');
          }
        }),
        independent: true
      }));
      // 两个节点各自发现一组任务，证明额度限制作用于整个集群而不是单个 Runner。
      const runners = [0, 1].map((node) =>
        createSystemMigrationRunner({
          migrations: [
            createMigration(`20260903_runner_normal_${node}`, async (context) => {
              normalActive += 1;
              await new Promise<void>((resolve) =>
                context.signal.addEventListener('abort', () => resolve(), { once: true })
              );
              normalActive -= 1;
            }),
            ...migrations.slice(node * 4, node * 4 + 4)
          ],
          logger
        })
      );

      try {
        await Promise.all(runners.map((runner) => runner.start()));
        await vi.waitFor(
          () => {
            expect(active).toBe(3);
            expect(normalActive).toBe(2);
          },
          { timeout: 5_000 }
        );
        const states = await MongoSystemMigrationState.find({
          _id: { $in: migrations.map((migration) => migration.id) }
        }).lean();
        expect(
          states.filter((state) => state.status === SystemMigrationStatusEnum.running)
        ).toHaveLength(3);
        // 等待额度的任务保持 pending，不会提前取得 Mongo lease 或启动业务函数。
        const waiting = states.filter(
          (state) => state.status === SystemMigrationStatusEnum.pending
        );
        expect(waiting).toHaveLength(5);
        expect(waiting.every((state) => !state.runId)).toBe(true);
        expect(finish.size).toBe(3);

        finishId = [...finish.keys()][0];
        finish.get(finishId)?.();
        await vi.waitFor(
          async () => {
            expect(finish.size).toBe(4);
            expect(active).toBe(3);
            expect(await MongoSystemMigrationState.findById(finishId).lean()).toMatchObject({
              status:
                outcome === 'success'
                  ? SystemMigrationStatusEnum.succeeded
                  : SystemMigrationStatusEnum.failed
            });
          },
          { timeout: 5_000 }
        );
        expect(peak).toBe(3);
      } finally {
        runners.forEach((runner) => runner.stop());
        await Promise.all(runners.map((runner) => runner.tick()));
      }
      expect(active).toBe(0);
      expect(normalActive).toBe(0);
      expect(concurrencyTokens.size).toBe(0);
      expect(finish.size).toBe(4);
      expect(
        await MongoSystemMigrationState.countDocuments({
          _id: { $in: migrations.map((migration) => migration.id) },
          status: SystemMigrationStatusEnum.pending
        })
      ).toBe(4);
    }
  );

  it.each(['unavailable', 'full'] as const)(
    'waits without claiming work when shared slots are %s',
    async (quotaState) => {
      const healthyEvalScript = vi.mocked(redisCacheAdapter.evalScript).getMockImplementation()!;
      if (quotaState === 'unavailable') {
        vi.mocked(redisCacheAdapter.evalScript).mockRejectedValueOnce(
          new Error('Redis unavailable')
        );
      } else {
        vi.mocked(redisCacheAdapter.evalScript).mockImplementation(async (input) =>
          input.script.includes('ZCARD') ? 0 : healthyEvalScript(input)
        );
      }
      const independentRun = vi.fn(async () => undefined);
      const normalRun = vi.fn(async () => undefined);
      const independent = {
        ...createMigration('20260903_runner_redis_unavailable', independentRun),
        independent: true
      };
      const runner = createSystemMigrationRunner({
        migrations: [independent, createMigration('20260903_runner_normal_available', normalRun)],
        timing: { scanIntervalMs: quotaState === 'full' ? 20 : 10_000 },
        logger
      });
      try {
        await runner.start();
        await runner.tick();
        expect(independentRun).not.toHaveBeenCalled();
        expect(normalRun).toHaveBeenCalledTimes(1);
        const state = await MongoSystemMigrationState.findById(independent.id).lean();
        expect(state).toMatchObject({ status: SystemMigrationStatusEnum.pending });
        expect(state?.runId).toBeUndefined();
        if (quotaState === 'full') expect(logger.error).not.toHaveBeenCalled();
        vi.mocked(redisCacheAdapter.evalScript).mockImplementation(healthyEvalScript);
        await runner.wake();
        expect(independentRun).toHaveBeenCalledTimes(1);
        expect(await MongoSystemMigrationState.findById(independent.id).lean()).toMatchObject({
          status: SystemMigrationStatusEnum.succeeded
        });
      } finally {
        runner.stop();
        await runner.tick();
      }
    }
  );

  it('aborts after losing a shared slot and preserves the Mongo checkpoint for takeover', async () => {
    let executions = 0;
    let stoppedSignal: AbortSignal | undefined;
    const migration = {
      ...createMigration('20260903_runner_concurrency_lost', async (context) => {
        executions += 1;
        if (executions === 1) {
          stoppedSignal = context.signal;
          await context.saveCheckpoint({ cursor: 1 });
          await new Promise<void>((resolve) =>
            context.signal.addEventListener('abort', () => resolve(), { once: true })
          );
          await expect(context.assertActive()).rejects.toThrow(
            'System migration lease is no longer active'
          );
        } else {
          expect(await context.getCheckpoint(z.object({ cursor: z.number() }))).toEqual({
            cursor: 1
          });
        }
      }),
      independent: true
    };
    const runner = createSystemMigrationRunner({
      migrations: [migration],
      timing: { heartbeatIntervalMs: 10, leaseDurationMs: 2_000, scanIntervalMs: 10_000 },
      logger
    });
    try {
      await runner.start();
      await vi.waitFor(async () => {
        expect(await MongoSystemMigrationState.findById(migration.id).lean()).toMatchObject({
          checkpoint: { cursor: 1 }
        });
      });
      concurrencyTokens.clear();
      await runner.tick();
      expect(stoppedSignal?.aborted).toBe(true);
      const state = await MongoSystemMigrationState.findById(migration.id).lean();
      expect(state).toMatchObject({
        status: SystemMigrationStatusEnum.running,
        checkpoint: { cursor: 1 }
      });
      expect(state?.lastError).toBeUndefined();
      expect(executions).toBe(1);
      await MongoSystemMigrationState.updateOne(
        { _id: migration.id },
        { $set: { leaseExpireAt: new Date(0) } }
      );
      await runner.wake();
      expect(executions).toBe(2);
      expect(await MongoSystemMigrationState.findById(migration.id).lean()).toMatchObject({
        status: SystemMigrationStatusEnum.succeeded
      });
    } finally {
      runner.stop();
      await runner.tick();
    }
  });

  it.each(['running', 'delayed', 'failed'] as const)(
    'executes an independent task once across nodes while the ordinary queue is %s',
    async (queueState) => {
      const ordinaryRun = vi.fn(async (context: Parameters<SystemMigration['run']>[0]) => {
        if (queueState === 'failed') throw new Error('ordinary task failed');
        await new Promise<void>((resolve) =>
          context.signal.addEventListener('abort', () => resolve(), { once: true })
        );
      });
      const laterRun = vi.fn(async () => undefined);
      const independentRun = vi.fn(async () => undefined);
      const ordinary = {
        ...createMigration('20260903_runner_ordinary_held', ordinaryRun),
        delay: queueState === 'delayed'
      };
      const independent = {
        ...createMigration('20260903_runner_independent_immediate', independentRun),
        independent: true
      };
      const migrations = [
        ordinary,
        createMigration('20260903_runner_ordinary_later', laterRun),
        independent
      ];
      const runners = ['first', 'second'].map((runnerId) =>
        createSystemMigrationRunner({
          migrations,
          runnerId,
          timing: { scanIntervalMs: 10_000, delayMs: 60_000 },
          logger
        })
      );

      try {
        await Promise.all(runners.map((runner) => runner.start()));
        await vi.waitFor(
          async () => {
            expect(await MongoSystemMigrationState.findById(independent.id).lean()).toMatchObject({
              status: SystemMigrationStatusEnum.succeeded
            });
            expect(await MongoSystemMigrationState.findById(ordinary.id).lean()).toMatchObject({
              status:
                queueState === 'failed'
                  ? SystemMigrationStatusEnum.failed
                  : SystemMigrationStatusEnum.running
            });
            if (queueState === 'running') expect(ordinaryRun).toHaveBeenCalledTimes(1);
            if (queueState === 'failed') expect(laterRun).toHaveBeenCalledTimes(1);
            if (queueState === 'delayed') {
              expect(logger.info).toHaveBeenCalledWith(
                'System migration execution delayed by configuration',
                expect.objectContaining({ migrationId: ordinary.id })
              );
            }
          },
          { timeout: 5_000 }
        );
        expect(independentRun).toHaveBeenCalledTimes(1);
        if (queueState !== 'failed') expect(laterRun).not.toHaveBeenCalled();
        if (queueState === 'delayed') expect(ordinaryRun).not.toHaveBeenCalled();
      } finally {
        runners.forEach((runner) => runner.stop());
        await Promise.all(runners.map((runner) => runner.tick()));
      }
    }
  );

  it('isolates independent tasks, retries during another execution and stops every active task', async () => {
    const signals: AbortSignal[] = [];
    const holdUntilStopped = async (context: Parameters<SystemMigration['run']>[0]) => {
      signals.push(context.signal);
      await new Promise<void>((resolve) =>
        context.signal.addEventListener('abort', () => resolve(), { once: true })
      );
      await expect(context.assertActive()).rejects.toThrow(
        'System migration lease is no longer active'
      );
    };
    const failedRun = vi.fn(async () => undefined).mockRejectedValueOnce(new Error('bad source'));
    const failed = {
      ...createMigration('20260903_runner_independent_retry', failedRun),
      independent: true
    };
    const migrations = [
      createMigration('20260903_runner_normal_long', holdUntilStopped),
      {
        ...createMigration('20260903_runner_independent_long', holdUntilStopped),
        independent: true
      },
      failed
    ];
    const runner = createSystemMigrationRunner({ migrations, logger });
    let wakePromise: Promise<void> | undefined;

    try {
      await runner.start();
      await vi.waitFor(async () => {
        expect(signals).toHaveLength(2);
        expect(await MongoSystemMigrationState.findById(failed.id).lean()).toMatchObject({
          status: SystemMigrationStatusEnum.failed
        });
      });
      // 即使 lease 过期也不能自动重试明确失败的独立任务。
      await MongoSystemMigrationState.updateOne(
        { _id: failed.id },
        { $set: { leaseExpireAt: new Date(0) } }
      );
      const observer = createSystemMigrationRunner({ migrations, logger });
      try {
        await observer.start();
        await observer.tick();
        expect(failedRun).toHaveBeenCalledTimes(1);
      } finally {
        observer.stop();
      }
      expect(await resetFailedMigration(failed.id)).toBe(true);
      wakePromise = runner.wake();
      await vi.waitFor(async () => {
        expect(await MongoSystemMigrationState.findById(failed.id).lean()).toMatchObject({
          status: SystemMigrationStatusEnum.succeeded
        });
      });
      expect(failedRun).toHaveBeenCalledTimes(2);
      expect(signals.every((signal) => !signal.aborted)).toBe(true);
    } finally {
      runner.stop();
      await wakePromise;
      await runner.tick();
    }
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(await MongoSystemMigrationState.findById(migrations[0].id).lean()).toMatchObject({
      status: SystemMigrationStatusEnum.running
    });
    expect(await MongoSystemMigrationState.findById(migrations[1].id).lean()).toMatchObject({
      status: SystemMigrationStatusEnum.running
    });
  });

  it('holds an already queued dependent task until its waiting or failed prerequisite succeeds', async () => {
    const prerequisiteRun = vi
      .fn(async () => undefined)
      .mockRejectedValueOnce(new Error('failure'));
    const dependentRun = vi.fn(async () => undefined);
    const prerequisite = {
      ...createMigration('20260903_runner_prerequisite', prerequisiteRun),
      manual: true
    };
    const dependent = {
      ...createMigration('20260903_runner_dependent', dependentRun),
      manual: true,
      dependsOn: [prerequisite.id]
    };
    const runner = createSystemMigrationRunner({ migrations: [prerequisite, dependent], logger });
    try {
      await runner.start();
      // 模拟旧节点已入队，不能仅依赖新启动接口的校验。
      await enqueueManualMigration(dependent.id);
      await runner.wake();
      expect(dependentRun).not.toHaveBeenCalled();
      await enqueueManualMigration(prerequisite.id);
      await runner.wake();
      expect(prerequisiteRun).toHaveBeenCalledTimes(1);
      expect(dependentRun).not.toHaveBeenCalled();
      expect((await MongoSystemMigrationState.findById(dependent.id))?.status).toBe(
        SystemMigrationStatusEnum.pending
      );
      await resetFailedMigration(prerequisite.id);
      await runner.wake();
      expect(prerequisiteRun).toHaveBeenCalledTimes(2);
      expect(dependentRun).toHaveBeenCalledTimes(1);
      expect((await MongoSystemMigrationState.findById(dependent.id))?.status).toBe(
        SystemMigrationStatusEnum.succeeded
      );
    } finally {
      await runner.stop();
    }
  });

  it('keeps scanning a queued task until its independent prerequisite succeeds', async () => {
    let finishPrerequisite: (() => void) | undefined;
    const prerequisiteDone = new Promise<void>((resolve) => {
      finishPrerequisite = resolve;
    });
    const prerequisiteRun = vi.fn(async () => prerequisiteDone);
    const dependentRun = vi.fn(async () => undefined);
    const prerequisite = {
      ...createMigration('20260903_runner_independent_prerequisite', prerequisiteRun),
      independent: true
    };
    const dependent = {
      ...createMigration('20260903_runner_queued_dependent', dependentRun),
      dependsOn: [prerequisite.id]
    };
    const runner = createSystemMigrationRunner({
      migrations: [prerequisite, dependent],
      timing: { scanIntervalMs: 10 },
      logger
    });

    try {
      await runner.start();
      await vi.waitFor(() => expect(prerequisiteRun).toHaveBeenCalledTimes(1));
      expect(dependentRun).not.toHaveBeenCalled();
      finishPrerequisite?.();
      // 不手动 tick/wake：普通队列必须保留探活，自动观察另一个队列的完成状态。
      await vi.waitFor(async () => {
        expect(await MongoSystemMigrationState.findById(dependent.id).lean()).toMatchObject({
          status: SystemMigrationStatusEnum.succeeded
        });
      });
      expect(dependentRun).toHaveBeenCalledTimes(1);
    } finally {
      finishPrerequisite?.();
      runner.stop();
      await runner.tick();
    }
  });

  it('waits for all explicit prerequisites and their dependents while unrelated tasks continue', async () => {
    const prerequisiteRun = vi
      .fn(async () => undefined)
      .mockRejectedValueOnce(new Error('missing models'));
    const manualRun = vi.fn(async () => undefined);
    const dependentRun = vi.fn(async () => undefined);
    const descendantRun = vi.fn(async () => undefined);
    const unrelatedRun = vi.fn(async () => undefined);
    const prerequisite = createMigration('20260903_runner_auto_prerequisite', prerequisiteRun);
    const manual = {
      ...createMigration('20260903_runner_manual_prerequisite', manualRun),
      manual: true
    };
    const dependent = {
      ...createMigration('20260903_runner_auto_dependent', dependentRun),
      dependsOn: [prerequisite.id, manual.id]
    };
    const descendant = {
      ...createMigration('20260903_runner_auto_descendant', descendantRun),
      dependsOn: [dependent.id]
    };
    const unrelated = createMigration('20260903_runner_auto_unrelated', unrelatedRun);
    const runner = createSystemMigrationRunner({
      migrations: [prerequisite, manual, dependent, descendant, unrelated],
      logger
    });

    try {
      await runner.start();
      await runner.tick();
      expect(prerequisiteRun).toHaveBeenCalledTimes(1);
      expect(manualRun).not.toHaveBeenCalled();
      expect(dependentRun).not.toHaveBeenCalled();
      expect(descendantRun).not.toHaveBeenCalled();
      expect(unrelatedRun).toHaveBeenCalledTimes(1);
      expect(await MongoSystemMigrationState.findById(prerequisite.id).lean()).toMatchObject({
        status: SystemMigrationStatusEnum.failed
      });

      // 一个前置恢复成功还不够：其余前置未成功时，直接与间接依赖都保持等待。
      expect(await resetFailedMigration(prerequisite.id)).toBe(true);
      await runner.wake();
      expect(prerequisiteRun).toHaveBeenCalledTimes(2);
      expect(dependentRun).not.toHaveBeenCalled();
      expect(descendantRun).not.toHaveBeenCalled();

      expect(await enqueueManualMigration(manual.id)).toBe(true);
      await runner.wake();
      expect(manualRun).toHaveBeenCalledTimes(1);
      expect(dependentRun).toHaveBeenCalledTimes(1);
      expect(descendantRun).toHaveBeenCalledTimes(1);
      expect(unrelatedRun).toHaveBeenCalledTimes(1);
      expect(await MongoSystemMigrationState.findById(descendant.id).lean()).toMatchObject({
        status: SystemMigrationStatusEnum.succeeded
      });
    } finally {
      runner.stop();
    }
  });

  it('skips waiting manual tasks, resumes after enqueue and recovers an expired manual lease', async () => {
    const manualRun = vi.fn(async () => undefined);
    const autoRun = vi.fn(async () => undefined);
    const manual = { ...createMigration('20260903_runner_manual', manualRun), manual: true };
    const migrations = [manual, createMigration('20260903_runner_after_manual', autoRun)];
    const runner = createSystemMigrationRunner({ migrations, logger });
    try {
      await runner.start();
      await runner.tick();
      expect(manualRun).not.toHaveBeenCalled();
      expect(autoRun).toHaveBeenCalledTimes(1);
      expect(
        await claimMigrationLease({
          migrationId: manual.id,
          runId: 'unauthorized',
          leaseDurationMs: 90_000
        })
      ).toBeNull();
      expect(await enqueueManualMigration(manual.id)).toBe(true);
      expect(await enqueueManualMigration(manual.id)).toBe(false);
      // 模拟入队后原节点领取并退出，新的 runner 无需再次手动触发。
      await claimMigrationLease({
        migrationId: manual.id,
        runId: 'crashed',
        leaseDurationMs: 90_000
      });
      await MongoSystemMigrationState.updateOne(
        { _id: manual.id },
        { $set: { leaseExpireAt: new Date(0) } }
      );
      await runner.wake();
      expect(manualRun).toHaveBeenCalledTimes(1);
      expect(autoRun).toHaveBeenCalledTimes(1);
      await runner.wake();
      expect(manualRun).toHaveBeenCalledTimes(1);
    } finally {
      await runner.stop();
    }
  });

  it('runs the registry serially while multiple nodes compete for every lease', async () => {
    const order: string[] = [];
    const migrations = [
      {
        ...createMigration('20260903_runner_serial_first', async (context) => {
          order.push('first:start');
          await context.assertActive();
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
        }),
        progressSteps: [
          {
            key: 'test_progress',
            labelKey: 'system_migration:migrations.example.progress'
          }
        ]
      },
      createMigration('20260903_runner_serial_second', async () => {
        order.push('second');
      }),
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

  it.each(['throw', 'reported'] as const)(
    'continues unrelated tasks after a %s failure without auto retry',
    async (failureType) => {
      const failedTask = vi.fn(async (context: Parameters<SystemMigration['run']>[0]) => {
        if (failureType === 'reported') await context.fail({ message: 'bad source record' });
        throw new Error('bad source record');
      });
      const laterTask = vi.fn();
      const migrations = [
        createMigration('20260903_runner_continue_after_failure', failedTask),
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
    }
  );

  it.each([false, true])(
    'resumes checkpoint and failed records after admin retry (independent: %s)',
    async (independent) => {
      const failedRecords = [
        {
          stageKey: 'migrating',
          data: { recordId: 'example-1' },
          reason: { message: 'missing modelId' }
        }
      ];
      let executions = 0;
      const migration = {
        ...createMigration('20260903_runner_context_failure', async (context) => {
          executions += 1;
          await context.reportProgress({
            key: 'migrating',
            status: SystemMigrationStatusEnum.running
          });
          if (executions === 1) {
            expect(await context.getFailedRecords()).toEqual([]);
            // 业务提交后先保存完整错误快照，再推进恢复位置。
            await context.reportFailedRecords(failedRecords);
            await context.saveCheckpoint({ lastId: 'example-2' });
            await context.fail({ message: 'example validation failed', failedRecords });
          }
          expect(await context.getCheckpoint(z.object({ lastId: z.string() }))).toEqual({
            lastId: 'example-2'
          });
          expect(await context.getFailedRecords()).toEqual(failedRecords);
          await context.reportProgress({
            key: 'migrating',
            status: SystemMigrationStatusEnum.succeeded
          });
        }),
        // Runner 构造时即按模式分组，首次失败与后续重试必须使用相同的执行模式。
        independent,
        progressSteps: [
          {
            key: 'migrating',
            labelKey: 'system_migration:migrations.example.migrating'
          }
        ]
      };
      const runner = createSystemMigrationRunner({
        migrations: [migration],
        timing: { scanIntervalMs: 10_000 },
        logger
      });

      let retryRunner: ReturnType<typeof createSystemMigrationRunner> | undefined;
      try {
        await runner.start();
        // 失败会结束本轮 tick。测试未启用事务，failed + 旧明细数量并不代表
        // context.fail 的“删除旧快照 -> 插入新快照”已完成，必须等待实际执行结束。
        await runner.tick();
        expect((await MongoSystemMigrationState.findById(migration.id).lean())?.status).toBe(
          SystemMigrationStatusEnum.failed
        );
        await expect(getMigrationFailedRecordCounts([migration.id])).resolves.toEqual([
          { migrationId: migration.id, stageKey: 'migrating', count: 1 }
        ]);

        const state = await MongoSystemMigrationState.findById(migration.id).lean();
        expect(state?.lastError).toMatchObject({
          stageKey: 'migrating',
          message: 'example validation failed'
        });
        expect(state?.lastError).not.toHaveProperty('key');
        expect(state?.lastError).not.toHaveProperty('params');
        await expect(getMigrationFailedRecords(migration.id)).resolves.toEqual(failedRecords);

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
        // 同样等待成功状态与失败明细清理全部结束，再验证恢复结果。
        await retryRunner.tick();
        expect((await MongoSystemMigrationState.findById(migration.id).lean())?.status).toBe(
          SystemMigrationStatusEnum.succeeded
        );
        expect(executions).toBe(2);
        await expect(getMigrationFailedRecords(migration.id)).resolves.toEqual([]);
      } finally {
        runner.stop();
        retryRunner?.stop();
      }
    }
  );

  it.each([false, true])(
    'recovers a stopped owner after lease expiry (independent: %s)',
    async (independent) => {
      let executions = 0;
      const migration = createMigration('20260903_runner_crash_takeover', async (context) => {
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
      });
      migration.independent = independent;
      const timing = {
        scanIntervalMs: 10,
        heartbeatIntervalMs: 15,
        leaseDurationMs: 2_000
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
            status: SystemMigrationStatusEnum.running,
            checkpoint: { firstBatchCompleted: true }
          });
        });

        firstRunner.stop();

        const stoppedState = await MongoSystemMigrationState.findById(migration.id).lean();
        expect(stoppedState).toMatchObject({
          status: SystemMigrationStatusEnum.running,
          checkpoint: { firstBatchCompleted: true }
        });
        // Lease 的时间计算与过期拒绝续租由 entity 测试覆盖；这里直接推进到过期状态，
        // 避免高负载 CI 中依赖真实计时等待，专注验证 runner 的 checkpoint 接管流程。
        const expireResult = await MongoSystemMigrationState.updateOne(
          { _id: migration.id, runId: stoppedState?.runId },
          { $set: { leaseExpireAt: new Date(0) } }
        );
        expect(expireResult.modifiedCount).toBe(1);

        await takeoverRunner.start();
        await takeoverRunner.tick();

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
    }
  );

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
    const store = createStore({
      ensureStates: vi.fn(),
      getStates,
      claimLease: vi.fn(async () => null)
    });
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
    const store = createStore({
      ensureStates: vi.fn(),
      getStates,
      claimLease: vi.fn(async () => null)
    });
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

  it.each([
    { delay: true, delayMs: 60 },
    { delay: false, delayMs: 100 },
    { delay: true, delayMs: 0 }
  ])('applies the configured delay only when enabled: %o', async ({ delay, delayMs }) => {
    let runStartedAt = 0;
    const migration = {
      ...createMigration('20260903_runner_delay', async () => {
        runStartedAt = Date.now();
      }),
      delay
    };
    const runner = createSystemMigrationRunner({
      migrations: [migration],
      timing: { scanIntervalMs: 10_000, delayMs },
      logger
    });

    try {
      const startedAt = Date.now();
      await runner.start();
      await runner.tick();
      expect(await MongoSystemMigrationState.findById(migration.id).lean()).toMatchObject({
        status: SystemMigrationStatusEnum.succeeded
      });
      if (delay && delayMs > 0) {
        expect(runStartedAt).toBeGreaterThanOrEqual(startedAt + delayMs - 15);
        expect(logger.info).toHaveBeenCalledWith(
          'System migration execution delayed by configuration',
          expect.objectContaining({ migrationId: migration.id, delayMs })
        );
      } else {
        expect(runStartedAt).toBeGreaterThanOrEqual(startedAt);
        expect(logger.info).not.toHaveBeenCalledWith(
          'System migration execution delayed by configuration',
          expect.anything()
        );
      }
    } finally {
      runner.stop();
      await runner.tick();
    }
  });
});
