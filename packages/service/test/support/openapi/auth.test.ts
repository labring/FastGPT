import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { Types } from 'mongoose';

const { mockAuthOpenApiHandler } = vi.hoisted(() => ({
  mockAuthOpenApiHandler: vi.fn()
}));

import {
  authOpenApiKey,
  isAppApiKeyChatCompletionsRequest
} from '@fastgpt/service/support/openapi/auth';

const teamId = new Types.ObjectId().toString();
const tmbId = new Types.ObjectId().toString();

const teamApiKey = {
  teamId,
  tmbId,
  apiKey: 'fastgpt-team',
  name: 'team key'
};

const appApiKey = {
  ...teamApiKey,
  apiKey: 'fastgpt-app',
  appId: 'app-1',
  name: 'app key'
};

describe('openapi auth', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    global.authOpenApiHandler = mockAuthOpenApiHandler;
    mockAuthOpenApiHandler.mockResolvedValue(undefined);
    await MongoOpenApi.deleteMany({});
  });

  describe('isAppApiKeyChatCompletionsRequest', () => {
    it('app 级 APIKey 允许 POST chat/completions', () => {
      expect(
        isAppApiKeyChatCompletionsRequest({
          method: 'POST',
          url: '/api/v1/chat/completions'
        })
      ).toBe(true);
      expect(
        isAppApiKeyChatCompletionsRequest({
          method: 'post',
          url: '/api/v2/chat/completions?stream=true'
        })
      ).toBe(true);
    });

    it('app 级 APIKey 拒绝非 chat/completions 路径和非 POST 方法', () => {
      expect(
        isAppApiKeyChatCompletionsRequest({
          method: 'POST',
          url: '/api/core/chat/init'
        })
      ).toBe(false);
      expect(
        isAppApiKeyChatCompletionsRequest({
          method: 'GET',
          url: '/api/v1/chat/completions'
        })
      ).toBe(false);
      expect(isAppApiKeyChatCompletionsRequest(undefined)).toBe(false);
    });
  });

  it('团队级 APIKey 保持原有开放 API 权限面', async () => {
    const openApi = await MongoOpenApi.create(teamApiKey);

    const result = await authOpenApiKey({
      apikey: 'fastgpt-team',
      req: {
        method: 'POST',
        url: '/api/core/dataset/list'
      } as any
    });

    expect(result).toEqual({
      apikey: 'fastgpt-team',
      teamId,
      tmbId,
      appId: '',
      authProxy: false,
      sourceName: 'team key'
    });
    expect(mockAuthOpenApiHandler).toHaveBeenCalledTimes(1);
    const [{ openApi: authedOpenApi }] = mockAuthOpenApiHandler.mock.calls[0];
    expect(String(authedOpenApi._id)).toBe(String(openApi._id));
    expect(authedOpenApi.apiKey).toBe('fastgpt-team');
    expect(authedOpenApi.name).toBe('team key');
  });

  it('app 级 APIKey 仅允许 chat/completions', async () => {
    const openApi = await MongoOpenApi.create(appApiKey);

    const result = await authOpenApiKey({
      apikey: 'fastgpt-app',
      req: {
        method: 'POST',
        url: '/api/v1/chat/completions'
      } as any
    });

    expect(result).toEqual({
      apikey: 'fastgpt-app',
      teamId,
      tmbId,
      appId: 'app-1',
      authProxy: false,
      sourceName: 'app key'
    });
    expect(mockAuthOpenApiHandler).toHaveBeenCalledTimes(1);
    const [{ openApi: authedOpenApi }] = mockAuthOpenApiHandler.mock.calls[0];
    expect(String(authedOpenApi._id)).toBe(String(openApi._id));
    expect(authedOpenApi.apiKey).toBe('fastgpt-app');
    expect(authedOpenApi.appId).toBe('app-1');
    expect(authedOpenApi.name).toBe('app key');
  });

  it('app 级 APIKey 调用其它开放 API 时拒绝且不消耗额度', async () => {
    await MongoOpenApi.create(appApiKey);

    await expect(
      authOpenApiKey({
        apikey: 'fastgpt-app',
        req: {
          method: 'GET',
          url: '/api/core/chat/init'
        } as any
      })
    ).rejects.toBe(ERROR_ENUM.unAuthApiKey);

    expect(mockAuthOpenApiHandler).not.toHaveBeenCalled();
  });

  it('旧版 Authorization 里附带 appId 时同样只能调用 chat/completions', async () => {
    await MongoOpenApi.create(teamApiKey);

    await expect(
      authOpenApiKey({
        apikey: 'fastgpt-team',
        authorizationAppId: 'app-1',
        req: {
          method: 'POST',
          url: '/api/core/dataset/list'
        } as any
      })
    ).rejects.toBe(ERROR_ENUM.unAuthApiKey);

    expect(mockAuthOpenApiHandler).not.toHaveBeenCalled();
  });

  it('返回 APIKey 是否开启 authProxy', async () => {
    await MongoOpenApi.create({
      ...teamApiKey,
      apiKey: 'fastgpt-team-auth-proxy',
      authProxy: true
    });

    const result = await authOpenApiKey({
      apikey: 'fastgpt-team-auth-proxy',
      req: {
        method: 'POST',
        url: '/api/core/dataset/list'
      } as any
    });

    expect(result.authProxy).toBe(true);
  });
});
