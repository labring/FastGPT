import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { Permission } from '@fastgpt/global/support/permission/controller';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { checkRoleUpdateConflict } from '@fastgpt/global/support/permission/utils';
import { describe, expect, it } from 'vitest';

const fakeClb = ({
  role,
  selfRole,
  tmbId
}: {
  role: PermissionValueType;
  selfRole?: PermissionValueType;
  tmbId: string;
}): CollaboratorItemType => ({
  avatar: 'fakeAvatar',
  name: 'fakeName',
  permission: new Permission({ role: role }),
  selfPermission: selfRole ? new Permission({ role: selfRole }) : undefined,
  teamId: 'fakeTeamId',
  tmbId
});

describe('Test checkRoleUpdateConflict', () => {
  it('There is no any old collaborator, should return false', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [],
      oldChildClbs: [],
      newChildClbs: [fakeClb({ role: 0b001, tmbId: 'fakeTmbId1' })]
    });
    expect(result).toBe(false);
  });
  it('There is no parent collaborator, should return false', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [],
      oldChildClbs: [fakeClb({ role: 0b011, tmbId: 'fakeTmbId1' })],
      newChildClbs: [fakeClb({ role: 0b001, tmbId: 'fakeTmbId2' })]
    });
    expect(result).toBe(false);
  });
  it("Edit parent's permission, should return true", () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [fakeClb({ role: 0b011, tmbId: 'fakeTmbId1' })],
      oldChildClbs: [fakeClb({ role: 0b011, tmbId: 'fakeTmbId1' })],
      newChildClbs: [fakeClb({ role: 0b010, tmbId: 'fakeTmbId1' })]
    });
    expect(result).toBe(true);
  });
  it("Edit permission but parent's permission bit is not set, should return false", () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [fakeClb({ role: 0b1001, tmbId: 'fakeTmbId1' })],
      oldChildClbs: [fakeClb({ role: 0b1111, tmbId: 'fakeTmbId1' })],
      newChildClbs: [fakeClb({ role: 0b1001, tmbId: 'fakeTmbId1' })]
    });
    expect(result).toBe(false);
  });
  it('add new clb, should return false', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [fakeClb({ role: 0b1001, tmbId: 'fakeTmbId1' })],
      oldChildClbs: [fakeClb({ role: 0b1111, tmbId: 'fakeTmbId1' })],
      newChildClbs: [fakeClb({ role: 0b1001, tmbId: 'fakeTmbId2' })]
    });
    expect(result).toBe(false);
  });
  it('add clb, no oldChildClbs', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [fakeClb({ role: 0b1001, tmbId: 'fakeTmbId1' })],
      oldChildClbs: [],
      newChildClbs: [fakeClb({ role: 0b1001, tmbId: 'fakeTmbId1' })]
    });
    expect(result).toBe(true);
  });
  it('add clb, no oldChildClbs, false', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [fakeClb({ role: 0b1001, tmbId: 'fakeTmbId1' })],
      oldChildClbs: [],
      newChildClbs: [fakeClb({ role: 0b0110, tmbId: 'fakeTmbId1' })]
    });
    expect(result).toBe(false);
  });
});
