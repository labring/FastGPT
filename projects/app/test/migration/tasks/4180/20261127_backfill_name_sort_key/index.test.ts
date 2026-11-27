import { describe, expect, it, vi } from 'vitest';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { buildTeamMemberNameSortKey } from '@fastgpt/service/support/user/team/sortKey';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { buildDatasetCollectionNameSortKey } from '@fastgpt/service/core/dataset/collection/sortKey';
import { backfillNameSortKey } from '@/migration/tasks/4180/20261127_backfill_name_sort_key';
import { backfillNameSortKeyBatch } from '@/migration/tasks/4180/20261127_backfill_name_sort_key/service';
import type { SystemMigrationContext } from '@/migration/registry';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationFailureInput
} from '@fastgpt/global/migration/schema';

vi.mock('@/migration/constants', () => ({ systemMigrationBatchSize: 2 }));

const createContext = () => {
  let checkpoint: Record<string, unknown> | undefined;
  let failures: SystemMigrationFailedRecord[] = [];
  const context = {
    migrationId: '20261127_backfill_name_sort_key',
    runId: 'test-run',
    signal: new AbortController().signal,
    getCheckpoint: async (schema) =>
      checkpoint ? schema.parse(structuredClone(checkpoint)) : undefined,
    saveCheckpoint: vi.fn(async (value: Record<string, unknown>) => {
      checkpoint = structuredClone(value);
    }),
    getFailedRecords: async () => structuredClone(failures),
    reportFailedRecords: vi.fn(async (value: SystemMigrationFailedRecord[]) => {
      failures = structuredClone(value);
    }),
    assertActive: vi.fn(async () => undefined),
    reportProgress: vi.fn<SystemMigrationContext['reportProgress']>(async () => undefined),
    fail: vi.fn(async (input: SystemMigrationFailureInput): Promise<never> => {
      failures = structuredClone(input.failedRecords ?? failures);
      throw new Error(input.message);
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;

  return { context, failures: () => failures };
};

const seedRawMember = async (overrides: Record<string, unknown> = {}) => {
  const doc = {
    _id: new Types.ObjectId(),
    teamId: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    name: '张三',
    status: 'active',
    createTime: new Date(),
    ...overrides
  };
  await MongoTeamMember.collection.insertOne(doc);
  return doc;
};

const seedRawCollection = async (overrides: Record<string, unknown> = {}) => {
  const doc = {
    _id: new Types.ObjectId(),
    teamId: new Types.ObjectId(),
    tmbId: new Types.ObjectId(),
    datasetId: new Types.ObjectId(),
    parentId: null,
    type: DatasetCollectionTypeEnum.file,
    name: '单据管理',
    createTime: new Date(),
    updateTime: new Date(),
    ...overrides
  };
  await MongoDatasetCollection.collection.insertOne(doc);
  return doc;
};

describe('backfillNameSortKey', () => {
  it('backfills team members (surname mode) and dataset collections (normal mode) and stays idempotent on replay', async () => {
    const members = await Promise.all([
      seedRawMember({ name: '曾国藩' }),
      seedRawMember({ name: 'Alice' }),
      seedRawMember({ name: '007' }),
      seedRawMember({ name: '阿明', nameSortKey: buildTeamMemberNameSortKey('阿明') })
    ]);
    const collections = await Promise.all([
      seedRawCollection({ name: '单据管理' }),
      seedRawCollection({ name: '曾几何时' }),
      seedRawCollection({ name: '#置顶文档' }),
      seedRawCollection({
        name: '已就绪文档',
        nameSortKey: buildDatasetCollectionNameSortKey('已就绪文档')
      })
    ]);

    const firstRun = createContext();
    expect(await backfillNameSortKey(firstRun.context)).toEqual({
      memberScannedCount: members.length,
      memberBackfilledCount: 3,
      collectionScannedCount: collections.length,
      collectionBackfilledCount: 3
    });

    for (const raw of members) {
      const updated = await MongoTeamMember.collection.findOne({ _id: raw._id });
      expect(updated?.nameSortKey).toBe(buildTeamMemberNameSortKey(raw.name));
    }
    for (const raw of collections) {
      const updated = await MongoDatasetCollection.collection.findOne({ _id: raw._id });
      expect(updated?.nameSortKey).toBe(buildDatasetCollectionNameSortKey(raw.name));
    }

    const memberBulkSpy = vi.spyOn(MongoTeamMember.collection, 'bulkWrite');
    const colBulkSpy = vi.spyOn(MongoDatasetCollection.collection, 'bulkWrite');
    try {
      const replay = createContext();
      expect(await backfillNameSortKey(replay.context)).toEqual({
        memberScannedCount: members.length,
        memberBackfilledCount: 0,
        collectionScannedCount: collections.length,
        collectionBackfilledCount: 0
      });
      expect(memberBulkSpy).not.toHaveBeenCalled();
      expect(colBulkSpy).not.toHaveBeenCalled();
    } finally {
      memberBulkSpy.mockRestore();
      colBulkSpy.mockRestore();
    }
  });

  it('resumes from checkpoint after a mid-run crash and heals validation failures across both targets on retry', async () => {
    const member1 = await seedRawMember({ name: '李四' });
    const member2 = await seedRawMember({ name: 'Bob' });
    const col1 = await seedRawCollection({ name: '单据管理' });
    const col2 = await seedRawCollection({ name: 'Doc.md' });
    const col3 = await seedRawCollection({ name: '_draft' });

    const state = createContext();
    const realSave = state.context.saveCheckpoint.getMockImplementation()!;
    // 第 1 次保存初始 checkpoint，第 2 次在成员批次后正常保存，第 3 次（集合阶段中）模拟中断
    state.context.saveCheckpoint
      .mockImplementationOnce(realSave)
      .mockImplementationOnce(realSave)
      .mockRejectedValueOnce(new Error('checkpoint write failed'));

    await expect(backfillNameSortKey(state.context)).rejects.toThrow('checkpoint write failed');

    // 恢复保存并模拟校验阶段发现两条陈旧记录（分别属于成员与集合）
    state.context.saveCheckpoint.mockImplementation(realSave);
    let injected = false;
    state.context.reportProgress.mockImplementation(async ({ key, status }) => {
      if (key === 'validation' && status === 'running' && !injected) {
        injected = true;
        await Promise.all([
          MongoTeamMember.collection.updateOne(
            { _id: member1._id },
            { $unset: { nameSortKey: 1 } }
          ),
          MongoDatasetCollection.collection.updateOne(
            { _id: col1._id },
            { $unset: { nameSortKey: 1 } }
          )
        ]);
      }
    });

    await expect(backfillNameSortKey(state.context)).rejects.toThrow('validation failed');
    expect(state.failures()).toEqual([
      expect.objectContaining({
        stageKey: 'validation',
        data: { target: 'members', id: String(member1._id) }
      })
    ]);

    // 第一次重试会自愈 member1，然后校验到 col1 失败
    state.context.reportProgress.mockReset();
    await expect(backfillNameSortKey(state.context)).rejects.toThrow('validation failed');
    expect(state.failures()).toEqual([
      expect.objectContaining({
        stageKey: 'validation',
        data: { target: 'collections', id: String(col1._id) }
      })
    ]);

    // 第二次重试自愈 col1 并完整通过校验
    expect(await backfillNameSortKey(state.context)).toEqual({
      memberScannedCount: 2,
      memberBackfilledCount: expect.any(Number),
      collectionScannedCount: 3,
      collectionBackfilledCount: expect.any(Number)
    });
    expect(state.failures()).toEqual([]);

    for (const raw of [member1, member2]) {
      const doc = await MongoTeamMember.collection.findOne({ _id: raw._id });
      expect(doc?.nameSortKey).toBe(buildTeamMemberNameSortKey(raw.name));
    }
    for (const raw of [col1, col2, col3]) {
      const doc = await MongoDatasetCollection.collection.findOne({ _id: raw._id });
      expect(doc?.nameSortKey).toBe(buildDatasetCollectionNameSortKey(raw.name));
    }
  });
});

describe('backfillNameSortKeyBatch', () => {
  it('does not overwrite a concurrent rename and skips concurrently deleted records', async () => {
    const renamed = await seedRawCollection({ name: '旧文件名' });
    const deleted = await seedRawCollection({ name: '待删文件' });

    const collection = MongoDatasetCollection.collection;
    const origBulkWrite = collection.bulkWrite.bind(collection);
    const spy = vi.spyOn(collection, 'bulkWrite').mockImplementationOnce(async (...args) => {
      await collection.updateOne(
        { _id: renamed._id },
        {
          $set: {
            name: '新文件名',
            nameSortKey: buildDatasetCollectionNameSortKey('新文件名')
          }
        }
      );
      await collection.deleteOne({ _id: deleted._id });
      return origBulkWrite(...args);
    });

    try {
      const result = await backfillNameSortKeyBatch({
        target: 'collections',
        ids: [String(renamed._id), String(deleted._id)]
      });
      expect(result.failures.size).toBe(0);
      expect(await collection.findOne({ _id: renamed._id })).toMatchObject({
        name: '新文件名',
        nameSortKey: buildDatasetCollectionNameSortKey('新文件名')
      });
      expect(await collection.findOne({ _id: deleted._id })).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('records a sanitized failure without leaking entity names after repeated CAS misses', async () => {
    const member = await seedRawMember({ name: '绝密成员名' });
    const collection = MongoTeamMember.collection;
    const spy = vi.spyOn(collection, 'bulkWrite').mockResolvedValue({
      matchedCount: 0,
      modifiedCount: 0
    } as Awaited<ReturnType<typeof collection.bulkWrite>>);

    try {
      const result = await backfillNameSortKeyBatch({
        target: 'members',
        ids: [String(member._id)]
      });
      expect(spy).toHaveBeenCalledTimes(3);
      expect(result.failures.has(String(member._id))).toBe(true);
      expect(result.failures.get(String(member._id))).not.toContain('绝密成员名');
    } finally {
      spy.mockRestore();
    }
  });
});
