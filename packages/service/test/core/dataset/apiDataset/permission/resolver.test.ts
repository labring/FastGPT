import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';

const userFind = vi.fn();
const teamMemberFind = vi.fn();
const groupFind = vi.fn();
const orgFind = vi.fn();

vi.mock('@fastgpt/service/support/user/schema', () => ({
  MongoUser: { find: userFind }
}));
vi.mock('@fastgpt/service/support/user/team/teamMemberSchema', () => ({
  MongoTeamMember: { find: teamMemberFind }
}));
vi.mock('@fastgpt/service/support/permission/memberGroup/memberGroupSchema', () => ({
  MongoMemberGroupModel: { find: groupFind }
}));
vi.mock('@fastgpt/service/support/permission/org/orgSchema', () => ({
  MongoOrgModel: { find: orgFind }
}));

const { getPermissionSubjectKey, resolveApiDatasetPermissionItems, ensureOwnerAccess } =
  await import('@fastgpt/service/core/dataset/apiDataset/permission/resolver');

const lean = <T>(rows: T[]) => ({ lean: vi.fn().mockResolvedValue(rows) });

beforeEach(() => {
  vi.clearAllMocks();
  userFind.mockReturnValue(lean([]));
  teamMemberFind.mockReturnValue(lean([]));
  groupFind.mockReturnValue(lean([]));
  orgFind.mockReturnValue(lean([]));
});

describe('getPermissionSubjectKey', () => {
  it('prefixes subject ids by type', () => {
    expect(getPermissionSubjectKey({ tmbId: 'a', permission: 4 })).toBe('tmb:a');
    expect(getPermissionSubjectKey({ groupId: 'b', permission: 4 })).toBe('group:b');
    expect(getPermissionSubjectKey({ orgId: 'c', permission: 4 })).toBe('org:c');
    expect(getPermissionSubjectKey({} as CollaboratorItemType)).toBe('unknown');
  });
});

describe('ensureOwnerAccess', () => {
  const ownerTmbId = 'owner-tmb';

  it('appends the owner row when the list has no owner, including the empty list', () => {
    expect(ensureOwnerAccess({ collaborators: [], ownerTmbId })).toEqual([
      { tmbId: ownerTmbId, permission: 4294967295 }
    ]);
    expect(
      ensureOwnerAccess({ collaborators: [{ tmbId: 't1', permission: 4 }], ownerTmbId })
    ).toEqual([
      { tmbId: 't1', permission: 4 },
      { tmbId: ownerTmbId, permission: 4294967295 }
    ]);
  });

  it('keeps an external manager and still ensures the owner row', () => {
    // 外部只给 manage 时，若不再补 owner，知识库 owner 会彻底失去自己库里的文件
    const collaborators = [{ tmbId: 't1', permission: 1 }];
    expect(ensureOwnerAccess({ collaborators, ownerTmbId })).toEqual([
      { tmbId: 't1', permission: 1 },
      { tmbId: ownerTmbId, permission: 4294967295 }
    ]);
    expect(collaborators).toHaveLength(1);
  });

  it('leaves the list untouched when any owner row exists', () => {
    const withOwnerRole = [{ tmbId: 't1', permission: 4294967295 }];
    expect(ensureOwnerAccess({ collaborators: withOwnerRole, ownerTmbId })).toBe(withOwnerRole);
  });

  it('upgrades the owner subject in place instead of appending a duplicate row', () => {
    // 同一 subject 只能有一行（唯一索引按 subject 建立），追加会撞唯一索引
    expect(
      ensureOwnerAccess({
        collaborators: [
          { tmbId: 't1', permission: 4 },
          { tmbId: ownerTmbId, permission: 2 }
        ],
        ownerTmbId
      })
    ).toEqual([
      { tmbId: 't1', permission: 4 },
      { tmbId: ownerTmbId, permission: 4294967295 }
    ]);
  });
});

describe('resolveApiDatasetPermissionItems', () => {
  it('resolves usernames through user → teamMember within the team', async () => {
    userFind.mockReturnValue(lean([{ _id: 'user-1', username: 'alice' }]));
    teamMemberFind.mockImplementation((filter: Record<string, unknown>) =>
      lean(filter.userId ? [{ _id: 'tmb-1', userId: 'user-1' }] : [])
    );

    const result = await resolveApiDatasetPermissionItems({
      teamId: 'team-1',
      itemsByFileId: new Map([['file-1', [{ username: 'alice', permission: 4 }]]])
    });

    expect(result.get('file-1')).toEqual([{ tmbId: 'tmb-1', permission: 4 }]);
    // 第二跳必须限定在当前团队
    expect(teamMemberFind).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'team-1', userId: { $in: ['user-1'] } }),
      expect.anything()
    );
  });

  it('drops unknown usernames and unknown subjects instead of failing the round', async () => {
    userFind.mockReturnValue(lean([{ _id: 'user-1', username: 'alice' }]));
    teamMemberFind.mockImplementation((filter: Record<string, unknown>) =>
      lean(filter.userId ? [] : [])
    );

    const result = await resolveApiDatasetPermissionItems({
      teamId: 'team-1',
      itemsByFileId: new Map([
        [
          'file-1',
          [
            { username: 'alice', permission: 4 },
            { tmbId: '64b7f4c2f1a2b3c4d5e6f7a8', permission: 2 }
          ]
        ]
      ])
    });

    expect(result.get('file-1')).toEqual([]);
  });

  it('filters invalid roles and malformed object ids', async () => {
    teamMemberFind.mockReturnValue(lean([{ _id: '64b7f4c2f1a2b3c4d5e6f7a8' }]));

    const result = await resolveApiDatasetPermissionItems({
      teamId: 'team-1',
      itemsByFileId: new Map([
        [
          'file-1',
          [
            { tmbId: '64b7f4c2f1a2b3c4d5e6f7a8', permission: 7 }, // 掩码不是合法 role
            { tmbId: 'not-an-objectid', permission: 4 }
          ]
        ]
      ])
    });

    expect(result.get('file-1')).toEqual([]);
    // 非法 id 在查询前就被丢弃，不会交给 Mongoose
    const idFilter = teamMemberFind.mock.calls.at(-1)?.[0] as { _id: { $in: unknown[] } };
    expect(idFilter._id.$in).toHaveLength(1);
  });

  it('keeps the strongest permission for duplicate subjects regardless of occurrence order', async () => {
    teamMemberFind.mockReturnValue(lean([{ _id: 'tmb-1' }]));

    const result = await resolveApiDatasetPermissionItems({
      teamId: 'team-1',
      itemsByFileId: new Map([
        [
          'file-1',
          [
            { tmbId: 'tmb-1', permission: 4 },
            { tmbId: 'tmb-1', permission: 2 }
          ]
        ]
      ])
    });

    // role 是位掩码，2(write) 比 4(read) 强，不能按数值大小取
    expect(result.get('file-1')).toEqual([{ tmbId: 'tmb-1', permission: 2 }]);
  });

  it('ranks manage above read and keeps the owner role as a valid value', async () => {
    teamMemberFind.mockReturnValue(lean([{ _id: 'tmb-1' }, { _id: 'tmb-2' }]));

    const result = await resolveApiDatasetPermissionItems({
      teamId: 'team-1',
      itemsByFileId: new Map([
        [
          'file-1',
          [
            { tmbId: 'tmb-1', permission: 4 },
            { tmbId: 'tmb-1', permission: 1 },
            { tmbId: 'tmb-2', permission: 4 },
            { tmbId: 'tmb-2', permission: 4294967295 }
          ]
        ]
      ])
    });

    expect(result.get('file-1')).toEqual([
      { tmbId: 'tmb-1', permission: 1 },
      { tmbId: 'tmb-2', permission: 4294967295 }
    ]);
  });

  it('preserves undefined snapshots and validates groups / orgs in the team', async () => {
    groupFind.mockReturnValue(lean([{ _id: '64b7f4c2f1a2b3c4d5e6f7a8' }]));
    orgFind.mockReturnValue(lean([]));

    const result = await resolveApiDatasetPermissionItems({
      teamId: 'team-1',
      itemsByFileId: new Map([
        ['missing', undefined],
        [
          'file-1',
          [
            { groupId: '64b7f4c2f1a2b3c4d5e6f7a8', permission: 2 },
            { orgId: '64b7f4c2f1a2b3c4d5e6f7a8', permission: 1 }
          ]
        ]
      ])
    });

    expect(result.get('missing')).toBeUndefined();
    expect(result.get('file-1')).toEqual([{ groupId: '64b7f4c2f1a2b3c4d5e6f7a8', permission: 2 }]);
    expect(groupFind).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'team-1' }), '_id');
  });
});
