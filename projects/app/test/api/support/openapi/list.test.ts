import { describe, expect, it } from 'vitest';
import handler from '@/pages/api/support/openapi/list';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getFakeUsers, getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';

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

  it('旧 appId 查询参数被忽略，只返回本人 APIKey', async () => {
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
        appId: String(app._id),
        apiKey: 'fastgpt-app-secret',
        name: 'legacy app key'
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
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('legacy app key');
    expect(result.data[0].apiKey).toBe('******cret');
    expect(result.data[0].canCopy).toBe(true);
    expect(result.data[0].authProxy).toBe(false);
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
});
