import { Types } from '@fastgpt/service/common/mongo';
import type { EditApiKeyProps } from '@/global/support/openapi/api';
import * as createapi from '@/pages/api/support/openapi/create';
import { TeamApikeyCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { MongoOpenApiTag } from '@fastgpt/service/support/openapi/tag/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { OpenApiErrEnum } from '@fastgpt/global/common/error/code/openapi';

const lock = vi.hoisted(() => ({ beforeCreate: undefined as undefined | (() => Promise<void>) }));
vi.mock('@fastgpt/service/support/user/lock', () => ({
  withTeamLock: vi.fn(async (_teamId, fn) => {
    await lock.beforeCreate?.();
    return fn();
  })
}));

const mockAppEnv = vi.hoisted(() => ({
  OPENAPI_KEY_MAX_COUNT: 100
}));

vi.mock('@/env', () => ({
  appEnv: mockAppEnv
}));

describe('support/openapi/create', () => {
  beforeEach(() => {
    mockAppEnv.OPENAPI_KEY_MAX_COUNT = 100;
    lock.beforeCreate = undefined;
  });

  it('creates personal and app keys with explicit immutable types', async () => {
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
        name: 'system key',
        limit: {
          maxUsagePoints: 1000
        }
      }
    });
    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);

    const systemKey = await MongoOpenApi.findOne({
      teamId: users.members[0].teamId,
      tmbId: users.members[0].tmbId,
      name: 'system key'
    }).lean();
    expect(systemKey?.appId).toBeUndefined();

    const app = await MongoApp.create({
      name: 'a',
      type: 'simple',
      tmbId: users.members[1].tmbId,
      teamId: users.members[1].teamId
    });
    const res2 = await Call<EditApiKeyProps>(createapi.default, {
      auth: users.members[1],
      body: {
        type: 'app',
        appId: String(app._id).toUpperCase(),
        name: 'legacy appId input key',
        limit: {
          maxUsagePoints: 1000
        }
      } as EditApiKeyProps
    });
    expect(res2.error).toBeUndefined();
    expect(res2.code).toBe(200);

    const legacyInputKey = await MongoOpenApi.findOne({
      teamId: users.members[1].teamId,
      tmbId: users.members[1].tmbId,
      name: 'legacy appId input key'
    }).lean();
    const storedKey = await MongoOpenApi.collection.findOne({
      _id: new Types.ObjectId(String(legacyInputKey?._id))
    });
    expect(storedKey?.appId).toBeInstanceOf(Types.ObjectId);
    expect(String(legacyInputKey?.appId)).toBe(String(app._id));
    expect(legacyInputKey?.type).toBe('app');
  });

  it.each([false, true])('counts personal quota before/after migration (%s)', async (migrated) => {
    const { owner, members } = await getFakeUsers(1);
    const [app, otherApp] = await MongoApp.create(
      ['quota app', 'other app'].map((name) => ({
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        name,
        type: 'simple'
      }))
    );
    const appId = String(app._id);
    await MongoOpenApi.create(
      Array.from({ length: 99 }, (_, index) => ({
        teamId: owner.teamId,
        tmbId: members[0].tmbId,
        type: 'app',
        appId,
        apiKey: `quota-key-${index}`
      }))
    );
    await MongoOpenApi.collection.insertOne({
      teamId: app.teamId,
      tmbId: app.tmbId,
      ...(migrated ? { type: 'personal' } : {}),
      appId: migrated ? new Types.ObjectId(appId) : appId,
      apiKey: 'migrated-default-app-quota'
    });
    mockAppEnv.OPENAPI_KEY_MAX_COUNT = 2;

    const personal = await Call(createapi.default, {
      auth: owner,
      body: { name: 'personal alongside one legacy default-app key' }
    });
    expect(personal.error).toBeUndefined();
    const last = await Call(createapi.default, {
      auth: owner,
      body: { type: 'app', appId, name: '100th app key with full personal quota' }
    });
    expect(last.error).toBeUndefined();
    const result = await Call(createapi.default, {
      auth: owner,
      body: { type: 'app', appId, name: '101st app key' }
    });
    expect(result.error).toBe(OpenApiErrEnum.exceedLimit);
    expect(
      await MongoOpenApi.collection.countDocuments({
        appId: new Types.ObjectId(appId)
      })
    ).toBe(migrated ? 101 : 100);

    const other = await Call(createapi.default, {
      auth: owner,
      body: { type: 'app', appId: String(otherApp._id), name: 'other app has its own quota' }
    });
    expect(other.error).toBeUndefined();
    const extraPersonal = await Call(createapi.default, {
      auth: owner,
      body: { name: 'personal quota includes the historical key' }
    });
    expect(extraPersonal.error).toBe(OpenApiErrEnum.exceedLimit);
    expect(await MongoOpenApi.countDocuments({ tmbId: owner.tmbId, type: 'personal' })).toBe(
      migrated ? 2 : 1
    );
  });

  it('rechecks membership inside the team lease after a completed handover', async () => {
    const users = await getFakeUsers(1);
    const member = users.members[0];
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: member.teamId,
      resourceId: null,
      tmbId: member.tmbId,
      permission: TeamApikeyCreatePermissionVal
    });
    const app = await MongoApp.create({
      name: 'owned app',
      type: 'simple',
      teamId: member.teamId,
      tmbId: member.tmbId
    });
    lock.beforeCreate = async () => {
      await MongoApp.updateOne({ _id: app._id }, { $set: { tmbId: users.owner.tmbId } });
      await MongoTeamMember.updateOne({ _id: member.tmbId }, { $set: { status: 'leave' } });
    };
    const res = await Call(createapi.default, {
      auth: member,
      body: { type: 'app', appId: String(app._id), name: 'late key' }
    });
    expect(res.error).toBeDefined();
    expect(await MongoOpenApi.countDocuments({ appId: String(app._id) })).toBe(0);
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

  it('rejects appId on a personal credential', async () => {
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
      } as EditApiKeyProps
    });

    expect(res.code).toBe(500);

    const openapi = await MongoOpenApi.findOne({
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      name: 'app auth proxy key'
    }).lean();
    expect(openapi).toBeNull();
  });

  it('uses OPENAPI_KEY_MAX_COUNT from app env as create limit', async () => {
    mockAppEnv.OPENAPI_KEY_MAX_COUNT = 1;
    const users = await getFakeUsers(1);
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: users.members[0].teamId,
      resourceId: null,
      tmbId: users.members[0].tmbId,
      permission: TeamApikeyCreatePermissionVal
    });

    const firstRes = await Call<EditApiKeyProps>(createapi.default, {
      auth: users.members[0],
      body: {
        name: 'first env limited key',
        limit: {
          maxUsagePoints: 1000
        }
      }
    });
    expect(firstRes.code).toBe(200);

    const secondRes = await Call<EditApiKeyProps>(createapi.default, {
      auth: users.members[0],
      body: {
        name: 'second env limited key',
        limit: {
          maxUsagePoints: 1000
        }
      }
    });

    expect(secondRes.code).toBe(500);
    expect(await MongoOpenApi.findOne({ name: 'second env limited key' })).toBeNull();
  });

  it('limits APIKey name to 50 chars', async () => {
    const users = await getFakeUsers(1);
    const allowedName = 'a'.repeat(50);
    const rejectedName = 'b'.repeat(51);

    const allowed = await Call<EditApiKeyProps>(createapi.default, {
      auth: users.owner,
      body: {
        name: allowedName,
        limit: {
          maxUsagePoints: 1000
        }
      }
    });
    const rejected = await Call<EditApiKeyProps>(createapi.default, {
      auth: users.owner,
      body: {
        name: rejectedName,
        limit: {
          maxUsagePoints: 1000
        }
      }
    });

    expect(allowed.code).toBe(200);
    expect(rejected.code).toBe(500);
    expect(await MongoOpenApi.findOne({ name: allowedName })).not.toBeNull();
    expect(await MongoOpenApi.findOne({ name: rejectedName })).toBeNull();
  });

  it('rejects empty APIKey name after trimming', async () => {
    const users = await getFakeUsers(1);

    const res = await Call<EditApiKeyProps>(createapi.default, {
      auth: users.owner,
      body: {
        name: '   ',
        limit: {
          maxUsagePoints: 1000
        }
      }
    });

    expect(res.code).toBe(500);
    expect(await MongoOpenApi.findOne({ name: '   ' })).toBeNull();
  });

  it('creates APIKey with tags that belong to current member', async () => {
    const users = await getFakeUsers(1);
    const [member] = users.members;
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: member.teamId,
      resourceId: null,
      tmbId: member.tmbId,
      permission: TeamApikeyCreatePermissionVal
    });
    const tag = await MongoOpenApiTag.create({
      teamId: member.teamId,
      tmbId: member.tmbId,
      name: '生产',
      normalizedName: '生产',
      type: 'custom',
      order: 100
    });

    const res = await Call<EditApiKeyProps>(createapi.default, {
      auth: member,
      body: {
        name: 'tagged key',
        tags: [String(tag._id)],
        limit: {
          maxUsagePoints: 1000
        }
      } as EditApiKeyProps
    });

    expect(res.code).toBe(200);

    const openapi = await MongoOpenApi.findOne({ name: 'tagged key' }).lean();
    expect((openapi?.tagIds || []).map(String)).toEqual([String(tag._id)]);
  });

  it('rejects creating APIKey with tags from another member', async () => {
    const users = await getFakeUsers(1);
    const [member] = users.members;
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: member.teamId,
      resourceId: null,
      tmbId: member.tmbId,
      permission: TeamApikeyCreatePermissionVal
    });
    const ownerTag = await MongoOpenApiTag.create({
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      name: 'owner tag',
      normalizedName: 'owner tag',
      type: 'custom',
      order: 100
    });

    const res = await Call<EditApiKeyProps>(createapi.default, {
      auth: member,
      body: {
        name: 'invalid tagged key',
        tags: [String(ownerTag._id)],
        limit: {
          maxUsagePoints: 1000
        }
      } as EditApiKeyProps
    });

    expect(res.code).toBe(500);
    expect(await MongoOpenApi.findOne({ name: 'invalid tagged key' })).toBeNull();
  });
});
