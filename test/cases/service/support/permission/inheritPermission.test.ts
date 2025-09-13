import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  ManageRoleVal,
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { createResourceDefaultCollaborators } from '@fastgpt/service/support/permission/controller';
import { syncChildrenPermission } from '@fastgpt/service/support/permission/inheritPermission';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import type { parseHeaderCertRet } from '@test/mocks/request';
import { describe, it, expect } from 'vitest';

describe('syncChildrenPermission', () => {
  const createApp = async ({
    user,
    name,
    type,
    parentId
  }: {
    user: parseHeaderCertRet;
    name: string;
    type: AppTypeEnum;
    parentId?: string;
  }) =>
    mongoSessionRun(async (session) => {
      const app = await MongoApp.create({
        teamId: user.teamId,
        tmbId: user.tmbId,
        ...(parentId ? { parentId } : {}),
        name,
        type,
        inheritPermission: true
      });
      if (type === 'folder') {
        await createResourceDefaultCollaborators({
          resource: app,
          resourceType: PerResourceTypeEnum.app,
          session,
          tmbId: String(user.tmbId)
        });
      }
      return app;
    });

  it('sync: add/update/delete clbs', async () => {
    const users = await getFakeUsers(5);
    const f1 = await createApp({
      user: users.owner,
      name: 'f1',
      type: AppTypeEnum.folder
    });
    const f2 = await createApp({
      user: users.owner,
      name: 'f2',
      type: AppTypeEnum.folder,
      parentId: String(f1._id)
    });
    expect(
      await MongoResourcePermission.countDocuments({
        resourceType: 'app'
      })
    ).eq(2);
    const clbs = [
      {
        tmbId: String(users.owner.tmbId),
        permission: OwnerRoleVal
      },
      {
        tmbId: String(users.members[0].tmbId),
        permission: ReadRoleVal
      },
      {
        tmbId: users.members[1].tmbId,
        permission: ReadRoleVal
      }
    ];

    await mongoSessionRun(async (session) => {
      await syncChildrenPermission({
        collaborators: clbs,
        folderTypeList: AppFolderTypeList,
        resource: f1,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        session
      });
      await MongoResourcePermission.insertOne({
        resourceId: f1._id,
        resourceType: PerResourceTypeEnum.app,
        permission: ReadRoleVal,
        tmbId: users.members[0].tmbId,
        teamId: users.members[0].teamId,
        session
      });
      await MongoResourcePermission.insertOne({
        resourceId: f1._id,
        resourceType: PerResourceTypeEnum.app,
        permission: ReadRoleVal,
        tmbId: users.members[1].tmbId,
        teamId: users.members[1].teamId,
        session
      });
    });

    expect(
      await MongoResourcePermission.countDocuments({
        resourceType: 'app'
      })
    ).eq(6);

    const f3 = await createApp({
      name: 'f3',
      user: users.owner,
      type: AppTypeEnum.folder,
      parentId: String(f2._id)
    });

    await mongoSessionRun(async (session) => {
      await syncChildrenPermission({
        collaborators: clbs,
        folderTypeList: AppFolderTypeList,
        resource: f3,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        session
      });
    });

    expect(
      await MongoResourcePermission.countDocuments({
        resourceType: 'app'
      })
    ).eq(9);

    const a1 = await createApp({
      name: 'a1',
      user: users.owner,
      type: AppTypeEnum.simple,
      parentId: String(f3._id)
    });

    await mongoSessionRun(async (session) => {
      await syncChildrenPermission({
        collaborators: clbs,
        folderTypeList: AppFolderTypeList,
        resource: a1,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        session
      });
    });

    expect(
      await MongoResourcePermission.countDocuments({
        resourceType: 'app'
      })
    ).eq(9);

    // update
    await mongoSessionRun(async (session) => {
      const clbs = [
        {
          tmbId: String(users.owner.tmbId),
          permission: OwnerRoleVal
        },
        {
          tmbId: String(users.members[0].tmbId),
          permission: ReadRoleVal
        },
        {
          tmbId: String(users.members[1].tmbId),
          permission: ManageRoleVal
        }
      ];
      await syncChildrenPermission({
        collaborators: clbs,
        folderTypeList: AppFolderTypeList,
        resource: f1,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        session
      });

      await MongoResourcePermission.updateOne(
        {
          resourceType: PerResourceTypeEnum.app,
          resourceId: String(f1._id),
          tmbId: String(users.members[1].tmbId)
        },
        {
          permission: ManageRoleVal
        }
      );
    });

    // console.log(await MongoResourcePermission.find({ resourceType: 'app' }));

    expect(
      await MongoResourcePermission.countDocuments({
        resourceType: 'app'
      })
    ).eq(9);

    // delete
    await mongoSessionRun(async (session) => {
      const clbs = [
        {
          tmbId: String(users.owner.tmbId),
          permission: OwnerRoleVal
        },
        {
          tmbId: String(users.members[0].tmbId),
          permission: ReadRoleVal
        }
      ];
      await syncChildrenPermission({
        collaborators: clbs,
        folderTypeList: AppFolderTypeList,
        resource: f1,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        session
      });

      await MongoResourcePermission.deleteOne(
        {
          resourceType: PerResourceTypeEnum.app,
          resourceId: String(f1._id),
          tmbId: String(users.members[1].tmbId),
          team: String(users.members[1].teamId)
        },
        { session }
      );
    });

    expect(
      await MongoResourcePermission.countDocuments({
        resourceType: 'app'
      })
    ).eq(8);
  });
});
