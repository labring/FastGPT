import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  checkWorkflowLocalDraft,
  getWorkflowLocalDraftDetailRoute,
  readWorkflowLocalDraft,
  removeWorkflowLocalDraft,
  saveWorkflowLocalDraft,
  WORKFLOW_LOCAL_DRAFT_STORAGE_KEY,
  type WorkflowLocalDraft
} from '../../../../src/web/core/workflow/localDraft/storage';

const scope = { appId: 'app-1', tmbId: 'tmb-a' };
const draftData: WorkflowLocalDraft['data'] = {
  nodes: [
    {
      nodeId: 'node-1',
      name: 'Start',
      flowNodeType: FlowNodeTypeEnum.workflowStart,
      inputs: [],
      outputs: []
    }
  ],
  edges: [],
  chatConfig: { welcomeText: 'hello' }
};

describe('workflow local draft', () => {
  let dom: JSDOM;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T00:00:00.000Z'));
    dom = new JSDOM('', { url: 'https://example.test/app/detail?appId=another-app' });
    vi.stubGlobal('window', dom.window);
  });

  afterEach(() => {
    dom.window.close();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('builds a canonical detail route from the draft app ID', () => {
    expect(getWorkflowLocalDraftDetailRoute('app-1')).toBe('/app/detail?appId=app-1');
    expect(getWorkflowLocalDraftDetailRoute('')).toBe('');
    expect(getWorkflowLocalDraftDetailRoute('app-1&currentTab=logs')).toBe('');
  });

  it('matches a saved draft by member regardless of the current route', () => {
    const saved = saveWorkflowLocalDraft({ ...scope, data: draftData });

    expect(saved).toMatchObject({ ...scope, data: draftData });
    expect(saved).not.toHaveProperty('username');
    expect(saved).not.toHaveProperty('teamId');
    expect(saved).not.toHaveProperty('route');
    expect(checkWorkflowLocalDraft(scope.tmbId)).toEqual({
      status: 'matched',
      draft: saved,
      route: '/app/detail?appId=app-1'
    });
  });

  it('removes a legacy draft without a member ID', () => {
    const saved = saveWorkflowLocalDraft({ ...scope, data: draftData });
    window.localStorage.clear();
    window.localStorage.setItem(
      WORKFLOW_LOCAL_DRAFT_STORAGE_KEY,
      JSON.stringify({ ...saved, tmbId: undefined })
    );

    expect(readWorkflowLocalDraft()).toBeNull();
    expect(window.localStorage.getItem(WORKFLOW_LOCAL_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('replaces the previous same-app draft when an edit removes every node', () => {
    saveWorkflowLocalDraft({ ...scope, data: draftData });
    const empty = saveWorkflowLocalDraft({ ...scope, data: { ...draftData, nodes: [] } });

    expect(empty?.data.nodes).toEqual([]);
    expect(readWorkflowLocalDraft(scope)).toEqual(empty);
  });

  it('keeps the previous draft when replacing storage fails', () => {
    const previous = saveWorkflowLocalDraft({ ...scope, data: draftData });
    vi.spyOn(dom.window.Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota exceeded');
    });

    const saved = saveWorkflowLocalDraft({ ...scope, data: { ...draftData, nodes: [] } });

    expect(saved).toBeUndefined();
    expect(readWorkflowLocalDraft(scope)).toEqual(previous);
  });

  it('stores drafts independently by app and member', () => {
    const otherApp = { ...scope, appId: 'app-2' };
    const otherMember = { ...scope, tmbId: 'tmb-b' };
    const first = saveWorkflowLocalDraft({ ...scope, data: draftData });
    const second = saveWorkflowLocalDraft({ ...otherApp, data: { ...draftData, nodes: [] } });
    const third = saveWorkflowLocalDraft({ ...otherMember, data: draftData });

    expect(readWorkflowLocalDraft(scope)).toEqual(first);
    expect(readWorkflowLocalDraft(otherApp)).toEqual(second);
    expect(readWorkflowLocalDraft(otherMember)).toEqual(third);
  });

  it('keeps leave-page backups available to the editor without restoring them on login', () => {
    const saved = saveWorkflowLocalDraft({ ...scope, data: draftData, restoreAfterLogin: false });

    expect(checkWorkflowLocalDraft(scope.tmbId)).toEqual({ status: 'empty' });
    expect(readWorkflowLocalDraft(scope)).toEqual(saved);
  });

  it('clears malformed and expired drafts', () => {
    window.localStorage.setItem(WORKFLOW_LOCAL_DRAFT_STORAGE_KEY, '{bad-json');
    expect(readWorkflowLocalDraft()).toBeNull();
    expect(window.localStorage.length).toBe(0);

    saveWorkflowLocalDraft({ ...scope, data: draftData });
    vi.setSystemTime(new Date('2026-05-19T00:00:01.000Z'));

    expect(checkWorkflowLocalDraft(scope.tmbId)).toEqual({ status: 'empty' });
    expect(window.localStorage.length).toBe(0);
  });

  it('removes only the specified draft snapshot', () => {
    const oldDraft = saveWorkflowLocalDraft({ ...scope, data: draftData })!;
    const current = saveWorkflowLocalDraft({ ...scope, data: { ...draftData, nodes: [] } })!;

    removeWorkflowLocalDraft(oldDraft);
    expect(readWorkflowLocalDraft(scope)).toEqual(current);

    removeWorkflowLocalDraft(current);
    expect(readWorkflowLocalDraft(scope)).toBeNull();
  });
});
