import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationProgressInput
} from '@fastgpt/global/migration/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { backfillAppCreateTime } from '@/migration/tasks/4170/20260903_backfill_app_create_time';
import {
  backfillAppCreateTimeRecord,
  getAppCreateTimeFromObjectId
} from '@/migration/tasks/4170/20260903_backfill_app_create_time/service';
import type { SystemMigrationContext } from '@/migration/registry';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createContext = ({
  beforeSaveCheckpoint
}: {
  beforeSaveCheckpoint?: (callCount: number) => Promise<void>;
} = {}) => {
  let checkpoint: Record<string, unknown> | undefined;
  let failedRecords: SystemMigrationFailedRecord[] = [];
  const progress: SystemMigrationProgressInput[] = [];
  let saveCheckpointCallCount = 0;

  const context = {
    migrationId: '20260903_backfill_app_create_time',
    runId: 'test-run',
    signal: new AbortController().signal,
    getCheckpoint: async (schema) =>
      checkpoint === undefined ? undefined : schema.parse(checkpoint),
    getFailedRecords: async () => structuredClone(failedRecords),
    reportFailedRecords: vi.fn(async (records: SystemMigrationFailedRecord[]) => {
      failedRecords = structuredClone(records);
    }),
    saveCheckpoint: vi.fn(async (value: Record<string, unknown>) => {
      saveCheckpointCallCount += 1;
      await beforeSaveCheckpoint?.(saveCheckpointCallCount);
      checkpoint = structuredClone(value);
    }),
    reportProgress: vi.fn(async (value: SystemMigrationProgressInput) => {
      progress.push(value);
    }),
    assertActive: vi.fn(async () => undefined),
    fail: async (error) => {
      if (error.failedRecords) failedRecords = structuredClone(error.failedRecords);
      throw new Error(error.message);
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  } satisfies SystemMigrationContext;

  return {
    context,
    getCheckpoint: () => checkpoint,
    getFailedRecords: () => failedRecords,
    getProgress: () => progress
  };
};

describe('4170 App createTime migration', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await MongoApp.deleteMany({});
  });

  it('derives timestamps only from valid ObjectIds', () => {
    const objectId = new Types.ObjectId();

    expect(getAppCreateTimeFromObjectId(objectId)).toEqual(objectId.getTimestamp());
    expect(getAppCreateTimeFromObjectId(String(objectId))).toEqual(objectId.getTimestamp());
    expect(getAppCreateTimeFromObjectId('invalid-app-id')).toBeUndefined();
    expect(getAppCreateTimeFromObjectId(undefined)).toBeUndefined();
  });

  it('backfills missing values, preserves existing values, and reports both progress states', async () => {
    const missingId = new Types.ObjectId();
    const keptId = new Types.ObjectId();
    const existingTime = new Date('2024-01-01T00:00:00.000Z');
    await MongoApp.collection.insertMany([
      { _id: missingId, name: 'Missing createTime' },
      { _id: keptId, name: 'Existing createTime', createTime: existingTime }
    ]);
    const state = createContext();

    await expect(backfillAppCreateTime(state.context)).resolves.toEqual({
      processedCount: 2,
      skippedInvalidId: 0
    });

    await expect(MongoApp.collection.findOne({ _id: missingId })).resolves.toMatchObject({
      createTime: missingId.getTimestamp()
    });
    await expect(MongoApp.collection.findOne({ _id: keptId })).resolves.toMatchObject({
      createTime: existingTime
    });
    expect(state.getCheckpoint()).toMatchObject({
      initialized: true,
      processedCount: 2,
      total: 2
    });
    expect(state.getFailedRecords()).toEqual([]);
    expect(state.getProgress().at(0)).toMatchObject({
      key: 'apps',
      status: SystemMigrationStatusEnum.running
    });
    expect(state.getProgress().at(-1)).toEqual({
      key: 'apps',
      status: SystemMigrationStatusEnum.succeeded,
      current: 2,
      total: 2
    });
  });

  it('is idempotent when the full task is run again', async () => {
    const appId = new Types.ObjectId();
    await MongoApp.collection.insertOne({ _id: appId, name: 'Idempotent App' });
    await backfillAppCreateTime(createContext().context);
    const updateSpy = vi.spyOn(MongoApp.collection, 'updateOne');

    await expect(backfillAppCreateTime(createContext().context)).resolves.toEqual({
      processedCount: 1,
      skippedInvalidId: 0
    });

    expect(updateSpy).not.toHaveBeenCalled();
    await expect(MongoApp.collection.findOne({ _id: appId })).resolves.toMatchObject({
      createTime: appId.getTimestamp()
    });
  });

  it('replays safely when the process exits after the write but before the checkpoint', async () => {
    const appId = new Types.ObjectId();
    await MongoApp.collection.insertOne({ _id: appId, name: 'Replay App' });
    const state = createContext({
      beforeSaveCheckpoint: async (callCount) => {
        if (callCount === 2) throw new Error('checkpoint unavailable');
      }
    });

    await expect(backfillAppCreateTime(state.context)).rejects.toThrow('checkpoint unavailable');
    await expect(MongoApp.collection.findOne({ _id: appId })).resolves.toMatchObject({
      createTime: appId.getTimestamp()
    });
    expect(state.getCheckpoint()).toMatchObject({ processedCount: 0, total: 1 });
    const updateSpy = vi.spyOn(MongoApp.collection, 'updateOne');

    await expect(backfillAppCreateTime(state.context)).resolves.toEqual({
      processedCount: 1,
      skippedInvalidId: 0
    });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('backfills an App created after the fixed snapshot', async () => {
    const snapshotId = new Types.ObjectId();
    const lateId = new Types.ObjectId();
    await MongoApp.collection.insertOne({ _id: snapshotId, name: 'Snapshot App' });
    const state = createContext({
      beforeSaveCheckpoint: async (callCount) => {
        if (callCount === 1) {
          await MongoApp.collection.insertOne({ _id: lateId, name: 'Late App' });
        }
      }
    });

    await expect(backfillAppCreateTime(state.context)).resolves.toEqual({
      processedCount: 1,
      skippedInvalidId: 0
    });
    await expect(MongoApp.collection.findOne({ _id: snapshotId })).resolves.toMatchObject({
      createTime: snapshotId.getTimestamp()
    });
    await expect(MongoApp.collection.findOne({ _id: lateId })).resolves.toMatchObject({
      createTime: lateId.getTimestamp()
    });
  });

  it('retries failed records before continuing from the saved checkpoint', async () => {
    const appId = new Types.ObjectId();
    await MongoApp.collection.insertOne({ _id: appId, name: 'Retry App' });
    const state = createContext();
    const updateSpy = vi
      .spyOn(MongoApp.collection, 'updateOne')
      .mockRejectedValue(new Error('temporary write failure'));

    await expect(backfillAppCreateTime(state.context)).rejects.toThrow(
      '1 apps still lack createTime'
    );
    expect(state.getCheckpoint()).toMatchObject({ processedCount: 1, total: 1 });
    expect(state.getFailedRecords()).toEqual([
      expect.objectContaining({
        stageKey: 'apps',
        data: expect.objectContaining({ recordId: String(appId) }),
        reason: { message: 'temporary write failure' }
      })
    ]);

    updateSpy.mockRestore();
    await expect(backfillAppCreateTime(state.context)).resolves.toEqual({
      processedCount: 1,
      skippedInvalidId: 0
    });
    expect(state.getFailedRecords()).toEqual([]);
    await expect(MongoApp.collection.findOne({ _id: appId })).resolves.toMatchObject({
      createTime: appId.getTimestamp()
    });
  });

  it('does not start a write after the lease is lost', async () => {
    const appId = new Types.ObjectId();
    await MongoApp.collection.insertOne({ _id: appId, name: 'Lease guarded App' });
    const state = createContext();
    state.context.assertActive.mockRejectedValue(new Error('lease lost'));
    const updateSpy = vi.spyOn(MongoApp.collection, 'updateOne');

    await expect(backfillAppCreateTime(state.context)).rejects.toThrow('lease lost');
    expect(updateSpy).not.toHaveBeenCalled();
    await expect(MongoApp.collection.findOne({ _id: appId })).resolves.not.toHaveProperty(
      'createTime'
    );
  });

  it('treats a concurrent createTime write as success', async () => {
    const appId = new Types.ObjectId();
    const concurrentTime = new Date('2025-01-01T00:00:00.000Z');
    await MongoApp.collection.insertOne({ _id: appId, name: 'Concurrent App' });
    const updateOne = MongoApp.collection.updateOne.bind(MongoApp.collection);
    vi.spyOn(MongoApp.collection, 'updateOne').mockImplementationOnce(async () => {
      await updateOne({ _id: appId }, { $set: { createTime: concurrentTime } });
      return { matchedCount: 0 } as never;
    });

    await expect(backfillAppCreateTimeRecord({ _id: appId })).resolves.toBeUndefined();
    await expect(MongoApp.collection.findOne({ _id: appId })).resolves.toMatchObject({
      createTime: concurrentTime
    });
  });

  it('skips and counts records whose id cannot provide a timestamp', async () => {
    const invalidId = 'invalid-create-time-id';
    await MongoApp.collection.insertOne({ _id: invalidId, name: 'Invalid id App' });

    await expect(backfillAppCreateTime(createContext().context)).resolves.toEqual({
      processedCount: 0,
      skippedInvalidId: 1
    });
    await expect(MongoApp.collection.findOne({ _id: invalidId })).resolves.not.toHaveProperty(
      'createTime'
    );
  });
});
