import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveLoginRedirectAfterLogin } from '../../../../src/web/support/user/loginRedirect';
import {
  readWorkflowLocalDraft,
  saveWorkflowLocalDraft
} from '../../../../src/web/core/workflow/localDraft/storage';
import { restoreWorkflowLocalDraftAfterLogin } from '../../../../src/web/core/workflow/localDraft/useWorkflowLocalDraftRestore';
import { setCurrentAuthTmbId } from '../../../../src/web/support/user/currentAuthTmbId';
import { getAuthLoginRedirectPath } from '../../../../src/web/support/user/loginRedirect/url';
import type { UserType } from '@fastgpt/global/support/user/type';

vi.mock('@/web/core/app/api/version', () => ({
  postPublishApp: vi.fn()
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}));

vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}));

const storageMap = new Map<string, string>();
const sessionStorageMap = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storageMap.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    storageMap.delete(key);
  })
};
const sessionStorageMock = {
  getItem: vi.fn((key: string) => sessionStorageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    sessionStorageMap.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    sessionStorageMap.delete(key);
  })
};

const user = {
  _id: 'user-a',
  username: 'user-a',
  team: {
    teamId: 'team-a',
    tmbId: 'tmb-a'
  }
} as UserType;

const saveDraftToStorage = ({
  tmbId = 'tmb-a'
}: {
  tmbId?: string;
} = {}) =>
  saveWorkflowLocalDraft({
    appId: 'app-1',
    tmbId,
    data: {
      nodes: [{ nodeId: 'node-1' }] as any,
      edges: [] as any,
      chatConfig: { welcomeText: 'hello' } as any
    }
  });

const resolveLoginRoute = ({
  loginUser = user,
  fallbackRoute = '/app/detail?appId=app-1&currentTab=appEdit',
  lastTmbId,
  saveDraft = vi.fn()
}: {
  loginUser?: UserType;
  fallbackRoute?: string;
  lastTmbId?: string;
  saveDraft?: ReturnType<typeof vi.fn>;
} = {}) =>
  resolveLoginRedirectAfterLogin({
    user: loginUser,
    fallbackRoute,
    lastTmbId,
    restoreWorkflowLocalDraft: ({ user }) =>
      restoreWorkflowLocalDraftAfterLogin({
        user,
        saveDraft: saveDraft as any
      })
  });

describe('login redirect helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    storageMap.clear();
    sessionStorageMap.clear();
    setCurrentAuthTmbId();
    vi.stubGlobal('window', {
      localStorage: localStorageMock,
      sessionStorage: sessionStorageMock,
      location: {
        pathname: '/login',
        search: ''
      }
    });
    vi.setSystemTime(new Date('2026-05-11T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should auto-save matched draft, clear cache and return canonical app detail route', async () => {
    saveDraftToStorage();
    const saveDraft = vi.fn().mockResolvedValue(undefined);

    const route = await resolveLoginRoute({
      fallbackRoute: '/app/detail?appId=app-1&currentTab=appEdit',
      saveDraft: saveDraft as any
    });

    expect(saveDraft).toHaveBeenCalledWith(
      'app-1',
      expect.objectContaining({
        autoSave: true,
        isPublish: false
      })
    );
    expect(readWorkflowLocalDraft()).toBeNull();
    expect(route).toBe('/app/detail?appId=app-1');
  });

  it('should restore draft even when login fallback route is not the workflow detail page', async () => {
    saveDraftToStorage();
    const saveDraft = vi.fn().mockResolvedValue(undefined);

    const route = await resolveLoginRoute({
      fallbackRoute: '/dashboard/agent',
      saveDraft: saveDraft as any
    });

    expect(saveDraft).toHaveBeenCalledWith(
      'app-1',
      expect.objectContaining({
        autoSave: true,
        isPublish: false
      })
    );
    expect(readWorkflowLocalDraft()).toBeNull();
    expect(route).toBe('/app/detail?appId=app-1');
  });

  it('should restore without using the encoded login lastRoute as redirect target', async () => {
    saveDraftToStorage();
    const saveDraft = vi.fn().mockResolvedValue(undefined);

    const route = await resolveLoginRoute({
      fallbackRoute: '%2Fapp%2Fdetail%3FappId%3Dapp-1%26currentTab%3DappEdit',
      saveDraft: saveDraft as any
    });

    expect(saveDraft).toHaveBeenCalledWith(
      'app-1',
      expect.objectContaining({
        autoSave: true,
        isPublish: false
      })
    );
    expect(readWorkflowLocalDraft()).toBeNull();
    expect(route).toBe('/app/detail?appId=app-1');
  });

  it('should retry 3 times and continue redirect when auto-save keeps failing', async () => {
    saveDraftToStorage();
    const restoreError = new Error('network error');
    const saveDraft = vi.fn().mockRejectedValue(restoreError);

    const route = await resolveLoginRoute({
      fallbackRoute: '/app/detail?appId=app-1',
      saveDraft: saveDraft as any
    });

    expect(saveDraft).toHaveBeenCalledTimes(3);
    expect(readWorkflowLocalDraft()).toBeNull();
    expect(route).toBe('/app/detail?appId=app-1');
  });

  it('should stop retrying when auto-save succeeds after transient failures', async () => {
    saveDraftToStorage();
    const saveDraft = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error 1'))
      .mockRejectedValueOnce(new Error('network error 2'))
      .mockResolvedValueOnce(undefined);

    const route = await resolveLoginRoute({
      fallbackRoute: '/app/detail?appId=app-1',
      saveDraft: saveDraft as any
    });

    expect(saveDraft).toHaveBeenCalledTimes(3);
    expect(readWorkflowLocalDraft()).toBeNull();
    expect(route).toBe('/app/detail?appId=app-1');
  });

  it('should restore draft when draft tmbId matches even if query lastTmbId differs', async () => {
    saveDraftToStorage();
    const saveDraft = vi.fn().mockResolvedValue(undefined);

    const route = await resolveLoginRoute({
      lastTmbId: 'tmb-b',
      fallbackRoute: '/app/detail?appId=app-1&currentTab=appEdit',
      saveDraft: saveDraft as any
    });

    expect(saveDraft).toHaveBeenCalledWith(
      'app-1',
      expect.objectContaining({
        autoSave: true,
        isPublish: false
      })
    );
    expect(readWorkflowLocalDraft()).toBeNull();
    expect(route).toBe('/app/detail?appId=app-1');
  });

  it('should discard draft and skip fallback route when login tmbId differs from draft tmbId', async () => {
    saveDraftToStorage();
    const saveDraft = vi.fn();

    const route = await resolveLoginRoute({
      loginUser: {
        ...user,
        team: {
          ...user.team,
          teamId: 'team-b',
          tmbId: 'tmb-b'
        }
      },
      fallbackRoute: '/app/detail?appId=app-1&currentTab=appEdit',
      saveDraft: saveDraft as any
    });

    expect(saveDraft).not.toHaveBeenCalled();
    expect(readWorkflowLocalDraft()).toBeNull();
    expect(route).toBe('/dashboard/agent');
  });

  it('should discard draft and skip fallback route when draft and query lastTmbId both mismatch', async () => {
    saveDraftToStorage();
    const saveDraft = vi.fn();

    const route = await resolveLoginRoute({
      loginUser: {
        ...user,
        team: {
          ...user.team,
          teamId: 'team-b',
          tmbId: 'tmb-b'
        }
      },
      lastTmbId: 'tmb-a',
      fallbackRoute: '/app/detail?appId=app-1&currentTab=appEdit',
      saveDraft: saveDraft as any
    });

    expect(saveDraft).not.toHaveBeenCalled();
    expect(readWorkflowLocalDraft()).toBeNull();
    expect(route).toBe('/dashboard/agent');
  });

  it('should use fallback route without draft when login tmbId matches query lastTmbId', async () => {
    const saveDraft = vi.fn();

    const route = await resolveLoginRoute({
      lastTmbId: 'tmb-a',
      fallbackRoute: '/app/detail?appId=app-1&currentTab=appEdit',
      saveDraft: saveDraft as any
    });

    expect(saveDraft).not.toHaveBeenCalled();
    expect(route).toBe('/app/detail?appId=app-1&currentTab=appEdit');
  });

  it('should use fallback route without draft when query lastTmbId is missing', async () => {
    const saveDraft = vi.fn();

    const route = await resolveLoginRoute({
      fallbackRoute: '/app/detail?appId=app-1&currentTab=appEdit',
      saveDraft: saveDraft as any
    });

    expect(saveDraft).not.toHaveBeenCalled();
    expect(route).toBe('/app/detail?appId=app-1&currentTab=appEdit');
  });

  it('should skip fallback route without draft when login tmbId differs from query lastTmbId', async () => {
    const saveDraft = vi.fn();

    const route = await resolveLoginRoute({
      loginUser: {
        ...user,
        team: {
          ...user.team,
          teamId: 'team-b',
          tmbId: 'tmb-b'
        }
      },
      lastTmbId: 'tmb-a',
      fallbackRoute: '/app/detail?appId=app-1&currentTab=appEdit',
      saveDraft: saveDraft as any
    });

    expect(saveDraft).not.toHaveBeenCalled();
    expect(route).toBe('/dashboard/agent');
  });

  it('should build auth login redirect path with current tab tmbId', () => {
    setCurrentAuthTmbId('tmb-a');

    expect(getAuthLoginRedirectPath({ lastRoute: '/app/detail?appId=app-1' })).toBe(
      '/login?lastRoute=%2Fapp%2Fdetail%3FappId%3Dapp-1&lastTmbId=tmb-a'
    );
  });
});
