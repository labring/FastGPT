import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import type { SystemMigrationContext } from '@/migration/registry';
import type {
  SystemMigrationProgressInput,
  SystemMigrationFailureInput
} from '@fastgpt/global/migration/schema';
import { migrateDatasetRebuildStatus } from '@/migration/tasks/4171/20261009_migrate_dataset_rebuild_status';
import {
  countRemainingRebuildStatuses,
  migrateRebuildStatusBatch
} from '@/migration/tasks/4171/20261009_migrate_dataset_rebuild_status/service';
import { db, initializeMongoModels, seed } from '../20261008_migrate_chunk_training/fixtures';

beforeAll(initializeMongoModels);
vi.mock('@/migration/constants', () => ({ systemMigrationBatchSize: 1 }));
vi.mock('@fastgpt/service/common/mongo/sessionRun', async (importOriginal) => importOriginal());

/** 只模拟框架断点/进度出口，业务迁移在真实 Mongo 事务中执行。 */
const createContext = () => {
  let checkpoint: Record<string, unknown> | undefined;
  const context = {
    migrationId: '20261009_migrate_dataset_rebuild_status',
    runId: 'test',
    signal: new AbortController().signal,
    getCheckpoint: async (schema) => (checkpoint ? schema.parse(checkpoint) : undefined),
    getFailedRecords: async () => [],
    reportFailedRecords: vi.fn(async () => undefined),
    saveCheckpoint: vi.fn(async (value: Record<string, unknown>) => {
      checkpoint = structuredClone(value);
    }),
    reportProgress: vi.fn(async (_value: SystemMigrationProgressInput) => undefined),
    assertActive: vi.fn(async () => undefined),
    fail: vi.fn(async (value: SystemMigrationFailureInput): Promise<never> => {
      throw new Error(value.message);
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;
  return { context, checkpoint: () => checkpoint };
};

describe('migrateDatasetRebuildStatus', () => {
  it('migrates waiting, active, exhausted and blocked rebuilds without changing content or training', async () => {
    const waiting = await seed({ existing: true, mode: 'rebuild' });
    const active = await seed({ existing: true, mode: 'rebuild', status: 'indexed' });
    const failed = await seed({ existing: true, mode: 'rebuild', retryCount: 0 });
    const blocked = await seed({
      existing: true,
      mode: 'rebuild',
      lockTime: new Date('2050-01-01')
    });
    const initial = await seed({ existing: true, mode: 'chunk', status: 'indexing' });
    await db().collection('dataset_trainings').deleteOne({ _id: waiting._id });
    await db()
      .collection('dataset_datas')
      .updateOne({ _id: waiting.dataId }, { $set: { rebuilding: true } });
    await db()
      .collection('dataset_datas')
      .updateOne({ _id: initial.dataId }, { $set: { rebuilding: false } });
    const original = await db().collection('dataset_datas').findOne({ _id: active.dataId });
    const { context } = createContext();
    await expect(migrateDatasetRebuildStatus(context)).resolves.toEqual({ remainingCount: 0 });
    for (const [task, status] of [
      [waiting, 'waitingRebuild'],
      [active, 'rebuilding'],
      [failed, 'rebuildError'],
      [blocked, 'rebuildError'],
      [initial, 'indexing']
    ] as const) {
      expect(await db().collection('dataset_datas').findOne({ _id: task.dataId })).toMatchObject({
        indexStatus: status
      });
    }
    expect(await db().collection('dataset_datas').findOne({ _id: active.dataId })).toMatchObject({
      q: original?.q,
      indexes: original?.indexes
    });
    expect(await db().collection('dataset_trainings').findOne({ _id: active._id })).toEqual(active);
    expect(
      await db()
        .collection('dataset_datas')
        .countDocuments({ rebuilding: { $exists: true } })
    ).toBe(0);
    for (const key of ['datas', 'trainings', 'validation']) {
      const statuses = context.reportProgress.mock.calls
        .filter(([p]) => p.key === key)
        .map(([p]) => p.status);
      expect(statuses[0]).toBe('running');
      expect(statuses.at(-1)).toBe('succeeded');
    }
    // 重放不会重置已完成数据；其 task 已被 worker 删除。
    await db().collection('dataset_trainings').deleteOne({ _id: active._id });
    await db()
      .collection('dataset_datas')
      .updateOne({ _id: active.dataId }, { $set: { indexStatus: 'indexed' } });
    await migrateDatasetRebuildStatus(context);
    expect(await db().collection('dataset_datas').findOne({ _id: active.dataId })).toMatchObject({
      indexStatus: 'indexed'
    });
  });

  it('resumes when business commit succeeded but checkpoint persistence failed', async () => {
    const task = await seed({ existing: true, mode: 'rebuild' });
    await db().collection('dataset_trainings').deleteOne({ _id: task._id });
    await db()
      .collection('dataset_datas')
      .updateOne({ _id: task.dataId }, { $set: { rebuilding: true } });
    const state = createContext();
    state.context.saveCheckpoint
      .mockImplementationOnce(state.context.saveCheckpoint.getMockImplementation()!)
      .mockRejectedValueOnce(new Error('checkpoint interrupted'));
    await expect(migrateDatasetRebuildStatus(state.context)).rejects.toThrow(
      'checkpoint interrupted'
    );
    expect(await db().collection('dataset_datas').findOne({ _id: task.dataId })).toMatchObject({
      indexStatus: 'waitingRebuild'
    });
    await expect(migrateDatasetRebuildStatus(state.context)).resolves.toEqual({
      remainingCount: 0
    });
  });

  it('stops before writes when the lease is lost', async () => {
    const task = await seed({ existing: true, mode: 'rebuild' });
    await db()
      .collection('dataset_datas')
      .updateOne({ _id: task.dataId }, { $set: { rebuilding: true } });
    const { context } = createContext();
    context.assertActive.mockRejectedValue(new Error('lease lost'));
    await expect(migrateDatasetRebuildStatus(context)).rejects.toThrow('lease lost');
    expect(await db().collection('dataset_datas').findOne({ _id: task.dataId })).toMatchObject({
      rebuilding: true
    });
    expect(context.saveCheckpoint).not.toHaveBeenCalled();
  });

  it('validates the whole source and reopens the scan when an old producer writes outside the window', async () => {
    const { context } = createContext();
    const report = context.reportProgress.getMockImplementation()!;
    context.reportProgress.mockImplementation(async (p) => {
      if (p.key === 'validation' && p.status === 'running') {
        await db().collection('dataset_datas').insertOne({ rebuilding: true });
      }
      return report(p);
    });
    await expect(migrateDatasetRebuildStatus(context)).rejects.toThrow(
      'legacy rebuild statuses remain'
    );
    context.reportProgress.mockImplementation(report);
    await expect(migrateDatasetRebuildStatus(context)).resolves.toEqual({ remainingCount: 0 });
  });

  it('completes an empty source and repeat runs', async () => {
    const { context } = createContext();
    await expect(migrateDatasetRebuildStatus(context)).resolves.toEqual({ remainingCount: 0 });
    await expect(migrateDatasetRebuildStatus(context)).resolves.toEqual({ remainingCount: 0 });
  });
});

describe('migrateRebuildStatusBatch', () => {
  it('rolls back the entire batch if a legacy field is invalid', async () => {
    const good = new Types.ObjectId();
    const bad = new Types.ObjectId();
    await db()
      .collection('dataset_datas')
      .insertMany([
        { _id: good, rebuilding: true },
        { _id: bad, rebuilding: 'invalid' }
      ]);
    await expect(migrateRebuildStatusBatch({ stage: 'datas', ids: [good, bad] })).rejects.toThrow(
      'Invalid rebuilding field'
    );
    expect(await db().collection('dataset_datas').findOne({ _id: good })).toMatchObject({
      rebuilding: true
    });
  });

  it('does not overwrite new statuses or orphan/mismatched training references', async () => {
    const completed = await seed({ existing: true, mode: 'rebuild', status: 'rebuildError' });
    const mismatched = await seed({ existing: true, mode: 'rebuild', status: 'indexed' });
    await db()
      .collection('dataset_trainings')
      .updateOne({ _id: mismatched._id }, { $set: { teamId: new Types.ObjectId() } });
    await migrateRebuildStatusBatch({ stage: 'trainings', ids: [completed._id, mismatched._id] });
    expect(await db().collection('dataset_datas').findOne({ _id: completed.dataId })).toMatchObject(
      { indexStatus: 'rebuildError' }
    );
    expect(
      await db().collection('dataset_datas').findOne({ _id: mismatched.dataId })
    ).toMatchObject({ indexStatus: 'indexed' });
    expect(await countRemainingRebuildStatuses()).toBe(0);
  });
});
