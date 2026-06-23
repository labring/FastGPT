import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { Types } from 'mongoose';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';

const { mockAuthOpenApiHandler } = vi.hoisted(() => ({
  mockAuthOpenApiHandler: vi.fn()
}));

import { authOpenApiKey, resolveOpenApiCredential } from '@fastgpt/service/support/openapi/auth';

const { parseHeaderCert } = await vi.importActual<
  typeof import('@fastgpt/service/support/permission/auth/common')
>('@fastgpt/service/support/permission/auth/common');

const teamId = new Types.ObjectId().toString();
const tmbId = new Types.ObjectId().toString();
const appId = new Types.ObjectId().toString();
const parsedAppId = new Types.ObjectId().toString();

const teamApiKey = {
  teamId,
  tmbId,
  apiKey: 'fastgpt-team',
  name: 'team key'
};

const legacyAppApiKey = {
  ...teamApiKey,
  apiKey: 'fastgpt-app',
  appId,
  name: 'legacy app key'
};

describe('openapi auth', () => {
  let updateApiKeyUsedTimeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    updateApiKeyUsedTimeSpy = vi.spyOn(MongoOpenApi, 'findByIdAndUpdate');
    global.authOpenApiHandler = mockAuthOpenApiHandler;
    mockAuthOpenApiHandler.mockResolvedValue(undefined);
    await MongoOpenApi.deleteMany({});
  });

  it('解析 APIKey 兼容凭证时只把 ObjectId 后缀识别为 appId', () => {
    expect(resolveOpenApiCredential(`fastgpt-team-${parsedAppId}`)).toEqual({
      apikey: 'fastgpt-team',
      parsedAppId
    });

    expect(resolveOpenApiCredential('fastgpt-team-app1')).toEqual({
      apikey: 'fastgpt-team-app1',
      parsedAppId: ''
    });
  });

  it('系统 APIKey 鉴权返回真实 key 和空兼容 appId', async () => {
    const openApi = await MongoOpenApi.create(teamApiKey);

    const result = await authOpenApiKey({
      apikey: 'fastgpt-team'
    });

    expect(result).toEqual({
      apikey: 'fastgpt-team',
      teamId,
      tmbId,
      legacyAppId: '',
      parsedAppId: '',
      authProxy: false,
      sourceName: 'team key'
    });
    expect(mockAuthOpenApiHandler).toHaveBeenCalledTimes(1);
    const [{ openApi: authedOpenApi }] = mockAuthOpenApiHandler.mock.calls[0];
    expect(String(authedOpenApi._id)).toBe(String(openApi._id));
    expect(authedOpenApi.apiKey).toBe('fastgpt-team');
    expect(updateApiKeyUsedTimeSpy).toHaveBeenCalledTimes(1);
    expect(String(updateApiKeyUsedTimeSpy.mock.calls[0][0])).toBe(String(openApi._id));
  });

  it('旧应用 APIKey 按系统 key 鉴权并返回 legacyAppId', async () => {
    const openApi = await MongoOpenApi.create(legacyAppApiKey);

    const result = await authOpenApiKey({
      apikey: 'fastgpt-app'
    });

    expect(result).toEqual({
      apikey: 'fastgpt-app',
      teamId,
      tmbId,
      legacyAppId: appId,
      parsedAppId: '',
      authProxy: false,
      sourceName: 'legacy app key'
    });
    expect(mockAuthOpenApiHandler).toHaveBeenCalledTimes(1);
    const [{ openApi: authedOpenApi }] = mockAuthOpenApiHandler.mock.calls[0];
    expect(String(authedOpenApi._id)).toBe(String(openApi._id));
    expect(authedOpenApi.appId).toBe(appId);
  });

  it('Bearer apiKey-appId 用真实 key 查库并返回 parsedAppId', async () => {
    await MongoOpenApi.create(teamApiKey);

    const result = await parseHeaderCert({
      req: {
        headers: {
          authorization: `Bearer fastgpt-team-${parsedAppId}`
        }
      } as any,
      authApiKey: true
    });

    expect(result).toMatchObject({
      teamId,
      tmbId,
      appId: '',
      legacyAppId: '',
      parsedAppId,
      apikey: 'fastgpt-team',
      authType: AuthUserTypeEnum.apikey
    });
    expect(mockAuthOpenApiHandler).toHaveBeenCalledTimes(1);
  });

  it('Bearer apiKey-appId 仍把限额和 lastUsedTime 更新到真实 key', async () => {
    const openApi = await MongoOpenApi.create(teamApiKey);

    await authOpenApiKey({
      apikey: `fastgpt-team-${parsedAppId}`
    });

    const [{ openApi: authedOpenApi }] = mockAuthOpenApiHandler.mock.calls[0];
    expect(String(authedOpenApi._id)).toBe(String(openApi._id));
    expect(authedOpenApi.apiKey).toBe('fastgpt-team');
    expect(String(updateApiKeyUsedTimeSpy.mock.calls[0][0])).toBe(String(openApi._id));
  });

  it('authApiKey=false 时拒绝且不消耗额度', async () => {
    await MongoOpenApi.create(teamApiKey);

    await expect(
      authOpenApiKey({
        apikey: 'fastgpt-team',
        authApiKey: false
      })
    ).rejects.toBe(ERROR_ENUM.unAuthApiKey);

    expect(mockAuthOpenApiHandler).not.toHaveBeenCalled();
    expect(updateApiKeyUsedTimeSpy).not.toHaveBeenCalled();
  });

  it('完整 key 不存在时拒绝且不消耗额度', async () => {
    await MongoOpenApi.create(teamApiKey);

    await expect(
      parseHeaderCert({
        req: {
          headers: {
            authorization: 'Bearer fastgpt-missing'
          }
        } as any,
        authApiKey: true
      })
    ).rejects.toBe(ERROR_ENUM.unAuthApiKey);

    expect(mockAuthOpenApiHandler).not.toHaveBeenCalled();
    expect(updateApiKeyUsedTimeSpy).not.toHaveBeenCalled();
  });

  it('返回 APIKey 是否开启 authProxy', async () => {
    await MongoOpenApi.create({
      ...teamApiKey,
      apiKey: 'fastgpt-team-auth-proxy',
      authProxy: true
    });

    const result = await authOpenApiKey({
      apikey: 'fastgpt-team-auth-proxy'
    });

    expect(result.authProxy).toBe(true);
  });
});
