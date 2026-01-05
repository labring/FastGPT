import * as getPermissionApi from '@/pages/api/core/app/getPermission';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';
import type {
  GetAppPermissionQueryType,
  GetAppPermissionResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { ZodError } from 'zod';

describe('get app permission api', () => {
  it('should return permission when user has access', async () => {
    const users = await getFakeUsers(1);
    const user = users.members[0];

    // Create a test app
    const app = await MongoApp.create({
      name: 'test-app',
      type: AppTypeEnum.simple,
      modules: [],
      edges: [],
      teamId: user.teamId,
      tmbId: user.tmbId
    });

    const res = await Call<{}, GetAppPermissionQueryType, GetAppPermissionResponseType>(
      getPermissionApi.default,
      {
        auth: user,
        query: {
          appId: String(app._id)
        }
      }
    );

    expect(res.code).toBe(200);
    expect(res.data).toBeDefined();
    expect(res.data.isOwner).toBe(true);
    expect(res.data.hasReadPer).toBe(true);
    expect(res.data.hasWritePer).toBe(true);
    expect(res.data.hasManagePer).toBe(true);
  });

  it('should return error when appId is missing', async () => {
    const users = await getFakeUsers(1);
    const user = users.members[0];

    const res = await Call<{}, GetAppPermissionQueryType, GetAppPermissionResponseType>(
      getPermissionApi.default,
      {
        auth: user,
        query: {
          appId: ''
        }
      }
    );
    console.log(res.error, 232);
    expect(res.error instanceof ZodError).toBe(true);
    expect(res.code).toBe(500);
  });

  it('should return error when user does not have access', async () => {
    const users = await getFakeUsers(2);
    const user1 = users.members[0];
    const user2 = users.members[1];

    // Create a test app by user1
    const app = await MongoApp.create({
      name: 'test-app',
      type: AppTypeEnum.simple,
      modules: [],
      edges: [],
      teamId: user1.teamId,
      tmbId: user1.tmbId
    });

    // Try to get permission as user2 (different team)
    const res = await Call<{}, GetAppPermissionQueryType, GetAppPermissionResponseType>(
      getPermissionApi.default,
      {
        auth: user2,
        query: {
          appId: String(app._id)
        }
      }
    );

    expect(res.data.isOwner).toBe(false);
    expect(res.data.hasReadPer).toBe(false);
    expect(res.data.hasWritePer).toBe(false);
    expect(res.data.hasManagePer).toBe(false);
    expect(res.data.hasReadChatLogPer).toBe(false);
    expect(res.code).toBe(200);
  });

  it('should return error when app does not exist', async () => {
    const users = await getFakeUsers(1);
    const user = users.members[0];

    const res = await Call<{}, GetAppPermissionQueryType, GetAppPermissionResponseType>(
      getPermissionApi.default,
      {
        auth: user,
        query: {
          appId: '507f1f77bcf86cd799439011' // Non-existent appId
        }
      }
    );

    expect(res.data.isOwner).toBe(false);
    expect(res.data.hasReadPer).toBe(false);
    expect(res.data.hasWritePer).toBe(false);
    expect(res.data.hasManagePer).toBe(false);
    expect(res.data.hasReadChatLogPer).toBe(false);
    expect(res.code).toBe(200);
  });
});
