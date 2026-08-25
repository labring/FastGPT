import { describe, expect, it } from 'vitest';
import {
  ManageRoleVal,
  OwnerRoleVal,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import {
  calculateInheritedResourceCollaborators,
  createInheritedResourceCollaboratorCalculator,
  mergeResourceCollaborators,
  shouldInheritResourcePermission,
  toInheritedCollaborators
} from '@fastgpt/service/support/permission/resourcePermissionPolicy';
import { getCollaboratorId } from '@fastgpt/global/support/permission/utils';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';

const user = (tmbId: string, permission: number) => ({ tmbId, permission });

const permissionsByUser = (collaborators: CollaboratorItemType[]) =>
  new Map(
    collaborators.map((collaborator) => [getCollaboratorId(collaborator), collaborator.permission])
  );

describe('shouldInheritResourcePermission', () => {
  it('treats the missing legacy flag as enabled', () => {
    expect(shouldInheritResourcePermission(undefined)).toBe(true);
    expect(shouldInheritResourcePermission(true)).toBe(true);
    expect(shouldInheritResourcePermission(false)).toBe(false);
  });
});

describe('toInheritedCollaborators', () => {
  it('converts an owner inherited from a parent into manage', () => {
    expect(
      toInheritedCollaborators([user('owner', OwnerRoleVal), user('reader', ReadRoleVal)])
    ).toEqual([user('owner', ManageRoleVal), user('reader', ReadRoleVal)]);
  });
});

describe('mergeResourceCollaborators', () => {
  it('keeps parent access and lets a child add an owner', () => {
    const result = mergeResourceCollaborators({
      parentCollaborators: [user('parent-owner', OwnerRoleVal), user('reader', ReadRoleVal)],
      childCollaborators: [user('child-owner', OwnerRoleVal)]
    });

    expect(permissionsByUser(result)).toEqual(
      new Map([
        ['parent-owner', ManageRoleVal],
        ['reader', ReadRoleVal],
        ['child-owner', OwnerRoleVal]
      ])
    );
  });

  it('merges equal collaborators without losing the child role', () => {
    const result = mergeResourceCollaborators({
      parentCollaborators: [user('same', ReadRoleVal)],
      childCollaborators: [user('same', WriteRoleVal)]
    });

    expect(result).toEqual([user('same', ReadRoleVal | WriteRoleVal)]);
  });
});

describe('calculateInheritedResourceCollaborators', () => {
  it('matches the reusable calculator result', () => {
    const props = {
      oldParentCollaborators: [user('reader', ReadRoleVal)],
      newParentCollaborators: [user('reader', WriteRoleVal)],
      childCollaborators: [user('reader', ReadRoleVal), user('extra', ManageRoleVal)]
    };

    const calculator = createInheritedResourceCollaboratorCalculator({
      oldParentCollaborators: props.oldParentCollaborators,
      newParentCollaborators: props.newParentCollaborators
    });

    expect(calculator(props.childCollaborators)).toEqual(
      calculateInheritedResourceCollaborators(props)
    );
  });

  it('removes parent-only access while retaining child-only access', () => {
    const result = calculateInheritedResourceCollaborators({
      oldParentCollaborators: [user('removed', ReadRoleVal), user('kept', ReadRoleVal)],
      newParentCollaborators: [user('kept', WriteRoleVal)],
      childCollaborators: [
        user('removed', ReadRoleVal),
        user('kept', ReadRoleVal),
        user('extra', WriteRoleVal)
      ]
    });

    expect(permissionsByUser(result)).toEqual(
      new Map([
        ['kept', WriteRoleVal],
        ['extra', WriteRoleVal]
      ])
    );
  });

  it('keeps child-only permission bits when the parent role is reduced', () => {
    const result = calculateInheritedResourceCollaborators({
      oldParentCollaborators: [user('same', ReadRoleVal | WriteRoleVal)],
      newParentCollaborators: [user('same', ReadRoleVal)],
      childCollaborators: [user('same', ReadRoleVal | WriteRoleVal | ManageRoleVal)]
    });

    expect(result).toEqual([user('same', ReadRoleVal | ManageRoleVal)]);
  });

  it('treats a parent owner as inherited manage and preserves a child owner', () => {
    const result = calculateInheritedResourceCollaborators({
      oldParentCollaborators: [user('owner', OwnerRoleVal)],
      newParentCollaborators: [user('owner', OwnerRoleVal)],
      childCollaborators: [user('owner', OwnerRoleVal)]
    });

    expect(result).toEqual([user('owner', OwnerRoleVal)]);
  });

  it('keeps a child owner when the parent owner is removed', () => {
    const result = calculateInheritedResourceCollaborators({
      oldParentCollaborators: [user('owner', OwnerRoleVal)],
      newParentCollaborators: [],
      childCollaborators: [user('owner', OwnerRoleVal)]
    });

    expect(result).toEqual([user('owner', OwnerRoleVal)]);
  });

  it('preserves group and org collaborators while recalculating inheritance', () => {
    const result = calculateInheritedResourceCollaborators({
      oldParentCollaborators: [
        { groupId: 'group-1', permission: ReadRoleVal },
        { orgId: 'org-1', permission: WriteRoleVal }
      ],
      newParentCollaborators: [
        { groupId: 'group-1', permission: WriteRoleVal },
        { orgId: 'org-1', permission: ManageRoleVal }
      ],
      childCollaborators: []
    });

    expect(result).toEqual([
      { groupId: 'group-1', permission: WriteRoleVal },
      { orgId: 'org-1', permission: ManageRoleVal }
    ]);
  });
});
