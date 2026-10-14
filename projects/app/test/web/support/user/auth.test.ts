import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loginOut: vi.fn(),
  clearMemory: vi.fn(),
  invalidateAuthSession: vi.fn(),
  setUserInfo: vi.fn(),
  resetModelCatalog: vi.fn(),
  setSystemState: vi.fn(),
  clientInitData: vi.fn().mockResolvedValue({ feConfigs: {} })
}));

vi.mock('@/web/support/user/api', () => ({ loginOut: mocks.loginOut }));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: {
    getState: () => ({
      invalidateAuthSession: mocks.invalidateAuthSession,
      setUserInfo: mocks.setUserInfo
    })
  }
}));
vi.mock('@/web/core/ai/model/useUserModelStore', () => ({
  resetUserModelCatalogAfterLogin: mocks.resetModelCatalog,
  useUserModelStore: {
    getState: () => ({ clearMemory: mocks.clearMemory })
  }
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: { setState: mocks.setSystemState }
}));
vi.mock('@/web/common/system/staticData', () => ({ clientInitData: mocks.clientInitData }));

import { clearToken, initClientAfterLogin } from '@/web/support/user/auth';
import type { UserType } from '@fastgpt/global/support/user/type';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import {
  getPendingLogoutRequest,
  isLogoutInProgress,
  resetLogoutState
} from '@/web/support/user/logoutState';

describe('user auth logout state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLogoutState();
    vi.stubGlobal('localStorage', {});
    mocks.loginOut.mockResolvedValue(undefined);
    mocks.clientInitData.mockResolvedValue({ feConfigs: {} });
    mocks.resetModelCatalog.mockImplementation(resetLogoutState);
    vi.stubGlobal('window', { location: { pathname: '/login' } });
  });

  afterEach(() => {
    resetLogoutState();
    vi.unstubAllGlobals();
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
    expect(mocks.invalidateAuthSession).toHaveBeenCalledTimes(1);
    expect(getPendingLogoutRequest()).toBeUndefined();
    expect(mocks.setSystemState).toHaveBeenCalledWith({
      authenticatedConfigGeneration: undefined,
      initDataPage: undefined
    });
    expect(mocks.clientInitData).not.toHaveBeenCalled();
  });

  it('does not invalidate a new login when an earlier server logout finishes', async () => {
    let finishLogout!: () => void;
    mocks.loginOut.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishLogout = resolve;
      })
    );
    const pending = clearToken();
    expect(clearToken()).toBe(pending);
    expect(mocks.loginOut).toHaveBeenCalledTimes(1);
    resetLogoutState();

    let finishNewLogout!: () => void;
    mocks.loginOut.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishNewLogout = resolve;
      })
    );
    const newer = clearToken();
    finishLogout();
    await pending;

    expect(mocks.invalidateAuthSession).toHaveBeenCalledTimes(2);
    expect(getPendingLogoutRequest()).toBe(newer);
    finishNewLogout();
    await newer;
    expect(getPendingLogoutRequest()).toBeUndefined();
  });

  it('releases failed logout requests and allows retrying without completion invalidations', async () => {
    const error = new Error('Logout unavailable');
    mocks.loginOut.mockRejectedValueOnce(error);
    await expect(clearToken()).rejects.toBe(error);
    expect(getPendingLogoutRequest()).toBeUndefined();
    await clearToken();
    expect(mocks.loginOut).toHaveBeenCalledTimes(2);
    expect(mocks.invalidateAuthSession).toHaveBeenCalledTimes(2);
  });
});

describe('initClientAfterLogin', () => {
  const permission = new TeamPermission({ isOwner: true });
  const user: UserType = {
    _id: 'user',
    username: 'member',
    avatar: '',
    timezone: 'Asia/Shanghai',
    language: 'en',
    hasPassword: true,
    tags: [],
    permission,
    team: {
      userId: 'user',
      tmbId: 'member',
      teamId: 'team',
      teamName: 'Team',
      memberName: 'Member',
      isSetMemberName: true,
      avatar: '',
      role: TeamMemberRoleEnum.owner,
      status: TeamMemberStatusEnum.active,
      permission
    }
  };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clientInitData.mockResolvedValue({ feConfigs: {} });
    vi.stubGlobal('window', { location: { pathname: '/chat' } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('explicitly advances the session before requesting full configuration once', async () => {
    mocks.clientInitData.mockImplementationOnce(async () => {
      expect(mocks.setUserInfo).toHaveBeenCalledExactlyOnceWith(user, true);
      expect(mocks.resetModelCatalog).toHaveBeenCalledOnce();
      return { feConfigs: {} };
    });
    await initClientAfterLogin(user);
    expect(mocks.clientInitData).toHaveBeenCalledExactlyOnceWith(3, '/chat');
  });

  it('keeps successful authentication when configuration refresh fails', async () => {
    mocks.clientInitData.mockRejectedValueOnce(new Error('Initialization unavailable'));
    await expect(initClientAfterLogin(user)).resolves.toBeUndefined();
    expect(mocks.setUserInfo).toHaveBeenCalledWith(user, true);
  });
});
