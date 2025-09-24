import * as createapi from '@/pages/api/core/app/create';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('create api', () => {
  it('should return 200 when create app success', async () => {
    const users = await getFakeUsers(2);
    await MongoResourcePermission.findOneAndUpdate(
      {
        resourceType: 'team',
        teamId: users.members[0].teamId,
        resourceId: null,
        tmbId: users.members[0].tmbId
      },
      {
        permission: TeamAppCreatePermissionVal
      },
      { upsert: true }
    );

    const res = await Call<createapi.CreateAppBody, {}, {}>(createapi.default, {
      auth: users.members[0],
      body: {
        modules: [],
        name: 'testfolder',
        type: AppTypeEnum.folder
      }
    });
    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    const folderId = res.data as string;

    const res2 = await Call<createapi.CreateAppBody, {}, {}>(createapi.default, {
      auth: users.members[0],
      body: {
        modules: [],
        name: 'testapp',
        type: AppTypeEnum.simple,
        parentId: String(folderId)
      }
    });
    expect(res2.error).toBeUndefined();
    expect(res2.code).toBe(200);
    expect(res2.data).toBeDefined();

    const res3 = await Call<createapi.CreateAppBody, {}, {}>(createapi.default, {
      auth: users.members[1],
      body: {
        modules: [],
        name: 'testapp',
        type: AppTypeEnum.simple,
        parentId: String(folderId)
      }
    });
    expect(res3.error).toBe(AppErrEnum.unAuthApp);
    expect(res3.code).toBe(500);

    await MongoResourcePermission.findOneAndUpdate(
      {
        resourceType: 'app',
        teamId: users.members[1].teamId,
        resourceId: String(folderId),
        tmbId: users.members[1].tmbId
      },
      {
        permission: WritePermissionVal
      },
      { upsert: true }
    );

    const res4 = await Call<createapi.CreateAppBody, {}, {}>(createapi.default, {
      auth: users.members[1],
      body: {
        modules: [],
        name: 'testapp',
        type: AppTypeEnum.simple,
        parentId: String(folderId)
      }
    });
    expect(res4.error).toBeUndefined();
    expect(res4.code).toBe(200);
    expect(res4.data).toBeDefined();
  });
});
