import { describe, expect, it } from 'vitest';
import { handler } from '@/pages/api/support/openapi/health';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getRootUser } from '@test/datas/users';

describe('support/openapi/health', () => {
  it('returns appId for legacy app APIKey', async () => {
    const user = await getRootUser();
    const app = await MongoApp.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      name: 'legacy app',
      type: AppTypeEnum.simple
    });
    await MongoOpenApi.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      appId: String(app._id),
      apiKey: 'fastgpt-legacy-app-key',
      name: 'legacy app key'
    });

    const result = await handler({
      query: {
        apiKey: 'fastgpt-legacy-app-key'
      }
    } as any);

    expect(result).toEqual({
      valid: true,
      appId: String(app._id)
    });
  });

  it('omits appId for system APIKey', async () => {
    const user = await getRootUser();
    await MongoOpenApi.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      apiKey: 'fastgpt-system-key',
      name: 'system key'
    });

    const result = await handler({
      query: {
        apiKey: 'fastgpt-system-key'
      }
    } as any);

    expect(result).toEqual({
      valid: true
    });
  });
});
