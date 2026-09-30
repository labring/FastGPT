import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MongoTmpData } from '@fastgpt/service/support/tmpData/schema';
import {
  PASSWORD_CHANGE_SESSION_TTL_SECONDS,
  assertUserPasswordAvailable,
  createPasswordChangeSession,
  getUserPasswordAvailability,
  isSsoPasswordDisabled,
  isSsoUserByUsername,
  updatePasswordWithChangeSession
} from '@fastgpt/service/support/user/account/password/service';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';

const originalFeConfigs = global.feConfigs;

/** 构造只影响 SSO 密码策略的 feConfigs，其余字段沿用运行时已有配置。 */
const setSsoPasswordPolicy = (enabled: boolean) => {
  global.feConfigs = {
    uploadFileMaxAmount: 10,
    uploadFileMaxSize: 10,
    ...global.feConfigs,
    sso: {
      url: 'https://sso.example.com',
      disablePasswordForSsoUsers: enabled
    }
  };
};

describe('password change session service', () => {
  it('creates a short-lived session bound to the user and login session', async () => {
    const result = await createPasswordChangeSession({
      userId: 'user-1',
      loginSessionId: 'login-1'
    });
    const record = await MongoTmpData.findOne({
      data: { userId: 'user-1', loginSessionId: 'login-1' }
    }).lean();

    expect(result.sessionId).toHaveLength(43);
    expect(new Date(result.expiredAt).getTime()).toBeGreaterThan(Date.now());
    expect(record).toMatchObject({ data: { userId: 'user-1', loginSessionId: 'login-1' } });
    expect(PASSWORD_CHANGE_SESSION_TTL_SECONDS).toBe(300);
  });

  it('rejects a missing, expired, mismatched, or reused session', async () => {
    await expect(
      updatePasswordWithChangeSession({
        sessionId: 'missing',
        userId: 'user-1',
        loginSessionId: 'login-1',
        newPassword: 'new'
      })
    ).rejects.toThrow(UserErrEnum.passwordChangeAuthorizationInvalid);
  });
});

describe('SSO password policy', () => {
  beforeEach(() => setSsoPasswordPolicy(false));
  afterEach(() => {
    global.feConfigs = originalFeConfigs;
  });

  it('only disables password for dynamically classified SSO users when the policy is enabled', () => {
    setSsoPasswordPolicy(true);

    expect(isSsoPasswordDisabled()).toBe(true);
    expect(isSsoUserByUsername('tenant-user')).toBe(true);
    expect(getUserPasswordAvailability('tenant-user')).toBe(false);
    expect(() => assertUserPasswordAvailable('tenant-user')).toThrow(
      UserErrEnum.ssoPasswordUnavailable
    );
  });

  it.each([
    'local',
    'user-name@example-domain.com',
    'wechat-openid',
    'git-octocat',
    'google-sub',
    'microsoft-id',
    'wecom-id'
  ])('keeps password available for non-SSO account %s', (username) => {
    setSsoPasswordPolicy(true);
    expect(getUserPasswordAvailability(username)).toBe(true);
  });

  it('restores password availability when the switch is disabled or SSO is not configured', () => {
    expect(getUserPasswordAvailability('tenant-user')).toBe(true);

    global.feConfigs.sso = {
      disablePasswordForSsoUsers: true
    };
    expect(isSsoPasswordDisabled()).toBe(false);
    expect(getUserPasswordAvailability('tenant-user')).toBe(true);
  });
});
