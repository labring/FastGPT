import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { Types } from 'mongoose';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';

const { mockAuthOpenApiHandler } = vi.hoisted(() => ({
  mockAuthOpenApiHandler: vi.fn()
}));

import { authOpenApiKey } from '@fastgpt/service/support/openapi/auth';

const { parseHeaderCert } = await vi.importActual<
  typeof import('@fastgpt/service/support/permission/auth/common')
>('@fastgpt/service/support/permission/auth/common');

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
  let updateApiKeyUsedTimeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    updateApiKeyUsedTimeSpy = vi.spyOn(MongoOpenApi, 'findByIdAndUpdate');
    global.authOpenApiHandler = mockAuthOpenApiHandler;
    mockAuthOpenApiHandler.mockResolvedValue(undefined);
    await MongoOpenApi.deleteMany({});
  });

  it('团队级 APIKey 保持原有开放 API 权限面', async () => {
    const openApi = await MongoOpenApi.create(teamApiKey);

    const result = await authOpenApiKey({
      apikey: 'fastgpt-team'
    });

    expect(result).toEqual({
      apikey: 'fastgpt-team',
      teamId,
      tmbId,
      appId: '',
      authProxy: false,
      sourceName: 'team key',
      keyType: 'team'
    });
    expect(mockAuthOpenApiHandler).toHaveBeenCalledTimes(1);
    const [{ openApi: authedOpenApi }] = mockAuthOpenApiHandler.mock.calls[0];
    expect(String(authedOpenApi._id)).toBe(String(openApi._id));
    expect(authedOpenApi.apiKey).toBe('fastgpt-team');
    expect(authedOpenApi.name).toBe('team key');
    expect(updateApiKeyUsedTimeSpy).toHaveBeenCalledTimes(1);
    expect(String(updateApiKeyUsedTimeSpy.mock.calls[0][0])).toBe(String(openApi._id));
  });

  it('app 级 APIKey 需要显式开启 app 能力', async () => {
    await MongoOpenApi.create(appApiKey);

    await expect(
      authOpenApiKey({
        apikey: 'fastgpt-app'
      })
    ).rejects.toBe(ERROR_ENUM.unAuthApiKey);

    expect(mockAuthOpenApiHandler).not.toHaveBeenCalled();
    expect(updateApiKeyUsedTimeSpy).not.toHaveBeenCalled();
  });

  it('app 级 APIKey 返回 app 类型，具体入口由 authCert 能力开关控制', async () => {
    const openApi = await MongoOpenApi.create(appApiKey);

    const result = await authOpenApiKey({
      apikey: 'fastgpt-app',
      authAppApiKey: true
    });

    expect(result).toEqual({
      apikey: 'fastgpt-app',
      teamId,
      tmbId,
      appId: 'app-1',
      authProxy: false,
      sourceName: 'app key',
      keyType: 'app'
    });
    expect(mockAuthOpenApiHandler).toHaveBeenCalledTimes(1);
    const [{ openApi: authedOpenApi }] = mockAuthOpenApiHandler.mock.calls[0];
    expect(String(authedOpenApi._id)).toBe(String(openApi._id));
    expect(authedOpenApi.apiKey).toBe('fastgpt-app');
    expect(authedOpenApi.appId).toBe('app-1');
    expect(authedOpenApi.name).toBe('app key');
    expect(updateApiKeyUsedTimeSpy).toHaveBeenCalledTimes(1);
    expect(String(updateApiKeyUsedTimeSpy.mock.calls[0][0])).toBe(String(openApi._id));
  });

  it('app 级 APIKey 在未开启 app 能力时拒绝且不消耗额度', async () => {
    await MongoOpenApi.create(appApiKey);

    await expect(
      authOpenApiKey({
        apikey: 'fastgpt-app',
        authApiKey: true,
        authAppApiKey: false
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

  describe('parseHeaderCert APIKey capability gate', () => {
    const createReq = (authorization: string) =>
      ({
        headers: {
          authorization
        }
      }) as any;

    it('authApiKey 仅允许团队级 APIKey', async () => {
      await MongoOpenApi.create(teamApiKey);

      const result = await parseHeaderCert({
        req: createReq('Bearer fastgpt-team'),
        authApiKey: true
      });

      expect(result).toMatchObject({
        teamId,
        tmbId,
        appId: '',
        apiKeyAppId: '',
        apikey: 'fastgpt-team',
        authType: AuthUserTypeEnum.apikey
      });
    });

    it('authApiKey 拒绝 DB 绑定 app 的 APIKey', async () => {
      await MongoOpenApi.create(appApiKey);

      await expect(
        parseHeaderCert({
          req: createReq('Bearer fastgpt-app'),
          authApiKey: true
        })
      ).rejects.toBe(ERROR_ENUM.unAuthApiKey);

      expect(mockAuthOpenApiHandler).not.toHaveBeenCalled();
      expect(updateApiKeyUsedTimeSpy).not.toHaveBeenCalled();
    });

    it('authApiKey 不拆分 Bearer key-appId，完整 key 不存在时拒绝且不消耗额度', async () => {
      await MongoOpenApi.create(teamApiKey);

      await expect(
        parseHeaderCert({
          req: createReq('Bearer fastgpt-team-app1'),
          authApiKey: true
        })
      ).rejects.toBe(ERROR_ENUM.unAuthApiKey);

      expect(mockAuthOpenApiHandler).not.toHaveBeenCalled();
      expect(updateApiKeyUsedTimeSpy).not.toHaveBeenCalled();
    });

    it('authAppApiKey 允许 DB 绑定 app 的 APIKey', async () => {
      await MongoOpenApi.create(appApiKey);

      const result = await parseHeaderCert({
        req: createReq('Bearer fastgpt-app'),
        authAppApiKey: true
      });

      expect(result).toMatchObject({
        teamId,
        tmbId,
        appId: 'app-1',
        apiKeyAppId: 'app-1',
        apikey: 'fastgpt-app',
        authType: AuthUserTypeEnum.apikey
      });
    });

    it('authAppApiKey 不拆分 Bearer key-appId，完整 key 不存在时拒绝且不消耗额度', async () => {
      await MongoOpenApi.create(teamApiKey);

      await expect(
        parseHeaderCert({
          req: createReq('Bearer fastgpt-team-app1'),
          authAppApiKey: true
        })
      ).rejects.toBe(ERROR_ENUM.unAuthApiKey);

      expect(mockAuthOpenApiHandler).not.toHaveBeenCalled();
      expect(updateApiKeyUsedTimeSpy).not.toHaveBeenCalled();
    });

    it('Bearer key-appId 命中完整团队级 key 时按团队级 APIKey 处理', async () => {
      await MongoOpenApi.create({
        ...teamApiKey,
        apiKey: 'fastgpt-team-app1',
        name: 'team key with dash'
      });

      const result = await parseHeaderCert({
        req: createReq('Bearer fastgpt-team-app1'),
        authApiKey: true
      });

      expect(result).toMatchObject({
        teamId,
        tmbId,
        appId: '',
        apiKeyAppId: '',
        apikey: 'fastgpt-team-app1',
        authType: AuthUserTypeEnum.apikey
      });
      expect(mockAuthOpenApiHandler).toHaveBeenCalledTimes(1);
    });

    it('authAppApiKey 拒绝团队级 APIKey', async () => {
      await MongoOpenApi.create(teamApiKey);

      await expect(
        parseHeaderCert({
          req: createReq('Bearer fastgpt-team'),
          authAppApiKey: true
        })
      ).rejects.toBe(ERROR_ENUM.unAuthApiKey);

      expect(mockAuthOpenApiHandler).not.toHaveBeenCalled();
      expect(updateApiKeyUsedTimeSpy).not.toHaveBeenCalled();
    });

    it('同时开启 authApiKey 和 authAppApiKey 时允许两种 APIKey', async () => {
      await MongoOpenApi.create([teamApiKey, appApiKey]);

      await expect(
        parseHeaderCert({
          req: createReq('Bearer fastgpt-team'),
          authApiKey: true,
          authAppApiKey: true
        })
      ).resolves.toMatchObject({
        apikey: 'fastgpt-team',
        appId: ''
      });

      await expect(
        parseHeaderCert({
          req: createReq('Bearer fastgpt-app'),
          authApiKey: true,
          authAppApiKey: true
        })
      ).resolves.toMatchObject({
        apikey: 'fastgpt-app',
        appId: 'app-1'
      });
    });
  });
});
