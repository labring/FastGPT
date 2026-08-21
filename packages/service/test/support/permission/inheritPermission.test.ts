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
  moveResourcePermissions,
  resumeResourcePermissionInheritance,
  updateResourceCollaborators
} from '@fastgpt/service/support/permission/resourcePermissionService';
import { resourcePermissionRepo } from '@fastgpt/service/support/permission/repository/resourcePermissionRepo';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
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
      await MongoResourcePermission.countDocuments({
        teamId: users.owner.teamId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: child._id
      })
    ).toBeGreaterThan(0);
  });
});
