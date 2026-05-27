import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkWorkflowLocalDraft,
  consumeWorkflowLocalDraftSavedNotice,
  getWorkflowLocalDraftDetailRoute,
  markWorkflowLocalDraftSavedNotice,
  readWorkflowLocalDraft,
  removeWorkflowLocalDraft,
  saveWorkflowLocalDraft,
  WORKFLOW_LOCAL_DRAFT_STORAGE_KEY
} from '../../../../src/web/core/workflow/localDraft';

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

  it('should build canonical app detail route from draft appId', () => {
    expect(getWorkflowLocalDraftDetailRoute('app-1')).toBe('/app/detail?appId=app-1');
    expect(getWorkflowLocalDraftDetailRoute('')).toBe('');
    expect(getWorkflowLocalDraftDetailRoute('app-1&currentTab=logs')).toBe('');
  });

  it('should save and match draft without account identity', () => {
    const saved = saveWorkflowLocalDraft({
      appId: 'app-1',
      data: draftData
    });

    expect(saved).toBe(true);

    const result = checkWorkflowLocalDraft();

    expect(result.status).toBe('matched');
    if (result.status === 'matched') {
      expect(result.draft.appId).toBe('app-1');
      expect(result.draft).not.toHaveProperty('username');
      expect(result.draft).not.toHaveProperty('teamId');
      expect(result.draft).not.toHaveProperty('tmbId');
      expect(result.draft).not.toHaveProperty('route');
      expect(result.route).toBe('/app/detail?appId=app-1');
    }
  });

  it('should strip legacy identity fields from stored draft', () => {
    saveWorkflowLocalDraft({
      appId: 'app-1',
      data: draftData
    });
    const savedDraft = JSON.parse(storageMap.get(WORKFLOW_LOCAL_DRAFT_STORAGE_KEY)!);
    storageMap.set(
      WORKFLOW_LOCAL_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ...savedDraft,
        username: 'legacy-user',
        teamId: 'legacy-team',
        tmbId: 'legacy-tmb',
        route: '/app/detail?appId=app-1&currentTab=publish'
      })
    );

    const draft = readWorkflowLocalDraft();
    const persistedDraft = JSON.parse(storageMap.get(WORKFLOW_LOCAL_DRAFT_STORAGE_KEY)!);

    expect(draft).not.toHaveProperty('tmbId');
    expect(draft).not.toHaveProperty('username');
    expect(draft).not.toHaveProperty('teamId');
    expect(draft).not.toHaveProperty('route');
    expect(persistedDraft).not.toHaveProperty('tmbId');
    expect(persistedDraft).not.toHaveProperty('username');
    expect(persistedDraft).not.toHaveProperty('teamId');
    expect(persistedDraft).not.toHaveProperty('route');
  });

  it('should match draft without checking the login fallback route', () => {
    saveWorkflowLocalDraft({
      appId: 'app-1',
      data: draftData
    });

    const matchedResult = checkWorkflowLocalDraft();
    expect(matchedResult.status).toBe('matched');
  });

  it('should replace stale same-app draft with the latest write', () => {
    saveWorkflowLocalDraft({
      appId: 'app-1',
      data: draftData
    });

    const saved = saveWorkflowLocalDraft({
      appId: 'app-1',
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
      data: draftData
    });

    const saved = saveWorkflowLocalDraft({
      appId: 'app-1',
      data: {
        ...draftData,
        nodes: []
      }
    });

    expect(saved).toBe(false);
    expect(readWorkflowLocalDraft()).toBeNull();
  });

  it('should keep another app draft when an invalid write belongs to a different app', () => {
    saveWorkflowLocalDraft({
      appId: 'app-1',
      data: draftData
    });

    const saved = saveWorkflowLocalDraft({
      appId: 'app-2',
      data: {
        ...draftData,
        nodes: []
      }
    });

    expect(saved).toBe(false);
    expect(readWorkflowLocalDraft()?.appId).toBe('app-1');
  });

  it('should clear malformed or expired drafts', () => {
    storageMap.set(WORKFLOW_LOCAL_DRAFT_STORAGE_KEY, '{bad-json');
    expect(readWorkflowLocalDraft()).toBeNull();
    expect(storageMap.has(WORKFLOW_LOCAL_DRAFT_STORAGE_KEY)).toBe(false);

    saveWorkflowLocalDraft({
      appId: 'app-1',
      data: draftData
    });
    vi.setSystemTime(new Date('2026-05-19T00:00:01.000Z'));

    const result = checkWorkflowLocalDraft();

    expect(result.status).toBe('expired');
    expect(readWorkflowLocalDraft()).toBeNull();
  });

  it('should remove current draft explicitly', () => {
    saveWorkflowLocalDraft({
      appId: 'app-1',
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
