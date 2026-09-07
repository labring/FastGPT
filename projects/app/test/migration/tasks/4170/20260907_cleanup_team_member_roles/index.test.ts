import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemMigrationContext } from '@/migration/registry';
import type { SystemMigrationProgressInput } from '@fastgpt/global/migration/schema';
import { cleanupTeamMemberRoles } from '@/migration/tasks/4170/20260907_cleanup_team_member_roles';
import * as service from '@/migration/tasks/4170/20260907_cleanup_team_member_roles/service';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { OpenAPIUserSchema } from '@fastgpt/global/openapi/support/user/account/login/api';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

vi.mock('@/migration/constants', () => ({ systemMigrationBatchSize: 2 }));
// 全局默认关闭事务；此处恢复真实实现，验证批次校验失败确实回滚。
vi.mock('@fastgpt/service/common/mongo/sessionRun', async (importOriginal) => importOriginal());

/** 用内存 Context 模拟持久断点和失权；业务写入仍运行真实测试 Mongo 事务。 */
const createContext = () => {
  let checkpoint: Record<string, unknown> | undefined;
  const context = {
    migrationId: '20260907_cleanup_team_member_roles',
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
      throw new Error('Blocking tasks must throw');
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;
  return { context, getCheckpoint: () => checkpoint };
};

const seedMembers = async (roles: unknown[]) => {
  const records = roles.map((role) => ({
    _id: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    teamId: new Types.ObjectId(),
    name: 'Member',
    status: 'active',
    ...(role !== undefined ? { role } : {})
  }));
  await MongoTeamMember.collection.insertMany(records);
  return records;
};

describe('cleanupTeamMemberRoles', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await MongoTeamMember.collection.deleteMany({});
  });

  it('only removes legacy fields, preserves permissions, and reports both completed stages', async () => {
    const records = await seedMembers(['owner', undefined, 'admin', 'visitor', 'member', '', null]);
    await MongoResourcePermission.collection.insertOne({
      teamId: records[2].teamId,
      tmbId: records[2]._id,
      resourceType: 'team',
      permission: 1
    });
    const permissions = await MongoResourcePermission.collection.find({}).toArray();
    const { context } = createContext();
    await expect(cleanupTeamMemberRoles(context)).resolves.toEqual({
      scannedCount: 7,
      remaining: 0
    });
    const expected = records.map((record) => {
      const copy = { ...record };
      if (copy.role !== 'owner') delete copy.role;
      return copy;
    });
    expect(await MongoTeamMember.collection.find({}).sort({ _id: 1 }).toArray()).toEqual(expected);
    expect(await MongoResourcePermission.collection.find({}).toArray()).toEqual(permissions);
    expect(context.reportProgress.mock.calls.map(([value]) => value)).toEqual([
      { key: 'members', status: 'running' },
      ...[2, 4, 6, 7].map((current) => ({ key: 'members', status: 'running', current })),
      { key: 'members', status: 'succeeded', current: 7 },
      { key: 'validation', status: 'running' },
      { key: 'validation', status: 'succeeded' }
    ]);
    expect(context.getFailedRecords).not.toHaveBeenCalled();
    expect(context.reportFailedRecords).not.toHaveBeenCalled();
    expect(context.fail).not.toHaveBeenCalled();
    await expect(cleanupTeamMemberRoles(createContext().context)).resolves.toEqual({
      scannedCount: 0,
      remaining: 0
    });
  });

  it('accepts an empty or already cleaned database without business writes', async () => {
    const update = vi.spyOn(MongoTeamMember.collection, 'updateMany');
    await expect(cleanupTeamMemberRoles(createContext().context)).resolves.toEqual({
      scannedCount: 0,
      remaining: 0
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('resumes after a committed checkpoint without rescanning earlier members', async () => {
    const records = await seedMembers(['admin', 'visitor', 'member']);
    const { context, getCheckpoint } = createContext();
    context.reportProgress
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(async () => {
        throw new Error('interrupted');
      });
    await expect(cleanupTeamMemberRoles(context)).rejects.toThrow('interrupted');
    expect(getCheckpoint()).toMatchObject({ lastId: String(records[1]._id), scannedCount: 2 });
    const read = vi.spyOn(service, 'readTeamMemberRoleBatch');
    await expect(cleanupTeamMemberRoles(context)).resolves.toEqual({
      scannedCount: 3,
      remaining: 0
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0][0].lastId).toBe(String(records[1]._id));
  });

  it('replays a committed batch when saving its checkpoint failed', async () => {
    await seedMembers(['admin', 'visitor', 'member']);
    const state = createContext();
    const save = state.context.saveCheckpoint.getMockImplementation()!;
    state.context.saveCheckpoint
      .mockImplementationOnce(save)
      .mockRejectedValueOnce(new Error('checkpoint unavailable'));
    await expect(cleanupTeamMemberRoles(state.context)).rejects.toThrow('checkpoint unavailable');
    expect(state.getCheckpoint()).toMatchObject({ lastId: null, scannedCount: 0 });
    await expect(service.countRemainingTeamMemberRoles()).resolves.toBe(1);
    await expect(cleanupTeamMemberRoles(state.context)).resolves.toEqual({
      scannedCount: 3,
      remaining: 0
    });
  });

  it('stops before writing or saving a batch after lease loss', async () => {
    await seedMembers(['admin']);
    const { context } = createContext();
    context.assertActive
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error('lease lost'));
    const update = vi.spyOn(MongoTeamMember.collection, 'updateMany');
    await expect(cleanupTeamMemberRoles(context)).rejects.toThrow('lease lost');
    expect(update).not.toHaveBeenCalled();
    expect(context.saveCheckpoint).toHaveBeenCalledTimes(1);
  });

  it('rolls back writes if batch validation fails and keeps the old checkpoint', async () => {
    await seedMembers(['admin']);
    const { context } = createContext();
    vi.spyOn(MongoTeamMember.collection, 'countDocuments').mockResolvedValueOnce(1);
    await expect(cleanupTeamMemberRoles(context)).rejects.toThrow('remain in cleanup batch');
    expect(await MongoTeamMember.collection.findOne({})).toMatchObject({ role: 'admin' });
    expect(context.saveCheckpoint).toHaveBeenCalledTimes(1);
  });

  it('does not clear a member promoted to owner after the batch was read', async () => {
    const [record] = await seedMembers(['admin']);
    const { context } = createContext();
    context.assertActive
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(async () => {
        await MongoTeamMember.collection.updateOne(
          { _id: record._id },
          { $set: { role: 'owner' } }
        );
      });
    await cleanupTeamMemberRoles(context);
    expect(await MongoTeamMember.collection.findOne({ _id: record._id })).toMatchObject({
      role: 'owner'
    });
  });

  it('fails global validation if a legacy writer inserts behind the cursor', async () => {
    await seedMembers(['admin']);
    const { context } = createContext();
    const save = context.saveCheckpoint.getMockImplementation()!;
    context.saveCheckpoint.mockImplementationOnce(save).mockImplementationOnce(async (value) => {
      await save(value);
      await MongoTeamMember.collection.insertOne({
        _id: new Types.ObjectId('000000000000000000000001'),
        role: 'visitor'
      });
    });
    await expect(cleanupTeamMemberRoles(context)).rejects.toThrow(
      '1 legacy team member roles remain'
    );
    expect(context.logger.error).toHaveBeenCalledWith(
      'Legacy team member roles remain after cleanup',
      { remaining: 1 }
    );
    expect(context.reportProgress).not.toHaveBeenCalledWith({
      key: 'validation',
      status: 'succeeded'
    });
  });

  it('rejects invalid source IDs before making any change', async () => {
    await seedMembers(['admin']);
    await MongoTeamMember.collection.insertOne({ _id: 'invalid' as never, role: 'visitor' });
    const update = vi.spyOn(MongoTeamMember.collection, 'updateMany');
    await expect(cleanupTeamMemberRoles(createContext().context)).rejects.toThrow('non-ObjectId');
    expect(update).not.toHaveBeenCalled();
  });

  it('allows token login after cleanup without role response compatibility', async () => {
    const user = await MongoUser.create({ username: 'migration-login', password: 'test' });
    const team = await MongoTeam.create({ name: 'Team', ownerId: user._id });
    const { insertedId } = await MongoTeamMember.collection.insertOne({
      teamId: team._id,
      userId: user._id,
      name: 'Member',
      status: 'active',
      role: 'admin'
    });
    await cleanupTeamMemberRoles(createContext().context);
    const detail = await getUserDetail({ tmbId: String(insertedId) });
    expect(OpenAPIUserSchema.safeParse(detail).success).toBe(true);
    expect(detail.permission.isOwner).toBe(false);
    expect(detail.permission.hasManagePer).toBe(false);
  });

  it('stops on an aborted signal before starting a batch', async () => {
    await seedMembers(['admin']);
    const { context } = createContext();
    context.signal = AbortSignal.abort(new Error('aborted'));
    const update = vi.spyOn(MongoTeamMember.collection, 'updateMany');
    await expect(cleanupTeamMemberRoles(context)).rejects.toThrow('aborted');
    expect(update).not.toHaveBeenCalled();
  });

  it('handles members deleted after the snapshot without a false failure', async () => {
    await seedMembers(['admin']);
    const { context } = createContext();
    const save = context.saveCheckpoint.getMockImplementation()!;
    context.saveCheckpoint.mockImplementationOnce(async (value) => {
      await save(value);
      await MongoTeamMember.collection.deleteMany({});
    });
    await expect(cleanupTeamMemberRoles(context)).resolves.toEqual({
      scannedCount: 0,
      remaining: 0
    });
  });

  it('does not advance a checkpoint on a business write failure', async () => {
    await seedMembers(['visitor']);
    const { context } = createContext();
    vi.spyOn(MongoTeamMember.collection, 'updateMany').mockRejectedValueOnce(
      new Error('write failed')
    );
    await expect(cleanupTeamMemberRoles(context)).rejects.toThrow('write failed');
    expect(context.saveCheckpoint).toHaveBeenCalledTimes(1);
    expect(await MongoTeamMember.collection.findOne({})).toMatchObject({ role: 'visitor' });
  });
});
