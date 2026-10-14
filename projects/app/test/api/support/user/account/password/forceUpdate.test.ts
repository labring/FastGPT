import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashStr } from '@fastgpt/global/common/string/tools';
import type { ForceUpdatePasswordBody } from '@fastgpt/global/openapi/support/user/account/password/api';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { delUserAllSession } from '@fastgpt/service/support/user/session';
import forceUpdatePasswordApi from '@/pages/api/support/user/account/password/forceUpdate';
import { Call } from '@test/utils/request';

vi.mock('@fastgpt/service/support/user/session', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
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

const OLD_PASSWORD = 'old-password';
const NEW_PASSWORD = 'brand-new-password';

describe('password/forceUpdate API', () => {
  let pendingUser: any;
  let normalUser: any;

  beforeEach(async () => {
    mocks.withUserLock.mockImplementation((_userId: string, fn: () => Promise<unknown>) => fn());
    mocks.assertPasswordUpdateRateLimit.mockResolvedValue(undefined);
    global.feConfigs = { ...global.feConfigs, sso: undefined };

    // 处于强制改密状态的账号（新口令落库后标记应被清除）。
    pendingUser = await MongoUser.create({
      username: 'force-update-api-pending',
      password: hashStr(OLD_PASSWORD),
      mustChangePassword: true
    });
    // 未处于强制改密状态的账号，用于验证 fail-closed。
    normalUser = await MongoUser.create({
      username: 'force-update-api-normal',
      password: hashStr(OLD_PASSWORD)
    });

    vi.clearAllMocks();
  });

  // 目标账号恒为 authCert 解析出的 userId，teamId / tmbId 只用于审计日志（已被全局 mock）。
  const getAuth = (userId = String(pendingUser._id), overrides: Record<string, unknown> = {}) =>
    ({
      userId,
      teamId: 'force-update-team',
      tmbId: 'force-update-tmb',
      isRoot: false,
      sessionId: 'current-session',
      ...overrides
    }) as any;

  const getBody = ({
    newPsw = hashStr(NEW_PASSWORD)
  }: { newPsw?: string } = {}): ForceUpdatePasswordBody => ({ newPsw });

  it('clears the pending flag and revokes the other sessions on success', async () => {
    const response = await Call<ForceUpdatePasswordBody, Record<string, never>, undefined>(
      forceUpdatePasswordApi,
      { body: getBody(), auth: getAuth() }
    );

    expect(response.code).toBe(200);
    expect(mocks.assertPasswordUpdateRateLimit).toHaveBeenCalledWith({
      account: String(pendingUser._id),
      limit: expect.any(Number)
    });
    expect(mocks.withUserLock).toHaveBeenCalledWith(String(pendingUser._id), expect.any(Function));
    expect(
      await MongoUser.exists({
        _id: pendingUser._id,
        password: hashStr(NEW_PASSWORD),
        mustChangePassword: false
      })
    ).toBeTruthy();
    // 发起改密的 Session 保留，其余注销（与其他改密路径一致）。
    expect(delUserAllSession).toHaveBeenCalledWith(String(pendingUser._id), ['current-session']);
  });

  it('no longer accepts an old password field', async () => {
    const response = await Call<any, Record<string, never>, undefined>(forceUpdatePasswordApi, {
      body: { ...getBody(), oldPsw: hashStr(OLD_PASSWORD) },
      auth: getAuth()
    });

    expect(response.error).toBeInstanceOf(ApiRequestInputParseError);
    expect(
      await MongoUser.exists({
        _id: pendingUser._id,
        password: hashStr(OLD_PASSWORD),
        mustChangePassword: true
      })
    ).toBeTruthy();
  });

  it('rejects an account that is not pending a forced change', async () => {
    // 标记未置位时必须拒绝：本端点不校验旧密码，标记是唯一的授权依据。
    const response = await Call<ForceUpdatePasswordBody, Record<string, never>, undefined>(
      forceUpdatePasswordApi,
      {
        body: getBody(),
        auth: getAuth(String(normalUser._id))
      }
    );

    expect(response.code).toBe(500);
    expect(response.error).toMatchObject({
      message: UserErrEnum.passwordChangeAuthorizationInvalid
    });
    expect(delUserAllSession).not.toHaveBeenCalled();
    expect(
      await MongoUser.exists({ _id: normalUser._id, password: hashStr(OLD_PASSWORD) })
    ).toBeTruthy();
  });

  it('rejects reusing the current password and keeps the flag pending', async () => {
    const response = await Call<ForceUpdatePasswordBody, Record<string, never>, undefined>(
      forceUpdatePasswordApi,
      { body: getBody({ newPsw: hashStr(OLD_PASSWORD) }), auth: getAuth() }
    );

    expect(response.code).toBe(500);
    expect(response.error).toMatchObject({ message: UserErrEnum.newPasswordSameAsOld });
    expect(await MongoUser.exists({ _id: pendingUser._id, mustChangePassword: true })).toBeTruthy();
  });

  it('rejects the request before the lock when the per-user rate limit is reached', async () => {
    mocks.assertPasswordUpdateRateLimit.mockRejectedValueOnce(new Error('rate limited'));

    const response = await Call<ForceUpdatePasswordBody, Record<string, never>, undefined>(
      forceUpdatePasswordApi,
      { body: getBody(), auth: getAuth() }
    );

    expect(response.code).toBe(500);
    expect(mocks.withUserLock).not.toHaveBeenCalled();
    expect(
      await MongoUser.exists({ _id: pendingUser._id, password: hashStr(OLD_PASSWORD) })
    ).toBeTruthy();
  });

  it('rejects unknown body fields instead of applying them to another account', async () => {
    const withUserId = await Call<any, Record<string, never>, undefined>(forceUpdatePasswordApi, {
      body: { ...getBody(), userId: String(normalUser._id) },
      auth: getAuth()
    });
    // 密码入参必须是 64 位 SHA-256 摘要，前端传入明文摘要以外的东西一律拒绝。
    const withPlainPassword = await Call<any, Record<string, never>, undefined>(
      forceUpdatePasswordApi,
      { body: getBody({ newPsw: 'plain-password' }), auth: getAuth() }
    );

    // ForceUpdatePasswordBodySchema 是 .strict() 的，未知字段在入参校验阶段即被
    // ApiRequestInputParseError 拒绝（生产入口层映射为 400）。应用测试的 createApiEntry
    // 是被 mock 的简化版本，会把一切异常折叠成 500，因此断言错误类型本身。
    expect(withUserId.error).toBeInstanceOf(ApiRequestInputParseError);
    expect(withPlainPassword.error).toBeInstanceOf(ApiRequestInputParseError);
    expect(withUserId.code).toBe(500);
    expect(withPlainPassword.code).toBe(500);
    expect(
      await MongoUser.exists({ _id: normalUser._id, password: hashStr(OLD_PASSWORD) })
    ).toBeTruthy();
  });

  it('rejects requests without a current Session', async () => {
    const response = await Call<ForceUpdatePasswordBody, Record<string, never>, undefined>(
      forceUpdatePasswordApi,
      { body: getBody(), auth: getAuth(String(pendingUser._id), { sessionId: undefined }) }
    );

    expect(response.code).toBe(500);
    expect(
      await MongoUser.exists({ _id: pendingUser._id, password: hashStr(OLD_PASSWORD) })
    ).toBeTruthy();
  });

  it('rejects a restricted SSO user before changing password or sessions', async () => {
    await MongoUser.updateOne({ _id: pendingUser._id }, { username: 'tenant-user' });
    global.feConfigs = {
      ...global.feConfigs,
      sso: {
        url: 'https://sso.example.com',
        disablePasswordForSsoUsers: true
      }
    };
    const response = await Call<ForceUpdatePasswordBody, Record<string, never>, undefined>(
      forceUpdatePasswordApi,
      { body: getBody(), auth: getAuth() }
    );

    expect(response.code).toBe(500);
    expect(response.error).toMatchObject({ message: UserErrEnum.ssoPasswordUnavailable });
    expect(delUserAllSession).not.toHaveBeenCalled();
    expect(
      await MongoUser.exists({
        _id: pendingUser._id,
        password: hashStr(OLD_PASSWORD),
        mustChangePassword: true
      })
    ).toBeTruthy();
  });
});
