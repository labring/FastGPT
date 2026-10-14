import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    localStorageMock.clear();
    vi.stubGlobal('localStorage', localStorageMock);
    useUserStore = (await import('@/web/support/user/useUserStore')).useUserStore;

    useUserStore.setState({
      userInfo: null,
      isTeamAdmin: false
    });
  });

  it('does not persist backend language when setting user info', () => {
    useUserStore.getState().setUserInfo(buildUser('en'));

    expect(useUserStore.getState().userInfo?.language).toBe('en');
    expect(i18nMocks.getLangMapping).not.toHaveBeenCalled();
    expect(i18nMocks.setLangToStorage).not.toHaveBeenCalled();
  });

  it('advances the session on identity changes while retaining it for same-member refreshes', () => {
    const user = buildUser('en');
    useUserStore.getState().setUserInfo(user);
    const generation = useUserStore.getState().authGeneration;
    useUserStore.getState().setUserInfo({ ...user, avatar: 'updated.svg' });
    expect(useUserStore.getState().authGeneration).toBe(generation);

    useUserStore.getState().setUserInfo({ ...user, team: { ...user.team, tmbId: 'new-member' } });
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
    useUserStore.getState().invalidateAuthSession();
    expect(useUserStore.getState().userInfo).toBeNull();
    expect(readMemberId()).toBe(user.team.tmbId);
    useUserStore.getState().setUserInfo(user);
    expect(useUserStore.getState().authGeneration).toBe(generation + 2);
    expect(JSON.parse(localStorageMock.getItem('userStore')!).state).not.toHaveProperty(
      'authGeneration'
    );
  });
});
