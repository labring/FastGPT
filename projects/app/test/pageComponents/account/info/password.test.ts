import { describe, expect, it } from 'vitest';
import {
  canManagePasswordFromAccountInfo,
  shouldCheckPasswordExpiration
} from '@/pageComponents/account/info/password';

describe('canManagePasswordFromAccountInfo', () => {
  it('does not expose password management for root', () => {
    expect(canManagePasswordFromAccountInfo({ isPlus: true, username: 'root' })).toBe(false);
  });

  it('does not expose password management for WeCom users', () => {
    expect(canManagePasswordFromAccountInfo({ isPlus: true, username: 'wecom-user' })).toBe(false);
  });

  it('exposes password management only for loaded Plus users', () => {
    expect(canManagePasswordFromAccountInfo({ isPlus: true, username: 'member' })).toBe(true);
    expect(canManagePasswordFromAccountInfo({ isPlus: false, username: 'member' })).toBe(false);
    expect(canManagePasswordFromAccountInfo({ isPlus: true })).toBe(false);
  });

  it('hides password management only when password availability is explicitly false', () => {
    expect(
      canManagePasswordFromAccountInfo({
        isPlus: true,
        username: 'sso-user',
        passwordAvailable: false
      })
    ).toBe(false);
    expect(
      canManagePasswordFromAccountInfo({
        isPlus: true,
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
