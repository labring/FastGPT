import { describe, expect, it } from 'vitest';
import type { AccountVerificationCapabilities } from '@fastgpt/global/support/user/account/verification/type';
import { resolveAccountVerificationByUsername } from '@fastgpt/global/support/user/account/verification/utils';

const capabilities: AccountVerificationCapabilities = {
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
};

const resolve = ({
  username,
  capabilities: currentCapabilities = capabilities,
  oldPasswordAvailable = true
}: {
  username: string;
  capabilities?: AccountVerificationCapabilities;
  oldPasswordAvailable?: boolean;
}) =>
  resolveAccountVerificationByUsername({
    username,
    capabilities: currentCapabilities,
    allowPasswordFallback: true,
    oldPasswordAvailable
  });

describe('resolveAccountVerificationByUsername', () => {
  it.each([
    ['user@example.com', 'email', 'code'],
    ['13800138000', 'phone', 'code'],
    ['wechat-openid', 'wechat', 'wechat'],
    ['git-octocat', 'github', 'oauth/github'],
    ['google-user', 'google', 'oauth/google'],
    ['microsoft-user', 'microsoft', 'oauth/microsoft'],
    ['tenant-user', 'sso', 'oauth/sso']
  ] as const)('resolves %s to %s verification', (username, accountKind, method) => {
    expect(resolve({ username })).toEqual({
      status: 'supported',
      accountKind,
      method
    });
  });

  it('prefers SSO over the standalone WeCom provider', () => {
    expect(resolve({ username: 'wecom-user' })).toMatchObject({ method: 'oauth/sso' });
  });

  it('falls back to the standalone WeCom provider when SSO is unavailable', () => {
    expect(
      resolve({
        username: 'wecom-user',
        capabilities: { ...capabilities, oauth: { ...capabilities.oauth, sso: false } }
      })
    ).toMatchObject({ accountKind: 'wecom', method: 'oauth/wecom' });
  });

  it.each([
    ['local', capabilities],
    ['user@example.com', { ...capabilities, emailCode: false }],
    ['git-octocat', { ...capabilities, oauth: { ...capabilities.oauth, github: false } }]
  ] as const)('falls back to password verification for %s', (username, currentCapabilities) => {
    expect(resolve({ username, capabilities: currentCapabilities })).toMatchObject({
      status: 'supported',
      method: 'oldPassword'
    });
  });

  it('does not expose old-password verification when no password is stored', () => {
    expect(resolve({ username: 'local', oldPasswordAvailable: false })).toEqual({
      status: 'unsupported',
      accountKind: 'local',
      unsupportedReason: 'no_available_verification_method'
    });
  });

  it('rejects an empty username', () => {
    expect(resolve({ username: '  ' })).toEqual({
      status: 'unsupported',
      accountKind: 'invalid',
      unsupportedReason: 'empty_username'
    });
  });
});
