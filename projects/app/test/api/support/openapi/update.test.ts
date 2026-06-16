import type { UpdateApiKeyBodyType } from '@fastgpt/global/openapi/support/openapi/api';
import handler from '@/pages/api/support/openapi/update';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('support/openapi/update', () => {
  it('team owner can enable authProxy for global APIKey', async () => {
    const { owner } = await getFakeUsers(1);
    const openapi = await MongoOpenApi.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      apiKey: 'fastgpt-owner-auth-proxy',
      authProxy: false,
      name: 'owner key'
    });

    const res = await Call<UpdateApiKeyBodyType>(handler, {
      auth: owner,
      body: {
        _id: String(openapi._id),
        authProxy: true
      }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);

    const updated = await MongoOpenApi.findById(openapi._id).lean();
    expect(updated?.authProxy).toBe(true);
  });

  it('non-owner cannot enable authProxy for global APIKey', async () => {
    const { members } = await getFakeUsers(1);
    const [member] = members;
    const openapi = await MongoOpenApi.create({
      teamId: member.teamId,
      tmbId: member.tmbId,
      apiKey: 'fastgpt-member-auth-proxy',
      authProxy: false,
      name: 'member key'
    });

    const res = await Call<UpdateApiKeyBodyType>(handler, {
      auth: member,
      body: {
        _id: String(openapi._id),
        authProxy: true
      }
    });

    expect(res.code).toBe(500);

    const updated = await MongoOpenApi.findById(openapi._id).lean();
    expect(updated?.authProxy).toBe(false);
  });

  it('app APIKey cannot enable authProxy', async () => {
    const { owner } = await getFakeUsers(1);
    const app = await MongoApp.create({
      name: 'app auth proxy update',
      type: 'simple',
      tmbId: owner.tmbId,
      teamId: owner.teamId
    });
    const openapi = await MongoOpenApi.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      appId: String(app._id),
      apiKey: 'fastgpt-app-auth-proxy',
      authProxy: false,
      name: 'app key'
    });

    const res = await Call<UpdateApiKeyBodyType>(handler, {
      auth: owner,
      body: {
        _id: String(openapi._id),
        authProxy: true
      }
    });

    expect(res.code).toBe(500);

    const updated = await MongoOpenApi.findById(openapi._id).lean();
    expect(updated?.authProxy).toBe(false);
  });
});
