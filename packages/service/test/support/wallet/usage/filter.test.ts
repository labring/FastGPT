import { describe, expect, it, vi } from 'vitest';
import {
  buildUsageMatch,
  createUsageDepartmentTree,
  getUsageDepartmentSelection,
  normalizeUsageDepartmentRules,
  toggleUsageDepartment
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
const include = (orgId: string) => ({ orgId, include: true });
const exclude = (orgId: string) => ({ orgId, include: false });

/** 用真实关系验证空范围和跨团队交集，不依赖管理侧默认建树行为。 */
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
    expectedScope: 'team' as const,
    requestKey: 'test'
  };
  return { teamId, members, base };
};

describe('usage department rules', () => {
  it('keeps child labels and excludes parent direct members until the parent is selected', () => {
    const rules = [include(aId), include(bId)];
    const result = getUsageDepartmentSelection({ departments: tree, rules });
    expect([...result.selected]).toEqual([aId, bId]);
    expect(result.states.find((item) => item.orgId === parentId)?.state).toBe('partial');
    expect(toggleUsageDepartment({ departments: tree, rules, orgId: parentId })).toEqual([
      include(parentId)
    ]);
  });

  it('uses nearest ancestor, keeps parent intent on exclusion, and toggles partial to all', () => {
    const rules = toggleUsageDepartment({
      departments: tree,
      rules: [include(parentId), include(emptyId)],
      orgId: aId
    });
    expect(rules).toEqual([include(parentId), include(emptyId), exclude(aId)]);
    const { selected, states } = getUsageDepartmentSelection({ departments: tree, rules });
    expect([...selected]).toEqual([parentId, bId, emptyId]);
    expect(states.find((item) => item.orgId === parentId)?.state).toBe('partial');
    expect(toggleUsageDepartment({ departments: tree, rules, orgId: parentId })).toEqual([
      include(emptyId),
      include(parentId)
    ]);
    expect(
      toggleUsageDepartment({ departments: tree, rules: [include(parentId)], orgId: parentId })
    ).toEqual([]);
  });

  it('removes orphan exclusions and nonexistent nodes without merging sibling inclusions', () => {
    expect(
      normalizeUsageDepartmentRules({
        departments: tree,
        rules: [exclude(parentId), include(aId), include(bId), include(foreignId)]
      })
    ).toEqual([include(aId), include(bId)]);
    expect(
      UsageSubjectFilterSchema.safeParse({
        type: 'department',
        rules: [include(aId), exclude(aId)]
      }).success
    ).toBe(false);
    expect(UsageSubjectFilterSchema.parse({ type: 'member', ids: [aId, aId] })).toEqual({
      type: 'member',
      ids: [aId]
    });
    expect(UsageSubjectFilterSchema.safeParse({ type: 'group', ids: [], rules: [] }).success).toBe(
      false
    );
  });

  it('deduplicates ID casing and rejects conflicting rules for the same department', () => {
    const lower = 'abcdef1234567890abcdef12';
    const upper = lower.toUpperCase();
    for (const type of ['member', 'group'] as const) {
      expect(UsageSubjectFilterSchema.parse({ type, ids: [upper, lower] })).toEqual({
        type,
        ids: [lower]
      });
    }
    expect(
      UsageSubjectFilterSchema.safeParse({
        type: 'department',
        rules: [include(upper), exclude(lower)]
      }).success
    ).toBe(false);
  });

  it('requires complete path segments rather than prefix collisions', () => {
    const collision = { _id: id(), name: 'Collision', path: '/root/parent-other', pathId: 'c' };
    expect(
      getUsageDepartmentSelection({
        departments: [...tree, collision],
        rules: [include(parentId)]
      }).selected.has(collision._id)
    ).toBe(false);
  });

  it('inherits across missing intermediate departments and keeps input order with a legacy root', () => {
    const departments = [
      { _id: 'leaf', name: 'Leaf', path: '/missing/a/deleted', pathId: 'leaf' },
      { _id: 'other', name: 'Other', path: '/missing/a-other', pathId: 'other' },
      { _id: 'root', name: 'Root', path: '', pathId: '' },
      { _id: 'a', name: 'A', path: '/missing', pathId: 'a' }
    ];
    const tree = createUsageDepartmentTree(departments);
    const rules = [include('root'), exclude('a'), include('leaf')];
    expect(normalizeUsageDepartmentRules({ departments, rules, tree })).toEqual(rules);
    const result = getUsageDepartmentSelection({ departments, rules, tree });
    expect([...result.selected]).toEqual(['leaf', 'other', 'root']);
    expect(result.states).toEqual([
      { orgId: 'leaf', state: 'all' },
      { orgId: 'other', state: 'all' },
      { orgId: 'root', state: 'partial' },
      { orgId: 'a', state: 'partial' }
    ]);
    expect(toggleUsageDepartment({ departments, rules, tree, orgId: 'leaf' })).toEqual([
      include('root'),
      exclude('a')
    ]);
    // 复用结构索引不能保留上一次规则计算的状态。
    expect(getUsageDepartmentSelection({ departments, rules: [], tree }).selected.size).toBe(0);
  });

  it('calculates wide organizations with thousands of explicit child selections', () => {
    const children = Array.from({ length: 10000 }, (_, index) => ({
      _id: `child-${index}`,
      name: `Child ${index}`,
      path: '/root',
      pathId: `child-${index}`
    }));
    const departments = [...children, { _id: 'root', name: 'Root', path: '', pathId: 'root' }];
    const tree = createUsageDepartmentTree(departments);
    const rules = children.filter((_, index) => index % 2 === 0).map((item) => include(item._id));
    const normalized = normalizeUsageDepartmentRules({ departments, rules, tree });
    expect(normalized).toEqual(rules);
    const result = getUsageDepartmentSelection({ departments, rules: normalized, tree });
    expect(result.selected.size).toBe(5000);
    expect(result.states.filter((item) => item.state === 'all')).toHaveLength(5000);
    expect(result.states.filter((item) => item.state === 'none')).toHaveLength(5000);
    expect(result.states.at(-1)).toEqual({ orgId: 'root', state: 'partial' });
    expect(toggleUsageDepartment({ departments, rules, tree, orgId: 'root' })).toEqual([
      include('root')
    ]);
  });

  it('handles deep paths iteratively without requiring intermediate department records', () => {
    const departments = [
      { _id: 'root', name: 'Root', path: '', pathId: '' },
      {
        _id: 'leaf',
        name: 'Leaf',
        path: `/${Array.from({ length: 20000 }, (_, index) => `p${index}`).join('/')}`,
        pathId: 'leaf'
      }
    ];
    const result = getUsageDepartmentSelection({ departments, rules: [include('root')] });
    expect([...result.selected]).toEqual(['root', 'leaf']);
    expect(result.states.every((item) => item.state === 'all')).toBe(true);
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
        requestKey: 'self',
        subjectFilter: { type: 'department', rules: [include(parentId)] }
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

  it('unions included departments before member intersection, retaining multi-department members', async () => {
    const { base, members } = await fixture();
    const result = await resolveUsageScope({
      ...base,
      subjectFilter: { type: 'department', rules: [include(parentId), exclude(aId)] }
    });
    expect(result.scope).toEqual({
      kind: 'members',
      ids: expect.arrayContaining([0, 2, 3].map((i) => String(members[i]._id)))
    });
    expect(result.scope.kind === 'members' && result.scope.ids).toHaveLength(3);
    expect(result.context.selectedItems).toMatchObject([{ id: parentId, partial: true }]);
  });

  it('queries current relationships for historical scope and never widens an empty department', async () => {
    const { base, members } = await fixture();
    const request = {
      ...base,
      subjectFilter: { type: 'department' as const, rules: [include(aId)] }
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
          subjectFilter: { type: 'department', rules: [include(emptyId)] }
        })
      ).scope
    ).toEqual({ kind: 'none' });
  });

  it('resets all department selection for a deleted browsing directory, but only removes invalid selected nodes in queries', async () => {
    const { base } = await fixture();
    const subjectFilter = { type: 'department' as const, rules: [include(aId), include(emptyId)] };
    await MongoOrgModel.deleteOne({ _id: aId });
    const queried = await resolveUsageScope({ ...base, subjectFilter });
    expect(queried.context).toMatchObject({
      subjectFilter: { type: 'department', rules: [include(emptyId)] },
      notices: ['DEPARTMENT_INVALID'],
      selectionChanged: true,
      resetPagination: true
    });
    const browsed = await resolveUsageScope({ ...base, subjectFilter, departmentDirectoryId: aId });
    expect(browsed.context).toMatchObject({
      subjectFilter: { type: 'department', rules: [] },
      notices: ['ORG_PATH_RESET']
    });
    expect(browsed.directoryId).toBe('');
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

  it('resolves uppercase member and group IDs without unavailable labels or widening scope', async () => {
    const { base, teamId } = await fixture();
    const memberId = 'abcdef000000000000000001';
    const groupId = 'abcdef000000000000000002';
    await MongoTeamMember.create({
      _id: memberId,
      teamId,
      userId: id(),
      name: 'Selected member',
      status: 'active'
    });
    await MongoMemberGroupModel.create({ _id: groupId, teamId, name: 'Selected group' });
    await MongoGroupMemberModel.create({ groupId, tmbId: memberId });

    for (const [type, selectedId] of [
      ['member', memberId],
      ['group', groupId]
    ] as const) {
      const result = await resolveUsageScope({
        ...base,
        subjectFilter: { type, ids: [selectedId.toUpperCase(), selectedId] }
      });
      expect(result.scope).toEqual({ kind: 'members', ids: [memberId] });
      expect(result.context.subjectFilter).toEqual({ type, ids: [selectedId] });
      expect(result.context.notices).toEqual([]);
      expect(result.context.selectionChanged).toBe(false);
      expect(result.context.selectedItems).toHaveLength(1);
      expect(result.context.selectedItems[0]).not.toHaveProperty('unavailable');
    }
  });

  it('canonicalizes department rules, browsing directories, visible IDs and toggle commands', async () => {
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
      subjectFilter: { type: 'department', rules: [include(orgId.toUpperCase())] },
      departmentDirectoryId: orgId.toUpperCase(),
      visibleDepartmentIds: [orgId.toUpperCase()]
    });
    expect(result.scope).toEqual({ kind: 'members', ids: [String(members[0]._id)] });
    expect(result.directoryId).toBe(orgId);
    expect(result.context).toMatchObject({
      subjectFilter: { type: 'department', rules: [include(orgId)] },
      notices: [],
      selectionChanged: false,
      departmentCheckStates: [{ orgId, state: 'all' }]
    });
    const toggled = await resolveUsageScope({
      ...base,
      subjectFilter: { type: 'department', rules: [] },
      departmentAction: { orgId: orgId.toUpperCase(), directoryId: orgId.toUpperCase() }
    });
    expect(toggled.context.subjectFilter).toEqual({
      type: 'department',
      rules: [include(orgId)]
    });
    expect(toggled.context.notices).toEqual([]);
    expect(toggled.scope).toEqual(result.scope);
    const options = await getUsageFilterOptions({ result, teamId, offset: 0, pageSize: 50 });
    expect(options.departmentDirectory?.id).toBe(orgId);
    expect(options.breadcrumbs.at(-1)?.name).toBe('Selected department');
  });

  it('paginates by stable status order while selected data is independent of search and page', async () => {
    const { base, teamId, members } = await fixture();
    const result = await resolveUsageScope({
      ...base,
      subjectFilter: { type: 'member', ids: [String(members[3]._id)] }
    });
    const options = await getUsageFilterOptions({ result, teamId, offset: 0, pageSize: 20 });
    expect(options.options.map((item) => item.status)).toEqual([
      TeamMemberStatusEnum.active,
      TeamMemberStatusEnum.active,
      TeamMemberStatusEnum.leave,
      TeamMemberStatusEnum.forbidden
    ]);
    const search = await getUsageFilterOptions({
      result,
      teamId,
      offset: 0,
      pageSize: 1,
      searchKey: 'Direct'
    });
    expect(search.options).toHaveLength(1);
    expect(search.context.selectedItems[0].name).toBe('Both');
  });

  it('limits department search to the current subtree without modifying selections', async () => {
    const { base, teamId } = await fixture();
    const result = await resolveUsageScope({
      ...base,
      subjectFilter: { type: 'department', rules: [include(emptyId)] },
      departmentDirectoryId: parentId
    });
    const options = await getUsageFilterOptions({ result, teamId, offset: 0, pageSize: 50 });
    expect(options.options.map((item) => item.id).sort()).toEqual([aId, bId].sort());
    expect(options.breadcrumbs.map((item) => item.name)).toEqual(['Team', 'Parent']);
    expect(
      (await getUsageFilterOptions({ result, teamId, offset: 0, pageSize: 50, searchKey: 'Empty' }))
        .options
    ).toEqual([]);
    expect(result.context.subjectFilter).toEqual({ type: 'department', rules: [include(emptyId)] });
  });

  it('matches the default group display name before counting and paginating within the team', async () => {
    const { base, teamId } = await fixture();
    const groups = await MongoMemberGroupModel.create([
      { teamId, name: DefaultGroupName },
      { teamId, name: 'Default group 2' },
      { teamId, name: 'Other' },
      { teamId: id(), name: DefaultGroupName }
    ]);
    const result = await resolveUsageScope({
      ...base,
      subjectFilter: { type: 'group', ids: [] }
    });
    const request = {
      result,
      teamId,
      searchKey: 'DEFAULT GROUP',
      defaultGroupName: 'Default group',
      pageSize: 1
    };
    const first = await getUsageFilterOptions({ ...request, offset: 0 });
    expect(first.options).toMatchObject([{ id: String(groups[0]._id), isDefault: true }]);
    expect(first).toMatchObject({ total: 2, hasMore: true });
    const second = await getUsageFilterOptions({ ...request, offset: 1 });
    expect(second.options).toMatchObject([{ id: String(groups[1]._id) }]);
    expect(second).toMatchObject({ total: 2, hasMore: false });
    const unmatched = await getUsageFilterOptions({
      ...request,
      searchKey: 'Other',
      offset: 0
    });
    expect(unmatched.options).toMatchObject([{ id: String(groups[2]._id) }]);
    expect(unmatched.total).toBe(1);
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
    expect(unrestricted.source).toEqual({ $exists: true });
    expect(unrestricted.appName).toEqual({ $exists: true });
  });
});
