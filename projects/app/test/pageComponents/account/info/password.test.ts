import { describe, expect, it } from 'vitest';
import {
  canManagePasswordFromAccountInfo,
  shouldCheckPasswordExpiration
} from '@/pageComponents/account/info/password';

describe('canManagePasswordFromAccountInfo', () => {
  it('exposes password management for root accounts', () => {
    expect(canManagePasswordFromAccountInfo({ username: 'root' })).toBe(true);
  });

  it('does not expose password management for WeCom users', () => {
    expect(canManagePasswordFromAccountInfo({ username: 'wecom-user' })).toBe(false);
  });

  it('exposes password management for regular accounts', () => {
    expect(canManagePasswordFromAccountInfo({ username: 'member' })).toBe(true);
    expect(canManagePasswordFromAccountInfo({})).toBe(false);
  });

  it('hides password management only when password availability is explicitly false', () => {
    expect(
      canManagePasswordFromAccountInfo({
        username: 'sso-user',
        passwordAvailable: false
      })
    ).toBe(false);
    expect(
      canManagePasswordFromAccountInfo({
        username: 'legacy-user',
        passwordAvailable: undefined
      })
    ).toBe(true);
  });
});

describe('shouldCheckPasswordExpiration', () => {
  it('requires a loaded user and skips accounts whose password capability is disabled', () => {
    expect(shouldCheckPasswordExpiration({ userId: 'user-id' })).toBe(true);
    expect(shouldCheckPasswordExpiration({ userId: 'user-id', passwordAvailable: false })).toBe(
      false
    );
    expect(shouldCheckPasswordExpiration({ passwordAvailable: true })).toBe(false);
  });
});
