import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowRuntimePort } from '@fastgpt/global/core/workflow/editor/types';
import { AppContext } from '@/pageComponents/app/detail/context';
import {
  readWorkflowLocalDraft,
  saveWorkflowLocalDraft
} from '@/web/core/workflow/localDraft/storage';
import type { WorkflowSaveRequest } from '@/web/core/workflow/editor/session/workflowPersistence';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useWorkflowDraftLifecycle } from '@/web/core/workflow/localDraft/useWorkflowDraftLifecycle';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/pageComponents/app/detail/context', async () => {
  const { createContext } = await import('use-context-selector');
  return {
    AppContext: createContext({
      appDetail: { _id: 'app-1', permission: { hasWritePer: true } },
      onSaveApp: vi.fn()
    })
  };
});
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: { team: { tmbId: 'tmb-1' } } })
}));
vi.mock('@/web/core/workflow/localDraft/useWorkflowAuthExpiredDraft', () => ({
  useWorkflowAuthExpiredDraft: () => ({
    authExpiredModal: undefined,
    handleBeforeUnloadAuthExpired: () => ({ isAuthExpiredRedirecting: false }),
    setBeforeUnloadAutoSaving: vi.fn(),
    shouldSkipUnmountAutoSave: () => true
  })
}));

const reactGlobals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

describe('workflow draft lifecycle', () => {
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.test'
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;
    root = createRoot(document.createElement('div'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it.each([
    { newerBackup: false, discard: false },
    { newerBackup: true, discard: false },
    { newerBackup: false, discard: true },
    { newerBackup: true, discard: true }
  ])(
    'clears only the confirmed draft after leaving (newer backup: $newerBackup, discard: $discard)',
    async ({ newerBackup, discard }) => {
      const scope = { appId: 'app-1', tmbId: 'tmb-1' };
      const data: WorkflowSaveRequest['data'] = {
        nodes: [
          {
            nodeId: 'start',
            name: 'Start',
            flowNodeType: FlowNodeTypeEnum.workflowStart,
            inputs: [],
            outputs: []
          }
        ],
        edges: [],
        chatConfig: { welcomeText: 'Recovered' },
        referenceSnapshots: []
      };
      let disposed = false;
      const runtime = {
        isDisposed: () => disposed,
        getSavepoint: () => ({ contentRevision: 5, isDirty: false })
      } as unknown as WorkflowRuntimePort;
      const createSaveRequest = (appId: string): WorkflowSaveRequest => ({
        appId,
        runtime,
        sessionId: 'test-session',
        requestToken: 1,
        contentRevision: 5,
        data
      });
      const initialDraft = saveWorkflowLocalDraft({ ...scope, data });
      const leaveSaveSign = { current: true };
      const writtenDraftRef = { current: undefined };
      let discardWrittenDraft: (() => void) | undefined;
      const Probe = ({ isSaved }: { isSaved: boolean }) => {
        const lifecycle = useWorkflowDraftLifecycle({
          appId: scope.appId,
          runtime,
          isSaved,
          serializeWorkflow: () => data,
          allowLoginRestore: true,
          leaveSaveSign,
          writtenDraftRef,
          createSaveRequest: discard ? () => undefined : createSaveRequest
        });
        discardWrittenDraft = lifecycle.discardWrittenDraft;
        return null;
      };

      let completeSave!: (saved: boolean) => void;
      const promise = new Promise<boolean>((resolve) => {
        completeSave = resolve;
      });
      const onSaveApp = vi.fn(() => promise);
      const appContext = {
        appDetail: { _id: scope.appId, permission: { hasWritePer: true } },
        onSaveApp
      };
      const render = async (isSaved: boolean) => {
        await act(async () =>
          root.render(
            React.createElement(
              AppContext.Provider,
              { value: appContext as never },
              React.createElement(Probe, { isSaved })
            )
          )
        );
      };
      await render(true);
      expect(readWorkflowLocalDraft(scope)).toEqual(initialDraft);
      expect(onSaveApp).not.toHaveBeenCalled();

      await render(false);
      await act(async () => {
        window.dispatchEvent(new window.Event('beforeunload', { cancelable: true }));
      });
      expect(onSaveApp).toHaveBeenCalledTimes(discard ? 0 : 1);
      expect(readWorkflowLocalDraft(scope)?.data).toEqual(data);

      const laterDraft = newerBackup
        ? saveWorkflowLocalDraft({
            ...scope,
            data: { ...data, chatConfig: { welcomeText: 'Other tab' } }
          })
        : null;
      await act(async () => {
        if (discard) {
          discardWrittenDraft!();
        } else {
          root.render(null);
          disposed = true;
          completeSave(true);
        }
      });
      expect(readWorkflowLocalDraft(scope)).toEqual(laterDraft);
    }
  );
});
