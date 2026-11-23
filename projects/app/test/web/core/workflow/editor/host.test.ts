import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReactFlowProvider } from '@xyflow/react';
import { AppContext } from '@/pageComponents/app/detail/context';
import type { AppSaveHandler } from '@/pageComponents/app/detail/context';
import { materializeWorkflow, serializeRuntime } from '@/web/core/workflow/editor/codec';
import { hydrateWorkflowEditor } from '@fastgpt/global/common/workflow/editor/protocol';
import {
  getWorkflowModelCheckData,
  peekWorkflowEnvironmentModels
} from '@/web/core/workflow/modelData';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import {
  useWorkflowHistory,
  useWorkflowInitialLoadFailed,
  useWorkflowPersistence,
  useWorkflowRuntime,
  useWorkflowIssueFocusNodeId,
  useWorkflowOverlayActions,
  useWorkflowOverlayValue,
  useWorkflowSessionActions,
  WorkflowSessionProvider,
  mergeViewOverlayPatches,
  type WorkflowHistoryState,
  type WorkflowPersistenceState,
  type WorkflowSessionActions
} from '@/web/core/workflow/editor/session/workflowSession';
import { useWorkflowDraftLifecycle } from '@/web/core/workflow/localDraft/useWorkflowDraftLifecycle';
import {
  readWorkflowLocalDraft,
  saveWorkflowLocalDraft
} from '@/web/core/workflow/localDraft/storage';
import { createWorkflowSaveCoordinator } from '@/web/core/workflow/editor/session/workflowPersistence';
import type {
  WorkflowRuntimeOptions,
  WorkflowRuntimePort
} from '@fastgpt/global/core/workflow/editor/types';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/pageComponents/app/detail/context', async () => {
  const { createContext } = await import('use-context-selector');
  return {
    AppContext: createContext({
      appDetail: { chatConfig: {} },
      setAppDetail: () => undefined
    })
  };
});
vi.mock('@/web/core/workflow/localDraft/useWorkflowDraftLifecycle', () => ({
  useWorkflowDraftLifecycle: vi.fn(() => ({
    authExpiredModal: undefined,
    discardWrittenDraft: vi.fn()
  }))
}));
vi.mock('@/web/core/workflow/localDraft/useWorkflowAuthExpiredDraft', () => ({
  useWorkflowAuthExpiredDraft: () => ({
    authExpiredModal: undefined,
    handleBeforeUnloadAuthExpired: () => ({ isAuthExpiredRedirecting: false }),
    setBeforeUnloadAutoSaving: () => undefined,
    shouldSkipUnmountAutoSave: () => false
  })
}));
vi.mock('@/web/support/user/useUserStore', () => {
  const state = { userInfo: { team: { tmbId: 'member-a' } } };
  return { useUserStore: Object.assign(() => state, { getState: () => state }) };
});
vi.mock('@/web/core/workflow/modelData', () => ({
  // 目录未就绪：Runtime 跳过模型规则，host 版本历史行为不受影响。
  getWorkflowModelCheckData: vi.fn(async () => ({ references: [], defaultModelIds: {} })),
  peekWorkflowEnvironmentModels: vi.fn(() => undefined)
}));
// gate 使用真实 Core 检查，仅替换异步模型目录和权限读取。
vi.mock('@/web/core/ai/model/modelData', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ensureModelCatalog: vi.fn(async () => ({}))
}));
vi.mock('@/web/core/workflow/editor/react/workflowEditorProvider', () => ({
  WorkflowEditorProvider: ({ children }: { children: React.ReactNode }) => children
}));

const t = ((key: string) => key) as never;

type TestAppDetail = {
  _id: string;
  permission: { hasWritePer: boolean };
  chatConfig: Record<string, unknown>;
};
type TestHost = {
  runtime: WorkflowRuntimePort | null;
  initialLoadFailed: boolean;
  issueFocusNodeId?: string;
} & WorkflowSessionActions &
  WorkflowPersistenceState &
  WorkflowHistoryState;

describe('workflow renderer overlays', () => {
  it('keeps equal patches as a no-op', () => {
    const current = { node: { searchedText: 'answer', debugResult: { ok: true } } };
    const result = mergeViewOverlayPatches({
      current,
      patches: [{ nodeId: 'node', values: { searchedText: 'answer', debugResult: { ok: true } } }]
    });

    expect(result.changed).toBe(false);
    expect(result.overlays).toBe(current);
  });

  it('notifies only the node whose overlay changed', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const renders: Record<string, number> = { first: 0, second: 0 };
    const snapshots: Record<string, unknown[]> = { first: [], second: [] };
    let patchViewData: ReturnType<typeof useWorkflowOverlayActions> | undefined;
    const onLeafRender = (nodeId: string, overlay: unknown) => {
      renders[nodeId] += 1;
      snapshots[nodeId].push(overlay);
    };
    const Leaf = React.memo(function Leaf({
      nodeId,
      onRender
    }: {
      nodeId: string;
      onRender: (nodeId: string, overlay: unknown) => void;
    }) {
      onRender(nodeId, useWorkflowOverlayValue(nodeId));
      return null;
    });
    const onActionsReady = (actions: ReturnType<typeof useWorkflowOverlayActions>) => {
      patchViewData = actions;
    };
    const Actions = ({
      onReady
    }: {
      onReady: (actions: ReturnType<typeof useWorkflowOverlayActions>) => void;
    }) => {
      onReady(useWorkflowOverlayActions());
      return null;
    };
    const host = await renderHost({
      chatConfig: {},
      initialRuntime: undefined,
      additionalChildren: React.createElement(
        React.Fragment,
        null,
        React.createElement(Leaf, { nodeId: 'first', onRender: onLeafRender }),
        React.createElement(Leaf, { nodeId: 'second', onRender: onLeafRender }),
        React.createElement(Actions, { onReady: onActionsReady })
      )
    });
    const initialRenders = { ...renders };

    await act(async () => {
      patchViewData?.([{ nodeId: 'first', values: { searchedText: 'match' } }]);
    });

    expect(renders.first).toBeGreaterThan(initialRenders.first);
    expect(renders.second).toBe(initialRenders.second);
    expect(snapshots.first.at(-1)).toEqual({ searchedText: 'match' });
    await act(async () => {
      host.readHost().loadDocument(answerDocument());
    });
    expect(snapshots.first.at(-1)).toBeUndefined();
    act(() => host.root.unmount());
    vi.unstubAllGlobals();
  });
});

describe('workflow save request coordination', () => {
  it('accepts only the newest response and rejects app/session/runtime changes', () => {
    const runtime = {
      isDisposed: vi.fn(() => false)
    } as unknown as WorkflowRuntimePort;
    const coordinator = createWorkflowSaveCoordinator();
    const scope = {
      runtime,
      sessionId: 'session-a',
      appId: 'app-a'
    };
    const requestA = coordinator.begin({
      ...scope,
      contentRevision: 1,
      data: {} as never
    });
    const requestB = coordinator.begin({
      ...scope,
      contentRevision: 2,
      data: { nodes: [{ nodeId: 'latest' }] } as never
    });

    expect(requestA.data).toEqual({});
    expect(coordinator.isCurrent(requestA, scope)).toBe(false);
    expect(coordinator.isCurrent(requestB, scope)).toBe(true);
    expect(coordinator.isCurrent(requestB, { ...scope, appId: 'app-b' })).toBe(false);
    expect(coordinator.isCurrent(requestB, { ...scope, sessionId: 'session-b' })).toBe(false);

    coordinator.invalidate();
    expect(coordinator.isCurrent(requestB, scope)).toBe(false);

    runtime.isDisposed.mockReturnValue(true);
    expect(coordinator.isCurrent(requestB, scope)).toBe(false);
  });
});

/**
 * 挂真实 Provider 树（AppContext -> ReactFlowProvider -> host）+ 计数型观察者。
 * host 在 ReactFlowProvider 内（问题焦点要 fitView），测试同样需要这层 Provider。
 * chatConfig 通过 Session props 注入且必须与文档一致，否则 host 的单向同步 effect 会额外发一笔 updateChatConfig。
 * onChatConfigChange 按真实页面装配回写 appDetail，断言才能读到 host 回写后的 appDetail；
 * Provider value 只渲染一次，因此回写不会再触发同步 effect（测试里不存在双向循环）。
 */
const renderHost = async ({
  chatConfig = {},
  initialRuntime,
  additionalChildren,
  onSaveApp
}: {
  chatConfig?: unknown;
  initialRuntime?: WorkflowRuntimePort;
  additionalChildren?: React.ReactNode;
  onSaveApp?: AppSaveHandler;
} = {}) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const appDetail = {
    current: { _id: 'app-a', permission: { hasWritePer: true }, chatConfig } as TestAppDetail
  };
  const setAppDetail = vi.fn((updater: (detail: TestAppDetail) => TestAppDetail) => {
    appDetail.current = updater(appDetail.current);
  });
  let host: TestHost | undefined;
  const onObserve = (nextHost: TestHost) => {
    host = nextHost;
  };

  const Observer = ({ onRead }: { onRead: (nextHost: TestHost) => void }) => {
    onRead({
      runtime: useWorkflowRuntime(),
      initialLoadFailed: useWorkflowInitialLoadFailed(),
      issueFocusNodeId: useWorkflowIssueFocusNodeId(),
      ...useWorkflowSessionActions(),
      ...useWorkflowPersistence(),
      ...useWorkflowHistory()
    });
    return null;
  };

  const render = (runtime?: WorkflowRuntimePort) =>
    root.render(
      React.createElement(
        AppContext.Provider,
        { value: { appDetail: appDetail.current, setAppDetail, onSaveApp } as never },
        React.createElement(
          ReactFlowProvider,
          null,
          React.createElement(
            WorkflowSessionProvider,
            {
              runtime,
              appId: 'app-a',
              appDetailChatConfig: chatConfig,
              onChatConfigChange: (nextChatConfig: Record<string, unknown>) => {
                appDetail.current.chatConfig = nextChatConfig;
              }
            },
            React.createElement(
              React.Fragment,
              null,
              React.createElement(Observer, { onRead: onObserve }),
              additionalChildren
            )
          )
        )
      )
    );

  await act(async () => render(initialRuntime));

  return { root, appDetail, setAppDetail, readHost: () => host!, render };
};

const emptyDocument = () =>
  materializeWorkflow({ input: { nodes: [], edges: [] }, chatConfig: {}, t });

const answerDocument = () =>
  materializeWorkflow({
    input: {
      nodes: [
        {
          nodeId: 'answer',
          flowNodeType: FlowNodeTypeEnum.answerNode,
          name: 'Answer',
          position: { x: 0, y: 0 },
          inputs: [],
          outputs: []
        }
      ],
      edges: []
    },
    chatConfig: {},
    t
  });

const LoadInitialWorkflow = ({ input }: { input: ReturnType<typeof answerDocument> }) => {
  const { loadInitialWorkflow } = useWorkflowSessionActions();
  React.useEffect(() => loadInitialWorkflow({ input }), [input, loadInitialWorkflow]);
  return null;
};

const reasoningRuntimeOptions: WorkflowRuntimeOptions = {
  getEnvironment: () => ({
    models: [
      {
        modelId: 'reasoning-model',
        legacyModel: 'reasoning-model',
        type: ModelTypeEnum.llm,
        config: {
          maxContext: 1,
          maxResponse: 1,
          quoteMaxToken: 1,
          reasoning: true
        }
      }
    ],
    sandbox: { configured: true, planSupported: true }
  })
};

const createReasoningChatNode = () => ({
  nodeId: 'reasoning',
  flowNodeType: FlowNodeTypeEnum.chatNode,
  name: 'Reasoning',
  inputs: [
    {
      key: NodeInputKeyEnum.aiModelId,
      label: 'Model',
      renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel],
      valueType: WorkflowIOValueTypeEnum.string,
      value: 'reasoning-model'
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.reasoningText,
      key: NodeOutputKeyEnum.reasoningText,
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.string,
      invalid: true
    }
  ]
});

describe('WorkflowSessionProvider version history', () => {
  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.test/app/detail?appId=app-a'
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T10:00:00+08:00'));
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([false, true])(
    'clears the superseded unload backup after a manual save (other tab wrote: %s)',
    async (otherTabWrote) => {
      const lifecycle = vi.mocked(useWorkflowDraftLifecycle);
      const mock = lifecycle.getMockImplementation()!;
      const actual = await vi.importActual<{
        useWorkflowDraftLifecycle: typeof useWorkflowDraftLifecycle;
      }>('@/web/core/workflow/localDraft/useWorkflowDraftLifecycle');
      const scope = { appId: 'app-a', tmbId: 'member-a' };
      const initial = answerDocument();
      const onSaveApp = vi.fn(async () => false);
      lifecycle.mockImplementation(actual.useWorkflowDraftLifecycle);
      try {
        const host = await renderHost({
          initialRuntime: hydrateWorkflowEditor(initial),
          onSaveApp
        });
        try {
          await act(async () => {
            host.readHost().runtime?.getNodeActions('answer')?.setName('Before unload');
            window.dispatchEvent(new window.Event('beforeunload', { cancelable: true }));
          });
          expect(onSaveApp).toHaveBeenCalledTimes(1);
          expect(readWorkflowLocalDraft(scope)?.data.nodes[0].name).toBe('Before unload');

          await act(async () => {
            host.readHost().runtime?.getNodeActions('answer')?.setName('Manually saved');
          });
          const request = host.readHost().createSaveRequest(scope.appId, { explicit: true })!;
          const newerDraft = otherTabWrote
            ? saveWorkflowLocalDraft({
                ...scope,
                data: { ...initial, chatConfig: { welcomeText: 'Other tab' } }
              })
            : null;
          await act(async () => expect(host.readHost().markSaved(request)).toBe(true));
          expect(host.readHost().isSaved).toBe(true);
          expect(readWorkflowLocalDraft(scope)).toEqual(newerDraft);
        } finally {
          await act(async () => host.root.unmount());
        }
      } finally {
        lifecycle.mockImplementation(mock);
      }
    }
  );

  it.each([false, true])(
    'keeps auto-save enabled when the backup matches the cloud workflow (legacy: %s)',
    async (legacy) => {
      const initial = answerDocument();
      const scope = { appId: 'app-a', tmbId: 'member-a' };
      const seed = hydrateWorkflowEditor(initial);
      const data = serializeRuntime(seed);
      seed.dispose();
      saveWorkflowLocalDraft({
        ...scope,
        data: { ...data, referenceSnapshots: legacy ? undefined : data.referenceSnapshots },
        restoreAfterLogin: false
      });

      const { root, readHost } = await renderHost();
      try {
        await act(async () => readHost().loadInitialWorkflow({ input: initial }));
        expect(readHost().isSaved).toBe(true);
        expect(readHost().canUndo).toBe(false);
        expect(readWorkflowLocalDraft(scope)).toBeNull();

        await act(async () => {
          expect(
            readHost().runtime?.dispatch({
              type: 'updateNode',
              nodeId: 'answer',
              patch: { name: 'New edit' }
            }).ok
          ).toBe(true);
        });
        expect(readHost().createSaveRequest(scope.appId)?.data.nodes[0]?.name).toBe('New edit');
      } finally {
        await act(async () => root.unmount());
      }
    }
  );

  it('clears a matching backup first seen at manual save only after the save succeeds', async () => {
    const scope = { appId: 'app-a', tmbId: 'member-a' };
    const { root, readHost } = await renderHost({
      initialRuntime: hydrateWorkflowEditor(answerDocument())
    });
    try {
      saveWorkflowLocalDraft({ ...scope, data: readHost().serializeWorkflow()! });
      const request = readHost().createSaveRequest(scope.appId, { explicit: true })!;
      expect(readWorkflowLocalDraft(scope)).not.toBeNull();
      await act(async () => expect(readHost().markSaved(request)).toBe(true));
      expect(readWorkflowLocalDraft(scope)).toBeNull();
    } finally {
      await act(async () => root.unmount());
    }
  });

  it('recovers a matching local draft and retains the cloud version in undo history', async () => {
    const initial = answerDocument();
    const scope = { appId: 'app-a', tmbId: 'member-a' };
    const welcomeText = 'Local welcome message';
    saveWorkflowLocalDraft({
      ...scope,
      data: {
        ...initial,
        nodes: initial.nodes.map((node) => ({ ...node, name: 'Local edit' })),
        chatConfig: { welcomeText }
      }
    });
    const { root, readHost } = await renderHost({
      chatConfig: initial.chatConfig,
      initialRuntime: undefined,
      additionalChildren: React.createElement(LoadInitialWorkflow, { input: initial })
    });
    try {
      expect(readHost().runtime?.getNode('answer')?.name).toBe('Local edit');
      expect(readHost().runtime?.getWorkflow().chatConfig.welcomeText).toBe(welcomeText);
      expect(readHost().isSaved).toBe(false);
      expect(readHost().createSaveRequest(scope.appId)).toBeUndefined();
      expect(readWorkflowLocalDraft(scope)).not.toBeNull();

      await act(async () => readHost().undo());
      expect(readHost().runtime?.getNode('answer')?.name).toBe('Answer');
      await act(async () => readHost().redo());
      expect(readHost().runtime?.getNode('answer')?.name).toBe('Local edit');
      expect(readHost().runtime?.getWorkflow().chatConfig.welcomeText).toBe(welcomeText);
      const request = readHost().createSaveRequest(scope.appId, { explicit: true })!;
      await act(async () => expect(readHost().markSaved(request)).toBe(true));
      expect(readWorkflowLocalDraft(scope)).toBeNull();
      expect(readHost().isSaved).toBe(true);
    } finally {
      await act(async () => root.unmount());
    }
  });

  it.each([false, true])(
    'discards only the recovered copy when exiting (newer draft: %s)',
    async (newerDraft) => {
      const initial = answerDocument();
      const scope = { appId: 'app-a', tmbId: 'member-a' };
      saveWorkflowLocalDraft({
        ...scope,
        data: { ...initial, chatConfig: { welcomeText: 'Recovered' } }
      });
      const { root, readHost } = await renderHost({
        chatConfig: initial.chatConfig,
        initialRuntime: undefined,
        additionalChildren: React.createElement(LoadInitialWorkflow, { input: initial })
      });
      try {
        expect(readHost().runtime?.getWorkflow().chatConfig.welcomeText).toBe('Recovered');
        if (newerDraft) {
          saveWorkflowLocalDraft({
            ...scope,
            data: { ...initial, chatConfig: { welcomeText: 'Newer tab' } }
          });
        }
        await act(async () => readHost().discardLocalDraft());
        expect(readWorkflowLocalDraft(scope)?.data.chatConfig.welcomeText).toBe(
          newerDraft ? 'Newer tab' : undefined
        );
      } finally {
        await act(async () => root.unmount());
      }
    }
  );

  it('loads app-scoped model details when the first runtime is attached', async () => {
    const initial = emptyDocument();
    const peek = vi.mocked(peekWorkflowEnvironmentModels);
    peek.mockReturnValue({ models: [], defaultModelIds: {} });
    const { root } = await renderHost({
      chatConfig: initial.chatConfig,
      initialRuntime: hydrateWorkflowEditor(initial)
    });

    try {
      expect(getWorkflowModelCheckData).toHaveBeenCalledWith({
        nodes: [],
        chatConfig: {},
        appId: 'app-a'
      });
    } finally {
      act(() => root.unmount());
      peek.mockReturnValue(undefined);
    }
  });

  it('does not focus an isolated workflow start node on initial attach', async () => {
    const initial = materializeWorkflow({
      input: {
        nodes: [
          {
            nodeId: 'start',
            flowNodeType: FlowNodeTypeEnum.workflowStart,
            name: 'Workflow Start',
            position: { x: 0, y: 0 },
            inputs: [],
            outputs: []
          }
        ],
        edges: []
      },
      chatConfig: {},
      t
    });
    const runtime = hydrateWorkflowEditor(initial);
    const { root, readHost } = await renderHost({
      chatConfig: initial.chatConfig,
      initialRuntime: runtime
    });

    await act(async () => vi.advanceTimersByTime(300));

    expect(readHost().issueFocusNodeId).toBeUndefined();
    act(() => root.unmount());
  });

  it('clears the initial issue focus after the environment resolves the error', async () => {
    let modelsReady = false;
    const initial = materializeWorkflow({
      input: {
        nodes: [
          {
            nodeId: 'start',
            flowNodeType: FlowNodeTypeEnum.workflowStart,
            name: 'Start',
            position: { x: 0, y: 0 },
            inputs: [],
            outputs: []
          },
          {
            nodeId: 'chat',
            flowNodeType: FlowNodeTypeEnum.chatNode,
            name: 'Chat',
            position: { x: 100, y: 0 },
            inputs: [
              {
                key: NodeInputKeyEnum.aiModelId,
                label: 'Model',
                renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel],
                valueType: WorkflowIOValueTypeEnum.string,
                value: 'model-1'
              },
              {
                key: NodeInputKeyEnum.userChatInput,
                label: 'Question',
                renderTypeList: [FlowNodeInputTypeEnum.reference],
                selectedType: FlowNodeInputTypeEnum.reference,
                valueType: WorkflowIOValueTypeEnum.string,
                value: ['start', NodeOutputKeyEnum.userChatInput]
              }
            ],
            outputs: []
          }
        ],
        edges: [
          {
            source: 'start',
            target: 'chat',
            sourceHandle: 'source',
            targetHandle: 'target'
          }
        ]
      },
      chatConfig: {},
      t
    });
    const runtime = hydrateWorkflowEditor(initial, {
      getEnvironment: () => ({
        models: modelsReady
          ? [{ modelId: 'model-1', legacyModel: 'model-1', type: ModelTypeEnum.llm }]
          : [],
        sandbox: { configured: true, planSupported: true }
      })
    });
    const { root, readHost } = await renderHost({
      chatConfig: initial.chatConfig,
      initialRuntime: runtime
    });

    await act(async () => vi.advanceTimersByTime(300));
    expect(readHost().runtime!.getNode('chat')?.issues).toContainEqual(
      expect.objectContaining({ code: 'model_unavailable' })
    );
    expect(readHost().issueFocusNodeId).toBe('chat');

    act(() => {
      modelsReady = true;
      runtime.refreshIssues('all');
    });

    expect(readHost().runtime!.getNode('chat')?.issues).toEqual([]);
    expect(readHost().issueFocusNodeId).toBeUndefined();
    act(() => root.unmount());
  });

  it('keeps the focused node while it still has an error', async () => {
    const initial = answerDocument();
    const runtime = hydrateWorkflowEditor(initial);
    const { root, readHost } = await renderHost({
      chatConfig: initial.chatConfig,
      initialRuntime: runtime
    });

    await act(async () => vi.advanceTimersByTime(300));
    expect(readHost().issueFocusNodeId).toBe('answer');

    act(() => {
      runtime.refreshIssues('all');
    });

    expect(readHost().runtime!.getNode('answer')?.issues.length).toBeGreaterThan(0);
    expect(readHost().issueFocusNodeId).toBe('answer');
    act(() => root.unmount());
  });

  it('records every command immediately without adding entries when switching versions', async () => {
    const initial = emptyDocument();
    const { root, appDetail, readHost } = await renderHost({ chatConfig: initial.chatConfig });

    act(() => readHost().initRuntime(initial));
    expect(readHost().versions).toHaveLength(1);

    act(() => {
      readHost().runtime!.dispatch({
        type: 'updateChatConfig',
        chatConfig: { welcomeText: 'first edit' }
      });
    });
    expect(readHost().versions).toHaveLength(2);

    vi.setSystemTime(new Date('2026-09-20T10:00:01+08:00'));
    act(() => {
      readHost().runtime!.dispatch({
        type: 'updateChatConfig',
        chatConfig: { welcomeText: 'second edit' }
      });
    });
    expect(readHost().versions).toHaveLength(3);
    expect(appDetail.current.chatConfig.welcomeText).toBe('second edit');

    const initialVersion = readHost().versions.at(-1)!;
    const versionCount = readHost().versions.length;
    const historyCount = (() => {
      const history = readHost().runtime!.getHistory();
      return history.undoCount + history.redoCount;
    })();
    act(() => {
      expect(readHost().switchVersion(initialVersion, 'ignored-copy-title')).toBe(true);
    });

    expect(readHost().versions).toHaveLength(versionCount);
    const historyAfterSwitch = readHost().runtime!.getHistory();
    expect(historyAfterSwitch.undoCount + historyAfterSwitch.redoCount).toBe(historyCount);
    const liveVersions = readHost().versions.filter((item) => item.live);
    expect(liveVersions).toHaveLength(1);
    // 本地编辑只记录 revision，初始快照用于回放上限之外的恢复。
    expect(liveVersions[0]?.contentRevision).toBe(initialVersion.contentRevision);
    expect(readHost().versions.filter((item) => item.content)).toEqual([liveVersions[0]]);
    // 回放恢复的 chatConfig 由 Runtime 变更事件回写 appDetail，不再依赖条目快照。
    expect(readHost().runtime!.getWorkflow().chatConfig.welcomeText).toBeUndefined();
    expect(appDetail.current.chatConfig.welcomeText).toBeUndefined();

    const serialized = await readHost().serializeWorkflowAndCheck(true);
    // 空工作流仍可保存草稿，Core 发布校验要求一个入口。
    expect(serialized).toBeUndefined();

    act(() => root.unmount());
  });

  it('restores the initial version after the sidebar and runtime histories reach their limits', async () => {
    const initial = emptyDocument();
    const { root, readHost } = await renderHost({ chatConfig: initial.chatConfig });
    try {
      act(() => readHost().initRuntime(initial));
      const runtime = readHost().runtime!;
      const initialVersion = readHost().versions[0];
      act(() => {
        for (let edit = 1; edit <= 205; edit++) {
          runtime.dispatch({
            type: 'updateChatConfig',
            chatConfig: { welcomeText: `Edit ${edit}` }
          });
        }
      });

      expect(readHost().versions).toHaveLength(101);
      expect(readHost().versions.at(-1)).toEqual({ ...initialVersion, live: false });
      expect(runtime.replayHistoryToRevision(initialVersion.contentRevision!)).toMatchObject({
        ok: false,
        error: { code: 'not_found' }
      });
      act(() =>
        expect(readHost().switchVersion(readHost().versions.at(-1)!, 'Initial copy')).toBe(true)
      );
      expect(readHost().versions.find((entry) => entry.live)?.title).toBe('Initial copy');
      expect(runtime.getWorkflow().chatConfig).toEqual(initial.chatConfig);
    } finally {
      act(() => root.unmount());
    }
  });

  it('records a field commit without snapshotting the document', async () => {
    const initialDocument = answerDocument();
    const { root, readHost } = await renderHost({ chatConfig: initialDocument.chatConfig });
    act(() => readHost().initRuntime(initialDocument));
    // initRuntime 之后才有 runtime；readHost() 读的是最新一次渲染的 context 值。
    const runtime = readHost().runtime!;
    const readAnswerText = () =>
      runtime.getNode('answer')?.inputs.find((input) => input.key === NodeInputKeyEnum.answerText)
        ?.value;
    const answerTextBeforeEdit = readAnswerText();
    // 出站序列化仍走 getWorkflowData；这里只断言「记录版本」不再触发它。
    const getWorkflowData = vi.spyOn(runtime, 'getWorkflowData');

    act(() => {
      const res = runtime.dispatch({
        type: 'updateField',
        nodeId: 'answer',
        fieldKey: NodeInputKeyEnum.answerText,
        value: 'hello',
        kind: 'input'
      });
      expect(res.ok).toBe(true);
    });

    expect(getWorkflowData).not.toHaveBeenCalled();
    expect(readHost().versions).toHaveLength(2);
    expect(readHost().versions.filter((item) => item.content)).toEqual([readHost().versions[1]]);
    expect(readAnswerText()).toBe('hello');

    // undo/redo 只移动 live 标记，不新增条目，也不读整份文档。
    const [edited, initialVersion] = readHost().versions;
    act(() => readHost().undo());
    expect(readHost().versions).toHaveLength(2);
    expect(readHost().versions.find((item) => item.live)?.contentRevision).toBe(
      initialVersion!.contentRevision
    );

    act(() => readHost().redo());
    expect(readHost().versions).toHaveLength(2);
    expect(readHost().versions.find((item) => item.live)?.contentRevision).toBe(
      edited!.contentRevision
    );
    expect(getWorkflowData).not.toHaveBeenCalled();

    // 本地版本切换按 contentRevision 回放：目标内容与保存 gate 都仍可用。
    act(() => {
      expect(readHost().switchVersion(initialVersion!, 'ignored-copy-title')).toBe(true);
    });
    expect(readAnswerText()).toBe(answerTextBeforeEdit);
    expect(getWorkflowData).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it('marks each successful request revision without losing newer edits', async () => {
    const initial = answerDocument();
    const { root, readHost } = await renderHost({ chatConfig: initial.chatConfig });
    act(() => readHost().initRuntime(initial));

    act(() => {
      readHost().runtime!.dispatch({
        type: 'updateChatConfig',
        chatConfig: { welcomeText: 'first edit' }
      });
    });
    const requestA = readHost().createSaveRequest('app-a')!;

    act(() => {
      readHost().runtime!.dispatch({
        type: 'updateChatConfig',
        chatConfig: { welcomeText: 'second edit' }
      });
    });
    const requestB = readHost().createSaveRequest('app-a')!;

    expect(requestA.contentRevision).toBeLessThan(requestB.contentRevision);
    let markResult = false;
    act(() => {
      markResult = readHost().markSaved(requestA);
    });
    expect(markResult).toBe(true);
    expect(readHost().runtime!.getSavepoint().isDirty).toBe(true);
    act(() => {
      markResult = readHost().markSaved(requestB);
    });
    expect(markResult).toBe(true);
    expect(readHost().runtime!.getSavepoint().isDirty).toBe(false);

    act(() => root.unmount());
  });

  it('switches to a cloud version without adding a local entry', async () => {
    const initial = emptyDocument();
    const runtime = hydrateWorkflowEditor(initial, reasoningRuntimeOptions);
    const { root, appDetail, readHost } = await renderHost({
      chatConfig: initial.chatConfig,
      initialRuntime: runtime
    });
    const localCount = readHost().versions.length;

    const cloudVersion = {
      nodes: [createReasoningChatNode()],
      edges: [],
      chatConfig: { welcomeText: 'cloud hello' },
      versionName: 'v1'
    } as unknown as AppVersionSchemaType;

    act(() => {
      expect(readHost().switchCloudVersion(cloudVersion)).toBe(true);
    });

    // 云端替换保留一条 cloud-active 版本项，便于按 Runtime revision 回放本地历史。
    expect(readHost().versions).toHaveLength(localCount + 1);
    expect(readHost().runtime!.getWorkflow().chatConfig).toEqual(
      expect.objectContaining({ welcomeText: 'cloud hello' })
    );
    expect(
      readHost()
        .runtime!.getNode('reasoning')
        ?.outputs.find((output) => output.id === NodeOutputKeyEnum.reasoningText)?.invalid
    ).toBe(false);
    // chatConfig 回写 appDetail（订阅回写与切换后的显式同步都走同一个 setter）。
    expect(appDetail.current.chatConfig.welcomeText).toBe('cloud hello');
    expect(readHost().versions.filter((item) => item.live)).toHaveLength(1);
    expect(readHost().versions.find((item) => item.live)?.contentRevision).toEqual(
      expect.any(Number)
    );
    expect(readHost().versions.find((item) => item.live)?.content).toBeDefined();

    act(() => root.unmount());
  });

  it('recomputes runtime-owned output validity when importing a workflow', async () => {
    const initial = emptyDocument();
    const runtime = hydrateWorkflowEditor(initial, reasoningRuntimeOptions);
    const { root, readHost } = await renderHost({
      chatConfig: initial.chatConfig,
      initialRuntime: runtime
    });
    const imported = materializeWorkflow({
      input: { nodes: [createReasoningChatNode()], edges: [] },
      chatConfig: {},
      t
    });

    act(() => {
      expect(readHost().loadDocument(imported).ok).toBe(true);
    });

    expect(
      readHost()
        .runtime!.getNode('reasoning')
        ?.outputs.find((output) => output.id === NodeOutputKeyEnum.reasoningText)?.invalid
    ).toBe(false);
    act(() => root.unmount());
  });

  it('switches back to a local version after switching to cloud', async () => {
    const initial = answerDocument();
    const { root, readHost } = await renderHost({ chatConfig: initial.chatConfig });
    act(() => readHost().initRuntime(initial));
    const localVersion = readHost().versions[0]!;

    const cloudVersion = {
      nodes: [],
      edges: [],
      chatConfig: { welcomeText: 'cloud hello' },
      versionName: 'v1'
    } as unknown as AppVersionSchemaType;

    act(() => {
      expect(readHost().switchCloudVersion(cloudVersion)).toBe(true);
    });
    expect(readHost().versions.find((item) => item.live)?.content).toBeDefined();

    act(() => {
      expect(readHost().switchVersion(localVersion, 'ignored-copy-title')).toBe(true);
    });
    expect(
      readHost()
        .runtime!.getWorkflow()
        .nodes.map((node) => node.nodeId)
    ).toContain('answer');
    expect(readHost().versions.find((item) => item.live)?.contentRevision).toBe(
      localVersion.contentRevision
    );

    act(() => readHost().redo());
    expect(readHost().runtime!.getWorkflow().chatConfig.welcomeText).toBe('cloud hello');
    expect(readHost().versions.find((item) => item.live)?.content).toBeDefined();

    act(() => readHost().undo());
    expect(readHost().runtime!.getWorkflow().chatConfig.welcomeText).toBeUndefined();

    act(() => root.unmount());
  });

  it('drops abandoned versions when switching to a cloud copy after undo', async () => {
    const initial = emptyDocument();
    const { root, readHost } = await renderHost({ chatConfig: initial.chatConfig });
    act(() => readHost().initRuntime(initial));
    const runtime = readHost().runtime!;
    const initialRevision = runtime.getSavepoint().contentRevision;

    act(() => {
      runtime.dispatch({ type: 'updateChatConfig', chatConfig: { welcomeText: 'First edit' } });
    });
    const localVersion = readHost().versions[0]!;
    act(() => {
      runtime.dispatch({ type: 'updateChatConfig', chatConfig: { welcomeText: 'Second edit' } });
      readHost().undo();
    });
    const abandonedVersion = readHost().versions[0]!;
    const cloudVersion = {
      nodes: [],
      edges: [],
      chatConfig: { welcomeText: 'Cloud copy' },
      versionName: 'v1'
    } as unknown as AppVersionSchemaType;

    act(() => {
      expect(readHost().switchCloudVersion(cloudVersion)).toBe(true);
    });
    const versions = readHost().versions;
    expect(versions.map((entry) => entry.contentRevision)).toEqual([
      runtime.getSavepoint().contentRevision,
      localVersion.contentRevision,
      initialRevision
    ]);

    act(() => {
      expect(readHost().switchCloudVersion(cloudVersion)).toBe(true);
      expect(readHost().switchVersion(abandonedVersion, abandonedVersion.title)).toBe(false);
    });
    expect(readHost().versions).toBe(versions);
    expect(runtime.getWorkflow().chatConfig.welcomeText).toBe('Cloud copy');

    act(() => {
      expect(readHost().switchVersion(localVersion, localVersion.title)).toBe(true);
    });
    expect(runtime.getWorkflow().chatConfig.welcomeText).toBe('First edit');

    act(() => root.unmount());
  });

  it.each([false, true])(
    'restores the prior redo and sidebar after a failed replacement (already undone: %s)',
    async (alreadyUndone) => {
      const initial = emptyDocument();
      const { root, readHost } = await renderHost({ chatConfig: initial.chatConfig });
      act(() => readHost().initRuntime(initial));
      const runtime = readHost().runtime!;

      act(() => {
        runtime.dispatch({
          type: 'updateChatConfig',
          chatConfig: { welcomeText: 'Previous edit' }
        });
        readHost().undo();
      });
      const previousVersions = readHost().versions;
      expect(readHost().canRedo).toBe(true);

      act(() => {
        expect(
          readHost().loadDocument(
            { ...initial, chatConfig: { welcomeText: 'Unconfirmed' } },
            { rollbackable: true }
          ).ok
        ).toBe(true);
      });
      const failedVersion = readHost().versions[0]!;
      const contentRevision = runtime.getSavepoint().contentRevision;
      expect(readHost().versions).toHaveLength(2);

      act(() => {
        if (alreadyUndone) readHost().undo();
        expect(readHost().rollbackDocument({ runtime, contentRevision })).toBe(true);
      });
      expect(runtime.getWorkflow().chatConfig.welcomeText).toBe(initial.chatConfig.welcomeText);
      expect(runtime.getSavepoint().isDirty).toBe(false);
      expect(readHost().canRedo).toBe(true);
      expect(readHost().versions).toEqual(previousVersions);
      expect(readHost().switchVersion(failedVersion, failedVersion.title)).toBe(false);
      act(() => readHost().redo());
      expect(runtime.getWorkflow().chatConfig.welcomeText).toBe('Previous edit');
      expect(readHost().canRedo).toBe(false);
      act(() => root.unmount());
    }
  );

  it('leaves a replaced document alone once explicitly saved or edited again', async () => {
    const initial = emptyDocument();
    const { root, readHost } = await renderHost({ chatConfig: initial.chatConfig });
    act(() => readHost().initRuntime(initial));
    const runtime = readHost().runtime!;
    act(() => {
      readHost().loadDocument({ ...initial, chatConfig: { welcomeText: 'Replacement' } });
    });
    const contentRevision = runtime.getSavepoint().contentRevision;
    act(() => {
      runtime.markSaved(contentRevision);
      expect(readHost().rollbackDocument({ runtime, contentRevision })).toBe(false);
      runtime.dispatch({ type: 'updateChatConfig', chatConfig: { welcomeText: 'Edited' } });
      expect(readHost().rollbackDocument({ runtime, contentRevision })).toBe(false);
    });
    expect(runtime.getWorkflow().chatConfig.welcomeText).toBe('Edited');
    act(() => root.unmount());
  });

  it('starts a new sidebar branch when undo passes the visible history limit', async () => {
    const initial = emptyDocument();
    const { root, readHost } = await renderHost({ chatConfig: initial.chatConfig });
    act(() => readHost().initRuntime(initial));
    const runtime = readHost().runtime!;

    act(() => {
      for (let index = 0; index < 102; index++) {
        runtime.dispatch({ type: 'updateChatConfig', chatConfig: { welcomeText: String(index) } });
      }
    });
    expect(readHost().versions).toHaveLength(101);
    act(() => {
      expect(runtime.replayHistory('undo', 101).ok).toBe(true);
    });
    expect(readHost().versions.some((entry) => entry.live)).toBe(false);

    act(() => {
      runtime.dispatch({ type: 'updateChatConfig', chatConfig: { welcomeText: 'New branch' } });
    });
    expect(runtime.getHistory().redoCount).toBe(0);
    expect(readHost().versions).toEqual([
      expect.objectContaining({
        contentRevision: runtime.getSavepoint().contentRevision,
        live: true
      }),
      expect.objectContaining({ contentRevision: 0, live: false })
    ]);

    act(() => root.unmount());
  });

  it.each(['import', 'history'] as const)(
    'recovers through %s after an initial cycle and waits for an explicit save',
    async (source) => {
      const initial = answerDocument();
      const broken = {
        ...initial,
        nodes: initial.nodes.map((node) => ({ ...node, parentNodeId: node.nodeId }))
      };
      const original = structuredClone(broken);
      const cloudVersion: AppVersionSchemaType = {
        ...initial,
        _id: '68ee0bd23d17260b7829b137',
        appId: '68ee0bd23d17260b7829b138',
        tmbId: '68ee0bd23d17260b7829b139',
        time: new Date(),
        versionName: 'Valid version'
      };
      const { root, readHost } = await renderHost({ chatConfig: initial.chatConfig });
      const draftLifecycle = vi.mocked(useWorkflowDraftLifecycle);

      act(() => readHost().loadInitialWorkflow({ input: broken }));
      expect(readHost().runtime).toBeNull();
      expect(readHost().initialLoadFailed).toBe(true);
      expect(readHost().isSaved).toBe(true);
      expect(broken).toEqual(original);

      act(() => {
        if (source === 'history') {
          expect(readHost().switchCloudVersion({ ...cloudVersion, nodes: broken.nodes })).toBe(
            false
          );
          expect(readHost().switchCloudVersion(cloudVersion)).toBe(true);
        } else {
          expect(readHost().loadDocument(broken)).toEqual({
            ok: false,
            error: { code: 'invalid_command', message: 'Circular workflow parent: answer' }
          });
          expect(readHost().runtime).toBeNull();
          expect(readHost().loadDocument(initial).ok).toBe(true);
        }
      });
      expect(readHost().initialLoadFailed).toBe(false);
      expect(readHost().runtime?.getNode('answer')?.parentNodeId).toBeUndefined();
      expect(readHost().isSaved).toBe(false);
      expect(draftLifecycle.mock.lastCall?.[0].allowLoginRestore).toBe(false);
      expect(draftLifecycle.mock.lastCall?.[0].createSaveRequest('app-a')).toBeUndefined();
      expect(readHost().createSaveRequest('app-a')).toBeUndefined();

      const request = readHost().createSaveRequest('app-a', { explicit: true })!;
      expect(request.data.nodes.map((node) => node.nodeId)).toEqual(['answer']);
      act(() => {
        expect(readHost().markSaved(request)).toBe(true);
      });
      expect(readHost().isSaved).toBe(true);
      expect(readHost().createSaveRequest('app-a')).toBeDefined();
      expect(draftLifecycle.mock.lastCall?.[0].serializeWorkflow()?.nodes).toHaveLength(1);

      act(() => root.unmount());
    }
  );

  it('ignores historical and imported recovery results after switching away', async () => {
    const initial = answerDocument();
    const broken = {
      ...initial,
      nodes: initial.nodes.map((node) => ({ ...node, parentNodeId: node.nodeId }))
    };
    const recovered = { ...initial, chatConfig: { welcomeText: 'Previous app' } };
    const cloudVersion: AppVersionSchemaType = {
      ...recovered,
      _id: '68ee0bd23d17260b7829b137',
      appId: 'app-a',
      tmbId: '68ee0bd23d17260b7829b139',
      versionName: 'Valid version',
      time: new Date()
    };
    const { root, readHost, appDetail } = await renderHost();

    act(() => readHost().loadInitialWorkflow({ input: broken }));
    expect(readHost().initialLoadFailed).toBe(true);
    const oldSession = readHost();
    act(() => root.unmount());
    appDetail.current.chatConfig = { welcomeText: 'Current app' };

    expect(oldSession.switchCloudVersion(cloudVersion)).toBe(false);
    expect(oldSession.loadDocument(recovered)).toMatchObject({
      ok: false,
      error: { code: 'disposed' }
    });
    expect(appDetail.current.chatConfig.welcomeText).toBe('Current app');
  });

  it('tears down the previous runtime when the runtime prop is removed', async () => {
    const initial = answerDocument();
    const runtime = hydrateWorkflowEditor(initial);
    const { root, readHost, render } = await renderHost({
      chatConfig: initial.chatConfig,
      initialRuntime: runtime
    });

    expect(readHost().runtime).toBe(runtime);
    const request = readHost().createSaveRequest('app-a')!;
    act(() => render(undefined));

    expect(runtime.isDisposed()).toBe(true);
    expect(readHost().runtime).toBeNull();
    expect(readHost().versions).toEqual([]);
    expect(readHost().isCurrentSaveRequest(request)).toBe(false);
    let markResult = false;
    act(() => {
      markResult = readHost().markSaved(request);
    });
    expect(markResult).toBe(false);

    act(() => {
      expect(() => readHost().initRuntime(null as never)).toThrow();
    });
    expect(readHost().runtime).toBeNull();
    expect(readHost().versions).toEqual([]);

    const disposedRuntime = hydrateWorkflowEditor(initial);
    const disposedSpy = vi.spyOn(disposedRuntime, 'dispose');
    await act(async () => render(disposedRuntime));
    disposedRuntime.dispose();
    await act(async () => render(disposedRuntime));
    expect(readHost().runtime).toBeNull();
    expect(readHost().versions).toEqual([]);
    expect(disposedSpy).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  it('keeps a runtime initialized by a child when no runtime prop was supplied', async () => {
    const initial = answerDocument();
    const Bootstrap = () => {
      const { initRuntime } = useWorkflowSessionActions();
      React.useEffect(() => initRuntime(initial), [initRuntime]);
      return null;
    };
    const { root, readHost } = await renderHost({
      chatConfig: initial.chatConfig,
      initialRuntime: undefined,
      additionalChildren: React.createElement(Bootstrap)
    });

    expect(readHost().runtime).not.toBeNull();
    expect(readHost().runtime?.isDisposed()).toBe(false);
    expect(readHost().versions).toHaveLength(1);

    act(() => root.unmount());
  });

  it('exposes the runtime issue view hydrated from the document', async () => {
    const initial = answerDocument();
    const { root, readHost } = await renderHost({ chatConfig: initial.chatConfig });
    act(() => readHost().initRuntime(initial));
    const host = readHost();

    // Issue View 由 Runtime 自己按文档规则算出；host 只负责注入环境事实。
    expect(peekWorkflowEnvironmentModels).toHaveBeenCalled();
    expect(host.runtime?.getNode('answer')?.issues.map((issue) => issue.code)).toContain(
      'required_input_empty'
    );
    expect(host.runtime?.getWorkflowIssues().issues.map((issue) => issue.code)).toContain(
      'required_input_empty'
    );
    // gate 合并 Core 完整检查与 Runtime Issue View。
    expect(await host.serializeWorkflowAndCheck(true)).toBeUndefined();

    act(() => root.unmount());
  });

  it('skips model availability issues while the environment model catalog is still undefined', async () => {
    vi.mocked(peekWorkflowEnvironmentModels).mockReturnValue(undefined);
    const initial = {
      nodes: [
        {
          nodeId: 'start',
          name: 'Start',
          flowNodeType: FlowNodeTypeEnum.workflowStart,
          inputs: [],
          outputs: []
        },
        {
          nodeId: 'chat',
          name: 'AI Chat',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          inputs: [
            {
              key: NodeInputKeyEnum.aiModel,
              label: 'Model',
              renderTypeList: [FlowNodeInputTypeEnum.settingLLMModel],
              valueType: WorkflowIOValueTypeEnum.string,
              required: true,
              value: 'gpt-4o-mini'
            }
          ],
          outputs: []
        }
      ],
      edges: [
        {
          source: 'start',
          target: 'chat',
          sourceHandle: 'start-source-right',
          targetHandle: 'chat-target-left'
        }
      ],
      chatConfig: {}
    };
    const { root, readHost } = await renderHost({
      chatConfig: initial.chatConfig,
      initialRuntime: hydrateWorkflowEditor(initial)
    });

    expect(
      readHost()
        .runtime?.getNode('chat')
        ?.issues.map((issue) => issue.code)
    ).not.toContain('model_unavailable');

    act(() => root.unmount());
  });

  it.each([true, false])(
    'revalidates application model permissions when refreshing the personal catalog (active: %s)',
    async (active) => {
      const appNode = createReasoningChatNode();
      const personalModel = {
        modelId: 'personal-model',
        type: ModelTypeEnum.llm,
        config: { maxContext: 1, maxResponse: 1, quoteMaxToken: 1 }
      };
      const personalNode = {
        ...appNode,
        nodeId: 'personal',
        inputs: appNode.inputs.map((input) => ({ ...input, value: personalModel.modelId }))
      };
      const peek = vi.mocked(peekWorkflowEnvironmentModels);
      peek.mockReturnValue({ models: [personalModel], defaultModelIds: {} });
      const appModel = { modelId: 'reasoning-model', type: ModelTypeEnum.llm };
      const staleRefresh =
        Promise.withResolvers<Awaited<ReturnType<typeof getWorkflowModelCheckData>>>();
      const getDetails = vi.mocked(getWorkflowModelCheckData);
      getDetails
        .mockClear()
        .mockResolvedValueOnce({ references: [appModel], defaultModelIds: {} })
        .mockReturnValueOnce(staleRefresh.promise)
        .mockResolvedValueOnce({ references: active ? [appModel] : [], defaultModelIds: {} });
      const previousModelList = useUserModelStore.getState().modelList;
      const { root, readHost } = await renderHost();

      try {
        await act(async () => {
          readHost().initRuntime({ nodes: [appNode, personalNode], edges: [], chatConfig: {} });
        });
        const issueCodes = (nodeId: string) =>
          readHost()
            .runtime?.getNode(nodeId)
            ?.issues.map((issue) => issue.code);
        expect(issueCodes(appNode.nodeId)).not.toContain('model_unavailable');
        expect(issueCodes(personalNode.nodeId)).not.toContain('model_unavailable');

        await act(async () => {
          useUserModelStore.setState({ modelList: [] });
          await vi.advanceTimersByTimeAsync(1);
        });
        expect(getDetails).toHaveBeenCalledTimes(2);

        await act(async () => {
          // Store 先发布新目录，目录授权在同一宏任务结束前才确认。
          peek.mockReturnValue(undefined);
          useUserModelStore.setState({ modelList: [] });
          await Promise.resolve();
          peek.mockReturnValue({ models: [], defaultModelIds: {} });
          await vi.advanceTimersByTimeAsync(1);
        });

        expect(issueCodes(personalNode.nodeId)).toContain('model_unavailable');
        expect(issueCodes(appNode.nodeId)?.includes('model_unavailable')).toBe(!active);

        await act(async () =>
          staleRefresh.resolve({ references: [appModel], defaultModelIds: {} })
        );
        expect(issueCodes(appNode.nodeId)?.includes('model_unavailable')).toBe(!active);
      } finally {
        act(() => root.unmount());
        useUserModelStore.setState({ modelList: previousModelList });
        peek.mockReturnValue(undefined);
        getDetails.mockReset().mockResolvedValue({ references: [], defaultModelIds: {} });
      }
    }
  );
});
