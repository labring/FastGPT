import { describe, expect, it } from 'vitest';
import handler from '@/pages/api/support/openapi/list';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getFakeUsers, getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { MongoOpenApiTag } from '@fastgpt/service/support/openapi/tag/schema';

describe('support/openapi/list', () => {
  it('团队级 APIKey 列表对有复制权限的记录返回脱敏值和复制权限', async () => {
    const user = await getRootUser();
    await MongoOpenApi.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      apiKey: 'fastgpt-team-secret',
      name: 'team key'
    });

    const result = await Call(handler, {
      auth: user
    });

    expect(result.code).toBe(200);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].apiKey).toBe('******cret');
    expect(result.data[0].canCopy).toBe(true);
    expect(result.data[0].authProxy).toBe(false);
  });

  it('团队级 APIKey 列表只返回当前登录成员自己的记录', async () => {
    const { manager, members } = await getFakeUsers(1);
    const [member] = members;

    await MongoOpenApi.create([
      {
        teamId: manager.teamId,
        tmbId: manager.tmbId,
        apiKey: 'fastgpt-manager-secret',
        name: 'manager key'
      },
      {
        teamId: member.teamId,
        tmbId: member.tmbId,
        apiKey: 'fastgpt-member-secret',
        name: 'member key'
      }
    ]);

    const result = await Call(handler, {
      auth: manager
    });

    expect(result.code).toBe(200);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('manager key');
    expect(result.data[0].apiKey).toBe('******cret');
    expect(result.data[0].canCopy).toBe(true);
  });

  it('旧 appId 查询参数只用于置顶排序，不扩大可见范围', async () => {
    const { owner, members } = await getFakeUsers(1);
    const [member] = members;
    const app = await MongoApp.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'test app',
      type: AppTypeEnum.simple
    });

    await MongoOpenApi.create([
      {
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        createTime: new Date('2024-01-01T00:00:00.000Z'),
        appId: String(app._id),
        apiKey: 'fastgpt-app-secret',
        name: 'legacy app key'
      },
      {
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        createTime: new Date('2025-01-01T00:00:00.000Z'),
        apiKey: 'fastgpt-new-global-secret',
        name: 'new global key'
      },
      {
        teamId: member.teamId,
        tmbId: member.tmbId,
        appId: String(app._id),
        apiKey: 'fastgpt-member-app-secret',
        name: 'member legacy app key'
      }
    ]);

    const result = await Call(handler, {
      auth: owner,
      query: {
        appId: String(app._id)
      }
    });

    expect(result.code).toBe(200);
    expect(result.data).toHaveLength(2);
    expect(result.data[0].name).toBe('legacy app key');
    expect(result.data[0].apiKey).toBe('******cret');
    expect(result.data[0].canCopy).toBe(true);
    expect(result.data[0].authProxy).toBe(false);
    expect(result.data[1].name).toBe('new global key');
  });

  it('团队级 APIKey 列表返回 authProxy 状态', async () => {
    const user = await getRootUser();
    await MongoOpenApi.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      apiKey: 'fastgpt-auth-proxy-secret',
      authProxy: true,
      name: 'team auth proxy key'
    });

    const result = await Call(handler, {
      auth: user
    });

    expect(result.code).toBe(200);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].authProxy).toBe(true);
  });

  it('returns tags and filters APIKeys by keyword and tags', async () => {
    const user = await getRootUser();
    const [prodTag, customerTag] = await MongoOpenApiTag.create([
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        name: '生产环境',
        normalizedName: '生产环境',
        type: 'custom',
        order: 100
      },
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        name: '客户 A',
        normalizedName: '客户 a',
        type: 'custom',
        order: 101
      }
    ]);
    await MongoOpenApi.create([
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        apiKey: 'fastgpt-production-secret',
        name: 'production customer key',
        tagIds: [prodTag._id, customerTag._id]
      },
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        apiKey: 'fastgpt-debug-secret',
        name: 'debug key',
        tagIds: [prodTag._id]
      }
    ]);

    const result = await Call(handler, {
      auth: user,
      query: {
        keyword: 'customer',
        tags: [String(prodTag._id), String(customerTag._id)]
      }
    });

    expect(result.code).toBe(200);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('production customer key');
    expect(result.data[0].tagIds).toEqual([String(prodTag._id), String(customerTag._id)]);
    expect(result.data[0].tags.map((tag) => tag.name)).toEqual(['生产环境', '客户 A']);

    const commaQueryResult = await Call(handler, {
      auth: user,
      query: {
        tags: `${prodTag._id},${customerTag._id}`
      }
    });
    expect(commaQueryResult.code).toBe(200);
    expect(commaQueryResult.data.map((item) => item.name)).toEqual(['production customer key']);
  });

  it('filters APIKeys by key value keyword contains match', async () => {
    const user = await getRootUser();
    await MongoOpenApi.create([
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        apiKey: 'fastgpt-search-value-secret',
        name: 'normal name'
      },
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        apiKey: 'fastgpt-other-secret',
        name: 'other name'
      }
    ]);

    const result = await Call(handler, {
      auth: user,
      query: {
        keyword: 'search-value'
      }
    });

    expect(result.code).toBe(200);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('normal name');
    expect(result.data[0].apiKey).toBe('******cret');

    const discontinuousResult = await Call(handler, {
      auth: user,
      query: {
        keyword: 'searchsecret'
      }
    });

    expect(discontinuousResult.code).toBe(200);
    expect(discontinuousResult.data).toHaveLength(0);

    const shortKeyFragmentResult = await Call(handler, {
      auth: user,
      query: {
        keyword: 'val'
      }
    });

    expect(shortKeyFragmentResult.code).toBe(200);
    expect(shortKeyFragmentResult.data).toHaveLength(1);
    expect(shortKeyFragmentResult.data[0].name).toBe('normal name');
  });

  it('returns persisted appName snapshot without filling missing appName on list', async () => {
    const user = await getRootUser();
    const app = await MongoApp.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      name: '历史应用',
      type: AppTypeEnum.simple
    });
    const openapi = await MongoOpenApi.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      appId: String(app._id),
      apiKey: 'fastgpt-legacy-appname-secret',
      name: 'legacy appName key'
    });
    await MongoOpenApi.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      appId: String(app._id),
      appName: '已有快照',
      apiKey: 'fastgpt-existing-appname-secret',
      name: 'existing appName key'
    });

    const result = await Call(handler, {
      auth: user
    });

    expect(result.code).toBe(200);
    expect(result.data.find((item) => item.name === 'legacy appName key')?.appName).toBeUndefined();
    expect(result.data.find((item) => item.name === 'existing appName key')?.appName).toBe(
      '已有快照'
    );

    const updated = await MongoOpenApi.findById(openapi._id).lean();
    expect(updated?.appName).toBeUndefined();
  });

  it('sorts by last used time with appId priority first', async () => {
    const user = await getRootUser();
    const app = await MongoApp.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      name: '排序应用',
      type: AppTypeEnum.simple
    });

    await MongoOpenApi.create([
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        appId: String(app._id),
        apiKey: 'fastgpt-app-old-used',
        name: 'app old used',
        lastUsedTime: new Date('2024-01-01T00:00:00.000Z')
      },
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        apiKey: 'fastgpt-global-new-used',
        name: 'global new used',
        lastUsedTime: new Date('2026-01-01T00:00:00.000Z')
      },
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        apiKey: 'fastgpt-global-middle-used',
        name: 'global middle used',
        lastUsedTime: new Date('2025-01-01T00:00:00.000Z')
      }
    ]);

    const result = await Call(handler, {
      auth: user,
      query: {
        appId: String(app._id),
        sortBy: 'lastUsedTime'
      }
    });

    expect(result.code).toBe(200);
    expect(result.data.map((item) => item.name)).toEqual([
      'app old used',
      'global new used',
      'global middle used'
    ]);
  });

  it('sorts by remaining points ascending with unlimited keys last', async () => {
    const user = await getRootUser();
    await MongoOpenApi.create([
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        apiKey: 'fastgpt-low-remaining',
        name: 'low remaining',
        usagePoints: 90,
        limit: {
          maxUsagePoints: 100
        }
      },
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        apiKey: 'fastgpt-high-remaining',
        name: 'high remaining',
        usagePoints: 10,
        limit: {
          maxUsagePoints: 100
        }
      },
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        apiKey: 'fastgpt-unlimited',
        name: 'unlimited remaining',
        usagePoints: 999,
        limit: {
          maxUsagePoints: -1
        }
      }
    ]);

    const result = await Call(handler, {
      auth: user,
      query: {
        sortBy: 'remainingPoints'
      }
    });

    expect(result.code).toBe(200);
    expect(result.data.map((item) => item.name)).toEqual([
      'low remaining',
      'high remaining',
      'unlimited remaining'
    ]);
  });
});
