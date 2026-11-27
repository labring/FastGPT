import { describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { buildTeamMemberNameSortKey } from '@fastgpt/service/support/user/team/sortKey';
import {
  findTeamMembersPage,
  LEGACY_TEAM_MEMBER_WAITING_STATUS,
  normalizeTeamMemberObjectIdHex,
  TEAM_MEMBER_LIST_PROJECTION
} from '@fastgpt/service/support/user/team/mongo/memberQuery';

describe('team member query & schema update hook', () => {
  it('syncs nameSortKey on updateOne direct/$set/$setOnInsert and ignores aggregation pipeline updates safely', async () => {
    const teamId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const created = await MongoTeamMember.create({
      teamId,
      userId,
      name: '张三',
      status: 'active'
    });
    expect(created.nameSortKey).toBe(buildTeamMemberNameSortKey('张三'));

    await MongoTeamMember.updateOne({ _id: created._id }, { name: 'Alice' });
    expect((await MongoTeamMember.findById(created._id).lean())?.nameSortKey).toBe(
      buildTeamMemberNameSortKey('Alice')
    );

    await MongoTeamMember.updateOne({ _id: created._id }, { $set: { name: '李伟' } });
    expect((await MongoTeamMember.findById(created._id).lean())?.nameSortKey).toBe(
      buildTeamMemberNameSortKey('李伟')
    );

    const upsertUserId = new Types.ObjectId();
    await MongoTeamMember.updateOne(
      { teamId, userId: upsertUserId },
      { $setOnInsert: { name: '曾国藩', status: 'active' } },
      { upsert: true }
    );
    const upserted = await MongoTeamMember.findOne({ teamId, userId: upsertUserId }).lean();
    expect(upserted?.nameSortKey).toBe(buildTeamMemberNameSortKey('曾国藩'));

    // Aggregation pipeline updates should pass through the hook without throwing.
    await expect(
      MongoTeamMember.updateOne({ _id: created._id }, [{ $set: { updateTime: new Date() } }])
    ).resolves.toBeDefined();

    // insertMany 未显式传 name 时应回落到 Schema default ('Member') 再生成 nameSortKey，避免被预写为 '2:'
    const [insertedDefault] = await MongoTeamMember.insertMany([
      { teamId, userId: new Types.ObjectId(), status: 'active' }
    ]);
    expect(insertedDefault.name).toBe('Member');
    expect(insertedDefault.nameSortKey).toBe(buildTeamMemberNameSortKey('Member'));
  });

  it('normalizes uppercase ObjectIds for pinning/filtering, projects narrow fields, and uses index-only sort for legacy waiting bucket', async () => {
    const teamId = new Types.ObjectId();
    const [activeZoe, activeAlice, waitingBob, waitingAn] = await Promise.all([
      MongoTeamMember.create({
        teamId,
        userId: new Types.ObjectId(),
        name: 'Zoe',
        status: 'active'
      }),
      MongoTeamMember.create({
        teamId,
        userId: new Types.ObjectId(),
        name: 'Alice',
        status: 'active'
      }),
      MongoTeamMember.collection.insertOne({
        _id: new Types.ObjectId(),
        teamId,
        userId: new Types.ObjectId(),
        name: 'Bob',
        nameSortKey: buildTeamMemberNameSortKey('Bob'),
        status: LEGACY_TEAM_MEMBER_WAITING_STATUS,
        createTime: new Date()
      }),
      MongoTeamMember.collection.insertOne({
        _id: new Types.ObjectId(),
        teamId,
        userId: new Types.ObjectId(),
        name: '安娜',
        nameSortKey: buildTeamMemberNameSortKey('安娜'),
        status: LEGACY_TEAM_MEMBER_WAITING_STATUS,
        createTime: new Date()
      })
    ]);

    expect(normalizeTeamMemberObjectIdHex(String(activeZoe._id).toUpperCase())).toBe(
      String(activeZoe._id)
    );
    expect(normalizeTeamMemberObjectIdHex('not-an-object-id')).toBeUndefined();

    // 显式验证历史 waiting 等值分桶直接命中复合索引且无阻塞 SORT。
    await MongoTeamMember.createIndexes();
    const waitingExplain = (await MongoTeamMember.find(
      { teamId, status: LEGACY_TEAM_MEMBER_WAITING_STATUS },
      TEAM_MEMBER_LIST_PROJECTION
    )
      .sort({ nameSortKey: 1, _id: 1 })
      .limit(10)
      .explain('executionStats')) as { queryPlanner?: { winningPlan?: unknown } };
    const planText = JSON.stringify(waitingExplain.queryPlanner?.winningPlan ?? {});
    expect(planText).toContain('fg_team_member_status_sort');
    expect(planText).not.toContain('"stage":"SORT"');

    // 大写 pinnedTmbId 与大写 matchedTmbIds 共用归一化，Zoe 正常置顶且不重复。
    const pinnedRes = await findTeamMembersPage({
      teamId: String(teamId),
      offset: 0,
      pageSize: 10,
      pinnedTmbId: String(activeZoe._id).toUpperCase(),
      matchedTmbIds: [
        String(activeAlice._id).toUpperCase(),
        String(activeZoe._id).toUpperCase(),
        String(waitingBob.insertedId).toUpperCase(),
        String(waitingAn.insertedId).toUpperCase()
      ]
    });
    expect(pinnedRes.total).toBe(4);
    expect(pinnedRes.members.map((m) => m.name)).toEqual(['Zoe', 'Alice', '安娜', 'Bob']);
    // 显式投影不应把内部排序键 nameSortKey 带出持久化层。
    for (const member of pinnedRes.members) {
      expect(member.nameSortKey).toBeUndefined();
    }
  });

  it('does not drop remaining active members when the pinned member changes status before bucket counting', async () => {
    const teamId = new Types.ObjectId();
    const [zoe, alice] = await Promise.all([
      MongoTeamMember.create({
        teamId,
        userId: new Types.ObjectId(),
        name: 'Zoe',
        status: 'active'
      }),
      MongoTeamMember.create({
        teamId,
        userId: new Types.ObjectId(),
        name: 'Alice',
        status: 'active'
      }),
      MongoTeamMember.create({
        teamId,
        userId: new Types.ObjectId(),
        name: 'Bob',
        status: 'leave'
      })
    ]);

    // 复现置顶 Zoe 读出为 active 后、分桶计数前并发改为 leave 的场景（拦截集合层原生 Promise 契约）。
    const origCountDocuments = MongoTeamMember.collection.countDocuments.bind(
      MongoTeamMember.collection
    );
    let mutated = false;
    const countSpy = vi
      .spyOn(MongoTeamMember.collection, 'countDocuments')
      .mockImplementation(async (filter, options) => {
        if (!mutated) {
          mutated = true;
          await MongoTeamMember.updateOne({ _id: zoe._id }, { $set: { status: 'leave' } });
        }
        return origCountDocuments(filter, options);
      });

    try {
      const res = await findTeamMembersPage({
        teamId: String(teamId),
        offset: 0,
        pageSize: 3,
        pinnedTmbId: String(zoe._id)
      });
      expect(res.total).toBe(3);
      expect(res.members.map((m) => m.name)).toEqual(['Zoe', 'Alice', 'Bob']);
      expect(res.members.some((m) => String(m._id) === String(alice._id))).toBe(true);
    } finally {
      countSpy.mockRestore();
    }
  });
});
