import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import {
  PASSWORD_CHANGE_TOKEN_TTL_SECONDS,
  PasswordChangeTokenService,
  assertUserPasswordAvailable,
  getUserPasswordAvailability,
  isSsoPasswordDisabled,
  isSsoUserByUsername
} from '@fastgpt/service/support/user/account/password/service';

const secret = 'password_change_test_secret_32_chars_min';
const otherSecret = 'password_change_other_secret_32_chars_min';
const issuedAtMs = Date.UTC(2026, 6, 22, 10, 0, 0);
const issuedAt = Math.floor(issuedAtMs / 1000);
const originalFeConfigs = global.feConfigs;

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

describe('PasswordChangeTokenService', () => {
  it('signs a five-minute HS256 token and verifies the current user', () => {
    const service = new PasswordChangeTokenService({
      secret,
      now: () => new Date(issuedAtMs)
    });
    const result = service.sign('user-1');

    expect(result.expiredAt.toISOString()).toBe('2026-07-22T10:05:00.000Z');
    expect(service.verify({ token: result.token, userId: 'user-1' })).toEqual({
      userId: 'user-1',
      purpose: 'changePassword',
      iat: issuedAt,
      exp: issuedAt + PASSWORD_CHANGE_TOKEN_TTL_SECONDS
    });
    expect(jwt.decode(result.token, { complete: true })?.header.alg).toBe('HS256');
  });

  it('accepts the token immediately before expiry and rejects it at expiry', () => {
    let nowMs = issuedAtMs;
    const service = new PasswordChangeTokenService({
      secret,
      now: () => new Date(nowMs)
    });
    const { token } = service.sign('user-1');

    nowMs = issuedAtMs + PASSWORD_CHANGE_TOKEN_TTL_SECONDS * 1000 - 1;
    expect(service.verify({ token, userId: 'user-1' }).userId).toBe('user-1');

    nowMs = issuedAtMs + PASSWORD_CHANGE_TOKEN_TTL_SECONDS * 1000;
    expect(() => service.verify({ token, userId: 'user-1' })).toThrow(
      UserErrEnum.passwordChangeAuthorizationInvalid
    );
  });

  it.each([
    ['malformed token', 'not-a-token'],
    [
      'wrong signing key',
      jwt.sign(
        { userId: 'user-1', purpose: 'changePassword', iat: issuedAt, exp: issuedAt + 300 },
        otherSecret,
        { algorithm: 'HS256' }
      )
    ],
    [
      'wrong algorithm',
      jwt.sign(
        { userId: 'user-1', purpose: 'changePassword', iat: issuedAt, exp: issuedAt + 300 },
        secret,
        { algorithm: 'HS384' }
      )
    ],
    [
      'missing purpose',
      jwt.sign({ userId: 'user-1', iat: issuedAt, exp: issuedAt + 300 }, secret, {
        algorithm: 'HS256'
      })
    ],
    [
      'other purpose',
      jwt.sign(
        { userId: 'user-1', purpose: 'accountCancellation', iat: issuedAt, exp: issuedAt + 300 },
        secret,
        { algorithm: 'HS256' }
      )
    ],
    [
      'extra claim',
      jwt.sign(
        {
          userId: 'user-1',
          purpose: 'changePassword',
          iat: issuedAt,
          exp: issuedAt + 300,
          role: 'admin'
        },
        secret,
        { algorithm: 'HS256' }
      )
    ]
  ])('maps %s to one stable authorization error', (_caseName, token) => {
    const service = new PasswordChangeTokenService({
      secret,
      now: () => new Date(issuedAtMs)
    });
    expect(() => service.verify({ token, userId: 'user-1' })).toThrow(
      UserErrEnum.passwordChangeAuthorizationInvalid
    );
  });

  it('rejects a valid token used by a different current user', () => {
    const service = new PasswordChangeTokenService({
      secret,
      now: () => new Date(issuedAtMs)
    });
    const { token } = service.sign('user-1');

    expect(() => service.verify({ token, userId: 'user-2' })).toThrow(
      UserErrEnum.passwordChangeAuthorizationInvalid
    );
  });

  it('rejects a modified signature without exposing the verification detail', () => {
    const service = new PasswordChangeTokenService({
      secret,
      now: () => new Date(issuedAtMs)
    });
    const { token } = service.sign('user-1');
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;

    expect(() => service.verify({ token: tampered, userId: 'user-1' })).toThrow(
      UserErrEnum.passwordChangeAuthorizationInvalid
    );
  });
});
