import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreWorkflowLocalDraftAfterLogin } from '../../../src/pageComponents/login/hooks/useWorkflowLocalDraftRestore';
import {
  readWorkflowLocalDraft,
  saveWorkflowLocalDraft
} from '../../../src/web/core/workflow/localDraft';
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
const localStorageMock = {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storageMap.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    storageMap.delete(key);
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
    identity: {
      username: 'user-a',
      teamId: 'team-a',
      tmbId: 'tmb-a'
    },
    route: '/app/detail?appId=app-1&currentTab=appEdit',
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
    vi.stubGlobal('window', {
      localStorage: localStorageMock,
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

  it('should clear another account draft without auto-save', async () => {
    saveDraftToStorage();
    const saveDraft = vi.fn();

    const route = await restoreWorkflowLocalDraftAfterLogin({
      user: {
        ...user,
        username: 'user-b'
      },
      fallbackRoute: '/app/detail?appId=app-1&currentTab=appEdit',
      saveDraft: saveDraft as any
    });

    expect(saveDraft).not.toHaveBeenCalled();
    expect(readWorkflowLocalDraft()).toBeNull();
    expect(route).toBe('/app/detail?appId=app-1&currentTab=appEdit');
  });
});
