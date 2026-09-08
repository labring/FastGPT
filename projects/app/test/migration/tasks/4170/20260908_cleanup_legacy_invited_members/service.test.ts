import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectionMongo, Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  cleanupLegacyInvitedMemberRecords,
  countLegacyInvitedMembers
} from '@/migration/tasks/4170/20260908_cleanup_legacy_invited_members/service';

const names = [
  'team_members',
  'resource_permissions',
  'team_group_members',
  'team_org_members',
  'apps',
  'datasets',
  'agent_skills',
  'users'
];
const collection = (name: string) => connectionMongo.connection.db!.collection(name);

beforeEach(async () => {
  vi.restoreAllMocks();
  // 测试基础设施默认跳过事务；此处使用真实副本集事务验证删除回滚。
  const actual = await vi.importActual<typeof import('@fastgpt/service/common/mongo/sessionRun')>(
    '@fastgpt/service/common/mongo/sessionRun'
  );
  vi.mocked(mongoSessionRun).mockImplementation(actual.mongoSessionRun);
  for (const name of names) {
    await collection(name).deleteMany({});
    // 空集合也预先存在，避免把测试集合初始化混进事务。
    await collection(name).insertOne({ _id: new Types.ObjectId(), fixture: true });
  }
});

describe('cleanupLegacyInvitedMemberRecords', () => {
  it('deletes only legacy statuses and both reference types, preserving users and normal members', async () => {
    const teamId = new Types.ObjectId();
    const records = ['waiting', 'reject', 'active', 'leave', 'forbidden', 'unknown'].map(
      (status) => ({ _id: new Types.ObjectId(), userId: new Types.ObjectId(), teamId, status })
    );
    await collection('team_members').insertMany(records);
    for (const name of names.slice(1, 4)) {
      await collection(name).insertMany(
        records.flatMap((m) => [{ tmbId: m._id }, { tmbId: String(m._id) }])
      );
    }
    const user = { _id: records[0].userId, username: 'legacy-invitation-test' };
    await collection('users').insertOne(user);
    const result = await cleanupLegacyInvitedMemberRecords(async () => {});
    expect(result).toEqual({
      counts: { members: 2, permissions: 4, groups: 4, orgs: 4 },
      failedRecords: []
    });
    for (const record of records.slice(2))
      expect(await collection('team_members').findOne({ _id: record._id })).toEqual(record);
    expect(await collection('users').findOne(user)).toEqual(user);
    expect(await countLegacyInvitedMembers()).toBe(0);
    expect((await cleanupLegacyInvitedMemberRecords(async () => {})).counts).toEqual({
      members: 0,
      permissions: 0,
      groups: 0,
      orgs: 0
    });
    for (const name of names.slice(1, 4))
      expect(await collection(name).countDocuments({ tmbId: { $exists: true } })).toBe(8);
  });

  it.each([
    'team',
    'resource_permissions',
    'team_group_members',
    'apps',
    'datasets',
    'agent_skills',
    'invalid'
  ])('protects %s records and allows retry after repair', async (kind) => {
    const _id = new Types.ObjectId();
    const teamId = new Types.ObjectId();
    const member = {
      _id,
      userId: new Types.ObjectId(),
      teamId,
      status: 'waiting',
      ...(kind === 'team' ? { role: 'owner' } : {})
    };
    await collection('team_members').insertOne(member);
    if (kind === 'invalid')
      await collection('team_members').updateOne({ _id }, { $unset: { teamId: '' } });
    if (!['team', 'invalid'].includes(kind))
      await collection(kind).insertOne({
        tmbId: String(_id),
        role: 'owner',
        permission: OwnerPermissionVal
      });
    const result = await cleanupLegacyInvitedMemberRecords(async () => {});
    expect(result.counts.members).toBe(0);
    expect(result.failedRecords).toEqual([
      expect.objectContaining({
        stageKey: 'cleanup',
        data: expect.objectContaining({ memberId: String(_id) })
      })
    ]);
    expect(await collection('team_members').findOne({ _id })).not.toBeNull();
    await collection('team_members').updateOne({ _id }, { $set: { teamId }, $unset: { role: '' } });
    if (!['team', 'invalid'].includes(kind))
      await collection(kind).deleteMany({ tmbId: String(_id) });
    expect((await cleanupLegacyInvitedMemberRecords(async () => {})).counts.members).toBe(1);
  });

  it.each([1, 2, 3])('does not commit partial deletes when lease check %s fails', async (call) => {
    const member = { _id: new Types.ObjectId(), teamId: new Types.ObjectId(), status: 'reject' };
    await collection('team_members').insertOne(member);
    for (const name of names.slice(1, 4)) await collection(name).insertOne({ tmbId: member._id });
    let checks = 0;
    await expect(
      cleanupLegacyInvitedMemberRecords(async () => {
        if (++checks === call) throw new Error('lease lost');
      })
    ).rejects.toThrow('lease lost');
    expect(await collection('team_members').findOne({ _id: member._id })).toEqual(member);
    for (const name of names.slice(1, 4))
      expect(await collection(name).countDocuments({ tmbId: member._id })).toBe(1);
  });

  it('refuses unexpectedly large candidate sets before writes', async () => {
    await collection('team_members').insertMany(
      Array.from({ length: 10001 }, () => ({ teamId: new Types.ObjectId(), status: 'waiting' }))
    );
    await expect(cleanupLegacyInvitedMemberRecords(async () => {})).rejects.toThrow(
      'exceeds 10000'
    );
    expect(await countLegacyInvitedMembers()).toBe(10001);
  });

  it('retries the transaction without deleting a concurrently accepted invitation', async () => {
    const _id = new Types.ObjectId();
    await collection('team_members').insertOne({
      _id,
      teamId: new Types.ObjectId(),
      status: 'waiting'
    });
    await collection('resource_permissions').insertOne({ tmbId: _id, permission: 4 });
    let checks = 0;
    const result = await cleanupLegacyInvitedMemberRecords(async () => {
      if (++checks === 2) {
        await collection('team_members').updateOne({ _id }, { $set: { status: 'active' } });
      }
    });
    expect(result.counts.members).toBe(0);
    expect(await collection('team_members').findOne({ _id })).toMatchObject({ status: 'active' });
    expect(await collection('resource_permissions').countDocuments({ tmbId: _id })).toBe(1);
  });

  it.each(['team_members', 'team_org_members'])(
    'rolls back when deletion silently misses %s',
    async (name) => {
      const _id = new Types.ObjectId();
      await collection('team_members').insertOne({
        _id,
        teamId: new Types.ObjectId(),
        status: 'reject'
      });
      await collection('resource_permissions').insertOne({ tmbId: _id, permission: 4 });
      await collection('team_org_members').insertOne({ tmbId: _id });
      const db = connectionMongo.connection.db!;
      const target = collection(name);
      const original = db.collection.bind(db);
      vi.spyOn(db, 'collection').mockImplementation((...args) =>
        args[0] === name ? target : original(...args)
      );
      vi.spyOn(target, 'deleteMany').mockResolvedValue({ acknowledged: true, deletedCount: 0 });
      await expect(cleanupLegacyInvitedMemberRecords(async () => {})).rejects.toThrow(
        name === 'team_members' ? 'delete count mismatch' : 'references remain'
      );
      expect(await collection('team_members').findOne({ _id })).not.toBeNull();
      expect(await collection('resource_permissions').countDocuments({ tmbId: _id })).toBe(1);
    }
  );
});
