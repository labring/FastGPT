import { describe, expect, it, vi } from 'vitest';
import {
  buildUsageMatch,
  getUsageDepartmentSubtreeIds
} from '@fastgpt/service/support/wallet/usage/filter/utils';
import {
  getUsageFilterOptions,
  resolveUsageScope
} from '@fastgpt/service/support/wallet/usage/filter/service';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { MongoOrgMemberModel } from '@fastgpt/service/support/permission/org/orgMemberSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { MongoGroupMemberModel } from '@fastgpt/service/support/permission/memberGroup/groupMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { Types } from '@fastgpt/service/common/mongo';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { UsageSubjectFilterSchema } from '@fastgpt/global/support/wallet/usage/filter';

const id = () => new Types.ObjectId().toString();
const rootId = id(),
  parentId = id(),
  aId = id(),
  bId = id(),
  emptyId = id(),
  foreignId = id();
const tree = [
  { _id: rootId, name: 'Root', path: '', pathId: 'root' },
  { _id: parentId, name: 'Parent', path: '/root', pathId: 'parent' },
  { _id: aId, name: 'A', path: '/root/parent', pathId: 'a' },
  { _id: bId, name: 'B', path: '/root/parent', pathId: 'b' },
  { _id: emptyId, name: 'Empty', path: '/root', pathId: 'empty' }
];

const fixture = async () => {
  const teamId = id(),
    otherTeamId = id();
  await MongoTeam.create({ _id: teamId, name: 'Team', ownerId: id() });
  const members = await MongoTeamMember.create([
    { teamId, userId: id(), name: 'Direct', status: 'active' },
    { teamId, userId: id(), name: 'A member', status: 'active' },
    { teamId, userId: id(), name: 'B member', status: 'leave' },
    { teamId, userId: id(), name: 'Both', status: 'forbidden' },
    { teamId: otherTeamId, userId: id(), name: 'Foreign', status: 'active' }
  ]);
  await MongoOrgModel.create(tree.map((item) => ({ ...item, teamId })));
  await MongoOrgMemberModel.create([
    { teamId, orgId: parentId, tmbId: members[0]._id },
    { teamId, orgId: aId, tmbId: members[1]._id },
    { teamId, orgId: bId, tmbId: members[2]._id },
    { teamId, orgId: aId, tmbId: members[3]._id },
    { teamId, orgId: bId, tmbId: members[3]._id },
    { teamId, orgId: bId, tmbId: members[4]._id }
  ]);
  const base = {
    teamId,
    tmbId: String(members[0]._id),
    canManageMembers: true,
    expectedScope: 'team' as const
  };
  return { teamId, members, base };
};

describe('usage department subtree selection', () => {
  it('keeps parent and child selections independent while expanding selected ancestors to descendants', () => {
    expect([...getUsageDepartmentSubtreeIds({ departments: tree, ids: [aId, bId] })]).toEqual([
      aId,
      bId
    ]);
    expect([...getUsageDepartmentSubtreeIds({ departments: tree, ids: [parentId] })]).toEqual([
      parentId,
      aId,
      bId
    ]);
  });

  it('ignores unknown IDs, deduplicates case-insensitively, and requires complete path segments', () => {
    expect([...getUsageDepartmentSubtreeIds({ departments: tree, ids: [aId, foreignId] })]).toEqual(
      [aId]
    );

    const lower = 'abcdef1234567890abcdef12';
    const upper = lower.toUpperCase();
    for (const type of ['member', 'department', 'group'] as const) {
      expect(UsageSubjectFilterSchema.parse({ type, ids: [upper, lower] })).toEqual({
        type,
        ids: [lower]
      });
    }

    const collision = { _id: id(), name: 'Collision', path: '/root/parent-other', pathId: 'c' };
    expect(
      getUsageDepartmentSubtreeIds({
        departments: [...tree, collision],
        ids: [parentId]
      }).has(collision._id)
    ).toBe(false);
  });

  it('expands descendants across missing intermediate departments and supports legacy root', () => {
    const departments = [
      { _id: 'leaf', name: 'Leaf', path: '/missing/a/deleted', pathId: 'leaf' },
      { _id: 'other', name: 'Other', path: '/missing/a-other', pathId: 'other' },
      { _id: 'root', name: 'Root', path: '', pathId: '' },
      { _id: 'a', name: 'A', path: '/missing', pathId: 'a' }
    ];
    expect([...getUsageDepartmentSubtreeIds({ departments, ids: ['a'] })]).toEqual(['leaf', 'a']);
    expect([...getUsageDepartmentSubtreeIds({ departments, ids: ['root'] })]).toEqual([
      'leaf',
      'other',
      'root',
      'a'
    ]);
  });
});

describe('usage scope resolution', () => {
  it('short circuits self before any organizational lookup', async () => {
    const org = vi.spyOn(MongoOrgModel, 'find'),
      groups = vi.spyOn(MongoMemberGroupModel, 'find');
    try {
      const result = await resolveUsageScope({
        teamId: id(),
        tmbId: aId,
        canManageMembers: false,
        expectedScope: 'team',
        subjectFilter: { type: 'department', ids: [parentId] }
      });
      expect(result.scope).toEqual({ kind: 'self', tmbId: aId });
      expect(result.context).toMatchObject({
        scope: 'self',
        scopeChanged: true,
        canManageMembers: false,
        subjectFilter: { type: 'member', ids: [] },
        selectedItems: []
      });
      expect(org).not.toHaveBeenCalled();
      expect(groups).not.toHaveBeenCalled();
      expect(
        (await getUsageFilterOptions({ result, teamId: id(), offset: 0, pageSize: 10 })).options
      ).toEqual([]);
    } finally {
      org.mockRestore();
      groups.mockRestore();
    }
  });

  it('includes subtree members for a selected parent department while keeping selectedItems independent', async () => {
    const { base, members } = await fixture();
    const parentResult = await resolveUsageScope({
      ...base,
      subjectFilter: { type: 'department', ids: [parentId] }
    });
    expect(parentResult.scope).toEqual({
      kind: 'members',
      ids: expect.arrayContaining([0, 1, 2, 3].map((i) => String(members[i]._id)))
    });
    expect(parentResult.scope.kind === 'members' && parentResult.scope.ids).toHaveLength(4);
    expect(parentResult.context.selectedItems).toMatchObject([{ id: parentId, name: 'Parent' }]);

    const childrenResult = await resolveUsageScope({
      ...base,
      subjectFilter: { type: 'department', ids: [aId, bId] }
    });
    expect(childrenResult.scope).toEqual({
      kind: 'members',
      ids: expect.arrayContaining([1, 2, 3].map((i) => String(members[i]._id)))
    });
    expect(childrenResult.scope.kind === 'members' && childrenResult.scope.ids).toHaveLength(3);
    expect(childrenResult.context.selectedItems).toMatchObject([
      { id: aId, name: 'A' },
      { id: bId, name: 'B' }
    ]);
  });

  it('queries current relationships for historical scope and never widens an empty department', async () => {
    const { base, members } = await fixture();
    const request = {
      ...base,
      subjectFilter: { type: 'department' as const, ids: [aId] }
    };
    await MongoOrgMemberModel.updateOne({ orgId: aId, tmbId: members[1]._id }, { orgId: bId });
    expect((await resolveUsageScope(request)).scope).toEqual({
      kind: 'members',
      ids: [String(members[3]._id)]
    });
    expect(
      (
        await resolveUsageScope({
          ...base,
          subjectFilter: { type: 'department', ids: [emptyId] }
        })
      ).scope
    ).toEqual({ kind: 'none' });
  });

  it('resets all department selection for a deleted browsing directory, but only removes invalid selected nodes in queries', async () => {
    const { base, teamId } = await fixture();
    const subjectFilter = { type: 'department' as const, ids: [aId, emptyId] };
    await MongoOrgModel.deleteOne({ _id: aId });
    const queried = await resolveUsageScope({ ...base, subjectFilter });
    expect(queried.context).toMatchObject({
      subjectFilter: { type: 'department', ids: [emptyId] },
      notices: ['DEPARTMENT_INVALID'],
      selectionChanged: true,
      resetPagination: true
    });
    const browsed = await resolveUsageScope({ ...base, subjectFilter, departmentDirectoryId: aId });
    expect(browsed.context).toMatchObject({
      subjectFilter: { type: 'department', ids: [] },
      notices: ['ORG_PATH_RESET']
    });
    expect(browsed.directoryId).toBe('');
    const rootOptions = await getUsageFilterOptions({
      result: browsed,
      teamId,
      searchKey: 'NonexistentSearch',
      offset: 50,
      pageSize: 10
    });
    expect(rootOptions.options.map((item) => item.name)).toEqual(
      expect.arrayContaining(['Parent', 'Empty'])
    );
  });

  it('preserves missing member selections as unavailable, and includes leave and forbidden members', async () => {
    const { base, members } = await fixture();
    const missing = id();
    const result = await resolveUsageScope({
      ...base,
      subjectFilter: {
        type: 'member',
        ids: [String(members[2]._id), String(members[3]._id), missing, String(members[4]._id)]
      }
    });
    expect(result.scope).toEqual({
      kind: 'members',
      ids: [String(members[2]._id), String(members[3]._id)]
    });
    expect(result.context.selectedItems[2]).toMatchObject({
      id: missing,
      name: 'unknown',
      unavailable: true
    });
    expect(result.context.selectedItems[3]).toMatchObject({ name: 'unknown', unavailable: true });
    expect(result.context.selectionChanged).toBe(false);
    const onlyMissing = await resolveUsageScope({
      ...base,
      subjectFilter: { type: 'member', ids: [missing] }
    });
    expect(onlyMissing.scope).toEqual({ kind: 'none' });
  });

  it('validates groups, intersects corrupt relations, and resolves implicit default group membership', async () => {
    const { base, teamId, members } = await fixture();
    const groups = await MongoMemberGroupModel.create([
      { teamId, name: 'Group' },
      { teamId, name: 'Empty' },
      { teamId, name: DefaultGroupName }
    ]);
    await MongoGroupMemberModel.create(
      [2, 4].map((i) => ({ groupId: groups[0]._id, tmbId: members[i]._id }))
    );
    const groupScope = async (ids: string[]) =>
      resolveUsageScope({ ...base, subjectFilter: { type: 'group', ids } });
    expect((await groupScope([String(groups[0]._id)])).scope).toEqual({
      kind: 'members',
      ids: [String(members[2]._id)]
    });
    expect((await groupScope([String(groups[1]._id)])).scope).toEqual({ kind: 'none' });
    expect((await groupScope([String(groups[2]._id)])).scope).toEqual({
      kind: 'members',
      ids: expect.arrayContaining(members.slice(0, 4).map((item) => String(item._id)))
    });
    const invalid = await groupScope([foreignId, String(groups[1]._id)]);
    expect(invalid.context).toMatchObject({
      subjectFilter: { type: 'group', ids: [String(groups[1]._id)] },
      notices: ['GROUP_INVALID']
    });
    expect((await groupScope([foreignId])).scope).toEqual({ kind: 'all' });
  });

  it('canonicalizes department IDs and browsing directories', async () => {
    const { base, teamId, members } = await fixture();
    const orgId = 'abcdef000000000000000003';
    await MongoOrgModel.create({
      _id: orgId,
      teamId,
      name: 'Selected department',
      path: '/root',
      pathId: 'selected'
    });
    await MongoOrgMemberModel.create({ teamId, orgId, tmbId: members[0]._id });
    const result = await resolveUsageScope({
      ...base,
      subjectFilter: { type: 'department', ids: [orgId.toUpperCase()] },
      departmentDirectoryId: orgId.toUpperCase()
    });
    expect(result.scope).toEqual({ kind: 'members', ids: [String(members[0]._id)] });
    expect(result.directoryId).toBe(orgId);
    expect(result.context).toMatchObject({
      subjectFilter: { type: 'department', ids: [orgId] },
      notices: [],
      selectionChanged: false
    });
    const options = await getUsageFilterOptions({ result, teamId, offset: 0, pageSize: 50 });
    expect(options.departmentDirectory?.id).toBe(orgId);
    expect(options.breadcrumbs.at(-1)?.name).toBe('Selected department');
  });

  it('paginates by stable status order and filters department subtree and localized default group', async () => {
    const { base, teamId, members } = await fixture();
    const memberResult = await resolveUsageScope({
      ...base,
      subjectFilter: { type: 'member', ids: [String(members[3]._id)] }
    });
    const memberOptions = await getUsageFilterOptions({
      result: memberResult,
      teamId,
      offset: 0,
      pageSize: 20
    });
    expect(memberOptions.options.map((item) => item.status)).toEqual([
      TeamMemberStatusEnum.active,
      TeamMemberStatusEnum.active,
      TeamMemberStatusEnum.leave,
      TeamMemberStatusEnum.forbidden
    ]);

    const deptResult = await resolveUsageScope({
      ...base,
      subjectFilter: { type: 'department', ids: [emptyId] },
      departmentDirectoryId: parentId
    });
    const deptOptions = await getUsageFilterOptions({
      result: deptResult,
      teamId,
      offset: 0,
      pageSize: 50
    });
    expect(deptOptions.options.map((item) => item.id).sort()).toEqual([aId, bId].sort());
    expect(deptOptions.breadcrumbs.map((item) => item.name)).toEqual(['Team', 'Parent']);
    expect(
      (
        await getUsageFilterOptions({
          result: deptResult,
          teamId,
          offset: 0,
          pageSize: 50,
          searchKey: 'Empty'
        })
      ).options
    ).toEqual([]);

    const groups = await MongoMemberGroupModel.create([
      { teamId, name: DefaultGroupName },
      { teamId, name: 'Default group 2' },
      { teamId, name: 'Other' }
    ]);
    const groupResult = await resolveUsageScope({
      ...base,
      subjectFilter: { type: 'group', ids: [] }
    });
    const first = await getUsageFilterOptions({
      result: groupResult,
      teamId,
      searchKey: 'DEFAULT GROUP',
      defaultGroupName: 'Default group',
      offset: 0,
      pageSize: 1
    });
    expect(first.options).toMatchObject([{ id: String(groups[0]._id), isDefault: true }]);
    expect(first).toMatchObject({ total: 2, hasMore: true });
  });
});

describe('usage common match', () => {
  it('uses ObjectIds, closed date bounds, OR sources and escaped case insensitive name search', () => {
    const teamId = id();
    const match = buildUsageMatch({
      teamId,
      scope: { kind: 'self', tmbId: aId },
      filters: {
        dateStart: '2026-11-01T00:00:00+08:00',
        dateEnd: '2026-11-01T23:59:59.999+08:00',
        projectName: 'App.[a]'
      }
    });
    expect(match.teamId).toBeInstanceOf(Types.ObjectId);
    expect(match.tmbId).toBeInstanceOf(Types.ObjectId);
    expect(match.time).toEqual({
      $gte: new Date('2026-10-31T16:00:00Z'),
      $lte: new Date('2026-11-01T15:59:59.999Z')
    });
    expect(match.appName?.$regex.test('APP.[a]')).toBe(true);
    expect(match.appName?.$regex.test('Appxa')).toBe(false);
    expect(match.source).toEqual({ $exists: true });

    const unrestricted = buildUsageMatch({
      teamId,
      scope: { kind: 'none' },
      filters: { dateStart: '2026-11-01T00:00:00Z', dateEnd: '2026-11-02T00:00:00Z' }
    });
    expect(unrestricted.tmbId).toEqual({ $in: [] });
  });
});
