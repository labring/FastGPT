vi.unmock('@fastgpt/service/support/permission/auth/common');

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import whoamiDefaultHandler, { handler } from '@/pages/api/support/user/account/whoami';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { SESSION_TTL_SECONDS } from '@fastgpt/dal/redis/caches';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import { AccountCancellationStatus } from '@fastgpt/global/support/user/account/cancellation/constants';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { TokenName } from '@fastgpt/service/support/permission/auth/common';
import { MongoAccountCancellation } from '@fastgpt/service/support/user/account/cancellation/schema';
import * as sessionService from '@fastgpt/service/support/user/session';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';

describe('GET /api/support/user/account/whoami', () => {
  const originalFeConfigs = global.feConfigs;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    global.feConfigs = originalFeConfigs;
  });

  afterAll(() => {
    global.feConfigs = originalFeConfigs;
  });

  it('authenticates Session Token from token header and Cookie without recording DAU tracking', async () => {
    const { owner } = await getFakeUsers(1);
    const createdAt = 1_762_752_000_000;
    const authSessionSpy = vi.spyOn(sessionService, 'authUserSession').mockResolvedValue({
      userId: owner.userId,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      isRoot: false,
      createdAt
    });

    const tokenRes = await Call(whoamiDefaultHandler, {
      headers: {
        token: `${owner.userId}:cli-token`
      }
    });

    expect(tokenRes.code).toBe(200);
    expect(tokenRes.data).toMatchObject({
      authType: 'token',
      user: { userId: owner.userId },
      team: { teamId: owner.teamId, tmbId: owner.tmbId, role: 'owner' },
      isRoot: false,
      session: {
        createdAt,
        expiresAt: createdAt + SESSION_TTL_SECONDS * 1000
      }
    });
    expect(authSessionSpy).toHaveBeenCalledTimes(1);
    expect(pushTrack.dailyUserActive).not.toHaveBeenCalled();

    const cookieRes = await Call(whoamiDefaultHandler, {
      headers: {
        cookie: `${TokenName}=${owner.userId}:cookie-token`
      }
    });
    expect(cookieRes.code).toBe(200);
    expect(cookieRes.data).toMatchObject({
      authType: 'token',
      team: { teamId: owner.teamId }
    });
  });

  it('authenticates personal and app API Keys via Authorization Bearer header', async () => {
    const {
      owner,
      members: [member]
    } = await getFakeUsers(1);
    const app = await MongoApp.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'Docs Assistant',
      type: AppTypeEnum.simple
    });

    await MongoOpenApi.create([
      {
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        type: ApiKeyTypeEnum.personal,
        apiKey: 'fastgpt-cli-personal-a1b2',
        name: 'CLI Personal Key',
        usagePoints: 50,
        limit: {
          maxUsagePoints: 500
        }
      },
      {
        teamId: owner.teamId,
        tmbId: member.tmbId,
        type: ApiKeyTypeEnum.app,
        appId: String(app._id),
        apiKey: 'fastgpt-cli-app-c3d4',
        name: 'CLI App Key'
      }
    ]);

    const personalResult = await handler({
      headers: {
        authorization: `Bearer fastgpt-cli-personal-a1b2-${String(app._id)}`
      }
    } as any);

    expect(personalResult).toMatchObject({
      authType: 'apikey',
      apiKeyType: 'personal',
      team: {
        teamId: owner.teamId,
        permission: { isOwner: true }
      },
      apiKey: {
        name: 'CLI Personal Key',
        maskedKey: '******a1b2',
        limit: {
          maxUsagePoints: 500,
          usagePoints: 50,
          remainingPoints: 450
        }
      }
    });
    expect(JSON.stringify(personalResult)).not.toContain('fastgpt-cli-personal-a1b2');

    // 应用 Key 创建者离职后仍可用。
    await MongoTeamMember.updateOne(
      { _id: member.tmbId },
      { $set: { status: TeamMemberStatusEnum.leave } }
    );
    const appResult = await handler({
      headers: {
        authorization: 'Bearer fastgpt-cli-app-c3d4'
      }
    } as any);

    expect(appResult).toMatchObject({
      authType: 'apikey',
      apiKeyType: 'app',
      team: {
        teamId: owner.teamId,
        permission: null
      },
      apiKey: {
        name: 'CLI App Key',
        maskedKey: '******c3d4',
        boundAppId: String(app._id),
        boundAppName: 'Docs Assistant',
        authProxy: false
      }
    });
    expect(JSON.stringify(appResult)).not.toContain('fastgpt-cli-app-c3d4');
  });

  it('rejects unauthenticated requests, expired API keys, and cancelling accounts', async () => {
    const {
      owner,
      members: [member]
    } = await getFakeUsers(1);
    const app = await MongoApp.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'Cancel Test App',
      type: AppTypeEnum.simple
    });

    await MongoOpenApi.create([
      {
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        type: ApiKeyTypeEnum.personal,
        apiKey: 'fastgpt-expired-key',
        name: 'Expired Key',
        limit: {
          expiredTime: new Date('2020-01-01T00:00:00.000Z'),
          maxUsagePoints: -1
        }
      },
      {
        teamId: owner.teamId,
        tmbId: member.tmbId,
        type: ApiKeyTypeEnum.app,
        appId: String(app._id),
        apiKey: 'fastgpt-app-cancel-test',
        name: 'App Key'
      }
    ]);

    const unauthRes = await Call(whoamiDefaultHandler, { headers: {} });
    expect(unauthRes.code).toBe(500);
    expect(unauthRes.error).toBe(ERROR_ENUM.unAuthorization);

    global.feConfigs = { ...global.feConfigs, isPlus: true } as any;
    await expect(
      handler({ headers: { authorization: 'Bearer fastgpt-expired-key' } } as any)
    ).rejects.toThrow('API Key is expired');

    // 创建者账号注销中会阻止 token，但应用 Key 仍受团队而非个人注销状态影响。
    await MongoAccountCancellation.create({
      userId: member.userId,
      status: AccountCancellationStatus.pending,
      requestedAt: new Date()
    });
    vi.spyOn(sessionService, 'authUserSession').mockResolvedValueOnce({
      userId: member.userId,
      teamId: member.teamId,
      tmbId: member.tmbId,
      isRoot: false,
      createdAt: 1000
    });

    await expect(
      handler({ headers: { token: `${member.userId}:cancelled-token` } } as any)
    ).rejects.toThrow();

    await expect(
      handler({ headers: { authorization: 'Bearer fastgpt-app-cancel-test' } } as any)
    ).resolves.toMatchObject({
      authType: 'apikey',
      apiKeyType: 'app',
      apiKey: { boundAppId: String(app._id) }
    });
  });
});
