import handler from '@/pages/api/admin/initv4151';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('admin/initv4151', () => {
  it('为有 appId 且缺少 appName 的历史 APIKey 回填应用名', async () => {
    const user = await getRootUser();
    const app = await MongoApp.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      name: '历史应用',
      type: AppTypeEnum.simple
    });
    const missingAppId = String(new Types.ObjectId());

    await MongoOpenApi.create([
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        appId: String(app._id),
        apiKey: 'fastgpt-legacy-app-key',
        name: 'legacy app key'
      },
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        appId: String(app._id),
        appName: '已有快照',
        apiKey: 'fastgpt-existing-appname-key',
        name: 'existing appName key'
      },
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        appId: missingAppId,
        apiKey: 'fastgpt-missing-app-key',
        name: 'missing app key'
      },
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        appId: 'invalid-app-id',
        apiKey: 'fastgpt-invalid-appid-key',
        name: 'invalid appId key'
      }
    ]);

    const result = await Call(handler, {
      auth: user
    });

    expect(result.code).toBe(200);
    expect(result.data.updatedRecords).toBe(1);
    expect(result.data.skippedMissingApp).toBe(1);
    expect(result.data.skippedInvalidAppId).toBe(1);

    const migrated = await MongoOpenApi.findOne({ name: 'legacy app key' }).lean();
    const existing = await MongoOpenApi.findOne({ name: 'existing appName key' }).lean();
    const missing = await MongoOpenApi.findOne({ name: 'missing app key' }).lean();
    const invalid = await MongoOpenApi.findOne({ name: 'invalid appId key' }).lean();

    expect(migrated?.appName).toBe('历史应用');
    expect(existing?.appName).toBe('已有快照');
    expect(missing?.appName).toBeUndefined();
    expect(invalid?.appName).toBeUndefined();
  });
});
