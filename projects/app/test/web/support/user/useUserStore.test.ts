import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { useUserStore as useUserStoreType } from '@/web/support/user/useUserStore';
import type { UserType } from '@fastgpt/global/support/user/type';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';

const i18nMocks = vi.hoisted(() => ({
  setLangToStorage: vi.fn(),
  getLangMapping: vi.fn((lang: string) => lang)
}));

const apiMocks = vi.hoisted(() => ({
  getTokenLogin: vi.fn(),
  putUserInfo: vi.fn(),
  getTeamPlanStatus: vi.fn().mockResolvedValue(null)
}));
vi.mock('@/web/support/user/api', () => ({
  getTokenLogin: apiMocks.getTokenLogin,
  putUserInfo: apiMocks.putUserInfo
}));
vi.mock('@/web/support/user/team/api', () => ({ getTeamPlanStatus: apiMocks.getTeamPlanStatus }));

const localStorageMock = vi.hoisted(() => {
  let store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    get length() {
      return Object.keys(store).length;
    }
  };
});

vi.mock('@fastgpt/web/i18n/utils', () => ({
  setLangToStorage: i18nMocks.setLangToStorage,
  getLangMapping: i18nMocks.getLangMapping
}));

let useUserStore: typeof useUserStoreType;

const buildUser = (language: UserType['language']): UserType => ({
  _id: 'user-id',
  username: 'user@example.com',
  avatar: '',
  timezone: 'Asia/Shanghai',
  language,
  hasPassword: true,
  team: {
    userId: 'user-id',
    tmbId: 'tmb-id',
    teamId: 'team-id',
    teamName: 'Team',
    memberName: 'Member',
    isSetMemberName: true,
    avatar: '',
    role: TeamMemberRoleEnum.owner,
    status: TeamMemberStatusEnum.active,
    permission: new TeamPermission({ isOwner: true })
  },
  permission: new TeamPermission({ isOwner: true }),
  tags: []
});

describe('useUserStore', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    apiMocks.getTokenLogin.mockReset();
    apiMocks.getTeamPlanStatus.mockReset().mockResolvedValue(null);
    localStorageMock.clear();
    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('document', { querySelector: () => null });
    useUserStore = (await import('@/web/support/user/useUserStore')).useUserStore;

    useUserStore.setState({
      userInfo: null,
      isTeamAdmin: false
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('does not persist backend language when setting user info', () => {
    useUserStore.getState().setUserInfo(buildUser('en'));

    expect(useUserStore.getState().userInfo?.language).toBe('en');
    expect(i18nMocks.getLangMapping).not.toHaveBeenCalled();
    expect(i18nMocks.setLangToStorage).not.toHaveBeenCalled();
  });

  it('retains global initialization across same-username profile and team refreshes', () => {
    const user = buildUser('en');
    useUserStore.getState().setUserInfo(user);
    const generation = useUserStore.getState().authGeneration;
    useUserStore.getState().setUserInfo({ ...user, avatar: 'updated.svg' });
    expect(useUserStore.getState().authGeneration).toBe(generation);

    useUserStore.getState().setUserInfo({ ...user, team: { ...user.team, tmbId: 'new-member' } });
    expect(useUserStore.getState().authGeneration).toBe(generation);
    // 密码变更等明确的新会话，即便用户名相同也必须使旧请求失效。
    useUserStore.getState().setUserInfo(user, true);
    expect(useUserStore.getState().authGeneration).toBe(generation + 1);
    useUserStore.getState().setUserInfo(null);
    expect(useUserStore.getState().authGeneration).toBe(generation + 2);
    expect(useUserStore.getState().isTeamAdmin).toBe(false);
  });

  it('invalidates same-user re-login and preserves the previous member for login redirects', async () => {
    const user = buildUser('en');
    useUserStore.getState().setUserInfo(user);
    const generation = useUserStore.getState().authGeneration;
    // resetModules 后从同一模块实例读取重定向身份。
    const { getCurrentAuthTmbId: readMemberId } =
      await import('@/web/support/user/currentAuthTmbId');
    const { beginLogout, isLogoutInProgress } = await import('@/web/support/user/logoutState');
    const { useUserModelStore } = await import('@/web/core/ai/model/useUserModelStore');
    const modelGeneration = useUserModelStore.getState().loginGeneration;
    beginLogout();
    useUserStore.getState().invalidateAuthSession();
    expect(useUserStore.getState().userInfo).toBeNull();
    expect(readMemberId()).toBe(user.team.tmbId);
    useUserStore.getState().setUserInfo(user, true);
    expect(useUserStore.getState().authGeneration).toBe(generation + 2);
    expect(isLogoutInProgress()).toBe(false);
    expect(useUserModelStore.getState().loginGeneration).toBe(modelGeneration + 1);
    expect(JSON.parse(localStorageMock.getItem('userStore')!).state).not.toHaveProperty(
      'authGeneration'
    );
    expect(JSON.parse(localStorageMock.getItem('userStore')!).state).not.toHaveProperty(
      'isUserInfoInitialized'
    );
  });

  it('restores initial identity without invalidating the concurrently requested configuration', async () => {
    const user = buildUser('en');
    let resolveUser!: (user: UserType) => void;
    apiMocks.getTokenLogin.mockReturnValue(
      new Promise<UserType>((resolve) => {
        resolveUser = resolve;
      })
    );
    const snapshots: { generation: number; userId?: string }[] = [];
    const unsubscribe = useUserStore.subscribe((state) => {
      snapshots.push({
        generation: state.authGeneration,
        userId: state.userInfo?._id
      });
    });
    try {
      const request = useUserStore.getState().initUserInfo();
      resolveUser(user);
      await expect(request).resolves.toEqual(user);
      expect(snapshots.filter(({ userId }) => userId)).toEqual([
        { generation: 0, userId: user._id }
      ]);
    } finally {
      unsubscribe();
    }
  });

  it('loads team plans once, after user restoration, and waits for them before finishing', async () => {
    const user = buildUser('en');
    apiMocks.getTokenLogin.mockResolvedValueOnce(user);
    let releasePlan!: (status: null) => void;
    apiMocks.getTeamPlanStatus.mockImplementationOnce(() => {
      expect(useUserStore.getState().userInfo?.team.tmbId).toBe(user.team.tmbId);
      return new Promise<null>((resolve) => {
        releasePlan = resolve;
      });
    });
    const completed = vi.fn();
    const request = useUserStore.getState().initUserInfo().then(completed);
    await Promise.resolve();
    await Promise.resolve();
    expect(apiMocks.getTeamPlanStatus).toHaveBeenCalledTimes(1);
    expect(completed).not.toHaveBeenCalled();
    releasePlan(null);
    await request;
    expect(completed).toHaveBeenCalledExactlyOnceWith(user);
    expect(useUserStore.getState().teamPlanStatus).toBeNull();
  });

  it('retains restored identity when the team-plan request fails and clears stale plans', async () => {
    const user = buildUser('en');
    apiMocks.getTokenLogin.mockResolvedValueOnce(user);
    apiMocks.getTeamPlanStatus.mockRejectedValueOnce(new Error('Plan unavailable'));
    await expect(useUserStore.getState().initUserInfo()).resolves.toEqual(user);
    expect(useUserStore.getState().userInfo).toEqual(user);
    expect(useUserStore.getState().teamPlanStatus).toBeNull();
    expect(apiMocks.getTeamPlanStatus).toHaveBeenCalledTimes(1);
  });

  it('ends initial user loading after a failure and allows a later successful retry', async () => {
    apiMocks.getTokenLogin.mockRejectedValueOnce(new Error('Network unavailable'));
    await expect(useUserStore.getState().initUserInfo()).resolves.toBeNull();
    expect(useUserStore.getState().authGeneration).toBe(0);
    expect(apiMocks.getTeamPlanStatus).not.toHaveBeenCalled();

    const user = buildUser('en');
    apiMocks.getTokenLogin.mockResolvedValueOnce(user);
    await expect(useUserStore.getState().initUserInfo()).resolves.toEqual(user);
    expect(useUserStore.getState().authGeneration).toBe(0);
  });
});
