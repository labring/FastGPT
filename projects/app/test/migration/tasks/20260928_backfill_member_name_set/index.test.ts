import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemMigrationContext } from '@/migration/registry';
import type { SystemMigrationProgressInput } from '@fastgpt/global/migration/schema';
import { backfillMemberNameSet } from '@/migration/tasks/20260928_backfill_member_name_set';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { UNSET_TEAM_MEMBER_NAME } from '@fastgpt/global/support/user/team/constant';

vi.mock('@/migration/constants', () => ({ systemMigrationBatchSize: 2 }));
// 全局默认关闭事务；此处恢复真实实现，验证批次写入确实原子提交。
vi.mock('@fastgpt/service/common/mongo/sessionRun', async (importOriginal) => importOriginal());

/** 用内存 Context 模拟持久断点、失败快照和失权；业务写入仍运行真实测试 Mongo 事务。 */
const createContext = () => {
  let checkpoint: Record<string, unknown> | undefined;
  let failedRecords: any[] = [];
  const context = {
    migrationId: '20260928_backfill_member_name_set',
    runId: 'test-run',
    signal: new AbortController().signal,
    getCheckpoint: async (schema) =>
      checkpoint === undefined ? undefined : schema.parse(checkpoint),
    saveCheckpoint: vi.fn(async (value: Record<string, unknown>) => {
      checkpoint = structuredClone(value);
    }),
    assertActive: vi.fn(async () => undefined),
    reportProgress: vi.fn(async (_value: SystemMigrationProgressInput) => undefined),
    getFailedRecords: vi.fn(async () => failedRecords),
    upsertFailedRecords: vi.fn(async (records: any[]) => {
      const byKey = new Map(failedRecords.map((record) => [String(record.data.tmbId), record]));
      for (const { key, record } of records) byKey.set(key, record);
      failedRecords = [...byKey.values()];
    }),
    removeFailedRecords: vi.fn(async (records: any[]) => {
      const keys = new Set(records.map((record) => record.key));
      failedRecords = failedRecords.filter((record) => !keys.has(String(record.data.tmbId)));
    }),
    reportFailedRecords: vi.fn(async (records: any[]) => {
      failedRecords = structuredClone(records);
    }),
    fail: vi.fn(async () => {
      throw new Error('migration failed');
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;
  return {
    context,
    getCheckpoint: () => checkpoint,
    getFailedRecords: () => failedRecords,
    setFailedRecords: (records: any[]) => {
      failedRecords = records;
    }
  };
};

const seedUser = async (username: string) => {
  const { insertedId } = await MongoUser.collection.insertOne({ username, password: 'x' });
  return insertedId as Types.ObjectId;
};

const seedMember = async (doc: {
  name: string;
  userId?: Types.ObjectId | null;
  isSetMemberName?: boolean;
}) => {
  const { insertedId } = await MongoTeamMember.collection.insertOne({
    _id: new Types.ObjectId(),
    teamId: new Types.ObjectId(),
    userId: doc.userId ?? null,
    name: doc.name,
    status: 'active',
    ...(doc.isSetMemberName === undefined ? {} : { isSetMemberName: doc.isSetMemberName })
  });
  return insertedId as Types.ObjectId;
};

const readMember = async (id: Types.ObjectId) =>
  MongoTeamMember.collection.findOne(
    { _id: id },
    { projection: { _id: 0, name: 1, isSetMemberName: 1 } }
  ) as Promise<{
    name: string;
    isSetMemberName?: boolean;
  }>;

describe('backfillMemberNameSet', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await MongoTeamMember.collection.deleteMany({});
    await MongoUser.collection.deleteMany({});
  });

  it('backfills placeholder, prefix-matched and set documents per rule', async () => {
    const userId = await seedUser('wecom-zhangsan');
    const placeholderId = await seedMember({ name: UNSET_TEAM_MEMBER_NAME, userId });
    const prefixMatchId = await seedMember({ name: 'zhangsan', userId });
    const setNameId = await seedMember({ name: '张三', userId });
    const orphanId = await seedMember({ name: UNSET_TEAM_MEMBER_NAME, userId: null });

    const { context, getFailedRecords } = createContext();
    await expect(backfillMemberNameSet(context)).rejects.toThrow('migration failed');

    expect(await readMember(placeholderId)).toEqual({
      name: 'wecom-zhangsan',
      isSetMemberName: false
    });
    expect(await readMember(prefixMatchId)).toEqual({ name: 'zhangsan', isSetMemberName: false });
    expect(await readMember(setNameId)).toEqual({ name: '张三', isSetMemberName: true });
    // 孤儿文档保持原样并进入失败快照
    expect(await readMember(orphanId)).toEqual({ name: UNSET_TEAM_MEMBER_NAME });
    expect(getFailedRecords().map((record) => record.data.tmbId)).toEqual([String(orphanId)]);
    expect(context.fail).toHaveBeenCalled();
  });

  it('is idempotent and never overwrites explicit false flags', async () => {
    const userId = await seedUser('alice');
    const explicitFalseId = await seedMember({
      name: 'alice',
      userId,
      isSetMemberName: false
    });
    const setTrueId = await seedMember({ name: 'Alice', userId });

    const { context } = createContext();
    await expect(backfillMemberNameSet(context)).resolves.toMatchObject({ orphanCount: 0 });
    await expect(backfillMemberNameSet(context)).resolves.toMatchObject({ orphanCount: 0 });

    expect(await readMember(explicitFalseId)).toEqual({ name: 'alice', isSetMemberName: false });
    expect(await readMember(setTrueId)).toEqual({ name: 'Alice', isSetMemberName: true });
  });

  it('retries previous orphan records and drops fixed ones from the snapshot', async () => {
    const orphanId = await seedMember({ name: UNSET_TEAM_MEMBER_NAME, userId: null });
    const { context, getFailedRecords } = createContext();
    await expect(backfillMemberNameSet(context)).rejects.toThrow('migration failed');
    expect(getFailedRecords()).toHaveLength(1);

    // 管理员修复：补建用户并绑定到孤儿成员
    const userId = await seedUser('fixed-user');
    await MongoTeamMember.collection.updateOne({ _id: orphanId }, { $set: { userId } });

    const retry = createContext();
    // 沿用上一轮的失败快照，并让增量删除作用于同一份测试存储。
    let retryFailedRecords = getFailedRecords();
    retry.context.getFailedRecords = vi.fn(async () => retryFailedRecords);
    retry.context.removeFailedRecords = vi.fn(async (records) => {
      const keys = new Set(records.map((record) => record.key));
      retryFailedRecords = retryFailedRecords.filter(
        (record) => !keys.has(String(record.data.tmbId))
      );
    });
    retry.context.upsertFailedRecords = vi.fn(async (records) => {
      retryFailedRecords = records.map(({ record }) => record);
    });
    await expect(backfillMemberNameSet(retry.context)).resolves.toMatchObject({ orphanCount: 0 });
    expect(await readMember(orphanId)).toEqual({
      name: 'fixed-user',
      isSetMemberName: false
    });
    expect(retry.context.fail).not.toHaveBeenCalled();
  });

  it('resumes from checkpoint after a mid-run crash', async () => {
    const userId = await seedUser('bob');
    const firstId = await seedMember({ name: UNSET_TEAM_MEMBER_NAME, userId });
    const secondId = await seedMember({ name: UNSET_TEAM_MEMBER_NAME, userId });
    const thirdId = await seedMember({ name: UNSET_TEAM_MEMBER_NAME, userId });

    const { context, getCheckpoint } = createContext();
    // 批大小为 2：包含第三个成员的批次写入时崩溃，断点应停在第一批之后
    const originalBulkWrite = MongoTeamMember.collection.bulkWrite.bind(MongoTeamMember.collection);
    const bulkWriteSpy = vi
      .spyOn(MongoTeamMember.collection, 'bulkWrite')
      .mockImplementation(async (ops, options) => {
        if (JSON.stringify(ops).includes(String(thirdId))) throw new Error('crash');
        return originalBulkWrite(ops, options);
      });
    await expect(backfillMemberNameSet(context)).rejects.toThrow('crash');
    expect(getCheckpoint()).toMatchObject({ scannedCount: 2 });
    expect(await readMember(firstId)).toMatchObject({ isSetMemberName: false });
    expect(await readMember(thirdId)).toEqual({ name: UNSET_TEAM_MEMBER_NAME });
    bulkWriteSpy.mockRestore();

    // 同一断点续跑：重放第一批幂等，并补齐剩余批次
    await expect(backfillMemberNameSet(context)).resolves.toMatchObject({ scannedCount: 3 });
    expect(await readMember(secondId)).toMatchObject({ isSetMemberName: false });
    expect(await readMember(thirdId)).toMatchObject({ isSetMemberName: false });
  });

  it('fails validation when unsettled documents remain', async () => {
    const userId = await seedUser('carol');
    await seedMember({ name: 'carol', userId });
    const { context } = createContext();
    // 模拟写入丢失：让所有 update 变成空操作
    vi.spyOn(MongoTeamMember.collection, 'bulkWrite').mockResolvedValue({} as never);
    await expect(backfillMemberNameSet(context)).rejects.toThrow('migration failed');
  });
});
