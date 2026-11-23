import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useContextSelector } from 'use-context-selector';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import type { AppDetailType } from '@fastgpt/global/core/app/type';
import type { PostPublishAppProps } from '@/global/core/app/api';
import type { WorkflowSaveRequest } from '@/web/core/workflow/editor/session/workflowPersistence';
import { serializeWorkflowData } from '@/web/core/workflow/editor/session/workflowPersistence';
import { hydrateRuntime } from '@/web/core/workflow/editor/codec';
import {
  readWorkflowLocalDraft,
  saveWorkflowLocalDraft
} from '@/web/core/workflow/localDraft/storage';
import { useWorkflowDraftLifecycle } from '@/web/core/workflow/localDraft/useWorkflowDraftLifecycle';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import AppContextProvider, {
  AppContext,
  type AppSaveHandler
} from '@/pageComponents/app/detail/context';

const mocks = vi.hoisted(() => ({
  getAppDetailById: vi.fn(),
  putAppById: vi.fn(),
  delAppById: vi.fn(),
  getAppLatestVersion: vi.fn(),
  postPublishApp: vi.fn(),
  toast: vi.fn(),
  router: {
    query: { appId: 'app-1', currentTab: 'appEdit' },
    push: vi.fn(),
    replace: vi.fn()
  }
}));

vi.mock('@/web/core/app/api', () => ({
  delAppById: mocks.delAppById,
  getAppDetailById: mocks.getAppDetailById,
  putAppById: mocks.putAppById
}));
vi.mock('@/web/core/app/api/version', () => ({
  getAppLatestVersion: mocks.getAppLatestVersion,
  postPublishApp: mocks.postPublishApp
}));
vi.mock('next/router', () => ({
  useRouter: () => mocks.router
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));
vi.mock('@fastgpt/web/hooks/useConfirm', () => ({
  useConfirm: () => ({
    openConfirm: vi.fn(),
    ConfirmModal: () => null
  })
}));
vi.mock('next/dynamic', () => ({
  default: () => () => null
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: { team: { tmbId: 'team-member' } } })
}));

const saveData = {
  nodes: [{ nodeId: 'node-1', inputs: [] }],
  edges: [{ source: 'node-1', target: 'node-1' }],
  chatConfig: { welcomeText: 'hello' },
  referenceSnapshots: [{ nodeId: 'node-1', name: 'Node 1' }]
} as unknown as PostPublishAppProps;

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const renderProvider = async ({ hasWritePer }: { hasWritePer: boolean }) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  let onSaveApp: AppSaveHandler;
  let appDetail: AppDetailType;
  let setAppDetail: React.Dispatch<React.SetStateAction<AppDetailType>>;

  const Capture = () => {
    onSaveApp = useContextSelector(AppContext, (value) => value.onSaveApp);
    appDetail = useContextSelector(AppContext, (value) => value.appDetail);
    setAppDetail = useContextSelector(AppContext, (value) => value.setAppDetail);
    return null;
  };

  mocks.getAppDetailById.mockResolvedValue({
    _id: 'app-1',
    type: 'workflow',
    permission: { hasWritePer }
  });
  mocks.getAppLatestVersion.mockImplementation(() => new Promise(() => {}));

  const render = () =>
    root.render(React.createElement(AppContextProvider, null, React.createElement(Capture)));

  await act(async () => {
    render();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => undefined);

  return {
    root,
    render,
    getSaveApp: () => onSaveApp!,
    getAppDetail: () => appDetail!,
    getSetAppDetail: () => setAppDetail!
  };
};

const switchApp = (render: () => void, appId = 'app-2') => {
  mocks.router.query = { appId, currentTab: 'appEdit' };
  act(() => flushSync(render));
};

describe('AppContext save result', () => {
  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.test/app/detail?appId=app-1'
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    mocks.router.query = { appId: 'app-1', currentTab: 'appEdit' };
    mocks.getAppDetailById.mockResolvedValue({
      _id: 'app-1',
      type: 'workflow',
      permission: { hasWritePer: true }
    });
    mocks.getAppLatestVersion.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saves a different app independently and serializes saves when reopening the original app', async () => {
    const { root, render, getSaveApp, getAppDetail } = await renderProvider({ hasWritePer: true });
    const previousResponse = createDeferred<void>();
    mocks.postPublishApp
      .mockImplementationOnce(() => previousResponse.promise)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const previousSave = getSaveApp()(saveData);
    try {
      expect(mocks.postPublishApp).toHaveBeenNthCalledWith(1, 'app-1', saveData);
      mocks.getAppDetailById.mockImplementation(async (appId: string) => ({
        _id: appId,
        type: 'workflow',
        permission: { hasWritePer: true }
      }));
      await act(async () => switchApp(render));
      expect(getAppDetail()._id).toBe('app-2');

      let nextSave: Promise<boolean> | undefined;
      await act(async () => {
        nextSave = getSaveApp()(saveData);
      });
      expect(mocks.postPublishApp).toHaveBeenNthCalledWith(2, 'app-2', saveData);
      await expect(nextSave).resolves.toBe(true);

      await act(async () => switchApp(render, 'app-1'));
      expect(getAppDetail()._id).toBe('app-1');
      const reopenedData = { ...saveData, versionName: 'After returning' };
      const reopenedSave = getSaveApp()(reopenedData);
      expect(mocks.postPublishApp).toHaveBeenCalledTimes(2);
      await act(async () => {
        previousResponse.resolve();
        await expect(previousSave).resolves.toBe(true);
        await expect(reopenedSave).resolves.toBe(true);
      });
      expect(mocks.postPublishApp).toHaveBeenNthCalledWith(3, 'app-1', reopenedData);
    } finally {
      await act(async () => {
        previousResponse.resolve();
        await previousSave;
      });
      await act(async () => root.unmount());
    }
  });

  it.each([false, true])(
    'keeps a local workflow draft after the editor leaves (saved=%s)',
    async (isSaved) => {
      const root = createRoot(document.createElement('div'));
      const data = {
        nodes: [
          {
            nodeId: 'node-1',
            name: 'Local edit',
            flowNodeType: FlowNodeTypeEnum.workflowStart,
            inputs: [],
            outputs: []
          }
        ],
        edges: [],
        chatConfig: {}
      };
      const leaveSaveSign = { current: true };
      const writtenDraftRef = { current: undefined };
      const DraftEditor = () => {
        const appId = useContextSelector(AppContext, (value) => value.appDetail._id);
        const runtime = hydrateRuntime({ input: data, t: (key) => key });
        useWorkflowDraftLifecycle({
          appId,
          runtime,
          isSaved,
          serializeWorkflow: () => data,
          allowLoginRestore: true,
          leaveSaveSign,
          writtenDraftRef,
          createSaveRequest: () => ({
            appId,
            runtime,
            sessionId: 'app-1-session',
            contentRevision: 0,
            requestToken: 1,
            data
          }),
          isCurrentSaveRequest: () => false
        });
        return null;
      };
      const Capture = () => {
        const appId = useContextSelector(AppContext, (value) => value.appId);
        const loadedAppId = useContextSelector(AppContext, (value) => value.appDetail._id);
        return appId === 'app-1' && loadedAppId === appId ? React.createElement(DraftEditor) : null;
      };
      const render = () =>
        root.render(React.createElement(AppContextProvider, null, React.createElement(Capture)));

      if (isSaved) saveWorkflowLocalDraft({ appId: 'app-1', tmbId: 'team-member', data });
      await act(async () => render());
      await act(async () => {
        mocks.router.query = { ...mocks.router.query, appId: 'app-2' };
        render();
      });
      await act(async () => root.unmount());

      expect(mocks.postPublishApp).not.toHaveBeenCalled();
      expect(readWorkflowLocalDraft({ appId: 'app-1', tmbId: 'team-member' })?.data).toEqual(data);
    }
  );

  it('returns failure when the current user cannot write', async () => {
    const { root, getSaveApp } = await renderProvider({ hasWritePer: false });
    let result: boolean | undefined;

    await act(async () => {
      result = await getSaveApp()(saveData);
    });
    expect(result).toBe(false);
    expect(mocks.postPublishApp).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it('blocks publishing a debug tool after serializing the editor runtime', async () => {
    const { root, getSaveApp } = await renderProvider({ hasWritePer: true });
    const runtime = hydrateRuntime({
      input: {
        nodes: [
          {
            nodeId: 'debug',
            name: 'Debug tool',
            flowNodeType: FlowNodeTypeEnum.answerNode,
            source: 'debug:tmbId:member',
            inputs: [],
            outputs: []
          }
        ],
        edges: [],
        chatConfig: {}
      },
      t: ((key: string) => key) as never
    });
    const saved = serializeWorkflowData({
      runtimeRef: { current: runtime },
      pendingSaveRevisionRef: { current: undefined }
    });
    if (!saved) throw new Error('workflow not saved');

    await act(async () => {
      await expect(getSaveApp()({ ...saved, isPublish: true })).rejects.toThrow(
        'Debug tool cannot be published'
      );
    });
    expect(mocks.postPublishApp).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'app:publish_remove_debug_tool_tip' })
    );
    runtime.dispose();
    act(() => root.unmount());
  });

  it('routes the current 404 save response to the app list and returns failure', async () => {
    mocks.postPublishApp.mockRejectedValueOnce({ statusText: AppErrEnum.unExist });
    const { root, getSaveApp } = await renderProvider({ hasWritePer: true });
    let result: boolean | undefined;

    await act(async () => {
      result = await getSaveApp()(saveData);
    });
    expect(result).toBe(false);
    expect(mocks.router.replace).toHaveBeenCalledWith('/dashboard/agent');

    act(() => root.unmount());
  });

  it('propagates network failure as a rejected save', async () => {
    mocks.postPublishApp.mockRejectedValueOnce(new Error('network error'));
    const { root, getSaveApp } = await renderProvider({ hasWritePer: true });

    await act(async () => {
      await expect(getSaveApp()(saveData)).rejects.toThrow('network error');
    });

    act(() => root.unmount());
  });

  it('preserves explicit save order and only replaces adjacent pending drafts', async () => {
    const firstRequest = createDeferred<void>();
    mocks.postPublishApp
      .mockImplementationOnce(() => firstRequest.promise)
      .mockResolvedValue(undefined);
    const { root, getSaveApp, getAppDetail } = await renderProvider({ hasWritePer: true });

    await act(async () => {
      const save = getSaveApp();
      const first = save({ ...saveData, versionName: 'in-flight' });
      const cloud = save({ ...saveData, versionName: 'explicit-cloud' });
      const obsoleteDraft = save({ ...saveData, versionName: 'obsolete-draft', autoSave: true });
      const previousDraft = save({ ...saveData, versionName: 'previous-draft', autoSave: true });
      const publish = save({ ...saveData, versionName: 'explicit-publish', isPublish: true });
      const latestDraft = save({
        ...saveData,
        nodes: [{ nodeId: 'latest', inputs: [] }],
        versionName: 'latest-draft',
        autoSave: true
      });

      expect(mocks.postPublishApp).toHaveBeenCalledTimes(1);
      await expect(obsoleteDraft).resolves.toBe(false);
      firstRequest.resolve();
      await expect(
        Promise.all([first, cloud, previousDraft, publish, latestDraft])
      ).resolves.toEqual([true, true, true, true, true]);
    });

    expect(mocks.postPublishApp.mock.calls.map(([, data]) => data.versionName)).toEqual([
      'in-flight',
      'explicit-cloud',
      'previous-draft',
      'explicit-publish',
      'latest-draft'
    ]);
    expect(mocks.postPublishApp.mock.calls[3]?.[1]).toMatchObject({ isPublish: true });
    expect(getAppDetail()).toMatchObject({
      nodes: [{ nodeId: 'latest', inputs: [] }],
      edges: saveData.edges,
      chatConfig: saveData.chatConfig,
      referenceSnapshots: saveData.referenceSnapshots
    });
    expect(getAppDetail()).not.toHaveProperty('isPublish');
    expect(getAppDetail()).not.toHaveProperty('versionName');
    expect(getAppDetail()).not.toHaveProperty('autoSave');

    act(() => root.unmount());
  });

  it('reports an earlier save failure and continues with the next request', async () => {
    const firstRequest = createDeferred<void>();
    mocks.postPublishApp
      .mockImplementationOnce(() => firstRequest.promise)
      .mockResolvedValue(undefined);
    const { root, getSaveApp } = await renderProvider({ hasWritePer: true });

    await act(async () => {
      const save = getSaveApp();
      const first = save({ ...saveData, isPublish: true });
      const draft = save({ ...saveData, autoSave: true });
      const failure = expect(first).rejects.toThrow('publish failed');
      firstRequest.reject(new Error('publish failed'));

      await failure;
      await expect(draft).resolves.toBe(true);
    });

    act(() => root.unmount());
  });

  it('does not apply the latest payload when that save fails', async () => {
    const firstRequest = createDeferred<void>();
    mocks.postPublishApp.mockImplementationOnce(() => firstRequest.promise);
    mocks.postPublishApp.mockRejectedValueOnce(new Error('latest save failed'));
    const { root, getSaveApp, getAppDetail } = await renderProvider({ hasWritePer: true });

    const requestA = { appId: 'app-1' } as WorkflowSaveRequest;
    const requestB = { appId: 'app-1' } as WorkflowSaveRequest;
    const firstSave = getSaveApp()(
      {
        ...saveData,
        nodes: [{ nodeId: 'first' }]
      },
      requestA
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const latestSave = getSaveApp()(
      {
        ...saveData,
        nodes: [{ nodeId: 'latest' }]
      },
      requestB
    );

    await act(async () => {
      firstRequest.resolve();
      await expect(firstSave).resolves.toBe(true);
      await expect(latestSave).rejects.toThrow('latest save failed');
    });

    expect(getAppDetail().nodes).toBeUndefined();
    act(() => root.unmount());
  });

  it.each([
    { title: 'before Runtime synchronization', updateRuntimeRevision: false },
    { title: 'after Runtime synchronization', updateRuntimeRevision: true }
  ])(
    'preserves edits made after the save request snapshot $title',
    async ({ updateRuntimeRevision }) => {
      const saveResponse = createDeferred<void>();
      mocks.postPublishApp.mockImplementationOnce(() => saveResponse.promise);
      const { root, getSaveApp, getAppDetail, getSetAppDetail } = await renderProvider({
        hasWritePer: true
      });
      let contentRevision = 1;
      const request = {
        runtime: {
          isDisposed: () => false,
          getSavepoint: () => ({ contentRevision })
        },
        sessionId: 'session-1',
        appId: 'app-1',
        contentRevision: 1,
        requestToken: 1,
        data: saveData
      } as unknown as WorkflowSaveRequest;

      const save = getSaveApp()(saveData, request);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      act(() => {
        getSetAppDetail()((state) => ({
          ...state,
          chatConfig: { ...state.chatConfig, welcomeText: 'newer edit' }
        }));
        if (updateRuntimeRevision) contentRevision = 2;
      });

      await act(async () => {
        saveResponse.resolve();
        await expect(save).resolves.toBe(true);
      });

      expect(getAppDetail().chatConfig.welcomeText).toBe('newer edit');
      act(() => root.unmount());
    }
  );

  it('ignores a previous app 404 after the route changes', async () => {
    const firstRequest = createDeferred<never>();
    mocks.postPublishApp.mockImplementationOnce(() => firstRequest.promise);
    const { root, render, getSaveApp } = await renderProvider({ hasWritePer: true });

    const previousAppSave = getSaveApp()(saveData);
    const pendingPublish = getSaveApp()({ ...saveData, isPublish: true });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    mocks.getAppDetailById.mockImplementationOnce(() => new Promise(() => {}));
    switchApp(render);
    await act(async () => {
      firstRequest.reject({ statusText: AppErrEnum.unExist });
      await previousAppSave;
    });

    await expect(previousAppSave).resolves.toBe(false);
    await expect(pendingPublish).resolves.toBe(false);
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(mocks.postPublishApp).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  it('ignores a previous app success after the route changes', async () => {
    const firstRequest = createDeferred<void>();
    mocks.postPublishApp.mockImplementationOnce(() => firstRequest.promise);
    const { root, render, getSaveApp, getAppDetail } = await renderProvider({ hasWritePer: true });

    const previousAppSave = getSaveApp()({
      ...saveData,
      nodes: [{ nodeId: 'previous-app' }]
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    mocks.getAppDetailById.mockResolvedValue({
      _id: 'app-2',
      type: 'workflow',
      permission: { hasWritePer: true }
    });
    switchApp(render);

    await act(async () => {
      firstRequest.resolve();
      await previousAppSave;
    });

    expect(getAppDetail().nodes).not.toEqual([{ nodeId: 'previous-app' }]);

    act(() => root.unmount());
  });

  it('publishes to the original app after navigation and drops only its pending autosave', async () => {
    const firstRequest = createDeferred<void>();
    mocks.postPublishApp.mockImplementationOnce(() => firstRequest.promise);
    const { root, render, getSaveApp, getAppDetail } = await renderProvider({ hasWritePer: true });
    const autoSave = { ...saveData, autoSave: true };
    const publish = {
      ...saveData,
      isPublish: true,
      nodes: [
        {
          nodeId: 'original-draft',
          name: 'Original draft',
          flowNodeType: FlowNodeTypeEnum.answerNode,
          inputs: [],
          outputs: []
        }
      ]
    };
    const save = getSaveApp();
    const inFlight = save(autoSave);
    const obsoleteDraft = save(autoSave);
    const pendingPublish = save(publish);
    expect(mocks.postPublishApp).toHaveBeenCalledTimes(1);

    mocks.getAppDetailById.mockResolvedValue({
      _id: 'app-2',
      type: 'workflow',
      permission: { hasWritePer: true }
    });
    await act(async () => switchApp(render));
    await expect(obsoleteDraft).resolves.toBe(false);
    await act(async () => {
      firstRequest.resolve();
      await expect(inFlight).resolves.toBe(false);
      await expect(pendingPublish).resolves.toBe(true);
    });

    expect(mocks.postPublishApp).toHaveBeenCalledTimes(2);
    expect(mocks.postPublishApp).toHaveBeenNthCalledWith(2, 'app-1', publish);
    expect(getAppDetail()._id).toBe('app-2');
    expect(getAppDetail().nodes).not.toEqual(publish.nodes);
    act(() => root.unmount());
  });

  it.each([false, true])(
    'settles in-flight workflow saves after unmount (autoSave: %s)',
    async (autoSave) => {
      const firstRequest = createDeferred<void>();
      mocks.postPublishApp.mockImplementationOnce(() => firstRequest.promise);
      const { root, getSaveApp } = await renderProvider({ hasWritePer: true });
      const save = getSaveApp();
      const inFlight = save({ ...saveData, autoSave }, { appId: 'app-1' } as WorkflowSaveRequest);
      const pending = save({ ...saveData, isPublish: true });

      act(() => root.unmount());
      firstRequest.resolve();

      await expect(Promise.all([inFlight, pending])).resolves.toEqual([true, true]);
      expect(mocks.postPublishApp).toHaveBeenCalledTimes(2);
      expect(mocks.postPublishApp).toHaveBeenNthCalledWith(2, 'app-1', {
        ...saveData,
        isPublish: true
      });
    }
  );
});
