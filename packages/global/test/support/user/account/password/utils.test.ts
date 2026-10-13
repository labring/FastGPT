import { describe, expect, it } from 'vitest';
import {
  isPasswordAvailableForUsername,
  isSsoPasswordPolicyEnabled,
  isSsoUsername
} from '@fastgpt/global/support/user/account/password/utils';
import type { SsoPasswordPolicyConfig } from '@fastgpt/global/support/user/account/password/utils';

/** 策略开启态：必须同时具备 sso.url 与显式开关，缺一不成立。 */
const policyOn: SsoPasswordPolicyConfig = {
  url: 'https://sso.example.com',
  disablePasswordForSsoUsers: true
};

describe('isSsoPasswordPolicyEnabled', () => {
  it('requires both an SSO root URL and an explicit switch', () => {
    expect(isSsoPasswordPolicyEnabled(policyOn)).toBe(true);
    // 只开开关但未接入 SSO：用户名无法被分类为 sso，策略不成立
    expect(isSsoPasswordPolicyEnabled({ disablePasswordForSsoUsers: true })).toBe(false);
    // 只接入 SSO 未开开关：不应影响任何账号的密码能力
    expect(isSsoPasswordPolicyEnabled({ url: 'https://sso.example.com' })).toBe(false);
    expect(isSsoPasswordPolicyEnabled({})).toBe(false);
    expect(isSsoPasswordPolicyEnabled(undefined)).toBe(false);
  });
});

describe('isSsoUsername', () => {
  it('classifies hyphenated usernames as SSO only when SSO is configured', () => {
    expect(isSsoUsername('tenant-user', policyOn)).toBe(true);
    expect(isSsoUsername('tenant-user', { disablePasswordForSsoUsers: true })).toBe(false);
  });

  it.each([
    'local',
    'user-name@example-domain.com',
    'wechat-openid',
    'git-octocat',
    'google-sub',
    'microsoft-id',
    'wecom-id'
  ])('does not treat non-SSO account %s as an SSO user', (username) => {
    expect(isSsoUsername(username, policyOn)).toBe(false);
  });

  it('treats a missing or blank username as non-SSO instead of throwing', () => {
    // 管理端新增用户时用户名可能还没填写，判定必须安全降级
    expect(isSsoUsername(undefined, policyOn)).toBe(false);
    expect(isSsoUsername('', policyOn)).toBe(false);
    expect(isSsoUsername('   ', policyOn)).toBe(false);
  });
});

describe('isPasswordAvailableForUsername', () => {
  it('disables password only for SSO accounts while the policy is enabled', () => {
    expect(isPasswordAvailableForUsername('tenant-user', policyOn)).toBe(false);
    expect(isPasswordAvailableForUsername('root', policyOn)).toBe(true);
    expect(isPasswordAvailableForUsername('user@example.com', policyOn)).toBe(true);
  });

  it('keeps every account password-capable once the policy is off', () => {
    expect(isPasswordAvailableForUsername('tenant-user', { url: 'https://sso.example.com' })).toBe(
      true
    );
    expect(isPasswordAvailableForUsername('tenant-user', undefined)).toBe(true);
  });
});
