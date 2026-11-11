import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  log: vi.fn()
}));

vi.unmock('@fastgpt/service/common/http/entry');
vi.unmock('@fastgpt/service/support/permission/auth/common');
vi.mock('@fastgpt/service/common/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/logger')>()),
  getLogger: () => loggerMocks
}));
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import healthApi, { handler } from '@/pages/api/support/openapi/health';
import { jsonRes } from '@fastgpt/service/common/response';
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
    // 用原始集合模拟旧版缺少 type 的记录，保留历史数据兼容验证。
    await MongoOpenApi.collection.insertOne(
      new MongoOpenApi({
        teamId: user.teamId,
        tmbId: user.tmbId,
        appId: String(app._id),
        apiKey: 'fastgpt-legacy-app-key',
        name: 'legacy app key',
        usagePoints: 25,
        limit: {
          maxUsagePoints: 1000
        }
      }).toObject({ getters: false })
    );

    const result = await handler({
      headers: {
        authorization: 'Bearer fastgpt-legacy-app-key'
      }
    } as any);

    expect(result).toEqual({
      valid: true,
      type: 'app',
      usagePoints: 25,
      maxUsagePoints: 1000,
      appId: String(app._id)
    });
  });

  it('omits appId for system APIKey', async () => {
    const user = await getRootUser();
    await MongoOpenApi.create({
      type: ApiKeyTypeEnum.personal,
      teamId: user.teamId,
      tmbId: user.tmbId,
      apiKey: 'fastgpt-system-key',
      name: 'system key'
    });

    const result = await handler({
      headers: {
        authorization: 'Bearer fastgpt-system-key'
      }
    } as any);

    expect(result).toEqual({
      valid: true,
      type: 'personal',
      usagePoints: 0,
      maxUsagePoints: -1
    });
  });

  it('supports raw APIKey in Authorization header and rejects query-only requests', async () => {
    const user = await getRootUser();
    await MongoOpenApi.create({
      type: ApiKeyTypeEnum.personal,
      teamId: user.teamId,
      tmbId: user.tmbId,
      apiKey: 'fastgpt-raw-header-key',
      name: 'raw header key'
    });

    const result = await handler({
      headers: {
        authorization: 'fastgpt-raw-header-key'
      }
    } as any);

    expect(result).toEqual({
      valid: true,
      type: 'personal',
      usagePoints: 0,
      maxUsagePoints: -1
    });

    await expect(
      handler({
        headers: {},
        query: {
          apiKey: 'fastgpt-raw-header-key'
        }
      } as any)
    ).rejects.toBe(ERROR_ENUM.unAuthorization);
  });

  it('redacts legacy apiKey query parameter in entry logs and error responses when rejecting query-only requests', async () => {
    loggerMocks.info.mockClear();
    const legacySecret = 'fastgpt-legacy-query-secret';
    const req = Object.assign(new IncomingMessage(new Socket()), {
      method: 'GET',
      url: `/api/support/openapi/health?apiKey=${legacySecret}`,
      headers: {},
      query: { apiKey: legacySecret }
    });
    const res = new ServerResponse(req);
    onTestFinished(() => {
      res.destroy();
      req.socket.destroy();
    });

    await healthApi(req as any, res as any);

    expect(jsonRes).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        code: 500,
        error: ERROR_ENUM.unAuthorization,
        url: '/api/support/openapi/health?apiKey=REDACTED'
      })
    );
    const loggedText = JSON.stringify(loggerMocks.info.mock.calls);
    expect(loggedText).toContain('/api/support/openapi/health?apiKey=REDACTED');
    expect(loggedText).not.toContain(legacySecret);
  });
});
