import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { useContextSelector } from 'use-context-selector';
import ReactFlow, { ReactFlowProvider } from 'reactflow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum,
  LoopRunModeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import type { Node } from 'reactflow';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { TFunction } from 'next-i18next';
import { LoopRunNode } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import { LoopRunStartNode } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRunStart';
import { LoopRunBreakNode } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRunBreak';
import WorkflowInitContextProvider, {
  WorkflowBufferDataContext,
  type WorkflowDataContextType
} from '@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext';
import {
  WorkflowActionsContext,
  WorkflowActionsProvider
} from '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext';
import NodeLoopRun from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/Loop/NodeLoopRun';
import { storeNode2FlowNode } from '@/web/core/workflow/utils';

const mocks = vi.hoisted(() => ({ toast: vi.fn(), t: (key: string) => key }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: mocks.t }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/pageComponents/app/detail/context', async () => {
  const { createContext } = await import('use-context-selector');
  return { AppContext: createContext({ appId: 'app', appDetail: { chatConfig: {} } }) };
});
vi.mock('@/web/core/workflow/modelData', () => ({
  getWorkflowModelCheckData: async () => undefined
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowUtilsContext', async () => {
  const { createContext } = await import('use-context-selector');
  return {
    WorkflowUtilsContext: createContext({
      splitOutput: () => ({ successOutputs: [], errorOutputs: [] })
    })
  };
});
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useNestedNode', () => ({
  useNestedNode: () => ({ nodeWidth: 500, nodeHeight: 500, inputBoxRef: null })
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/NodeCard', () => ({
  default: () => null
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput', () => ({
  default: () => null
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderOutput', () => ({
  default: () => null
}));
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderOutput/CatchError',
  () => ({
    default: () => null
  })
);
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));

const nodeTypes = {
  [FlowNodeTypeEnum.loopRun]: NodeLoopRun,
  [FlowNodeTypeEnum.loopRunStart]: () => null,
  [FlowNodeTypeEnum.loopRunBreak]: () => null,
  [FlowNodeTypeEnum.emptyNode]: () => null
};

describe('workflow node initialization after canvas replacement', () => {
  let dom: JSDOM;
  let root: Root;
  let state: WorkflowDataContextType;
  let actions: ComponentProps<typeof WorkflowActionsContext.Provider>['value'];
  const Consumer = () => {
    state = useContextSelector(WorkflowBufferDataContext, (value) => value);
    actions = useContextSelector(WorkflowActionsContext, (value) => value);
    return createElement(ReactFlow, {
      nodes: state.getNodes(),
      edges: state.edges,
      nodeTypes,
      style: { width: 800, height: 600 }
    });
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    dom = new JSDOM('<!doctype html><div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('SVGElement', dom.window.SVGElement);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(callback, 0)
    );
    vi.stubGlobal('cancelAnimationFrame', clearTimeout);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    root = createRoot(document.getElementById('root')!);
    await act(async () => {
      /* eslint-disable react/no-children-prop -- Provider 的 children 为必填，createElement 的第三参无法满足该类型约束。 */
      root.render(
        createElement(ReactFlowProvider, {
          children: createElement(WorkflowInitContextProvider, {
            basicNodeTemplates: [],
            children: createElement(WorkflowActionsProvider, { children: createElement(Consumer) })
          })
        })
      );
      /* eslint-enable react/no-children-prop */
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('removes every edge of an explicitly deleted port and preserves other ports', async () => {
    const sourceHandle = 'node-source_catch-right';
    const nodes = ['node', 'target-a', 'target-b'].map((id) => ({
      id,
      type: FlowNodeTypeEnum.emptyNode,
      position: { x: 0, y: 0 },
      data: {
        id: FlowNodeTypeEnum.emptyNode,
        nodeId: id,
        flowNodeType: FlowNodeTypeEnum.emptyNode,
        name: id,
        intro: '',
        avatar: '',
        inputs: [],
        outputs: []
      }
    }));
    const edges = [
      {
        id: 'catch-a',
        source: 'node',
        target: 'target-a',
        sourceHandle,
        targetHandle: 'target-a-target-left'
      },
      {
        id: 'catch-b',
        source: 'node',
        target: 'target-b',
        sourceHandle,
        targetHandle: 'target-b-target-left'
      },
      {
        id: 'normal',
        source: 'node',
        target: 'target-a',
        sourceHandle: 'node-source-right',
        targetHandle: 'target-a-target-left'
      }
    ];
    await act(async () => state.replaceWorkflowData({ nodes, edges }));
    await act(async () => actions.onDelEdge({ nodeId: 'node', sourceHandle }));
    expect(state.edges.map((edge) => edge.id)).toEqual(['normal']);
  });

  it('keeps loop mode outputs unique when applying versions with reused node IDs', async () => {
    // 实际挂载 ReactFlow：其 StoreUpdater 在 effect 中同步 props，才能复现旧属性重复补输出。
    for (const mode of [
      LoopRunModeEnum.array,
      LoopRunModeEnum.conditional,
      LoopRunModeEnum.array
    ]) {
      const loop = storeNode2FlowNode({
        item: {
          ...LoopRunNode,
          nodeId: 'loop',
          position: { x: 0, y: 0 },
          inputs: [
            ...LoopRunNode.inputs.map((input) =>
              input.key === NodeInputKeyEnum.loopRunMode ? { ...input, value: mode } : input
            ),
            {
              key: 'result',
              label: 'Result',
              canEdit: true,
              valueType: WorkflowIOValueTypeEnum.string,
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              value: ['loop__start', NodeOutputKeyEnum.currentItem]
            }
          ]
        },
        t: mocks.t as TFunction
      });
      const start = storeNode2FlowNode({
        item: {
          ...LoopRunStartNode,
          nodeId: 'loop__start',
          parentNodeId: 'loop',
          position: { x: 60, y: 280 }
        },
        t: mocks.t as TFunction
      });
      const nodes = [loop, start];
      if (mode === LoopRunModeEnum.conditional) {
        nodes.push(
          storeNode2FlowNode({
            item: {
              ...LoopRunBreakNode,
              nodeId: 'loop__break',
              parentNodeId: 'loop',
              position: { x: 300, y: 280 }
            },
            t: mocks.t as TFunction
          })
        );
      }
      await act(async () => state.replaceWorkflowData({ nodes, edges: [] }));
      expect(state.getNodeById('loop__start')?.outputs.map(({ key }) => key)).toEqual(
        mode === LoopRunModeEnum.array
          ? [NodeOutputKeyEnum.currentIndex, NodeOutputKeyEnum.currentItem]
          : [NodeOutputKeyEnum.currentIteration]
      );
      expect(state.getNodeById('loop')?.outputs.filter(({ key }) => key === 'result')).toEqual([
        {
          id: 'result',
          key: 'result',
          label: 'Result',
          type: FlowNodeOutputTypeEnum.dynamic,
          valueType: WorkflowIOValueTypeEnum.string
        }
      ]);
      expect(state.getNodeById('loop')?.inputs.find(({ key }) => key === 'result')?.value).toEqual([
        'loop__start',
        NodeOutputKeyEnum.currentItem
      ]);
      expect(mocks.toast).not.toHaveBeenCalled();
    }
  });

  it('deduplicates batched initialization while preserving the first input and output configuration', async () => {
    const node: Node<FlowNodeItemType> = {
      id: 'node',
      type: FlowNodeTypeEnum.emptyNode,
      position: { x: 0, y: 0 },
      data: {
        id: FlowNodeTypeEnum.emptyNode,
        nodeId: 'node',
        flowNodeType: FlowNodeTypeEnum.emptyNode,
        name: 'Node',
        intro: '',
        avatar: '',
        inputs: [],
        outputs: []
      }
    };
    const input: FlowNodeInputItemType = {
      key: 'input',
      label: 'Configured input',
      renderTypeList: [FlowNodeInputTypeEnum.input],
      value: 'saved value'
    };
    const output: FlowNodeOutputItemType = {
      id: 'saved-output-id',
      key: 'result',
      label: 'Configured result',
      type: FlowNodeOutputTypeEnum.dynamic,
      valueType: WorkflowIOValueTypeEnum.string
    };
    await act(async () => state.replaceWorkflowData({ nodes: [node], edges: [] }));
    await act(async () => {
      actions.onChangeNode([
        { nodeId: 'node', type: 'ensureInput', value: input },
        { nodeId: 'node', type: 'ensureOutput', value: output, index: 0 },
        { nodeId: 'node', type: 'ensureInput', value: { ...input, value: 'stale default' } },
        { nodeId: 'node', type: 'ensureOutput', value: { ...output, id: 'stale-id' }, index: 0 }
      ]);
      actions.onChangeNode({ nodeId: 'node', type: 'ensureInput', value: { ...input, value: '' } });
      actions.onChangeNode({
        nodeId: 'node',
        type: 'ensureOutput',
        value: { ...output, label: '' }
      });
    });
    expect(state.getNodeById('node')?.inputs).toEqual([input]);
    expect(state.getNodeById('node')?.outputs).toEqual([output]);
    expect(mocks.toast).not.toHaveBeenCalled();

    // 手动新增和重命名仍需拦截真实冲突，不能为自动初始化一并关闭校验。
    await act(async () => {
      actions.onChangeNode([
        { nodeId: 'node', type: 'addInput', value: { ...input, value: 'duplicate' } },
        { nodeId: 'node', type: 'addOutput', value: { ...output, id: 'duplicate' } },
        { nodeId: 'node', type: 'replaceInput', key: 'other', value: input }
      ]);
    });
    expect(state.getNodeById('node')?.inputs).toEqual([input]);
    expect(state.getNodeById('node')?.outputs).toEqual([output]);
    expect(mocks.toast).toHaveBeenCalledTimes(3);
    expect(mocks.toast.mock.calls.map(([options]) => options)).toEqual(
      Array.from({ length: 3 }, () => ({ status: 'warning', title: 'common:key_repetition' }))
    );
  });
});
