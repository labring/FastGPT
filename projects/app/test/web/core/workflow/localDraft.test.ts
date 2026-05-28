import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkWorkflowLocalDraft,
  getWorkflowLocalDraftDetailRoute,
  readWorkflowLocalDraft,
  removeWorkflowLocalDraft,
  saveWorkflowLocalDraft,
  WORKFLOW_LOCAL_DRAFT_STORAGE_KEY
} from '../../../../src/web/core/workflow/localDraft/storage';

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
    vi.stubGlobal('window', {
      localStorage: localStorageMock,
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

  it('should save and match draft with tmbId', () => {
    const saved = saveWorkflowLocalDraft({
      appId: 'app-1',
      tmbId: 'tmb-a',
      data: draftData
    });

    expect(saved).toBe(true);

    const result = checkWorkflowLocalDraft();

    expect(result.status).toBe('matched');
    if (result.status === 'matched') {
      expect(result.draft.appId).toBe('app-1');
      expect(result.draft.tmbId).toBe('tmb-a');
      expect(result.draft).not.toHaveProperty('username');
      expect(result.draft).not.toHaveProperty('teamId');
      expect(result.draft).not.toHaveProperty('route');
      expect(result.route).toBe('/app/detail?appId=app-1');
    }
  });

  it('should clear stored draft without tmbId', () => {
    saveWorkflowLocalDraft({
      appId: 'app-1',
      tmbId: 'tmb-a',
      data: draftData
    });
    const savedDraft = JSON.parse(storageMap.get(WORKFLOW_LOCAL_DRAFT_STORAGE_KEY)!);
    delete savedDraft.tmbId;
    storageMap.set(WORKFLOW_LOCAL_DRAFT_STORAGE_KEY, JSON.stringify(savedDraft));

    const draft = readWorkflowLocalDraft();

    expect(draft).toBeNull();
    expect(storageMap.has(WORKFLOW_LOCAL_DRAFT_STORAGE_KEY)).toBe(false);
  });

  it('should match draft without checking the login fallback route', () => {
    saveWorkflowLocalDraft({
      appId: 'app-1',
      tmbId: 'tmb-a',
      data: draftData
    });

    const matchedResult = checkWorkflowLocalDraft();
    expect(matchedResult.status).toBe('matched');
  });

  it('should replace stale same-app draft with the latest write', () => {
    saveWorkflowLocalDraft({
      appId: 'app-1',
      tmbId: 'tmb-a',
      data: draftData
    });

    const saved = saveWorkflowLocalDraft({
      appId: 'app-1',
      tmbId: 'tmb-a',
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
      tmbId: 'tmb-a',
      data: draftData
    });

    const saved = saveWorkflowLocalDraft({
      appId: 'app-1',
      tmbId: 'tmb-a',
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
      tmbId: 'tmb-a',
      data: draftData
    });

    const saved = saveWorkflowLocalDraft({
      appId: 'app-2',
      tmbId: 'tmb-a',
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
      tmbId: 'tmb-a',
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
      tmbId: 'tmb-a',
      data: draftData
    });

    removeWorkflowLocalDraft();

    expect(readWorkflowLocalDraft()).toBeNull();
  });
});
