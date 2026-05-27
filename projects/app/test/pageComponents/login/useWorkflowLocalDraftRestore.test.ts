import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreWorkflowLocalDraftAfterLogin } from '../../../src/pageComponents/login/hooks/useWorkflowLocalDraftRestore';
import {
  readWorkflowLocalDraft,
  saveWorkflowLocalDraft
} from '../../../src/web/core/workflow/localDraft';
import { markLastAuthTmbId } from '../../../src/web/support/user/lastTmbIdStorage';
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
  username: 'user-a',
  team: {
    teamId: 'team-a',
    tmbId: 'tmb-a'
  }
} as UserType;

const saveDraftToStorage = () =>
  saveWorkflowLocalDraft({
    appId: 'app-1',
    data: {
      nodes: [{ nodeId: 'node-1' }] as any,
      edges: [] as any,
      chatConfig: { welcomeText: 'hello' } as any
    }
  });

describe('useWorkflowLocalDraftRestore helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    storageMap.clear();
    sessionStorageMap.clear();
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
    markLastAuthTmbId('tmb-a');
    const saveDraft = vi.fn().mockResolvedValue(undefined);

    const route = await restoreWorkflowLocalDraftAfterLogin({
      user,
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
    markLastAuthTmbId('tmb-a');
    const saveDraft = vi.fn().mockResolvedValue(undefined);

    const route = await restoreWorkflowLocalDraftAfterLogin({
      user,
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
    markLastAuthTmbId('tmb-a');
    const saveDraft = vi.fn().mockResolvedValue(undefined);

    const route = await restoreWorkflowLocalDraftAfterLogin({
      user,
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

  it('should keep draft and skip redirect when auto-save fails', async () => {
    saveDraftToStorage();
    markLastAuthTmbId('tmb-a');
    const restoreError = new Error('network error');
    const saveDraft = vi.fn().mockRejectedValue(restoreError);
    const onRestoreFailed = vi.fn();

    const route = await restoreWorkflowLocalDraftAfterLogin({
      user,
      fallbackRoute: '/app/detail?appId=app-1',
      saveDraft: saveDraft as any,
      onRestoreFailed
    });

    expect(onRestoreFailed).toHaveBeenCalledWith(restoreError);
    expect(readWorkflowLocalDraft()?.appId).toBe('app-1');
    expect(route).toBeUndefined();
  });

  it('should skip draft when last auth tmbId is missing', async () => {
    saveDraftToStorage();
    const saveDraft = vi.fn();

    const route = await restoreWorkflowLocalDraftAfterLogin({
      user,
      fallbackRoute: '/app/detail?appId=app-1&currentTab=appEdit',
      saveDraft: saveDraft as any
    });

    expect(saveDraft).not.toHaveBeenCalled();
    expect(readWorkflowLocalDraft()?.appId).toBe('app-1');
    expect(route).toBe('/app/detail?appId=app-1&currentTab=appEdit');
  });

  it('should skip draft and force dashboard when last auth tmbId is different', async () => {
    saveDraftToStorage();
    markLastAuthTmbId('tmb-a');
    const saveDraft = vi.fn();

    const route = await restoreWorkflowLocalDraftAfterLogin({
      user: {
        ...user,
        team: {
          ...user.team,
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

  it('should restore draft when last auth tmbId is the same', async () => {
    saveDraftToStorage();
    markLastAuthTmbId('tmb-a');
    const saveDraft = vi.fn().mockResolvedValue(undefined);

    const route = await restoreWorkflowLocalDraftAfterLogin({
      user,
      fallbackRoute: '/app/detail?appId=app-1&currentTab=appEdit',
      saveDraft: saveDraft as any
    });

    expect(saveDraft).toHaveBeenCalled();
    expect(readWorkflowLocalDraft()).toBeNull();
    expect(route).toBe('/app/detail?appId=app-1');
  });
});
