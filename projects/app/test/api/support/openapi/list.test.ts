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

  it('团队级 APIKey 列表对无复制权限的记录保持脱敏', async () => {
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
    expect(result.data).toHaveLength(2);

    const resultMap = Object.fromEntries(
      result.data.map((item: { name: string; apiKey: string; canCopy: boolean }) => [
        item.name,
        item
      ])
    );
    expect(resultMap['manager key'].apiKey).toBe('******cret');
    expect(resultMap['manager key'].canCopy).toBe(true);
    expect(resultMap['member key'].apiKey).toBe('******cret');
    expect(resultMap['member key'].canCopy).toBe(false);
  });

  it('应用级 APIKey 列表返回脱敏值和复制权限', async () => {
    const user = await getRootUser();
    const app = await MongoApp.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      name: 'test app',
      type: AppTypeEnum.simple
    });

    await MongoOpenApi.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      appId: String(app._id),
      apiKey: 'fastgpt-app-secret',
      name: 'app key'
    });

    const result = await Call(handler, {
      auth: user,
      query: {
        appId: String(app._id)
      }
    });

    expect(result.code).toBe(200);
    expect(result.data).toHaveLength(1);
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
