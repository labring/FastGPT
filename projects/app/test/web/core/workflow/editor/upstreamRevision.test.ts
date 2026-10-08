// `useNodeWorkflowDocument` 的窄订阅测试：只有命中来源闭包的变更才换 workflow 身份。
// 这条订阅面是「打字不刷新全部节点」的关键，写宽一格就退回每笔提交全图重算。
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import type { WorkflowRuntimePort } from '@fastgpt/global/core/workflow/editor/types';
import { hydrateRuntime } from '@/web/core/workflow/editor/codec';
import { WorkflowSessionProvider } from '@/web/core/workflow/editor/session/workflowSession';
import { useNodeWorkflowDocument } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/useWorkflowDocument';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/pageComponents/app/detail/context', async () => {
  const { createContext } = await import('use-context-selector');
  return {
    AppContext: createContext({
      appId: '',
      appDetail: { chatConfig: {} },
      setAppDetail: () => undefined
    })
  };
});
vi.mock('@/web/core/workflow/localDraft/useWorkflowDraftLifecycle', () => ({
  useWorkflowDraftLifecycle: () => ({ authExpiredModal: undefined })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: vi.fn() })
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: {} })
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ teamPlanStatus: undefined })
}));
vi.mock('@/web/core/ai/model/useUserModelStore', () => ({
  useUserModelStore: { subscribe: () => () => undefined }
}));
vi.mock('@/web/core/ai/model/modelData', () => ({
  ensureModelCatalog: vi.fn(async () => ({}))
}));

const t = ((key: string) => key) as never;

const textInput = (value: string) => ({
  key: 'text',
  renderTypeList: ['input'],
  valueType: 'string',
  label: 'Text',
  value
});

const chainNode = (nodeId: string, name: string) => ({
  nodeId,
  flowNodeType: FlowNodeTypeEnum.chatNode,
  name,
  position: { x: 0, y: 0 },
  inputs: [textInput('v')],
  outputs: [{ id: 'answerText', key: 'answerText', label: 'Answer', valueType: 'string' }]
});

const edge = (source: string, target: string) => ({
  source,
  target,
  sourceHandle: getHandleId(source, 'source', 'answerText'),
  targetHandle: 'target'
});

/** start -> A -> B，外加一个不连线的 C：用来验证「无关节点写入」不带动任何人。 */
const createStoreWorkflow = () => ({
  nodes: [
    {
      nodeId: 'start',
      flowNodeType: FlowNodeTypeEnum.workflowStart,
      name: 'Start',
      position: { x: 0, y: 0 },
      inputs: [],
      outputs: [{ id: NodeOutputKeyEnum.userChatInput, key: NodeOutputKeyEnum.userChatInput }]
    },
    chainNode('A', 'A'),
    chainNode('B', 'B'),
    chainNode('C', 'C'),
    {
      nodeId: 'answer',
      flowNodeType: FlowNodeTypeEnum.answerNode,
      name: 'Answer',
      position: { x: 0, y: 0 },
      inputs: [{ key: 'text', renderTypeList: ['input'], valueType: 'string', value: '' }],
      outputs: []
    }
  ],
  edges: [
    {
      source: 'start',
      target: 'A',
      sourceHandle: getHandleId('start', 'source', NodeOutputKeyEnum.userChatInput),
      targetHandle: 'target'
    },
    edge('A', 'B'),
    edge('B', 'answer')
  ],
  chatConfig: {}
});

const reactGlobals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

describe('useNodeWorkflowDocument upstream revision', () => {
  let root: Root;
  let runtime: WorkflowRuntimePort;
  /** nodeId -> 上一次渲染观察到的 workflow 快照身份。 */
  let observed: Record<string, unknown>;

  const Leaf = ({ nodeId }: { nodeId: string }) => {
    const { workflow } = useNodeWorkflowDocument({ nodeId });
    observed[nodeId] = workflow;
    return null;
  };

  const dispatch = async (command: Parameters<WorkflowRuntimePort['dispatch']>[0]) => {
    await act(async () => {
      void runtime.dispatch(command as never);
    });
    await act(async () => undefined);
  };

  beforeEach(async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;
    root = createRoot(document.createElement('div'));
    runtime = hydrateRuntime({ input: createStoreWorkflow(), t });
    observed = {};

    await act(async () => {
      root.render(
        React.createElement(
          WorkflowSessionProvider,
          { runtime },
          ['A', 'B', 'C'].map((nodeId) => React.createElement(Leaf, { key: nodeId, nodeId }))
        )
      );
    });
    await act(async () => undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    runtime.dispose();
    vi.unstubAllGlobals();
  });

  it('上游节点的纯输入值写入不刷新下游，只刷新它自己', async () => {
    const beforeA = observed.A;
    const beforeB = observed.B;

    await dispatch({
      type: 'updateField',
      nodeId: 'A',
      fieldKey: 'text',
      kind: 'input',
      value: 'x'
    });

    expect(observed.A).not.toBe(beforeA);
    expect(observed.B).toBe(beforeB);
    expect(observed.C).toBeDefined();
  });

  it('上游节点改名会刷新下游派生列表', async () => {
    const beforeB = observed.B;

    await dispatch({ type: 'updateNode', nodeId: 'A', patch: { name: 'renamed' } });

    expect(observed.B).not.toBe(beforeB);
  });

  it('不相连节点的输入值写入谁都不带动', async () => {
    const beforeA = observed.A;
    const beforeB = observed.B;

    await dispatch({
      type: 'updateField',
      nodeId: 'C',
      fieldKey: 'text',
      kind: 'input',
      value: 'x'
    });

    expect(observed.A).toBe(beforeA);
    expect(observed.B).toBe(beforeB);
  });

  it('改名会连带重算 outputs，被 Runtime 判成结构变更，一律全量失效', async () => {
    const beforeB = observed.B;

    // C 与 A / B 都不相连，但 affectedRecords.structure 为真时不做闭包判定：
    // 来源闭包本身可能已经不同，保守方向只会多算不会漏算。
    await dispatch({ type: 'updateNode', nodeId: 'C', patch: { name: 'renamed' } });

    expect(observed.B).not.toBe(beforeB);
  });

  it('结构与 chatConfig 变化一律刷新', async () => {
    const beforeA = observed.A;
    const beforeC = observed.C;
    await dispatch({ type: 'connectEdge', edge: edge('C', 'A') as never });
    // 连线是结构变更：来源闭包本身可能已经不同，所有派生列表一律失效。
    expect(observed.A).not.toBe(beforeA);
    expect(observed.C).not.toBe(beforeC);

    const beforeB = observed.B;
    await dispatch({
      type: 'updateChatConfig',
      chatConfig: { variables: [] } as never
    });
    expect(observed.B).not.toBe(beforeB);
  });

  it('几何提交不刷新任何派生列表', async () => {
    const beforeA = observed.A;
    const beforeB = observed.B;

    await dispatch({ type: 'commitGeometry', nodeId: 'A', position: { x: 10, y: 10 } });

    expect(observed.A).toBe(beforeA);
    expect(observed.B).toBe(beforeB);
  });
});
