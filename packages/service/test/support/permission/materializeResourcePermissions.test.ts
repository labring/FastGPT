import { describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { getCollaboratorId } from '@fastgpt/global/support/permission/utils';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import {
  materializeResourcePermissions,
  resolveMaterializedResourcePermissions,
  type MigrationResource
} from '@fastgpt/service/support/permission/migration/materializeResourcePermissions';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { resourcePermissionRepo } from '@fastgpt/service/support/permission/repository/resourcePermissionRepo';
import { getFakeUsers } from '@test/datas/users';

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

describe('materializeResourcePermissions', () => {
  it('writes inherited ACLs when parent and child are processed in separate batches', async () => {
    const findByResourceIdsSpy = vi.spyOn(resourcePermissionRepo, 'findByResourceIds');
    const users = await getFakeUsers(2);
    const parent = await MongoApp.create({
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      name: 'migration-parent',
      type: AppTypeEnum.folder
    });
    const child = await MongoApp.create({
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      parentId: parent._id,
      name: 'migration-child',
      type: AppTypeEnum.simple
    });

    await mongoSessionRun(async (session) => {
      await resourcePermissionRepo.replaceResource({
        teamId: String(users.owner.teamId),
        resourceType: PerResourceTypeEnum.app,
        resourceId: String(parent._id),
        collaborators: [
          { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
          { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
        ],
        session
      });
      await resourcePermissionRepo.replaceResource({
        teamId: String(users.owner.teamId),
        resourceType: PerResourceTypeEnum.app,
        resourceId: String(child._id),
        collaborators: [{ tmbId: String(users.owner.tmbId), permission: OwnerRoleVal }],
        session
      });
    });

    const result = await materializeResourcePermissions({
      dryRun: false,
      teamId: String(users.owner.teamId),
      batchSize: 1
    });

    expect(result.errors).toEqual([]);
    expect(result.resourceCount).toBe(2);
    expect(result.updatedResourceCount).toBe(1);
    const aclQueryCalls = findByResourceIdsSpy.mock.calls as Array<[{ session?: unknown }]>;
    expect(aclQueryCalls).toHaveLength(2);
    expect(aclQueryCalls.map(([query]) => query.resourceIds)).toEqual([
      [String(parent._id)],
      [String(child._id), String(parent._id)]
    ]);

    const childPermissions = await resourcePermissionRepo.findByResource({
      teamId: String(users.owner.teamId),
      resourceType: PerResourceTypeEnum.app,
      resourceId: String(child._id)
    });
    expect(childPermissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tmbId: String(users.members[0].tmbId),
          permission: ReadRoleVal
        })
      ])
    );
  });
});
