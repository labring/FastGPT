import * as copyapi from '@/pages/api/core/app/copy';
import * as createapi from '@/pages/api/core/app/create';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('Copy', () => {
  it('should return success', async () => {
    const users = await getFakeUsers(2);
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: users.members[0].teamId,
      resourceId: null,
      tmbId: users.members[0].tmbId,
      permission: TeamAppCreatePermissionVal
    });

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
        parentId: folderId,
        name: 'simple app',
        type: AppTypeEnum.simple
      }
    });
    expect(res2.error).toBeUndefined();
    expect(res2.code).toBe(200);
    const appId = res2.data as string;

    const res3 = await Call<copyapi.copyAppBody, {}, {}>(copyapi.default, {
      auth: users.members[1],
      body: {
        appId
      }
    });
    expect(res3.error).toBe(AppErrEnum.unAuthApp);
    expect(res3.code).toBe(500);

    await MongoResourcePermission.create({
      resourceType: 'app',
      teamId: users.members[1].teamId,
      resourceId: String(folderId),
      tmbId: users.members[1].tmbId,
      permission: WritePermissionVal
    });

    const res4 = await Call<copyapi.copyAppBody, {}, {}>(copyapi.default, {
      auth: users.members[1],
      body: {
        appId
      }
    });
    expect(res4.error).toBeUndefined();
    expect(res4.code).toBe(200);
  });
});
