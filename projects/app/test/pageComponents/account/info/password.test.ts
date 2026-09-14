import { describe, expect, it } from 'vitest';
import { canManagePasswordFromAccountInfo } from '@/pageComponents/account/info/password';

describe('canManagePasswordFromAccountInfo', () => {
  it('exposes password management for root accounts', () => {
    expect(canManagePasswordFromAccountInfo({ isPlus: true, username: 'root' })).toBe(true);
  });

  it('does not expose password management for WeCom users', () => {
    expect(canManagePasswordFromAccountInfo({ isPlus: true, username: 'wecom-user' })).toBe(false);
  });

  it('exposes password management only for loaded Plus users', () => {
    expect(canManagePasswordFromAccountInfo({ isPlus: true, username: 'member' })).toBe(true);
    expect(canManagePasswordFromAccountInfo({ isPlus: false, username: 'member' })).toBe(false);
    expect(canManagePasswordFromAccountInfo({ isPlus: true })).toBe(false);
  });
});
