import type { UpdateApiKeyBodyType } from '@fastgpt/global/openapi/support/openapi/api';
import handler from '@/pages/api/support/openapi/update';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { MongoOpenApiTag } from '@fastgpt/service/support/openapi/tag/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('support/openapi/update', () => {
  it('member can update their own APIKey base fields', async () => {
    const { members } = await getFakeUsers(1);
    const [member] = members;
    const openapi = await MongoOpenApi.create({
      teamId: member.teamId,
      tmbId: member.tmbId,
      apiKey: 'fastgpt-member-update-own',
      name: 'member key',
      limit: {
        maxUsagePoints: 100
      }
    });

    const res = await Call<UpdateApiKeyBodyType>(handler, {
      auth: member,
      body: {
        _id: String(openapi._id),
        name: 'member updated key',
        limit: {
          maxUsagePoints: 200
        }
      }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);

    const updated = await MongoOpenApi.findById(openapi._id).lean();
    expect(updated?.name).toBe('member updated key');
    expect(updated?.limit?.maxUsagePoints).toBe(200);
  });

  it('team owner cannot update other member APIKey', async () => {
    const { owner, members } = await getFakeUsers(1);
    const [member] = members;
    const openapi = await MongoOpenApi.create({
      teamId: member.teamId,
      tmbId: member.tmbId,
      apiKey: 'fastgpt-member-update-private',
      name: 'member private key'
    });

    const res = await Call<UpdateApiKeyBodyType>(handler, {
      auth: owner,
      body: {
        _id: String(openapi._id),
        name: 'owner updated key'
      }
    });

    expect(res.code).toBe(500);

    const updated = await MongoOpenApi.findById(openapi._id).lean();
    expect(updated?.name).toBe('member private key');
  });

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

  it('replaces and clears APIKey tags', async () => {
    const { owner } = await getFakeUsers(1);
    const [tagA, tagB] = await MongoOpenApiTag.create([
      {
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        name: 'A',
        normalizedName: 'a',
        type: 'custom',
        order: 100
      },
      {
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        name: 'B',
        normalizedName: 'b',
        type: 'custom',
        order: 101
      }
    ]);
    const openapi = await MongoOpenApi.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      apiKey: 'fastgpt-tag-update',
      name: 'tag update',
      tagIds: [tagA._id]
    });

    const replaced = await Call<UpdateApiKeyBodyType>(handler, {
      auth: owner,
      body: {
        _id: String(openapi._id),
        tags: [String(tagB._id)]
      }
    });

    expect(replaced.code).toBe(200);
    const replacedKey = await MongoOpenApi.findById(openapi._id).lean();
    expect((replacedKey?.tagIds || []).map(String)).toEqual([String(tagB._id)]);

    const cleared = await Call<UpdateApiKeyBodyType>(handler, {
      auth: owner,
      body: {
        _id: String(openapi._id),
        tags: []
      }
    });

    expect(cleared.code).toBe(200);
    const clearedKey = await MongoOpenApi.findById(openapi._id).lean();
    expect(clearedKey?.tagIds || []).toHaveLength(0);
  });

  it('rejects updating APIKey with tags from another member', async () => {
    const { owner, members } = await getFakeUsers(1);
    const [member] = members;
    const memberTag = await MongoOpenApiTag.create({
      teamId: member.teamId,
      tmbId: member.tmbId,
      name: 'member tag',
      normalizedName: 'member tag',
      type: 'custom',
      order: 100
    });
    const openapi = await MongoOpenApi.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      apiKey: 'fastgpt-invalid-tag-update',
      name: 'invalid tag update'
    });

    const res = await Call<UpdateApiKeyBodyType>(handler, {
      auth: owner,
      body: {
        _id: String(openapi._id),
        tags: [String(memberTag._id)]
      }
    });

    expect(res.code).toBe(500);
    const updated = await MongoOpenApi.findById(openapi._id).lean();
    expect(updated?.tagIds || []).toHaveLength(0);
  });
});
