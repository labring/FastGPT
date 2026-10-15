import { describe, expect, it } from 'vitest';
import {
  isPasswordAvailableForUsername,
  isSsoPasswordPolicyEnabled,
  isSsoUsername
} from '@fastgpt/global/support/user/account/password/utils';
import type { SsoPasswordPolicyConfig } from '@fastgpt/global/support/user/account/password/utils';

/** 策略开启态：必须同时具备 SSO 接入能力与显式开关，缺一不成立。 */
const policyOn: SsoPasswordPolicyConfig = {
  enabled: true,
  disablePasswordForSsoUsers: true
};

describe('isSsoPasswordPolicyEnabled', () => {
  it('uses client capabilities without requiring the server root address', () => {
    expect(isSsoPasswordPolicyEnabled({ enabled: true, disablePasswordForSsoUsers: true })).toBe(
      true
    );
    expect(isSsoPasswordPolicyEnabled({ enabled: false, disablePasswordForSsoUsers: true })).toBe(
      false
    );
    expect(isSsoPasswordPolicyEnabled({ enabled: true })).toBe(false);
  });
  it('requires both an SSO capability and an explicit switch', () => {
    expect(isSsoPasswordPolicyEnabled(policyOn)).toBe(true);
    // 只开开关但未接入 SSO：用户名无法被分类为 sso，策略不成立
    expect(isSsoPasswordPolicyEnabled({ disablePasswordForSsoUsers: true })).toBe(false);
    // 只接入 SSO 未开开关：不应影响任何账号的密码能力
    expect(isSsoPasswordPolicyEnabled({ enabled: true })).toBe(false);
    expect(isSsoPasswordPolicyEnabled({})).toBe(false);
    expect(isSsoPasswordPolicyEnabled(undefined)).toBe(false);
  });
});

describe('isSsoUsername', () => {
  it('classifies client SSO accounts with the same capability rule', () => {
    expect(isSsoUsername('tenant-user', { enabled: true })).toBe(true);
    expect(isSsoUsername('tenant-user', { enabled: false })).toBe(false);
  });
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
  it('keeps administrator password controls consistent with client SSO capabilities', () => {
    const sso = { enabled: true, disablePasswordForSsoUsers: true };
    expect(isPasswordAvailableForUsername('tenant-user', sso)).toBe(false);
    expect(isPasswordAvailableForUsername('root', sso)).toBe(true);
    expect(isPasswordAvailableForUsername('user@example.com', sso)).toBe(true);
    expect(isPasswordAvailableForUsername('tenant-user', { ...sso, enabled: false })).toBe(true);
  });
  it('disables password only for SSO accounts while the policy is enabled', () => {
    expect(isPasswordAvailableForUsername('tenant-user', policyOn)).toBe(false);
    expect(isPasswordAvailableForUsername('root', policyOn)).toBe(true);
    expect(isPasswordAvailableForUsername('user@example.com', policyOn)).toBe(true);
  });

  it('keeps every account password-capable once the policy is off', () => {
    expect(isPasswordAvailableForUsername('tenant-user', { enabled: true })).toBe(true);
    expect(isPasswordAvailableForUsername('tenant-user', undefined)).toBe(true);
  });
});
