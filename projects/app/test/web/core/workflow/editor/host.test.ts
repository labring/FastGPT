import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReactFlowProvider } from 'reactflow';
import { AppContext } from '@/pageComponents/app/detail/context';
import { materializeWorkflow } from '@/web/core/workflow/editor/codec';
import { hydrateWorkflowEditor } from '@fastgpt/global/core/workflow/editor/protocol';
import { peekWorkflowEnvironmentModels } from '@/web/core/workflow/modelData';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import {
  useWorkflowHistory,
  useWorkflowPersistence,
  useWorkflowRuntime,
  useWorkflowSessionActions,
  WorkflowSessionProvider,
  mergeViewOverlayPatches,
  type WorkflowHistoryState,
  type WorkflowPersistenceState,
  type WorkflowSessionActions
} from '@/web/core/workflow/editor/session/workflowSession';
import { createWorkflowSaveCoordinator } from '@/web/core/workflow/editor/session/workflowPersistence';
import type { WorkflowRuntimePort } from '@fastgpt/global/core/workflow/editor/types';

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
  useWorkflowDraftLifecycle: () => ({ authExpiredModal: undefined })
}));
vi.mock('@/web/core/workflow/modelData', () => ({
  // 目录未就绪：Runtime 跳过模型规则，host 版本历史行为不受影响。
  peekWorkflowEnvironmentModels: vi.fn(() => undefined)
}));
// gate 只等目录就绪；Issue 判定全在 Runtime，这里不再 mock 任何检查器。
vi.mock('@/web/core/ai/model/modelData', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ensureModelCatalog: vi.fn(async () => ({}))
}));
vi.mock('@/web/core/workflow/editor/react/workflowEditorProvider', () => ({
  WorkflowEditorProvider: ({ children }: { children: React.ReactNode }) => children
}));

const t = ((key: string) => key) as never;

type TestAppDetail = { chatConfig: Record<string, unknown> };
type TestHost = { runtime: WorkflowRuntimePort | null } & WorkflowSessionActions &
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
const renderHost = async (
  chatConfig: unknown = {},
  initialRuntime?: WorkflowRuntimePort,
  additionalChildren?: React.ReactNode
) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const appDetail = { current: { chatConfig } as TestAppDetail };
  const setAppDetail = vi.fn((updater: (detail: TestAppDetail) => TestAppDetail) => {
    appDetail.current = updater(appDetail.current);
  });
  let host: TestHost | undefined;

  const Observer = () => {
    host = {
      runtime: useWorkflowRuntime(),
      ...useWorkflowSessionActions(),
      ...useWorkflowPersistence(),
      ...useWorkflowHistory()
    };
    return null;
  };

  const render = (runtime?: WorkflowRuntimePort) =>
    root.render(
      React.createElement(
        AppContext.Provider,
        { value: { appDetail: appDetail.current, setAppDetail } as never },
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
              React.createElement(Observer),
              additionalChildren
            )
          )
        )
      )
    );

  await act(async () => render(initialRuntime));

  return { root, appDetail, setAppDetail, readHost: () => host!, render };
};

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

describe('WorkflowSessionProvider version history', () => {
  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
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

  it('records every command immediately without adding entries when switching versions', async () => {
    const initial = materializeWorkflow({ input: { nodes: [], edges: [] }, chatConfig: {}, t });
    const { root, appDetail, readHost } = await renderHost(initial.chatConfig);

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
    // 本地条目不快照文档：切换按 contentRevision 回放 History，live 标记落到目标条目。
    expect(liveVersions[0]?.contentRevision).toBe(initialVersion.contentRevision);
    expect(readHost().versions.every((item) => item.content === undefined)).toBe(true);
    // 回放恢复的 chatConfig 由 Runtime 变更事件回写 appDetail，不再依赖条目快照。
    expect(readHost().runtime!.getWorkflow().chatConfig.welcomeText).toBeUndefined();
    expect(appDetail.current.chatConfig.welcomeText).toBeUndefined();

    const serialized = await readHost().serializeWorkflowAndCheck(true);
    expect(serialized).toEqual(expect.objectContaining({ nodes: [], edges: [] }));

    act(() => root.unmount());
  });

  it('records a field commit without snapshotting the document', async () => {
    const initialDocument = answerDocument();
    const { root, readHost } = await renderHost(initialDocument.chatConfig);
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
    expect(readHost().versions.every((item) => item.content === undefined)).toBe(true);
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

  it('marks only the newest save request and keeps its captured revision', async () => {
    const initial = answerDocument();
    const { root, readHost } = await renderHost(initial.chatConfig);
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
      markResult = readHost().markSaved(requestB);
    });
    expect(markResult).toBe(true);
    expect(readHost().runtime!.getSavepoint().isDirty).toBe(false);
    act(() => {
      markResult = readHost().markSaved(requestA);
    });
    expect(markResult).toBe(false);

    act(() => root.unmount());
  });

  it('switches to a cloud version without adding a local entry', async () => {
    const initial = answerDocument();
    const { root, appDetail, readHost } = await renderHost(initial.chatConfig);
    act(() => readHost().initRuntime(initial));
    const localCount = readHost().versions.length;

    const cloudVersion = {
      nodes: [],
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
    // chatConfig 回写 appDetail（订阅回写与切换后的显式同步都走同一个 setter）。
    expect(appDetail.current.chatConfig.welcomeText).toBe('cloud hello');
    expect(readHost().versions.filter((item) => item.live)).toHaveLength(1);
    expect(readHost().versions.find((item) => item.live)?.contentRevision).toEqual(
      expect.any(Number)
    );
    expect(readHost().versions.find((item) => item.live)?.content).toBeDefined();

    act(() => root.unmount());
  });

  it('switches back to a local version after switching to cloud', async () => {
    const initial = answerDocument();
    const { root, readHost } = await renderHost(initial.chatConfig);
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

  it('tears down the previous runtime when the runtime prop is removed', async () => {
    const initial = answerDocument();
    const runtime = hydrateWorkflowEditor(initial);
    const { root, readHost, render } = await renderHost(initial.chatConfig, runtime);

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
    const { root, readHost } = await renderHost(
      initial.chatConfig,
      undefined,
      React.createElement(Bootstrap)
    );

    expect(readHost().runtime).not.toBeNull();
    expect(readHost().runtime?.isDisposed()).toBe(false);
    expect(readHost().versions).toHaveLength(1);

    act(() => root.unmount());
  });

  it('exposes the runtime issue view hydrated from the document', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    let host: TestHost | undefined;
    const initial = materializeWorkflow({
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

    const Observer = () => {
      host = {
        runtime: useWorkflowRuntime(),
        ...useWorkflowSessionActions(),
        ...useWorkflowPersistence(),
        ...useWorkflowHistory()
      };
      return null;
    };

    await act(async () => {
      root.render(
        React.createElement(
          AppContext.Provider,
          { value: { appDetail: { chatConfig: {} }, setAppDetail: vi.fn() } as never },
          React.createElement(
            ReactFlowProvider,
            null,
            React.createElement(WorkflowSessionProvider, null, React.createElement(Observer))
          )
        )
      );
    });

    act(() => {
      host?.initRuntime(initial);
    });

    // Issue View 由 Runtime 自己按文档规则算出；host 只负责注入环境事实。
    expect(peekWorkflowEnvironmentModels).toHaveBeenCalled();
    expect(host?.runtime?.getNode('answer')?.issues.map((issue) => issue.code)).toContain(
      'required_input_empty'
    );
    expect(host?.runtime?.getWorkflowIssues().issues.map((issue) => issue.code)).toContain(
      'required_input_empty'
    );
    // gate 只读 Issue View：有 error 时不序列化。
    expect(await host?.serializeWorkflowAndCheck(true)).toBeUndefined();

    act(() => root.unmount());
  });
});
