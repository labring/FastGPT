import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loginOut: vi.fn(),
  clearMemory: vi.fn(),
  invalidateAuthSession: vi.fn()
}));

vi.mock('@/web/support/user/api', () => ({ loginOut: mocks.loginOut }));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: { getState: () => ({ invalidateAuthSession: mocks.invalidateAuthSession }) }
}));
vi.mock('@/web/core/ai/model/useUserModelStore', () => ({
  useUserModelStore: {
    getState: () => ({ clearMemory: mocks.clearMemory })
  }
}));

import { clearToken } from '@/web/support/user/auth';
import { isLogoutInProgress, resetLogoutState } from '@/web/support/user/logoutState';

describe('user auth logout state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLogoutState();
    vi.stubGlobal('localStorage', {});
    mocks.loginOut.mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetLogoutState();
  });

  it('marks logout before clearing client state and requesting server logout', async () => {
    mocks.loginOut.mockImplementationOnce(async () => {
      expect(isLogoutInProgress()).toBe(true);
      expect(mocks.invalidateAuthSession).toHaveBeenCalledTimes(1);
    });
    await clearToken();

    expect(isLogoutInProgress()).toBe(true);
    expect(mocks.clearMemory).toHaveBeenCalledOnce();
    expect(mocks.loginOut).toHaveBeenCalledOnce();
    expect(mocks.invalidateAuthSession).toHaveBeenCalledTimes(2);
  });

  it('does not invalidate a new login when an earlier server logout finishes', async () => {
    let finishLogout!: () => void;
    mocks.loginOut.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishLogout = resolve;
      })
    );
    const pending = clearToken();
    resetLogoutState();
    finishLogout();
    await pending;

    expect(mocks.invalidateAuthSession).toHaveBeenCalledTimes(1);
  });
});
