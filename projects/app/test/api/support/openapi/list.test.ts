import { describe, expect, it } from 'vitest';
import handler from '@/pages/api/support/openapi/list';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';

describe('support/openapi/list', () => {
  it('团队级 APIKey 列表保持脱敏返回', async () => {
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
  });

  it('应用级 APIKey 列表返回明文供发布渠道重复复制', async () => {
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
    expect(result.data[0].apiKey).toBe('fastgpt-app-secret');
  });
});
