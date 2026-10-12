import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemMigrationContext } from '@/migration/registry';
import type { SystemMigrationProgressInput } from '@fastgpt/global/migration/schema';
import { backfillMemberNameSet } from '@/migration/tasks/4171/20260928_backfill_member_name_set';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';

vi.mock('@/migration/constants', () => ({ systemMigrationBatchSize: 2 }));
vi.mock('@fastgpt/service/common/mongo/sessionRun', async (importOriginal) => importOriginal());

/** 用内存 Context 模拟持久断点；业务写入仍运行真实测试 Mongo 事务。 */
const createContext = () => {
  let checkpoint: Record<string, unknown> | undefined;
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
    getFailedRecords: vi.fn(async () => []),
    reportFailedRecords: vi.fn(async () => undefined),
    fail: vi.fn(async () => {
      throw new Error('migration failed');
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;
  return { context, getCheckpoint: () => checkpoint };
};

const seedUser = async (username: string) => {
  const { insertedId } = await MongoUser.collection.insertOne({ username, password: 'x' });
  return insertedId as Types.ObjectId;
};

const seedMember = async (doc: {
  name: string;
  userId?: Types.ObjectId | null;
  role?: string;
  isSetMemberName?: boolean;
}) => {
  const { insertedId } = await MongoTeamMember.collection.insertOne({
    _id: new Types.ObjectId(),
    teamId: new Types.ObjectId(),
    userId: doc.userId ?? null,
    name: doc.name,
    status: 'active',
    ...(doc.role === undefined ? {} : { role: doc.role }),
    ...(doc.isSetMemberName === undefined ? {} : { isSetMemberName: doc.isSetMemberName })
  });
  return insertedId as Types.ObjectId;
};

const readMember = async (id: Types.ObjectId) =>
  MongoTeamMember.collection.findOne(
    { _id: id },
    { projection: { _id: 0, name: 1, isSetMemberName: 1 } }
  ) as Promise<{ name: string; isSetMemberName?: boolean }>;

describe('backfillMemberNameSet', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await MongoTeamMember.collection.deleteMany({});
    await MongoUser.collection.deleteMany({});
  });

  it('sets owner true and classifies non-owner names', async () => {
    const userId = await seedUser('alice');
    const ownerId = await seedMember({
      name: 'alice',
      userId,
      role: TeamMemberRoleEnum.owner,
      isSetMemberName: false
    });
    const usernameMatchId = await seedMember({ name: 'alice', userId });
    const historicalNameId = await seedMember({ name: 'Legacy member', userId });
    const setNameId = await seedMember({ name: 'Alice', userId });

    const { context } = createContext();
    await expect(backfillMemberNameSet(context)).resolves.toMatchObject({
      ownerCount: 1,
      usernameMatchCount: 1,
      setTrueCount: 2
    });

    expect(await readMember(ownerId)).toEqual({ name: 'alice', isSetMemberName: true });
    expect(await readMember(usernameMatchId)).toEqual({ name: 'alice', isSetMemberName: false });
    expect(await readMember(historicalNameId)).toEqual({
      name: 'Legacy member',
      isSetMemberName: true
    });
    expect(await readMember(setNameId)).toEqual({ name: 'Alice', isSetMemberName: true });
  });

  it('is idempotent and preserves existing non-owner flags', async () => {
    const userId = await seedUser('alice');
    const explicitFalseId = await seedMember({
      name: 'Alice',
      userId,
      isSetMemberName: false
    });
    const setTrueId = await seedMember({ name: 'alice', userId, isSetMemberName: true });

    const { context } = createContext();
    await backfillMemberNameSet(context);
    await backfillMemberNameSet(context);

    expect(await readMember(explicitFalseId)).toEqual({ name: 'Alice', isSetMemberName: false });
    expect(await readMember(setTrueId)).toEqual({ name: 'alice', isSetMemberName: true });
  });

  it('resumes from checkpoint after a mid-run crash', async () => {
    const userId = await seedUser('bob');
    const firstId = await seedMember({ name: 'bob', userId });
    const secondId = await seedMember({ name: 'bob', userId });
    const thirdId = await seedMember({ name: 'bob', userId });

    const { context, getCheckpoint } = createContext();
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
    expect(await readMember(thirdId)).toEqual({ name: 'bob' });
    bulkWriteSpy.mockRestore();

    await expect(backfillMemberNameSet(context)).resolves.toMatchObject({ scannedCount: 3 });
    expect(await readMember(secondId)).toMatchObject({ isSetMemberName: false });
    expect(await readMember(thirdId)).toMatchObject({ isSetMemberName: false });
  });

  it('fails validation when a write is lost', async () => {
    const userId = await seedUser('carol');
    await seedMember({ name: 'carol', userId });
    const { context } = createContext();
    vi.spyOn(MongoTeamMember.collection, 'bulkWrite').mockResolvedValue({} as never);
    await expect(backfillMemberNameSet(context)).rejects.toThrow('without isSetMemberName');
  });
});
