import { describe, expect, it } from 'vitest';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { getCollaboratorId } from '@fastgpt/global/support/permission/utils';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import {
  resolveMaterializedResourcePermissions,
  type MigrationResource
} from '@fastgpt/service/support/permission/migration/materializeResourcePermissions';

const user = (tmbId: string, permission: number): CollaboratorItemType => ({
  tmbId,
  permission
});

const toPermissionMap = (collaborators: CollaboratorItemType[]) =>
  new Map(
    collaborators.map((collaborator) => [getCollaboratorId(collaborator), collaborator.permission])
  );

const resolve = (resources: MigrationResource[], currentPermissions: CollaboratorItemType[]) =>
  resolveMaterializedResourcePermissions({
    resources,
    currentPermissions: currentPermissions as (CollaboratorItemType & { resourceId: unknown })[],
    resourceType: PerResourceTypeEnum.app
  });

describe('resolveMaterializedResourcePermissions', () => {
  it('materializes a normal child from its parent ACL', () => {
    const resources = [
      { _id: 'parent', teamId: 'team', tmbId: 'owner' },
      { _id: 'child', teamId: 'team', parentId: 'parent', tmbId: 'owner' }
    ];
    const currentPermissions = [
      { resourceId: 'parent', ...user('owner', OwnerRoleVal) },
      { resourceId: 'parent', ...user('reader', ReadRoleVal) }
    ];

    const result = resolve(resources, currentPermissions);

    expect(result.errors).toEqual([]);
    expect(result.changes).toHaveLength(1);
    expect(toPermissionMap(result.changes[0].collaborators)).toEqual(
      new Map([
        ['owner', OwnerRoleVal],
        ['reader', ReadRoleVal]
      ])
    );
  });

  it('preserves child-only permission bits and independent subtrees', () => {
    const resources = [
      { _id: 'parent', teamId: 'team', tmbId: 'owner' },
      { _id: 'child', teamId: 'team', parentId: 'parent', tmbId: 'owner' },
      {
        _id: 'independent',
        teamId: 'team',
        parentId: 'parent',
        tmbId: 'owner',
        inheritPermission: false
      }
    ];
    const currentPermissions = [
      { resourceId: 'parent', ...user('owner', OwnerRoleVal) },
      { resourceId: 'parent', ...user('reader', ReadRoleVal) },
      { resourceId: 'child', ...user('extra', WriteRoleVal) },
      { resourceId: 'independent', ...user('owner', OwnerRoleVal) }
    ];

    const result = resolve(resources, currentPermissions);

    expect(result.errors).toEqual([]);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].resourceId).toBe('child');
    expect(toPermissionMap(result.changes[0].collaborators)).toEqual(
      new Map([
        ['owner', OwnerRoleVal],
        ['reader', ReadRoleVal],
        ['extra', WriteRoleVal]
      ])
    );
  });

  it('is idempotent after applying the generated changes', () => {
    const resources = [
      { _id: 'parent', teamId: 'team', tmbId: 'owner' },
      { _id: 'child', teamId: 'team', parentId: 'parent', tmbId: 'owner' }
    ];
    const currentPermissions = [
      { resourceId: 'parent', ...user('owner', OwnerRoleVal) },
      { resourceId: 'parent', ...user('reader', ReadRoleVal) }
    ];
    const first = resolve(resources, currentPermissions);
    const materializedPermissions = [
      ...currentPermissions.filter((permission) => permission.resourceId !== 'child'),
      ...(first.changes[0]?.collaborators ?? []).map((collaborator) => ({
        resourceId: 'child',
        ...collaborator
      }))
    ];

    const second = resolve(resources, materializedPermissions);

    expect(second.changes).toEqual([]);
    expect(second.errors).toEqual([]);
  });

  it('only reports target resources when ancestors are loaded for a batch', () => {
    const resources = [
      { _id: 'parent', teamId: 'team', tmbId: 'owner' },
      { _id: 'child', teamId: 'team', parentId: 'parent', tmbId: 'owner' }
    ];
    const result = resolveMaterializedResourcePermissions({
      resources,
      currentPermissions: [],
      resourceType: PerResourceTypeEnum.app,
      targetResourceIds: ['child']
    });

    expect(result.errors).toEqual([]);
    expect(result.skippedResourceCount).toBe(0);
    expect(result.changes.map((change) => change.resourceId)).toEqual(['child']);
  });

  it('reports orphan parents and cycles without writing changes', () => {
    const resources = [
      { _id: 'a', teamId: 'team', parentId: 'b', tmbId: 'owner' },
      { _id: 'b', teamId: 'team', parentId: 'a', tmbId: 'owner' },
      { _id: 'orphan', teamId: 'team', parentId: 'missing', tmbId: 'owner' }
    ];

    const result = resolve(resources, []);

    expect(result.changes).toEqual([]);
    expect(result.skippedResourceCount).toBe(3);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'app:a: parent cycle',
        'app:b: missing parent a',
        'app:a: missing parent b',
        'app:orphan: missing parent missing'
      ])
    );
  });
});
