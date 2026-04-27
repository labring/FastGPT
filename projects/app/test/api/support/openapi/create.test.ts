import type { EditApiKeyProps } from '@/global/support/openapi/api';
import * as createapi from '@/pages/api/support/openapi/create';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  TeamApikeyCreatePermissionVal,
  TeamDatasetCreatePermissionVal
} from '@fastgpt/global/support/permission/user/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, it, expect } from 'vitest';

describe('create dataset', () => {
  it('should return 200 when create dataset success', async () => {
    const users = await getFakeUsers(2);
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: users.members[0].teamId,
      resourceId: null,
      tmbId: users.members[0].tmbId,
      permission: TeamApikeyCreatePermissionVal
    });
    const res = await Call<EditApiKeyProps>(createapi.default, {
      auth: users.members[0],
      body: {
        name: 'test',
        limit: {
          maxUsagePoints: 1000
        }
      }
    });
    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);

    await MongoResourcePermission.create({
      resourceType: 'app',
      teamId: users.members[1].teamId,
      resourceId: null,
      tmbId: users.members[1].tmbId,
      permission: ManagePermissionVal
    });

    const app = await MongoApp.create({
      name: 'a',
      type: 'simple',
      tmbId: users.members[1].tmbId,
      teamId: users.members[1].teamId
    });
    const res2 = await Call<EditApiKeyProps>(createapi.default, {
      auth: users.members[1],
      body: {
        appId: app._id,
        name: 'test',
        limit: {
          maxUsagePoints: 1000
        }
      }
    });
    expect(res2.error).toBeUndefined();
    expect(res2.code).toBe(200);
  });
});
