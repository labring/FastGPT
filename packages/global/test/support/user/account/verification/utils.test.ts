import { describe, expect, it } from 'vitest';
import type { AccountVerificationCapabilities } from '@fastgpt/global/support/user/account/verification/type';
import { resolveAccountVerificationByUsername } from '@fastgpt/global/support/user/account/verification/utils';

const capabilities = {
  emailCode: true,
  phoneCode: true,
  wechat: true,
  oauth: {
    github: true,
    google: true,
    microsoft: true,
    wecom: true,
    sso: true
  }
} satisfies AccountVerificationCapabilities;

type CapabilityOverrides = Partial<Omit<AccountVerificationCapabilities, 'oauth'>> & {
  oauth?: Partial<AccountVerificationCapabilities['oauth']>;
};

const resolve = (username: string, overrides: CapabilityOverrides = {}) =>
  resolveAccountVerificationByUsername({
    username,
    capabilities: {
      ...capabilities,
      ...overrides,
      oauth: {
        ...capabilities.oauth,
        ...overrides.oauth
      }
    },
    allowPasswordFallback: true,
    oldPasswordAvailable: true
  });

describe('resolveAccountVerificationByUsername', () => {
  it.each(['', '   '])('rejects an empty username: %j', (username) => {
    expect(resolve(username)).toEqual({
      status: 'unsupported',
      accountKind: 'invalid',
      unsupportedReason: 'empty_username'
    });
  });

  it.each([
    ['user@example.com', 'email', 'code'],
    ['user-name@example-domain.com', 'email', 'code'],
    ['13800138000', 'phone', 'code'],
    ['local', 'local', 'oldPassword'],
    ['-leading', 'local', 'oldPassword'],
    ['trailing-', 'local', 'oldPassword'],
    ['wechat-openid', 'wechat', 'wechat'],
    ['git-octocat', 'github', 'oauth/github'],
    ['google-sub', 'google', 'oauth/google'],
    ['microsoft-id', 'microsoft', 'oauth/microsoft'],
    ['wecom-id', 'wecom', 'oauth/sso'],
    ['customer-user', 'sso', 'oauth/sso']
  ])('resolves %s to one method', (username, accountKind, method) => {
    expect(resolve(username)).toEqual({ status: 'supported', accountKind, method });
  });

  it('falls back to old password when a contact channel is unavailable', () => {
    expect(resolve('user@example.com', { emailCode: false })).toMatchObject({
      accountKind: 'email',
      method: 'oldPassword'
    });
    expect(resolve('13800138000', { phoneCode: false })).toMatchObject({
      accountKind: 'phone',
      method: 'oldPassword'
    });
  });

  it('requires both password fallback policy and a stored password', () => {
    expect(
      resolveAccountVerificationByUsername({
        username: 'local',
        capabilities,
        allowPasswordFallback: true,
        oldPasswordAvailable: false
      })
    ).toEqual({
      status: 'unsupported',
      accountKind: 'local',
      unsupportedReason: 'no_available_verification_method'
    });

    expect(
      resolveAccountVerificationByUsername({
        username: 'local',
        capabilities,
        allowPasswordFallback: false
      })
    ).toEqual({
      status: 'unsupported',
      accountKind: 'local',
      unsupportedReason: 'no_available_verification_method'
    });
  });

  it('keeps a configured non-password method ahead of password fallback', () => {
    expect(
      resolveAccountVerificationByUsername({
        username: 'user@example.com',
        capabilities,
        allowPasswordFallback: false
      })
    ).toEqual({ status: 'supported', accountKind: 'email', method: 'code' });
  });

  it.each([
    ['wechat-openid', { wechat: false }, 'wechat'],
    ['git-octocat', { oauth: { github: false } }, 'github'],
    ['google-sub', { oauth: { google: false } }, 'google'],
    ['microsoft-id', { oauth: { microsoft: false } }, 'microsoft']
  ] as const)(
    'does not route a disabled direct provider through SSO: %s',
    (username, overrides, accountKind) => {
      expect(resolve(username, overrides)).toMatchObject({
        accountKind,
        method: 'oldPassword'
      });
    }
  );

  it('uses Wecom SSO, direct Wecom and old password in order', () => {
    expect(resolve('wecom-id')).toMatchObject({ method: 'oauth/sso' });
    expect(resolve('wecom-id', { oauth: { sso: false } })).toMatchObject({
      method: 'oauth/wecom'
    });
    expect(
      resolve('wecom-id', {
        oauth: { sso: false, wecom: false }
      })
    ).toMatchObject({ method: 'oldPassword' });
  });

  it('treats unknown hyphenated names as local when SSO is unavailable', () => {
    expect(resolve('customer-user', { oauth: { sso: false } })).toEqual({
      status: 'supported',
      accountKind: 'local',
      method: 'oldPassword'
    });
  });

  it.each(['Git-user', 'git-', 'wechat-', '1380013800', '138001380000'])(
    'applies strict provider and phone boundaries: %s',
    (username) => {
      const result = resolve(username, { oauth: { sso: false } });
      expect(result).toMatchObject({
        status: 'supported',
        accountKind: 'local',
        method: 'oldPassword'
      });
    }
  );
});
