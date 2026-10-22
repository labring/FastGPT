import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { SystemMigrationContext } from '@/migration/registry';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationFailureInput,
  SystemMigrationProgressInput
} from '@fastgpt/global/migration/schema';
import { migrateChunkTraining } from '@/migration/tasks/4171/20261008_migrate_chunk_training';
import { migrateLegacyTraining } from '@/migration/tasks/4171/20261008_migrate_chunk_training/service';
import { db, initializeMongoModels, seed } from './fixtures';

beforeAll(initializeMongoModels);

vi.mock('@/migration/constants', () => ({ systemMigrationBatchSize: 1 }));
vi.mock('@fastgpt/service/common/mongo/sessionRun', async (importOriginal) => importOriginal());

/** 仅模拟框架持久化出口及故障点；所有业务转换都使用真实 Mongo 事务。 */
const createContext = () => {
  let checkpoint: Record<string, unknown> | undefined;
  let failures: SystemMigrationFailedRecord[] = [];
  const context = {
    migrationId: '20261008_migrate_chunk_training',
    runId: 'test',
    signal: new AbortController().signal,
    getCheckpoint: async (schema) => (checkpoint ? schema.parse(checkpoint) : undefined),
    getFailedRecords: async () => structuredClone(failures),
    saveCheckpoint: vi.fn(async (value: Record<string, unknown>) => {
      checkpoint = structuredClone(value);
    }),
    reportFailedRecords: vi.fn(async (value: SystemMigrationFailedRecord[]) => {
      failures = structuredClone(value);
    }),
    reportProgress: vi.fn(async (_value: SystemMigrationProgressInput) => undefined),
    assertActive: vi.fn(async () => undefined),
    fail: vi.fn(async (error: SystemMigrationFailureInput): Promise<never> => {
      throw new Error(error.message);
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;
  return { context, checkpoint: () => checkpoint, failures: () => failures };
};

describe('migrateChunkTraining', () => {
  it('resumes a historical checkpoint without counters using the remaining window', async () => {
    const done = await seed();
    const remaining = await seed();
    await migrateLegacyTraining(done._id);
    const state = createContext();
    await state.context.saveCheckpoint({
      version: 1,
      endId: String(remaining._id),
      lastId: String(done._id)
    });
    await migrateChunkTraining(state.context);
    expect(state.context.reportProgress).toHaveBeenCalledWith({
      key: 'trainings',
      status: 'running',
      current: 0,
      total: 1
    });
    expect(state.context.reportProgress).toHaveBeenCalledWith({
      key: 'trainings',
      status: 'succeeded',
      current: 1,
      total: 1
    });
    expect(await db().collection('dataset_datas').countDocuments({})).toBe(2);
  });

  it('migrates multiple batches, preserves unrelated tasks and reports both complete stages', async () => {
    const a = await seed();
    const b = await seed({ mode: 'image' });
    const ignored = await seed({ mode: 'qa' });
    const { context } = createContext();
    await expect(migrateChunkTraining(context)).resolves.toEqual({ remainingCount: 0 });
    expect(await db().collection('dataset_trainings').findOne({ _id: a._id })).toMatchObject({
      mode: 'index',
      dataId: a._id
    });
    expect(await db().collection('dataset_trainings').findOne({ _id: b._id })).toMatchObject({
      mode: 'image',
      dataId: b._id
    });
    expect(await db().collection('dataset_trainings').findOne({ _id: ignored._id })).toEqual(
      ignored
    );
    for (const key of ['trainings', 'validation']) {
      const statuses = context.reportProgress.mock.calls
        .filter(([value]) => value.key === key)
        .map(([value]) => value.status);
      expect(statuses[0]).toBe('running');
      expect(statuses.at(-1)).toBe('succeeded');
    }
    expect(
      context.reportProgress.mock.calls
        .map(([value]) => value)
        .filter((value) => value.key === 'trainings' && value.total !== undefined)
        .map(({ current, total }) => [current, total])
    ).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
      [2, 2]
    ]);
    await migrateChunkTraining(context);
    expect(await db().collection('dataset_datas').countDocuments({})).toBe(2);
  });

  it('persists the full failure snapshot before checkpoint and repairs skipped rows on retry', async () => {
    const bad = await seed({ existing: true });
    await db().collection('dataset_datas').deleteOne({ _id: bad.dataId });
    const good = await seed();
    const state = createContext();
    await expect(migrateChunkTraining(state.context)).rejects.toThrow('need repair');
    expect(state.checkpoint()?.lastId).toBe(String(good._id));
    expect(state.failures()).toEqual([
      {
        stageKey: 'trainings',
        data: { trainingId: String(bad._id) },
        reason: { message: expect.stringContaining('referenced data missing') }
      }
    ]);
    expect(state.context.reportFailedRecords.mock.invocationCallOrder[0]).toBeLessThan(
      state.context.saveCheckpoint.mock.invocationCallOrder[1]
    );
    expect(state.context.reportProgress).toHaveBeenLastCalledWith({
      key: 'trainings',
      status: 'running',
      current: 1,
      total: 2
    });
    await db()
      .collection('dataset_trainings')
      .updateOne({ _id: bad._id }, { $unset: { dataId: '' } });
    await migrateChunkTraining(state.context);
    expect(state.failures()).toEqual([]);
    expect(await db().collection('dataset_datas').countDocuments({})).toBe(2);
    expect(state.context.reportProgress).toHaveBeenCalledWith({
      key: 'trainings',
      status: 'succeeded',
      current: 2,
      total: 2
    });
  });

  it.each(['q', 'a', 'imageId'])(
    'reports invalid legacy %s by task ID and continues subsequent records',
    async (field) => {
      const bad = await seed();
      await db()
        .collection('dataset_trainings')
        .updateOne({ _id: bad._id }, { $set: { [field]: 42 } });
      const good = await seed();
      const state = createContext();
      await expect(migrateChunkTraining(state.context)).rejects.toThrow('need repair');
      expect(state.failures()).toEqual([
        {
          stageKey: 'trainings',
          data: { trainingId: String(bad._id) },
          reason: { message: `invalid ${field} type; source task retained for repair` }
        }
      ]);
      expect(await db().collection('dataset_datas').findOne({ _id: bad._id })).toBeNull();
      expect(await db().collection('dataset_trainings').findOne({ _id: bad._id })).toMatchObject({
        mode: 'chunk',
        retryCount: 2
      });
      expect(await db().collection('dataset_trainings').findOne({ _id: good._id })).toMatchObject({
        mode: 'index',
        retryCount: 3
      });
    }
  );

  it('replays safely after business commit or failure reporting but before checkpoint', async () => {
    const bad = await seed({ existing: true });
    await db().collection('dataset_datas').deleteOne({ _id: bad.dataId });
    await seed();
    const state = createContext();
    state.context.saveCheckpoint
      .mockImplementationOnce(state.context.saveCheckpoint.getMockImplementation()!)
      .mockRejectedValueOnce(new Error('checkpoint unavailable'));
    await expect(migrateChunkTraining(state.context)).rejects.toThrow('checkpoint unavailable');
    expect(state.checkpoint()).toMatchObject({ lastId: null, totalCount: 2 });
    expect(state.failures()).toHaveLength(1);
    await db().collection('dataset_trainings').deleteOne({ _id: bad._id });
    state.context.saveCheckpoint.mockRejectedValueOnce(new Error('crash after commit'));
    await expect(migrateChunkTraining(state.context)).rejects.toThrow('crash after commit');
    expect(await db().collection('dataset_datas').countDocuments({})).toBe(1);
    await migrateChunkTraining(state.context);
    expect(state.failures()).toEqual([]);
    expect(await db().collection('dataset_datas').countDocuments({})).toBe(1);
    expect(state.context.reportProgress).toHaveBeenCalledWith({
      key: 'trainings',
      status: 'succeeded',
      current: 2,
      total: 2
    });
  });

  it('stops starting transactions when lease is lost and preserves previous failure details', async () => {
    const bad = await seed({ lockTime: new Date() });
    const good = await seed();
    const state = createContext();
    // Initial check, batch check, first task, then fail the next batch.
    state.context.assertActive
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('lease lost'));
    await expect(migrateChunkTraining(state.context)).rejects.toThrow('lease lost');
    expect(state.checkpoint()?.lastId).toBe(String(bad._id));
    expect(state.failures()).toHaveLength(1);
    expect(await db().collection('dataset_trainings').findOne({ _id: good._id })).toMatchObject({
      mode: 'chunk'
    });
    expect(await db().collection('dataset_datas').countDocuments({})).toBe(0);
  });

  it('fails final validation for late legacy writes and opens a new scan window on retry', async () => {
    await seed();
    const state = createContext();
    state.context.reportProgress.mockImplementation(async (progress) => {
      if (progress.key === 'validation' && progress.status === 'running') await seed();
    });
    await expect(migrateChunkTraining(state.context)).rejects.toThrow('stop old producers');
    expect(state.checkpoint()).toEqual({ version: 1, endId: null, lastId: null });
    state.context.reportProgress.mockImplementation(async () => undefined);
    await migrateChunkTraining(state.context);
    expect(await db().collection('dataset_datas').countDocuments({})).toBe(2);
  });

  it('handles an empty source and an aborted signal without writing business data', async () => {
    const empty = createContext();
    await expect(migrateChunkTraining(empty.context)).resolves.toEqual({
      remainingCount: 0
    });
    expect(empty.context.reportProgress).toHaveBeenCalledWith({
      key: 'trainings',
      status: 'running',
      current: 0,
      total: 0
    });
    expect(empty.context.reportProgress).toHaveBeenCalledWith({
      key: 'trainings',
      status: 'succeeded',
      current: 0,
      total: 0
    });
    expect(empty.context.reportProgress).toHaveBeenLastCalledWith({
      key: 'validation',
      status: 'succeeded',
      current: 1,
      total: 1
    });
    await seed();
    const { context } = createContext();
    const controller = new AbortController();
    controller.abort(new Error('stopped'));
    await expect(migrateChunkTraining({ ...context, signal: controller.signal })).rejects.toThrow(
      'stopped'
    );
    expect(await db().collection('dataset_datas').countDocuments({})).toBe(0);
  });
});
