import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { useUserStore as useUserStoreType } from '@/web/support/user/useUserStore';
import type { UserType } from '@fastgpt/global/support/user/type';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';

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

const buildUser = (language: UserType['language']): UserType =>
  ({
    _id: 'user-id',
    username: 'user@example.com',
    avatar: '',
    timezone: 'Asia/Shanghai',
    language,
    promotionRate: 0,
    team: {
      userId: 'user-id',
      tmbId: 'tmb-id',
      teamId: 'team-id',
      teamName: 'Team',
      memberName: 'Member',
      avatar: '',
      teamDomain: '',
      role: 'owner',
      status: 'active',
      permission: new TeamPermission({ isOwner: true })
    },
    permission: new TeamPermission({ isOwner: true }),
    tags: []
  }) as UserType;

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
});
