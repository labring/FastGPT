import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { Types } from 'mongoose';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';

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

const originalFeConfigs = global.feConfigs;

describe('openapi auth', () => {
  let updateApiKeyUsedTimeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    updateApiKeyUsedTimeSpy = vi.spyOn(MongoOpenApi, 'findByIdAndUpdate');
    global.feConfigs = { ...global.feConfigs, isPlus: true } as any;
    await MongoOpenApi.deleteMany({});
  });

  afterAll(() => {
    global.feConfigs = originalFeConfigs;
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
    expect(updateApiKeyUsedTimeSpy).toHaveBeenCalledTimes(1);
    expect(String(updateApiKeyUsedTimeSpy.mock.calls[0][0])).toBe(String(openApi._id));
  });

  it('旧应用 APIKey 按系统 key 鉴权并返回 legacyAppId', async () => {
    await MongoOpenApi.create(legacyAppApiKey);

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
  });

  it('Bearer apiKey-appId 用真实 key 查库并返回 parsedAppId', async () => {
    const user = await MongoUser.create({ username: 'api-key-user', password: 'password' });
    const team = await MongoTeam.create({ name: 'API Key team', ownerId: user._id });
    const member = await MongoTeamMember.create({
      teamId: team._id,
      userId: user._id,
      status: 'active'
    });
    await MongoOpenApi.create({
      ...teamApiKey,
      teamId: String(team._id),
      tmbId: String(member._id)
    });

    const result = await parseHeaderCert({
      req: {
        headers: {
          authorization: `Bearer fastgpt-team-${parsedAppId}`
        }
      } as any,
      authApiKey: true
    });

    expect(result).toMatchObject({
      teamId: String(team._id),
      tmbId: String(member._id),
      appId: '',
      legacyAppId: '',
      parsedAppId,
      apikey: 'fastgpt-team',
      authType: AuthUserTypeEnum.apikey
    });
  });

  it('Bearer apiKey-appId 仍把限额和 lastUsedTime 更新到真实 key', async () => {
    const openApi = await MongoOpenApi.create(teamApiKey);

    await authOpenApiKey({
      apikey: `fastgpt-team-${parsedAppId}`
    });

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

    expect(updateApiKeyUsedTimeSpy).not.toHaveBeenCalled();
  });

  it('商业版拒绝已过期的 API Key', async () => {
    await MongoOpenApi.create({
      ...teamApiKey,
      apiKey: 'fastgpt-expired',
      limit: {
        expiredTime: new Date(Date.now() - 1000),
        maxUsagePoints: -1
      }
    });

    await expect(authOpenApiKey({ apikey: 'fastgpt-expired' })).rejects.toMatchObject({
      name: 'UserError',
      message: expect.stringContaining('is expired')
    });
    expect(updateApiKeyUsedTimeSpy).not.toHaveBeenCalled();
  });

  it('商业版拒绝超过用量额度的 API Key', async () => {
    await MongoOpenApi.create({
      ...teamApiKey,
      apiKey: 'fastgpt-over-usage',
      usagePoints: 2,
      limit: {
        maxUsagePoints: 1
      }
    });

    await expect(authOpenApiKey({ apikey: 'fastgpt-over-usage' })).rejects.toMatchObject({
      name: 'UserError',
      message: expect.stringContaining('is over usage')
    });
    expect(updateApiKeyUsedTimeSpy).not.toHaveBeenCalled();
  });

  it('社区版保持历史行为，不执行商业版 API Key 限额校验', async () => {
    global.feConfigs = { ...global.feConfigs, isPlus: false } as any;
    await MongoOpenApi.create({
      ...teamApiKey,
      apiKey: 'fastgpt-community-expired',
      limit: {
        expiredTime: new Date(Date.now() - 1000),
        maxUsagePoints: -1
      }
    });

    await expect(authOpenApiKey({ apikey: 'fastgpt-community-expired' })).resolves.toMatchObject({
      apikey: 'fastgpt-community-expired'
    });
    expect(updateApiKeyUsedTimeSpy).toHaveBeenCalledTimes(1);
  });

  it('API Key 鉴权只解析凭证，成员状态由具体业务入口校验', async () => {
    const user = await MongoUser.create({
      username: 'inactive-api-key-user',
      password: 'password'
    });
    const team = await MongoTeam.create({ name: 'Inactive API Key team', ownerId: user._id });
    const member = await MongoTeamMember.create({
      teamId: team._id,
      userId: user._id,
      status: 'leave'
    });
    await MongoOpenApi.create({
      ...teamApiKey,
      apiKey: 'fastgpt-inactive-member',
      teamId: String(team._id),
      tmbId: String(member._id)
    });

    await expect(
      parseHeaderCert({
        req: {
          headers: {
            authorization: 'Bearer fastgpt-inactive-member'
          }
        } as any,
        authApiKey: true
      })
    ).resolves.toMatchObject({
      teamId: String(team._id),
      tmbId: String(member._id),
      authType: AuthUserTypeEnum.apikey
    });
    expect(updateApiKeyUsedTimeSpy).toHaveBeenCalledTimes(1);
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
