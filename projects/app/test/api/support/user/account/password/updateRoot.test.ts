import type { IssuedSessionCredentials as Credentials } from '@fastgpt/global/support/user/session/type';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashStr } from '@fastgpt/global/common/string/tools';
import type { UpdateRootPasswordBody } from '@fastgpt/global/openapi/support/user/account/password/api';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { initTeamFreePlan } from '@fastgpt/service/support/wallet/sub/utils';
import updateRootPasswordApi from '@/pages/api/support/user/account/password/updateRoot';
import { Call } from '@test/utils/request';
import { delUserAllSession, rekeyUserSession } from '@fastgpt/service/support/user/session';

vi.mock('@fastgpt/service/support/user/session', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    rekeyUserSession: vi.fn().mockResolvedValue({ token: 'rekeyed-session' }),
    delUserAllSession: vi.fn().mockResolvedValue(undefined)
  };
});

const mocks = vi.hoisted(() => ({
  withUserLock: vi.fn(),
  assertPasswordUpdateRateLimit: vi.fn()
}));

vi.mock('@fastgpt/service/common/rateLimit/interface/accountVerification', () => ({
  assertPasswordUpdateRateLimit: mocks.assertPasswordUpdateRateLimit
}));

vi.mock('@fastgpt/service/support/user/lock', () => ({
  withUserLock: mocks.withUserLock
}));

describe('password/updateRoot API', () => {
  let rootUser: any;
  let testTeam: any;
  let testTmb: any;

  const OLD_PASSWORD = 'old-root-password';

  beforeEach(async () => {
    mocks.withUserLock.mockImplementation((_userId: string, fn: () => Promise<unknown>) => fn());
    mocks.assertPasswordUpdateRateLimit.mockResolvedValue(undefined);
    global.feConfigs = { ...global.feConfigs, sso: undefined, isPlus: false };
    global.systemEnv = { ...global.systemEnv, sso: undefined };
    await MongoUser.deleteMany({ username: 'root' });
    rootUser = await MongoUser.create({
      username: 'root',
      password: hashStr(OLD_PASSWORD)
    });
    testTeam = await MongoTeam.create({
      name: 'Root Team',
      ownerId: rootUser._id
    });
    await initTeamFreePlan({ teamId: String(testTeam._id) });
    testTmb = await MongoTeamMember.create({
      teamId: testTeam._id,
      userId: rootUser._id,
      status: 'active',
      role: 'owner'
    });
    vi.clearAllMocks();
  });

  const getAuth = (userId = String(rootUser._id), isRoot = true) =>
    ({
      userId,
      teamId: String(testTeam._id),
      tmbId: String(testTmb._id),
      isRoot,
      sessionId: 'current-session'
    }) as any;

  it.each([false, true])(
    'returns replacement credentials without exposing browser Refresh (native=%s)',
    async (native) => {
      const now = Date.now();
      const credentials = {
        token: 'at.replacement',
        refreshToken: 'rt.replacement',
        session: {
          sessionId: 'user:device',
          contextVersion: 2,
          generation: 2,
          serverTime: now,
          createdAt: now,
          accessExpiresAt: now + 900_000,
          refreshExpiresAt: now + 604_800_000,
          absoluteExpiresAt: now + 2_592_000_000
        }
      };
      vi.mocked(rekeyUserSession).mockResolvedValueOnce(credentials);
      const response = await Call(updateRootPasswordApi, {
        body: { oldPsw: hashStr(OLD_PASSWORD), newPsw: hashStr('native-new-password') },
        auth: getAuth(),
        headers: {
          'x-fastgpt-session-transport': 'header',
          ...(native ? {} : { origin: 'https://fastgpt.example.com' })
        }
      });
      expect(response.code).toBe(200);
      expect(response.data).toEqual(
        native ? credentials : { token: credentials.token, session: credentials.session }
      );
    }
  );

  it('updates the root password in OSS when the old password matches', async () => {
    const newPsw = hashStr('new-root-password');
    const response = await Call<UpdateRootPasswordBody, Record<string, never>, Credentials>(
      updateRootPasswordApi,
      {
        body: {
          oldPsw: hashStr(OLD_PASSWORD),
          newPsw
        },
        auth: getAuth()
      }
    );

    expect(response.code).toBe(200);
    expect(await MongoUser.exists({ _id: rootUser._id, password: newPsw })).toBeTruthy();
    expect(delUserAllSession).toHaveBeenCalledWith(String(rootUser._id), ['current-session']);
  });

  it('requires the old password when root already has a stored password', async () => {
    const response = await Call<UpdateRootPasswordBody, Record<string, never>, Credentials>(
      updateRootPasswordApi,
      {
        body: { newPsw: hashStr('new-root-password') },
        auth: getAuth()
      }
    );

    expect(response.code).toBe(500);
    expect(response.error).toMatchObject({ message: UserErrEnum.oldPasswordError });
    expect(
      await MongoUser.exists({ _id: rootUser._id, password: hashStr(OLD_PASSWORD) })
    ).toBeTruthy();
  });

  it('rejects a wrong old password', async () => {
    const response = await Call<UpdateRootPasswordBody, Record<string, never>, Credentials>(
      updateRootPasswordApi,
      {
        body: {
          oldPsw: hashStr('wrong-old-password'),
          newPsw: hashStr('new-root-password')
        },
        auth: getAuth()
      }
    );

    expect(response.code).toBe(500);
    expect(response.error).toMatchObject({ message: UserErrEnum.oldPasswordError });
    expect(delUserAllSession).not.toHaveBeenCalled();
    expect(
      await MongoUser.exists({ _id: rootUser._id, password: hashStr(OLD_PASSWORD) })
    ).toBeTruthy();
  });

  it('rejects non-root users', async () => {
    const normalUser = await MongoUser.create({
      username: 'normal-user',
      password: hashStr(OLD_PASSWORD)
    });

    const response = await Call<UpdateRootPasswordBody, Record<string, never>, Credentials>(
      updateRootPasswordApi,
      {
        body: {
          oldPsw: hashStr(OLD_PASSWORD),
          newPsw: hashStr('new-password')
        },
        auth: getAuth(String(normalUser._id), false)
      }
    );

    expect(response.code).toBe(500);
    expect(
      await MongoUser.exists({ _id: normalUser._id, password: hashStr(OLD_PASSWORD) })
    ).toBeTruthy();
  });

  it('rejects requests when commercial edition (isPlus) is active', async () => {
    global.feConfigs = { ...global.feConfigs, isPlus: true };

    const response = await Call<UpdateRootPasswordBody, Record<string, never>, Credentials>(
      updateRootPasswordApi,
      {
        body: {
          oldPsw: hashStr(OLD_PASSWORD),
          newPsw: hashStr('new-root-password')
        },
        auth: getAuth()
      }
    );

    expect(response.code).toBe(500);
    expect(
      await MongoUser.exists({ _id: rootUser._id, password: hashStr(OLD_PASSWORD) })
    ).toBeTruthy();
  });
});
