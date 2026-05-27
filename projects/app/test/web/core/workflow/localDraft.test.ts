import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkWorkflowLocalDraft,
  consumeWorkflowLocalDraftSavedNotice,
  getWorkflowAppIdFromRoute,
  getWorkflowLocalDraftDetailRoute,
  markWorkflowLocalDraftSavedNotice,
  normalizeWorkflowLocalDraftRoute,
  readWorkflowLocalDraft,
  removeWorkflowLocalDraft,
  saveWorkflowLocalDraft,
  WORKFLOW_LOCAL_DRAFT_STORAGE_KEY
} from '../../../../src/web/core/workflow/localDraft';
import type { UserType } from '@fastgpt/global/support/user/type';

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

const createUser = ({
  username = 'user-a',
  teamId = 'team-a',
  tmbId = 'tmb-a'
}: {
  username?: string;
  teamId?: string;
  tmbId?: string;
} = {}) =>
  ({
    username,
    team: {
      teamId,
      tmbId
    }
  }) as UserType;

const draftData = {
  nodes: [{ nodeId: 'node-1' }] as any,
  edges: [] as any,
  chatConfig: { welcomeText: 'hello' } as any
};

describe('workflow local draft', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    storageMap.clear();
    sessionStorageMap.clear();
    vi.stubGlobal('window', {
      localStorage: localStorageMock,
      sessionStorage: sessionStorageMock,
      location: {
        pathname: '/app/detail',
        search: '?appId=app-1&currentTab=appEdit'
      }
    });
    vi.setSystemTime(new Date('2026-05-11T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should parse appId from workflow route', () => {
    expect(getWorkflowAppIdFromRoute('/app/detail?appId=app-1&currentTab=appEdit')).toBe('app-1');
    expect(
      getWorkflowAppIdFromRoute('%2Fapp%2Fdetail%3FappId%3Dapp-1%26currentTab%3DappEdit')
    ).toBe('app-1');
    expect(getWorkflowAppIdFromRoute('/app/detail?appId=app-1%26currentTab%3DappEdit')).toBe(
      'app-1'
    );
    expect(getWorkflowAppIdFromRoute('/dashboard/agent')).toBe('');
    expect(getWorkflowAppIdFromRoute('/app/detail?appId=app-1&currentTab=publish')).toBe('app-1');
    expect(
      getWorkflowAppIdFromRoute('https%3A%2F%2Fexample.com%2Fapp%2Fdetail%3FappId%3Dapp-1')
    ).toBe('');
  });

  it('should normalize encoded workflow route for restore redirect', () => {
    expect(
      normalizeWorkflowLocalDraftRoute('%2Fapp%2Fdetail%3FappId%3Dapp-1%26currentTab%3DappEdit')
    ).toBe('/app/detail?appId=app-1&currentTab=appEdit');
    expect(normalizeWorkflowLocalDraftRoute('/app/detail?appId=app-1&currentTab=appEdit')).toBe(
      '/app/detail?appId=app-1&currentTab=appEdit'
    );
    expect(normalizeWorkflowLocalDraftRoute('https://example.com/app/detail?appId=app-1')).toBe('');
  });

  it('should build canonical app detail route from draft appId', () => {
    expect(getWorkflowLocalDraftDetailRoute('app-1')).toBe('/app/detail?appId=app-1');
    expect(getWorkflowLocalDraftDetailRoute('')).toBe('');
    expect(getWorkflowLocalDraftDetailRoute('app-1&currentTab=logs')).toBe('');
  });

  it('should save and match draft for the same username and tmbId', () => {
    const saved = saveWorkflowLocalDraft({
      appId: 'app-1',
      identity: {
        username: 'user-a',
        teamId: 'team-a',
        tmbId: 'tmb-a'
      },
      data: draftData
    });

    expect(saved).toBe(true);

    const result = checkWorkflowLocalDraft({
      user: createUser({
        teamId: 'team-b'
      })
    });

    expect(result.status).toBe('matched');
    if (result.status === 'matched') {
      expect(result.draft.appId).toBe('app-1');
      expect(result.draft.username).toBe('user-a');
      expect(result.route).toBe('/app/detail?appId=app-1');
    }
  });

  it('should match draft without checking the login fallback route or tab', () => {
    saveWorkflowLocalDraft({
      appId: 'app-1',
      identity: {
        username: 'user-a',
        teamId: 'team-a',
        tmbId: 'tmb-a'
      },
      data: draftData
    });

    const matchedResult = checkWorkflowLocalDraft({
      user: createUser()
    });
    expect(matchedResult.status).toBe('matched');
  });

  it('should replace stale same-app draft with the latest write', () => {
    saveWorkflowLocalDraft({
      appId: 'app-1',
      identity: {
        username: 'user-a',
        teamId: 'team-a',
        tmbId: 'tmb-a'
      },
      data: draftData
    });

    const saved = saveWorkflowLocalDraft({
      appId: 'app-1',
      identity: {
        username: 'user-a',
        teamId: 'team-a',
        tmbId: 'tmb-a'
      },
      data: {
        ...draftData,
        nodes: [{ nodeId: 'node-latest' }] as any
      }
    });

    expect(saved).toBe(true);
    expect(readWorkflowLocalDraft()?.data.nodes[0]?.nodeId).toBe('node-latest');
  });

  it('should clear stale same-app draft when the latest write is unavailable', () => {
    saveWorkflowLocalDraft({
      appId: 'app-1',
      identity: {
        username: 'user-a',
        teamId: 'team-a',
        tmbId: 'tmb-a'
      },
      data: draftData
    });

    const saved = saveWorkflowLocalDraft({
      appId: 'app-1',
      identity: null,
      data: draftData
    });

    expect(saved).toBe(false);
    expect(readWorkflowLocalDraft()).toBeNull();
  });

  it('should keep another account draft when an invalid write belongs to a different identity', () => {
    saveWorkflowLocalDraft({
      appId: 'app-1',
      identity: {
        username: 'user-a',
        teamId: 'team-a',
        tmbId: 'tmb-a'
      },
      data: draftData
    });

    const saved = saveWorkflowLocalDraft({
      appId: 'app-1',
      identity: {
        username: 'user-b',
        teamId: 'team-b',
        tmbId: 'tmb-b'
      },
      data: {
        ...draftData,
        nodes: []
      }
    });

    expect(saved).toBe(false);
    expect(readWorkflowLocalDraft()?.username).toBe('user-a');
  });

  it('should return canonical detail route instead of the saved tab route', () => {
    saveWorkflowLocalDraft({
      appId: 'app-1',
      identity: {
        username: 'user-a',
        teamId: 'team-a',
        tmbId: 'tmb-a'
      },
      data: draftData,
      route: '/app/detail?appId=app-1&currentTab=publish'
    });

    const result = checkWorkflowLocalDraft({
      user: createUser()
    });

    expect(result.status).toBe('matched');
    if (result.status === 'matched') {
      expect(result.route).toBe('/app/detail?appId=app-1');
    }
  });

  it('should reject draft from another account without deleting it', () => {
    saveWorkflowLocalDraft({
      appId: 'app-1',
      identity: {
        username: 'user-a',
        teamId: 'team-a',
        tmbId: 'tmb-a'
      },
      data: draftData
    });

    const result = checkWorkflowLocalDraft({
      user: createUser({ username: 'user-b' })
    });

    expect(result.status).toBe('account-mismatch');
    expect(readWorkflowLocalDraft()?.username).toBe('user-a');
  });

  it('should reject draft from the same username but another tmbId without deleting it', () => {
    saveWorkflowLocalDraft({
      appId: 'app-1',
      identity: {
        username: 'user-a',
        teamId: 'team-a',
        tmbId: 'tmb-a'
      },
      data: draftData
    });

    const result = checkWorkflowLocalDraft({
      user: createUser({ tmbId: 'tmb-b' })
    });

    expect(result.status).toBe('account-mismatch');
    expect(readWorkflowLocalDraft()?.tmbId).toBe('tmb-a');
  });

  it('should clear malformed or expired drafts', () => {
    storageMap.set(WORKFLOW_LOCAL_DRAFT_STORAGE_KEY, '{bad-json');
    expect(readWorkflowLocalDraft()).toBeNull();
    expect(storageMap.has(WORKFLOW_LOCAL_DRAFT_STORAGE_KEY)).toBe(false);

    saveWorkflowLocalDraft({
      appId: 'app-1',
      identity: {
        username: 'user-a',
        teamId: 'team-a',
        tmbId: 'tmb-a'
      },
      data: draftData
    });
    vi.setSystemTime(new Date('2026-05-19T00:00:01.000Z'));

    const result = checkWorkflowLocalDraft({
      user: createUser()
    });

    expect(result.status).toBe('expired');
    expect(readWorkflowLocalDraft()).toBeNull();
  });

  it('should remove current draft explicitly', () => {
    saveWorkflowLocalDraft({
      appId: 'app-1',
      identity: {
        username: 'user-a',
        teamId: 'team-a',
        tmbId: 'tmb-a'
      },
      data: draftData
    });

    removeWorkflowLocalDraft();

    expect(readWorkflowLocalDraft()).toBeNull();
  });

  it('should consume saved draft notice only once', () => {
    expect(consumeWorkflowLocalDraftSavedNotice()).toBe(false);

    markWorkflowLocalDraftSavedNotice();

    expect(consumeWorkflowLocalDraftSavedNotice()).toBe(true);
    expect(consumeWorkflowLocalDraftSavedNotice()).toBe(false);
  });
});
