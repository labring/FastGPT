import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  ManageRoleVal,
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import {
  createResourceDefaultCollaborators,
  getResourceOwnedClbs
} from '@fastgpt/service/support/permission/controller';
import {
  createResourcePermissions,
  moveResourcePermissions,
  resumeResourcePermissionInheritance,
  updateResourceCollaborators
} from '@fastgpt/service/support/permission/resourcePermissionService';
import { resourcePermissionRepo } from '@fastgpt/service/support/permission/repository/resourcePermissionRepo';
import { getFakeUsers } from '@test/datas/users';
import type { parseHeaderCertRet } from '@test/mocks/request';
import { describe, expect, it } from 'vitest';

const toPermissionMap = (collaborators: { tmbId?: string; permission: number }[]) =>
  new Map(collaborators.map((collaborator) => [collaborator.tmbId, collaborator.permission]));

describe.sequential('resource permission inheritance', () => {
  const createApp = async ({
    user,
    name,
    type,
    parentId,
    inheritPermission = true
  }: {
    user: parseHeaderCertRet;
    name: string;
    type: AppTypeEnum;
    parentId?: string;
    inheritPermission?: boolean;
  }) =>
    mongoSessionRun(async (session) => {
      const app = await MongoApp.create({
        teamId: user.teamId,
        tmbId: user.tmbId,
        ...(parentId ? { parentId } : {}),
        name,
        type,
        inheritPermission
      });
      await createResourceDefaultCollaborators({
        resource: app,
        resourceType: PerResourceTypeEnum.app,
        session,
        tmbId: String(user.tmbId)
      });
      return app;
    });

  it('materializes complete ACLs for folders and ordinary resources', async () => {
    const users = await getFakeUsers(3);
    const folder = await createApp({
      user: users.owner,
      name: 'folder',
      type: AppTypeEnum.folder
    });
    const child = await createApp({
      user: users.owner,
      name: 'child',
      type: AppTypeEnum.simple,
      parentId: String(folder._id)
    });

    const parentCollaborators = [
      { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
      { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
    ];

    await mongoSessionRun(async (session) => {
      await updateResourceCollaborators({
        resource: folder,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        oldCollaborators: await getResourceOwnedClbs({
          teamId: String(users.owner.teamId),
          resourceId: String(folder._id),
          resourceType: PerResourceTypeEnum.app,
          session
        }),
        newCollaborators: parentCollaborators,
        session
      });
    });

    const childCollaborators = await getResourceOwnedClbs({
      teamId: String(users.owner.teamId),
      resourceId: String(child._id),
      resourceType: PerResourceTypeEnum.app
    });
    expect(toPermissionMap(childCollaborators)).toEqual(
      new Map([
        [String(users.owner.tmbId), OwnerRoleVal],
        [String(users.members[0].tmbId), ReadRoleVal]
      ])
    );
  });

  it('inherits existing parent ACLs when creating a child and isolates false branches', async () => {
    const users = await getFakeUsers(3);
    const parent = await createApp({
      user: users.owner,
      name: 'create-parent',
      type: AppTypeEnum.folder
    });
    const parentCollaborators = [
      { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
      { tmbId: String(users.members[1].tmbId), permission: ReadRoleVal }
    ];

    await mongoSessionRun(async (session) => {
      await updateResourceCollaborators({
        resource: parent,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        oldCollaborators: await getResourceOwnedClbs({
          teamId: String(users.owner.teamId),
          resourceId: String(parent._id),
          resourceType: PerResourceTypeEnum.app,
          session
        }),
        newCollaborators: parentCollaborators,
        session
      });

      const inheritedChild = await MongoApp.create({
        teamId: users.owner.teamId,
        tmbId: users.members[0].tmbId,
        parentId: parent._id,
        name: 'created-inherited-child',
        type: AppTypeEnum.simple
      });
      await createResourcePermissions({
        resource: {
          _id: String(inheritedChild._id),
          type: inheritedChild.type,
          teamId: String(inheritedChild.teamId),
          parentId: String(parent._id)
        },
        resourceType: PerResourceTypeEnum.app,
        tmbId: String(users.members[0].tmbId),
        session
      });

      const isolatedChild = await MongoApp.create({
        teamId: users.owner.teamId,
        tmbId: users.members[0].tmbId,
        parentId: parent._id,
        name: 'created-isolated-child',
        type: AppTypeEnum.simple,
        inheritPermission: false
      });
      await createResourcePermissions({
        resource: {
          _id: String(isolatedChild._id),
          type: isolatedChild.type,
          teamId: String(isolatedChild.teamId),
          parentId: String(parent._id),
          inheritPermission: false
        },
        resourceType: PerResourceTypeEnum.app,
        tmbId: String(users.members[0].tmbId),
        session
      });
    });

    const [inheritedChild, isolatedChild] = await MongoApp.find({
      teamId: users.owner.teamId,
      name: { $in: ['created-inherited-child', 'created-isolated-child'] }
    })
      .sort({ name: 1 })
      .lean();
    const inheritedCollaborators = await getResourceOwnedClbs({
      teamId: String(users.owner.teamId),
      resourceId: String(inheritedChild._id),
      resourceType: PerResourceTypeEnum.app
    });
    const isolatedCollaborators = await getResourceOwnedClbs({
      teamId: String(users.owner.teamId),
      resourceId: String(isolatedChild._id),
      resourceType: PerResourceTypeEnum.app
    });

    expect(toPermissionMap(inheritedCollaborators)).toEqual(
      new Map([
        [String(users.owner.tmbId), ManageRoleVal],
        [String(users.members[1].tmbId), ReadRoleVal],
        [String(users.members[0].tmbId), OwnerRoleVal]
      ])
    );
    expect(toPermissionMap(isolatedCollaborators)).toEqual(
      new Map([[String(users.members[0].tmbId), OwnerRoleVal]])
    );
  });

  it('propagates through multiple levels but stops at independent descendants', async () => {
    const users = await getFakeUsers(2);
    const parent = await createApp({
      user: users.owner,
      name: 'multi-parent',
      type: AppTypeEnum.folder
    });
    const child = await createApp({
      user: users.owner,
      name: 'multi-child',
      type: AppTypeEnum.folder,
      parentId: String(parent._id)
    });
    const grandchild = await createApp({
      user: users.owner,
      name: 'multi-grandchild',
      type: AppTypeEnum.simple,
      parentId: String(child._id)
    });
    const independent = await createApp({
      user: users.owner,
      name: 'multi-independent',
      type: AppTypeEnum.folder,
      parentId: String(parent._id),
      inheritPermission: false
    });
    const independentChild = await createApp({
      user: users.owner,
      name: 'multi-independent-child',
      type: AppTypeEnum.simple,
      parentId: String(independent._id)
    });

    await mongoSessionRun(async (session) => {
      const oldCollaborators = await getResourceOwnedClbs({
        teamId: String(users.owner.teamId),
        resourceId: String(parent._id),
        resourceType: PerResourceTypeEnum.app,
        session
      });
      await updateResourceCollaborators({
        resource: parent,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        oldCollaborators,
        newCollaborators: [
          ...oldCollaborators,
          { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
        ],
        session
      });
    });

    const collaboratorsByName = new Map(
      await Promise.all(
        [child, grandchild, independent, independentChild].map(async (resource) => [
          resource.name,
          toPermissionMap(
            await getResourceOwnedClbs({
              teamId: String(users.owner.teamId),
              resourceId: String(resource._id),
              resourceType: PerResourceTypeEnum.app
            })
          )
        ])
      )
    );
    const inheritedMap = new Map([
      [String(users.owner.tmbId), OwnerRoleVal],
      [String(users.members[0].tmbId), ReadRoleVal]
    ]);
    const isolatedMap = new Map([[String(users.owner.tmbId), OwnerRoleVal]]);

    expect(collaboratorsByName.get('multi-child')).toEqual(inheritedMap);
    expect(collaboratorsByName.get('multi-grandchild')).toEqual(inheritedMap);
    expect(collaboratorsByName.get('multi-independent')).toEqual(isolatedMap);
    expect(collaboratorsByName.get('multi-independent-child')).toEqual(isolatedMap);
  });

  it('removes inherited access while preserving child-only access', async () => {
    const users = await getFakeUsers(4);
    const parent = await createApp({
      user: users.owner,
      name: 'parent',
      type: AppTypeEnum.folder
    });
    const child = await createApp({
      user: users.owner,
      name: 'child',
      type: AppTypeEnum.simple,
      parentId: String(parent._id)
    });

    const owner = { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal };
    const reader = { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal };
    const extra = { tmbId: String(users.members[1].tmbId), permission: WriteRoleVal };
    const parentBefore = [owner, reader, extra];

    await mongoSessionRun(async (session) => {
      await updateResourceCollaborators({
        resource: parent,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        oldCollaborators: await getResourceOwnedClbs({
          teamId: String(users.owner.teamId),
          resourceId: String(parent._id),
          resourceType: PerResourceTypeEnum.app,
          session
        }),
        newCollaborators: parentBefore,
        session
      });

      const childBefore = await getResourceOwnedClbs({
        teamId: String(users.owner.teamId),
        resourceId: String(child._id),
        resourceType: PerResourceTypeEnum.app,
        session
      });
      await resourcePermissionRepo.replaceResource({
        teamId: String(users.owner.teamId),
        resourceType: PerResourceTypeEnum.app,
        resourceId: String(child._id),
        collaborators: [
          ...childBefore,
          { tmbId: String(users.members[2].tmbId), permission: ManageRoleVal }
        ],
        session
      });

      await updateResourceCollaborators({
        resource: parent,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        oldCollaborators: parentBefore,
        newCollaborators: [owner, extra],
        session
      });
    });

    const collaborators = await getResourceOwnedClbs({
      teamId: String(users.owner.teamId),
      resourceId: String(child._id),
      resourceType: PerResourceTypeEnum.app
    });
    expect(toPermissionMap(collaborators)).toEqual(
      new Map([
        [String(users.owner.tmbId), OwnerRoleVal],
        [String(users.members[1].tmbId), WriteRoleVal],
        [String(users.members[2].tmbId), ManageRoleVal]
      ])
    );
  });

  it('does not propagate through an independent subtree', async () => {
    const users = await getFakeUsers(2);
    const parent = await createApp({
      user: users.owner,
      name: 'parent',
      type: AppTypeEnum.folder
    });
    const independent = await createApp({
      user: users.owner,
      name: 'independent',
      type: AppTypeEnum.folder,
      parentId: String(parent._id),
      inheritPermission: false
    });

    await mongoSessionRun(async (session) => {
      const oldCollaborators = await getResourceOwnedClbs({
        teamId: String(users.owner.teamId),
        resourceId: String(parent._id),
        resourceType: PerResourceTypeEnum.app,
        session
      });
      await updateResourceCollaborators({
        resource: parent,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        oldCollaborators,
        newCollaborators: [
          ...oldCollaborators,
          { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
        ],
        session
      });
    });

    const collaborators = await getResourceOwnedClbs({
      teamId: String(users.owner.teamId),
      resourceId: String(independent._id),
      resourceType: PerResourceTypeEnum.app
    });
    expect(toPermissionMap(collaborators)).toEqual(
      new Map([[String(users.owner.tmbId), OwnerRoleVal]])
    );
  });

  it('recalculates a moved resource and resumes inheritance', async () => {
    const users = await getFakeUsers(3);
    const oldParent = await createApp({
      user: users.owner,
      name: 'old-parent',
      type: AppTypeEnum.folder
    });
    const newParent = await createApp({
      user: users.owner,
      name: 'new-parent',
      type: AppTypeEnum.folder
    });
    const child = await createApp({
      user: users.owner,
      name: 'child',
      type: AppTypeEnum.simple,
      parentId: String(oldParent._id)
    });

    await mongoSessionRun(async (session) => {
      const newParentCollaborators = [
        ...(await getResourceOwnedClbs({
          teamId: String(users.owner.teamId),
          resourceId: String(newParent._id),
          resourceType: PerResourceTypeEnum.app,
          session
        })),
        { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
      ];
      await resourcePermissionRepo.replaceResource({
        teamId: String(users.owner.teamId),
        resourceType: PerResourceTypeEnum.app,
        resourceId: String(newParent._id),
        collaborators: newParentCollaborators,
        session
      });

      const moved = await moveResourcePermissions({
        resource: {
          _id: String(child._id),
          type: child.type,
          teamId: String(child.teamId),
          parentId: child.parentId,
          inheritPermission: child.inheritPermission
        },
        newParentId: String(newParent._id),
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        newParentCollaborators,
        session
      });
      expect(toPermissionMap(moved.collaborators)).toEqual(
        expect.objectContaining(toPermissionMap(newParentCollaborators))
      );

      await MongoApp.updateOne(
        { _id: child._id },
        { parentId: newParent._id, inheritPermission: false },
        { session }
      );
      await resumeResourcePermissionInheritance({
        resource: {
          _id: String(child._id),
          type: child.type,
          teamId: String(child.teamId),
          parentId: newParent._id,
          inheritPermission: false
        },
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        session
      });
    });

    expect(
      toPermissionMap(
        await getResourceOwnedClbs({
          teamId: String(users.owner.teamId),
          resourceId: String(child._id),
          resourceType: PerResourceTypeEnum.app
        })
      )
    ).toEqual(
      new Map([
        [String(users.owner.tmbId), OwnerRoleVal],
        [String(users.members[0].tmbId), ReadRoleVal]
      ])
    );
    await expect(MongoApp.findById(child._id).lean()).resolves.toMatchObject({
      parentId: String(newParent._id),
      inheritPermission: true
    });
  });

  it('moves a resource to root and removes only inherited parent permissions', async () => {
    const users = await getFakeUsers(3);
    const parent = await createApp({
      user: users.owner,
      name: 'root-move-parent',
      type: AppTypeEnum.folder
    });
    const child = await createApp({
      user: users.owner,
      name: 'root-move-child',
      type: AppTypeEnum.simple,
      parentId: String(parent._id)
    });
    const parentCollaborators = [
      { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
      { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
    ];

    await mongoSessionRun(async (session) => {
      await updateResourceCollaborators({
        resource: parent,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        oldCollaborators: await getResourceOwnedClbs({
          teamId: String(users.owner.teamId),
          resourceId: String(parent._id),
          resourceType: PerResourceTypeEnum.app,
          session
        }),
        newCollaborators: parentCollaborators,
        session
      });

      const childCollaborators = await getResourceOwnedClbs({
        teamId: String(users.owner.teamId),
        resourceId: String(child._id),
        resourceType: PerResourceTypeEnum.app,
        session
      });
      await resourcePermissionRepo.replaceResource({
        teamId: String(users.owner.teamId),
        resourceType: PerResourceTypeEnum.app,
        resourceId: String(child._id),
        collaborators: [
          ...childCollaborators,
          { tmbId: String(users.members[1].tmbId), permission: ManageRoleVal }
        ],
        session
      });

      const moved = await moveResourcePermissions({
        resource: {
          _id: String(child._id),
          type: child.type,
          teamId: String(child.teamId),
          parentId: child.parentId,
          inheritPermission: child.inheritPermission
        },
        newParentId: undefined,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        newParentCollaborators: [],
        session
      });

      expect(toPermissionMap(moved.collaborators)).toEqual(
        new Map([
          [String(users.owner.tmbId), OwnerRoleVal],
          [String(users.members[1].tmbId), ManageRoleVal]
        ])
      );
      await MongoApp.updateOne({ _id: child._id }, { parentId: null }, { session });
    });

    await expect(MongoApp.findById(child._id).lean()).resolves.toMatchObject({
      parentId: null
    });
    expect(
      toPermissionMap(
        await getResourceOwnedClbs({
          teamId: String(users.owner.teamId),
          resourceId: String(child._id),
          resourceType: PerResourceTypeEnum.app
        })
      )
    ).toEqual(
      new Map([
        [String(users.owner.tmbId), OwnerRoleVal],
        [String(users.members[1].tmbId), ManageRoleVal]
      ])
    );
  });
});
