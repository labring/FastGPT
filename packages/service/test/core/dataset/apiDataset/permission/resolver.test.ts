import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import {
  getPermissionSubjectKey,
  resolveApiDatasetPermissionItems,
  ensureOwnerAccess,
  type PermissionSubjectResolverDeps
} from '@fastgpt/service/core/dataset/apiDataset/permission/resolver';

const findUsernamesByUserIds = vi.fn();
const findActiveTeamMemberIdsByUserIds = vi.fn();
const findActiveTeamMemberIds = vi.fn();
const findTeamMemberGroupIds = vi.fn();
const findTeamOrgIds = vi.fn();

const deps: PermissionSubjectResolverDeps = {
  findUsernamesByUserIds,
  findActiveTeamMemberIdsByUserIds,
  findActiveTeamMemberIds,
  findTeamMemberGroupIds,
  findTeamOrgIds
};

beforeEach(() => {
  vi.clearAllMocks();
  findUsernamesByUserIds.mockResolvedValue(new Map());
  findActiveTeamMemberIdsByUserIds.mockResolvedValue(new Map());
  findActiveTeamMemberIds.mockResolvedValue(new Set());
  findTeamMemberGroupIds.mockResolvedValue(new Set());
  findTeamOrgIds.mockResolvedValue(new Set());
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
    findUsernamesByUserIds.mockResolvedValue(new Map([['user-1', 'alice']]));
    findActiveTeamMemberIdsByUserIds.mockResolvedValue(new Map([['user-1', 'tmb-1']]));

    const result = await resolveApiDatasetPermissionItems({
      teamId: 'team-1',
      itemsByFileId: new Map([['file-1', [{ username: 'alice', permission: 4 }]]]),
      deps
    });

    expect(result.get('file-1')).toEqual([{ tmbId: 'tmb-1', permission: 4 }]);
    expect(findActiveTeamMemberIdsByUserIds).toHaveBeenCalledWith({
      teamId: 'team-1',
      userIds: ['user-1'],
      tx: undefined
    });
  });

  it('excludes non-active (leave/forbidden) members for both username and tmbId queries', async () => {
    const activeTmbId = '64b7f4c2f1a2b3c4d5e6f7a1';
    const leftTmbId = '64b7f4c2f1a2b3c4d5e6f7a2';
    findUsernamesByUserIds.mockResolvedValue(
      new Map([
        ['user-active', 'alice'],
        ['user-left', 'bob']
      ])
    );
    findActiveTeamMemberIdsByUserIds.mockResolvedValue(new Map([['user-active', 'tmb-alice']]));
    findActiveTeamMemberIds.mockResolvedValue(new Set([activeTmbId]));

    const result = await resolveApiDatasetPermissionItems({
      teamId: 'team-1',
      itemsByFileId: new Map([
        [
          'file-1',
          [
            { username: 'alice', permission: 4 },
            { username: 'bob', permission: 2 },
            { tmbId: activeTmbId, permission: 4 },
            { tmbId: leftTmbId, permission: 4294967295 }
          ]
        ]
      ]),
      deps
    });

    expect(result.get('file-1')).toEqual([
      { tmbId: 'tmb-alice', permission: 4 },
      { tmbId: activeTmbId, permission: 4 }
    ]);
    expect(findActiveTeamMemberIds).toHaveBeenCalledWith({
      teamId: 'team-1',
      tmbIds: [activeTmbId, leftTmbId],
      tx: undefined
    });
  });

  it('drops unknown usernames and unknown subjects instead of failing the round', async () => {
    findUsernamesByUserIds.mockResolvedValue(new Map([['user-1', 'alice']]));

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
      ]),
      deps
    });

    expect(result.get('file-1')).toEqual([]);
  });

  it('filters invalid roles and unknown ids', async () => {
    findActiveTeamMemberIds.mockResolvedValue(new Set(['64b7f4c2f1a2b3c4d5e6f7a8']));

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
      ]),
      deps
    });

    expect(result.get('file-1')).toEqual([]);
  });

  it('keeps the strongest permission for duplicate subjects regardless of occurrence order', async () => {
    findActiveTeamMemberIds.mockResolvedValue(new Set(['tmb-1']));

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
      ]),
      deps
    });

    // role 是位掩码，2(write) 比 4(read) 强，不能按数值大小取
    expect(result.get('file-1')).toEqual([{ tmbId: 'tmb-1', permission: 2 }]);
  });

  it('ranks manage above read and keeps the owner role as a valid value', async () => {
    findActiveTeamMemberIds.mockResolvedValue(new Set(['tmb-1', 'tmb-2']));

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
      ]),
      deps
    });

    expect(result.get('file-1')).toEqual([
      { tmbId: 'tmb-1', permission: 1 },
      { tmbId: 'tmb-2', permission: 4294967295 }
    ]);
  });

  it('preserves undefined snapshots and validates groups / orgs in the team', async () => {
    findTeamMemberGroupIds.mockResolvedValue(new Set(['64b7f4c2f1a2b3c4d5e6f7a8']));
    findTeamOrgIds.mockResolvedValue(new Set());

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
      ]),
      deps
    });

    expect(result.get('missing')).toBeUndefined();
    expect(result.get('file-1')).toEqual([{ groupId: '64b7f4c2f1a2b3c4d5e6f7a8', permission: 2 }]);
    expect(findTeamMemberGroupIds).toHaveBeenCalledWith({
      teamId: 'team-1',
      groupIds: ['64b7f4c2f1a2b3c4d5e6f7a8'],
      tx: undefined
    });
  });
});
