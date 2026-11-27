import { describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { buildTeamMemberNameSortKey } from '@fastgpt/service/support/user/team/sortKey';
import { backfillTeamMemberSortKey } from '@/migration/tasks/4180/20261127_backfill_team_member_sort_key';
import { backfillTeamMemberSortKeyBatch } from '@/migration/tasks/4180/20261127_backfill_team_member_sort_key/service';
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
    migrationId: '20261127_backfill_team_member_sort_key',
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
  await MongoTeamMember.collection.insertOne(doc as any);
  return doc;
};

describe('backfillTeamMemberSortKey', () => {
  it('backfills Chinese, English, digits, and special characters and stays idempotent on replay', async () => {
    const records = await Promise.all([
      seedRawMember({ name: '张三' }),
      seedRawMember({ name: 'Alice' }),
      seedRawMember({ name: '007' }),
      seedRawMember({ name: '#测试' }),
      seedRawMember({ name: '曾国藩' }),
      seedRawMember({ name: '阿明', nameSortKey: buildTeamMemberNameSortKey('阿明') })
    ]);

    const firstRun = createContext();
    expect(await backfillTeamMemberSortKey(firstRun.context)).toEqual({
      scannedCount: records.length,
      backfilledCount: 5
    });

    for (const raw of records) {
      const updated = await MongoTeamMember.collection.findOne({ _id: raw._id });
      expect(updated?.nameSortKey).toBe(buildTeamMemberNameSortKey(raw.name));
    }

    const bulkWriteSpy = vi.spyOn(MongoTeamMember.collection, 'bulkWrite');
    try {
      const replay = createContext();
      expect(await backfillTeamMemberSortKey(replay.context)).toEqual({
        scannedCount: records.length,
        backfilledCount: 0
      });
      expect(bulkWriteSpy).not.toHaveBeenCalled();
    } finally {
      bulkWriteSpy.mockRestore();
    }
  });

  it('resumes from checkpoint after a mid-run crash and heals validation failures on retry', async () => {
    const first = await seedRawMember({ name: '李四' });
    const second = await seedRawMember({ name: 'Bob' });
    const third = await seedRawMember({ name: '_bot' });

    const state = createContext();
    const realSave = state.context.saveCheckpoint.getMockImplementation()!;
    state.context.saveCheckpoint
      .mockImplementationOnce(realSave)
      .mockRejectedValueOnce(new Error('checkpoint write failed'));

    await expect(backfillTeamMemberSortKey(state.context)).rejects.toThrow(
      'checkpoint write failed'
    );

    // 恢复保存并模拟校验阶段发现落后游标的陈旧记录
    state.context.saveCheckpoint.mockImplementation(realSave);
    state.context.reportProgress.mockImplementationOnce(async () => undefined);
    state.context.reportProgress.mockImplementation(async ({ key, status }) => {
      if (key === 'validation' && status === 'running') {
        await MongoTeamMember.collection.updateOne(
          { _id: first._id },
          { $unset: { nameSortKey: 1 } }
        );
      }
    });

    await expect(backfillTeamMemberSortKey(state.context)).rejects.toThrow('validation failed');
    expect(state.failures()).toEqual([
      expect.objectContaining({ stageKey: 'validation', data: { id: String(first._id) } })
    ]);

    state.context.reportProgress.mockReset();
    expect(await backfillTeamMemberSortKey(state.context)).toEqual({
      scannedCount: 3,
      backfilledCount: expect.any(Number)
    });
    expect(state.failures()).toEqual([]);

    for (const raw of [first, second, third]) {
      const doc = await MongoTeamMember.collection.findOne({ _id: raw._id });
      expect(doc?.nameSortKey).toBe(buildTeamMemberNameSortKey(raw.name));
    }
  });
});

describe('backfillTeamMemberSortKeyBatch', () => {
  it('does not overwrite a concurrent rename and skips concurrently deleted records', async () => {
    const renamed = await seedRawMember({ name: '张三' });
    const deleted = await seedRawMember({ name: '李四' });

    const collection = MongoTeamMember.collection;
    const origBulkWrite = collection.bulkWrite.bind(collection);
    const spy = vi.spyOn(collection, 'bulkWrite').mockImplementationOnce(async (...args: any[]) => {
      await collection.updateOne(
        { _id: renamed._id },
        { $set: { name: 'Alice', nameSortKey: buildTeamMemberNameSortKey('Alice') } }
      );
      await collection.deleteOne({ _id: deleted._id });
      return origBulkWrite(...(args as Parameters<typeof origBulkWrite>));
    });

    try {
      const result = await backfillTeamMemberSortKeyBatch([
        String(renamed._id),
        String(deleted._id)
      ]);
      expect(result.failures.size).toBe(0);
      expect(await collection.findOne({ _id: renamed._id })).toMatchObject({
        name: 'Alice',
        nameSortKey: buildTeamMemberNameSortKey('Alice')
      });
      expect(await collection.findOne({ _id: deleted._id })).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('records a sanitized failure without leaking member names after repeated CAS misses', async () => {
    const member = await seedRawMember({ name: '绝密成员名' });
    const collection = MongoTeamMember.collection;
    const spy = vi.spyOn(collection, 'bulkWrite').mockResolvedValue({
      matchedCount: 0,
      modifiedCount: 0
    } as any);

    try {
      const result = await backfillTeamMemberSortKeyBatch([String(member._id)]);
      expect(spy).toHaveBeenCalledTimes(3);
      expect(result.failures.has(String(member._id))).toBe(true);
      expect(result.failures.get(String(member._id))).not.toContain('绝密成员名');
    } finally {
      spy.mockRestore();
    }
  });
});
