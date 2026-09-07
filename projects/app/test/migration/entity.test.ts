import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import {
  claimMigrationLease,
  completeMigration,
  ensureMigrationStates,
  failMigration,
  getMigrationFailedRecordCounts,
  getMigrationFailedRecords,
  getMigrationStates,
  resetFailedMigration,
  renewMigrationLease,
  saveMigrationCheckpoint,
  saveMigrationFailedRecords,
  saveMigrationProgress
} from '@/migration/entity';
import {
  MongoSystemMigrationFailedRecord,
  MongoSystemMigrationState
} from '@/migration/mongoSchema';

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

describe('system migration entity lease', () => {
  const migrationIdPattern = /^20260903_entity_/;

  beforeEach(async () => {
    vi.restoreAllMocks();
    await Promise.all([
      MongoSystemMigrationState.deleteMany({ _id: migrationIdPattern }),
      MongoSystemMigrationFailedRecord.deleteMany({ migrationId: migrationIdPattern })
    ]);
  });

  it('creates missing states without overwriting existing status', async () => {
    const migrationId = '20260903_entity_state';
    await ensureMigrationStates([migrationId]);
    await MongoSystemMigrationState.updateOne(
      { _id: migrationId },
      { $set: { status: SystemMigrationStatusEnum.failed } }
    );

    await ensureMigrationStates([migrationId]);

    const [state] = await getMigrationStates([migrationId]);
    expect(state).toMatchObject({
      _id: migrationId,
      status: SystemMigrationStatusEnum.failed
    });
  });

  it('allows only one concurrent lease winner', async () => {
    const migrationId = '20260903_entity_atomic_claim';
    await ensureMigrationStates([migrationId]);

    const claims = await Promise.all(
      Array.from({ length: 8 }, () =>
        claimMigrationLease({
          migrationId,
          runId: randomUUID(),
          leaseDurationMs: 1_000
        })
      )
    );

    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  describe('claimMigrationLease', () => {
    it.each([1, 90_123])('adds %i milliseconds to Mongo server time', async (leaseDurationMs) => {
      const migrationId = '20260903_entity_claim_server_time';
      await ensureMigrationStates([migrationId]);
      // 只观察真实数据库调用，固定兼容表达式，避免高版本测试 Mongo 掩盖兼容性回退。
      const claim = vi.spyOn(MongoSystemMigrationState, 'findOneAndUpdate');

      const state = await claimMigrationLease({
        migrationId,
        runId: randomUUID(),
        leaseDurationMs
      });

      expect(claim).toHaveBeenCalledWith(
        expect.any(Object),
        [
          {
            $set: expect.objectContaining({
              heartbeatAt: '$$NOW',
              leaseExpireAt: { $add: ['$$NOW', leaseDurationMs] }
            })
          }
        ],
        expect.any(Object)
      );
      expect(state?.leaseExpireAt).toBeInstanceOf(Date);
      expect(state?.heartbeatAt).toBeInstanceOf(Date);
      expect(state!.leaseExpireAt!.getTime() - state!.heartbeatAt!.getTime()).toBe(leaseDurationMs);
    });
  });

  describe('renewMigrationLease', () => {
    it.each([SystemMigrationStatusEnum.running, SystemMigrationStatusEnum.failed])(
      'renews a %s lease from Mongo server time without changing ownership',
      async (status) => {
        const migrationId = '20260903_entity_renew_server_time';
        const runId = randomUUID();
        const leaseDurationMs = 90_123;
        await ensureMigrationStates([migrationId]);
        const claimed = await claimMigrationLease({ migrationId, runId, leaseDurationMs: 60_000 });
        await MongoSystemMigrationState.updateOne({ _id: migrationId }, { $set: { status } });
        const renew = vi.spyOn(MongoSystemMigrationState, 'updateOne');

        await expect(renewMigrationLease({ migrationId, runId, leaseDurationMs })).resolves.toBe(
          true
        );

        expect(renew).toHaveBeenCalledWith(
          expect.any(Object),
          [
            {
              $set: expect.objectContaining({
                heartbeatAt: '$$NOW',
                leaseExpireAt: { $add: ['$$NOW', leaseDurationMs] }
              })
            }
          ],
          expect.any(Object)
        );
        const state = await MongoSystemMigrationState.findById(migrationId).lean();
        expect(state).toMatchObject({ status, runId, lastStartedAt: claimed!.lastStartedAt });
        expect(state!.leaseExpireAt!.getTime() - state!.heartbeatAt!.getTime()).toBe(
          leaseDurationMs
        );
        expect(state!.leaseExpireAt!.getTime()).toBeGreaterThan(claimed!.leaseExpireAt!.getTime());
      }
    );

    it('does not revive an expired lease', async () => {
      const migrationId = '20260903_entity_expired_renew';
      const runId = randomUUID();
      await ensureMigrationStates([migrationId]);
      await claimMigrationLease({ migrationId, runId, leaseDurationMs: 60_000 });
      await MongoSystemMigrationState.updateOne(
        { _id: migrationId },
        { $set: { leaseExpireAt: new Date(0) } }
      );
      const expired = await MongoSystemMigrationState.findById(migrationId).lean();

      await expect(
        renewMigrationLease({ migrationId, runId, leaseDurationMs: 90_000 })
      ).resolves.toBe(false);
      await expect(MongoSystemMigrationState.findById(migrationId).lean()).resolves.toEqual(
        expired
      );
    });
  });

  it('claims a failed task only after its holding lease expires', async () => {
    const migrationId = '20260903_entity_failed_lease_claim';
    await MongoSystemMigrationState.create({
      _id: migrationId,
      status: SystemMigrationStatusEnum.failed,
      runId: 'failed-run',
      heartbeatAt: new Date(),
      leaseExpireAt: new Date(Date.now() + 1_000),
      lastError: {
        message: 'migration failed',
        runId: 'failed-run',
        createdAt: new Date()
      }
    });

    await expect(
      claimMigrationLease({
        migrationId,
        runId: randomUUID(),
        leaseDurationMs: 1_000
      })
    ).resolves.toBeNull();

    await expect(
      renewMigrationLease({
        migrationId,
        runId: 'failed-run',
        leaseDurationMs: 500
      })
    ).resolves.toBe(true);
    await delay(100);
    await expect(
      claimMigrationLease({
        migrationId,
        runId: randomUUID(),
        leaseDurationMs: 1_000
      })
    ).resolves.toBeNull();

    await delay(450);
    await expect(
      claimMigrationLease({
        migrationId,
        runId: randomUUID(),
        leaseDurationMs: 1_000
      })
    ).resolves.toMatchObject({
      status: SystemMigrationStatusEnum.running
    });
  });

  it('takes over an expired lease and fences every write from the old run', async () => {
    const migrationId = '20260903_entity_expired_takeover';
    const oldRunId = randomUUID();
    const newRunId = randomUUID();
    await ensureMigrationStates([migrationId]);

    const firstClaim = await claimMigrationLease({
      migrationId,
      runId: oldRunId,
      leaseDurationMs: 10
    });
    expect(firstClaim?.runId).toBe(oldRunId);

    await delay(30);
    const secondClaim = await claimMigrationLease({
      migrationId,
      runId: newRunId,
      leaseDurationMs: 1_000
    });
    expect(secondClaim).toMatchObject({
      runId: newRunId
    });

    await expect(
      saveMigrationCheckpoint({ migrationId, runId: oldRunId, checkpoint: { cursor: 1 } })
    ).resolves.toBe(false);
    await expect(
      saveMigrationProgress({
        migrationId,
        runId: oldRunId,
        progress: {
          key: 'test_progress',
          status: SystemMigrationStatusEnum.running,
          current: 1,
          total: 2
        }
      })
    ).resolves.toBe(false);
    await expect(
      saveMigrationCheckpoint({ migrationId, runId: newRunId, checkpoint: { cursor: 2 } })
    ).resolves.toBe(true);
    await expect(completeMigration({ migrationId, runId: oldRunId })).resolves.toBe(false);
    await expect(
      completeMigration({
        migrationId,
        runId: newRunId,
        result: { migratedCount: 2 }
      })
    ).resolves.toBe(true);

    const state = await MongoSystemMigrationState.findById(migrationId).lean();
    expect(state).toMatchObject({
      status: SystemMigrationStatusEnum.succeeded,
      checkpoint: { cursor: 2 },
      result: { migratedCount: 2 }
    });
  });

  it('updates one progress stage by key without overwriting other stages', async () => {
    const migrationId = '20260903_entity_progress_stages';
    const runId = randomUUID();
    await ensureMigrationStates([migrationId]);
    await claimMigrationLease({ migrationId, runId, leaseDurationMs: 10_000 });

    await expect(
      saveMigrationProgress({
        migrationId,
        runId,
        progress: { key: 'loading', status: SystemMigrationStatusEnum.running }
      })
    ).resolves.toBe(true);
    await expect(
      saveMigrationProgress({
        migrationId,
        runId,
        progress: {
          key: 'migrating',
          status: SystemMigrationStatusEnum.running,
          current: 1,
          total: 3
        }
      })
    ).resolves.toBe(true);
    await expect(
      saveMigrationProgress({
        migrationId,
        runId,
        progress: { key: 'loading', status: SystemMigrationStatusEnum.succeeded }
      })
    ).resolves.toBe(true);

    const state = await MongoSystemMigrationState.findById(migrationId).lean();
    expect(state?.progress).toEqual([
      expect.objectContaining({ key: 'loading', status: SystemMigrationStatusEnum.succeeded }),
      expect.objectContaining({
        key: 'migrating',
        status: SystemMigrationStatusEnum.running,
        current: 1,
        total: 3
      })
    ]);
  });

  it('replaces the running task failed-record snapshot with lease fencing', async () => {
    const migrationId = '20260903_entity_live_failed_records';
    const runId = randomUUID();
    await ensureMigrationStates([migrationId]);
    await claimMigrationLease({ migrationId, runId, leaseDurationMs: 10_000 });
    await saveMigrationProgress({
      migrationId,
      runId,
      progress: { key: 'migrating', status: SystemMigrationStatusEnum.running }
    });

    await expect(
      saveMigrationFailedRecords({
        migrationId,
        runId,
        failedRecords: [
          {
            stageKey: 'migrating',
            data: { recordId: 'record-1' },
            reason: { message: 'Invalid source data' }
          },
          {
            stageKey: 'migrating',
            data: { recordId: 'record-2' },
            reason: { message: 'Missing owner' }
          }
        ]
      })
    ).resolves.toBe(true);
    await expect(MongoSystemMigrationState.findById(migrationId).lean()).resolves.toMatchObject({
      status: SystemMigrationStatusEnum.running
    });
    await expect(getMigrationFailedRecordCounts([migrationId])).resolves.toEqual([
      { migrationId, stageKey: 'migrating', count: 2 }
    ]);

    await expect(
      saveMigrationFailedRecords({
        migrationId,
        runId,
        failedRecords: [
          {
            stageKey: 'migrating',
            data: { recordId: 'record-2' },
            reason: { message: 'Missing owner' }
          }
        ]
      })
    ).resolves.toBe(true);
    await expect(getMigrationFailedRecords(migrationId)).resolves.toEqual([
      {
        stageKey: 'migrating',
        data: { recordId: 'record-2' },
        reason: { message: 'Missing owner' }
      }
    ]);

    await expect(
      saveMigrationFailedRecords({
        migrationId,
        runId: randomUUID(),
        failedRecords: []
      })
    ).resolves.toBe(false);
    await expect(getMigrationFailedRecordCounts([migrationId])).resolves.toEqual([
      { migrationId, stageKey: 'migrating', count: 1 }
    ]);
  });

  it('preserves an immediately reported failed-record snapshot after an unexpected error', async () => {
    const migrationId = '20260903_entity_preserve_live_failed_records';
    const runId = randomUUID();
    await ensureMigrationStates([migrationId]);
    await claimMigrationLease({ migrationId, runId, leaseDurationMs: 10_000 });
    await saveMigrationProgress({
      migrationId,
      runId,
      progress: { key: 'migrating', status: SystemMigrationStatusEnum.running }
    });
    await saveMigrationFailedRecords({
      migrationId,
      runId,
      failedRecords: [
        {
          stageKey: 'migrating',
          data: { recordId: 'record-1' },
          reason: { message: 'Invalid source data' }
        }
      ]
    });
    await saveMigrationCheckpoint({ migrationId, runId, checkpoint: { lastId: 'record-1' } });
    await saveMigrationProgress({
      migrationId,
      runId,
      progress: {
        key: 'migrating',
        status: SystemMigrationStatusEnum.running,
        current: 1,
        total: 2
      }
    });

    // Runner 捕获的普通 throw 不携带 failedRecords，不得清空任务已经上报的快照。
    await expect(
      failMigration({
        migrationId,
        runId,
        stageKey: 'migrating',
        error: { message: 'Unexpected downstream failure' }
      })
    ).resolves.toBe(true);

    await expect(MongoSystemMigrationState.findById(migrationId).lean()).resolves.toMatchObject({
      status: SystemMigrationStatusEnum.failed,
      progress: [
        expect.objectContaining({
          key: 'migrating',
          status: SystemMigrationStatusEnum.failed
        })
      ]
    });
    await expect(getMigrationFailedRecordCounts([migrationId])).resolves.toEqual([
      { migrationId, stageKey: 'migrating', count: 1 }
    ]);
    await expect(getMigrationFailedRecords(migrationId)).resolves.toEqual([
      {
        stageKey: 'migrating',
        data: { recordId: 'record-1' },
        reason: { message: 'Invalid source data' }
      }
    ]);
  });

  it('records failed data against each stage even when a stage has not reported progress', async () => {
    const migrationId = '20260903_entity_failed_stages';
    const runId = randomUUID();
    await ensureMigrationStates([migrationId]);
    await claimMigrationLease({ migrationId, runId, leaseDurationMs: 10_000 });
    await saveMigrationProgress({
      migrationId,
      runId,
      progress: { key: 'migrating', status: SystemMigrationStatusEnum.running }
    });

    await expect(
      failMigration({
        migrationId,
        runId,
        stageKey: 'migrating',
        error: {
          message: 'Multiple stages contain invalid data',
          failedRecords: [
            {
              stageKey: 'migrating',
              data: { recordId: 'record-1' },
              reason: { message: 'Invalid model' }
            },
            {
              stageKey: 'reloading',
              data: { recordId: 'record-2' },
              reason: { message: 'Invalid cache entry' }
            }
          ]
        }
      })
    ).resolves.toBe(true);

    const state = await MongoSystemMigrationState.findById(migrationId).lean();
    expect(state?.progress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'migrating',
          status: SystemMigrationStatusEnum.failed,
          error: expect.objectContaining({ stageKey: 'migrating' })
        }),
        expect.objectContaining({
          key: 'reloading',
          status: SystemMigrationStatusEnum.failed
        })
      ])
    );
    await expect(getMigrationFailedRecordCounts([migrationId])).resolves.toEqual(
      expect.arrayContaining([
        { migrationId, stageKey: 'migrating', count: 1 },
        { migrationId, stageKey: 'reloading', count: 1 }
      ])
    );
  });

  it('stores failed record details and resets a failed task for checkpoint retry', async () => {
    const migrationId = '20260903_entity_failed_records';
    const runId = randomUUID();
    await ensureMigrationStates([migrationId]);
    await claimMigrationLease({
      migrationId,
      runId,
      leaseDurationMs: 10_000
    });
    await saveMigrationCheckpoint({
      migrationId,
      runId,
      checkpoint: { lastId: 'record-0' }
    });
    await saveMigrationProgress({
      migrationId,
      runId,
      progress: {
        key: 'test_progress',
        status: SystemMigrationStatusEnum.running,
        current: 1,
        total: 2
      }
    });

    await expect(
      failMigration({
        migrationId,
        runId,
        stageKey: 'test_progress',
        error: {
          message: 'Some records failed',
          failedRecords: [
            {
              stageKey: 'test_progress',
              data: { recordId: 'record-1' },
              reason: { message: 'Invalid source data' }
            }
          ]
        }
      })
    ).resolves.toBe(true);
    await expect(MongoSystemMigrationState.findById(migrationId).lean()).resolves.toMatchObject({
      status: SystemMigrationStatusEnum.failed,
      lastError: { stageKey: 'test_progress', message: 'Some records failed', runId },
      progress: [
        {
          key: 'test_progress',
          status: SystemMigrationStatusEnum.failed,
          error: { stageKey: 'test_progress', message: 'Some records failed', runId }
        }
      ]
    });
    await expect(getMigrationFailedRecords(migrationId)).resolves.toMatchObject([
      {
        stageKey: 'test_progress',
        data: { recordId: 'record-1' },
        reason: { message: 'Invalid source data' }
      }
    ]);

    await expect(resetFailedMigration(migrationId)).resolves.toBe(true);
    const resetState = await MongoSystemMigrationState.findById(migrationId).lean();
    expect(resetState).toMatchObject({ status: SystemMigrationStatusEnum.pending });
    expect(resetState).not.toHaveProperty('runId');
    expect(resetState).toMatchObject({
      checkpoint: { lastId: 'record-0' },
      progress: [
        {
          key: 'test_progress',
          status: SystemMigrationStatusEnum.failed,
          current: 1,
          total: 2
        }
      ],
      lastError: { message: 'Some records failed' }
    });
    await expect(getMigrationFailedRecordCounts([migrationId])).resolves.toEqual([
      { migrationId, stageKey: 'test_progress', count: 1 }
    ]);
    // 管理员重试时保留错误数据，只有脚本完整成功后才清理。
    await expect(getMigrationFailedRecords(migrationId)).resolves.toHaveLength(1);
    await expect(resetFailedMigration(migrationId)).resolves.toBe(false);

    const retryRunId = randomUUID();
    await claimMigrationLease({
      migrationId,
      runId: retryRunId,
      leaseDurationMs: 10_000
    });
    await expect(completeMigration({ migrationId, runId: retryRunId })).resolves.toBe(true);
    await expect(getMigrationFailedRecords(migrationId)).resolves.toEqual([]);
    await expect(getMigrationFailedRecordCounts([migrationId])).resolves.toEqual([]);
  });
});
