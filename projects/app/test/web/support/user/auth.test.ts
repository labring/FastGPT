import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loginOut: vi.fn(),
  clearMemory: vi.fn()
}));

vi.mock('@/web/support/user/api', () => ({ loginOut: mocks.loginOut }));
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
    await clearToken();

    expect(isLogoutInProgress()).toBe(true);
    expect(mocks.clearMemory).toHaveBeenCalledOnce();
    expect(mocks.loginOut).toHaveBeenCalledOnce();
  });
});
