import type { EditApiKeyProps } from '@/global/support/openapi/api';
import * as createapi from '@/pages/api/support/openapi/create';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamApikeyCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
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

  it('team owner can create global APIKey with authProxy enabled', async () => {
    const users = await getFakeUsers(1);

    const res = await Call<EditApiKeyProps>(createapi.default, {
      auth: users.owner,
      body: {
        name: 'owner auth proxy key',
        authProxy: true,
        limit: {
          maxUsagePoints: 1000
        }
      }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);

    const openapi = await MongoOpenApi.findOne({
      teamId: users.owner.teamId,
      name: 'owner auth proxy key'
    }).lean();
    expect(openapi?.authProxy).toBe(true);
  });

  it('non-owner cannot enable authProxy when creating global APIKey', async () => {
    const users = await getFakeUsers(1);
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
        name: 'member auth proxy key',
        authProxy: true,
        limit: {
          maxUsagePoints: 1000
        }
      }
    });

    expect(res.code).toBe(500);
    expect(await MongoOpenApi.findOne({ name: 'member auth proxy key' })).toBeNull();
  });

  it('app APIKey cannot enable authProxy', async () => {
    const users = await getFakeUsers(1);
    const app = await MongoApp.create({
      name: 'auth proxy app',
      type: 'simple',
      tmbId: users.owner.tmbId,
      teamId: users.owner.teamId
    });

    const res = await Call<EditApiKeyProps>(createapi.default, {
      auth: users.owner,
      body: {
        appId: String(app._id),
        name: 'app auth proxy key',
        authProxy: true,
        limit: {
          maxUsagePoints: 1000
        }
      }
    });

    expect(res.code).toBe(500);
    expect(await MongoOpenApi.findOne({ name: 'app auth proxy key' })).toBeNull();
  });
});
