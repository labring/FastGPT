import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useContextSelector } from 'use-context-selector';
import { ReactFlowProvider } from 'reactflow';
import { AppContext } from '@/pageComponents/app/detail/context';
import { materializeWorkflow } from '@/web/core/workflow/editor/codec';
import { peekWorkflowEnvironmentModels } from '@/web/core/workflow/modelData';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import {
  WorkflowHostContext,
  WorkflowHostProvider,
  mergeViewOverlayPatches,
  type WorkflowHostValue
} from '@/web/core/workflow/editor/host';

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
vi.mock('@/web/core/workflow/editor/react', () => ({
  WorkflowEditorProvider: ({ children }: { children: React.ReactNode }) => children
}));

const t = ((key: string) => key) as never;

type TestAppDetail = { chatConfig: Record<string, unknown> };

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

/**
 * 挂真实 Provider 树（AppContext -> ReactFlowProvider -> host）+ 计数型观察者。
 * host 在 ReactFlowProvider 内（问题焦点要 fitView），测试同样需要这层 Provider。
 * chatConfig 必须与文档一致，否则 host 的单向同步 effect 会额外发一笔 updateChatConfig。
 * setAppDetail 按真实 setter 语义应用 updater，断言才能读到 host 回写后的 appDetail；
 * Provider value 只渲染一次，因此回写不会再触发同步 effect（测试里不存在双向循环）。
 */
const renderHost = async (chatConfig: unknown = {}) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const appDetail = { current: { chatConfig } as TestAppDetail };
  const setAppDetail = vi.fn((updater: (detail: TestAppDetail) => TestAppDetail) => {
    appDetail.current = updater(appDetail.current);
  });
  let host: WorkflowHostValue | undefined;

  const Observer = () => {
    host = useContextSelector(WorkflowHostContext, (value) => value);
    return null;
  };

  await act(async () => {
    root.render(
      React.createElement(
        AppContext.Provider,
        { value: { appDetail: appDetail.current, setAppDetail } as never },
        React.createElement(
          ReactFlowProvider,
          null,
          React.createElement(WorkflowHostProvider, null, React.createElement(Observer))
        )
      )
    );
  });

  return { root, appDetail, setAppDetail, readHost: () => host! };
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

describe('WorkflowHostProvider version history', () => {
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
      readHost().switchVersion(initialVersion, 'ignored-copy-title');
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

    // 云端版本走 replaceDocument，且不新增“My Edit”记录。
    expect(readHost().versions).toHaveLength(localCount);
    expect(readHost().runtime!.getWorkflow().chatConfig).toEqual(
      expect.objectContaining({ welcomeText: 'cloud hello' })
    );
    // chatConfig 回写 appDetail（订阅回写与切换后的显式同步都走同一个 setter）。
    expect(appDetail.current.chatConfig.welcomeText).toBe('cloud hello');

    act(() => root.unmount());
  });

  it('exposes the runtime issue view hydrated from the document', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    let host: WorkflowHostValue | undefined;
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
      host = useContextSelector(WorkflowHostContext, (value) => value);
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
            React.createElement(WorkflowHostProvider, null, React.createElement(Observer))
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
