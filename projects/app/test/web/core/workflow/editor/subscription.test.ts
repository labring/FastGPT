// adapter 两层订阅 API 测试：稳定 action 句柄零订阅，value hook 按 Object.is bail out。
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import type { WorkflowRuntimePort } from '@fastgpt/global/core/workflow/editor/types';
import { hydrateRuntime } from '@/web/core/workflow/editor/codec';
import { WorkflowEditorProvider } from '@/web/core/workflow/editor/react/workflowEditorProvider';
import { useFieldValue } from '@/web/core/workflow/editor/react/useField';
import { useNode, useNodeValue } from '@/web/core/workflow/editor/react/useNode';
import {
  useWorkflow,
  useWorkflowActions,
  useWorkflowValue
} from '@/web/core/workflow/editor/react/useWorkflow';
import type { WorkflowActionsHandle } from '@/web/core/workflow/editor/react/workflowEditorAdapter';

const t = ((key: string) => key) as never;

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
    {
      nodeId: 'answer',
      flowNodeType: FlowNodeTypeEnum.answerNode,
      name: 'Answer',
      position: { x: 100, y: 0 },
      inputs: [
        {
          key: 'extraText',
          renderTypeList: ['input'],
          valueType: 'string',
          label: 'Extra',
          value: 'before'
        }
      ],
      outputs: []
    }
  ],
  edges: [
    {
      source: 'start',
      target: 'answer',
      sourceHandle: getHandleId('start', 'source', NodeOutputKeyEnum.userChatInput),
      targetHandle: 'answer-target-left'
    }
  ],
  chatConfig: {}
});

const reactGlobals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

describe('workflow editor subscription API', () => {
  let root: Root;
  let runtime: WorkflowRuntimePort;

  /** 挂真实 Provider 树 + 计数型叶子；第二次 act 排空 React 的强制重渲染队列。 */
  const mount = async (leaf: React.FC) => {
    await act(async () => {
      root.render(
        React.createElement(WorkflowEditorProvider, { runtime }, React.createElement(leaf))
      );
    });
    await act(async () => undefined);
  };

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;
    root = createRoot(document.createElement('div'));
    runtime = hydrateRuntime({ input: createStoreWorkflow(), t });
  });

  afterEach(() => {
    act(() => root.unmount());
    runtime.dispose();
    vi.unstubAllGlobals();
  });

  it('keeps the actions handle frozen, identity-stable and unsubscribed', async () => {
    const seen: WorkflowActionsHandle[] = [];
    let renders = 0;
    const Leaf = () => {
      renders += 1;
      seen.push(useWorkflowActions());
      return null;
    };
    await mount(Leaf);

    expect(renders).toBe(1);
    const actions = seen[0];
    expect(Object.isFrozen(actions)).toBe(true);
    expect(actions.getEdges()).toBe(actions.getWorkflowSnapshot().edges);
    expect(actions.getEdges()).toHaveLength(1);

    // 结构变化、几何提交与节点删除全部经过同一个句柄，叶子始终不重渲染。
    act(() => {
      expect(actions.disconnectEdge({ index: 0 }).ok).toBe(true);
    });
    act(() => {
      expect(actions.commitGeometry([{ nodeId: 'answer', position: { x: 10, y: 20 } }]).ok).toBe(
        true
      );
    });
    act(() => {
      expect(actions.removeNodes(['answer']).ok).toBe(true);
    });

    expect(renders).toBe(1);
    expect(seen[seen.length - 1]).toBe(actions);
    // 非订阅 getter 读到的仍是点击瞬间的当前值。
    expect(actions.getEdges()).toHaveLength(0);
    expect(actions.getWorkflowSnapshot().nodes.map((node) => node.nodeId)).toEqual(['start']);
    expect(runtime.getNodeView('answer')).toBeUndefined();
  });

  it('bails out on unchanged primitives and passes the stable graph object', async () => {
    const counts: number[] = [];
    const graphs: unknown[] = [];
    let renders = 0;
    const Leaf = () => {
      renders += 1;
      counts.push(
        useWorkflowValue((structure, graph) => {
          graphs.push(graph);
          return structure.nodes.length;
        })
      );
      return null;
    };
    await mount(Leaf);
    expect(renders).toBe(1);
    expect(counts).toEqual([2]);
    // 06a-3 任务 4 已把图查询对象透传进来：身份与 port 上的同一个对象一致，且不随结构变化。
    expect(graphs.every((graph) => graph === runtime.getGraphQueries())).toBe(true);

    // 边集合变化会通知结构通道，但节点数没变 → Object.is 相等，不重渲染。
    act(() => {
      runtime.dispatch({ type: 'disconnectEdge', index: 0 });
    });
    expect(renders).toBe(1);

    // 字段写入根本不通知结构通道。
    act(() => {
      runtime.dispatch({
        type: 'updateField',
        nodeId: 'answer',
        fieldKey: 'extraText',
        kind: 'input',
        value: 'after'
      });
    });
    expect(renders).toBe(1);

    // 派生值真的变了才重渲染。
    act(() => {
      runtime.dispatch({ type: 'removeNodes', nodeIds: ['answer'] });
    });
    expect(renders).toBe(2);
    expect(counts.at(-1)).toBe(1);
  });

  it('refreshes the workflow snapshot for node output structure changes', async () => {
    const snapshots: ReturnType<typeof useWorkflow>[] = [];
    let renders = 0;
    const Leaf = () => {
      renders += 1;
      snapshots.push(useWorkflow());
      return null;
    };
    await mount(Leaf);
    const initialSnapshot = snapshots[0];

    act(() => {
      expect(
        runtime.dispatch({
          type: 'updateNode',
          nodeId: 'answer',
          patch: {
            outputs: [{ id: 'result', key: 'result', type: FlowNodeOutputTypeEnum.static }]
          }
        }).ok
      ).toBe(true);
    });

    expect(renders).toBe(2);
    expect(snapshots.at(-1)).not.toBe(initialSnapshot);
  });

  it('re-renders when the selector builds a new object, the documented misuse', async () => {
    // React 对不缓存的 getSnapshot 会连续强制重渲染，第 3 次后切回同一引用让测试能收尾。
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const seen: { nodeCount: number }[] = [];
    let renders = 0;
    let allowFresh = true;
    const Leaf = () => {
      renders += 1;
      if (renders >= 3) allowFresh = false;
      seen.push(
        useWorkflowValue((structure) => {
          const cached = seen.at(-1);
          if (!allowFresh && cached) return cached;
          return { nodeCount: structure.nodes.length };
        })
      );
      return null;
    };
    await mount(Leaf);

    // 文档没有任何变更，派生内容也一直是 2 个节点，只因每次返回新对象就被判为变化。
    expect(renders).toBeGreaterThan(1);
    expect(seen.every((value) => value.nodeCount === 2)).toBe(true);
    errorSpy.mockRestore();
  });

  it('scopes node subscriptions to one node and tolerates deletion', async () => {
    const names: (string | undefined)[] = [];
    let renders = 0;
    const Leaf = () => {
      renders += 1;
      names.push(useNodeValue('answer', (node) => node?.data.name));
      return null;
    };
    await mount(Leaf);
    expect(names).toEqual(['Answer']);

    // 别的节点写入不通知本节点通道。
    act(() => {
      runtime.dispatch({ type: 'updateNode', nodeId: 'start', patch: { name: 'Start2' } });
    });
    expect(renders).toBe(1);

    // 本节点字段写入与几何提交都会通知，但 name 派生值没变 → bail out。
    act(() => {
      runtime.dispatch({
        type: 'updateField',
        nodeId: 'answer',
        fieldKey: 'extraText',
        kind: 'input',
        value: 'after'
      });
      runtime.dispatch({ type: 'commitGeometry', nodeId: 'answer', position: { x: 10, y: 10 } });
    });
    expect(renders).toBe(1);

    act(() => {
      runtime.dispatch({ type: 'updateNode', nodeId: 'answer', patch: { name: 'Renamed' } });
    });
    expect(renders).toBe(2);
    expect(names.at(-1)).toBe('Renamed');

    // 节点删除后 selector 收到 undefined，不抛错。
    act(() => {
      runtime.dispatch({ type: 'removeNodes', nodeIds: ['answer'] });
    });
    expect(renders).toBe(3);
    expect(names.at(-1)).toBeUndefined();
  });

  it('reads the current node fields after a canvas node keeps its identity', async () => {
    const values: unknown[] = [];
    const Leaf = () => {
      const node = useNode('answer');
      values.push(node?.data.inputs.find((input) => input.key === 'extraText')?.value);
      return null;
    };
    await mount(Leaf);

    expect(values).toEqual(['before']);

    act(() => {
      runtime.dispatch({
        type: 'updateField',
        nodeId: 'answer',
        fieldKey: 'extraText',
        kind: 'input',
        value: 'after'
      });
    });

    expect(values.at(-1)).toBe('after');
  });

  it('scopes field subscriptions, tolerates a fresh query object and a deleted field', async () => {
    const values: unknown[] = [];
    const kinds: unknown[] = [];
    let valueRenders = 0;
    let kindRenders = 0;
    const ValueLeaf = () => {
      valueRenders += 1;
      // 每次渲染传新的 query 字面量：hook 内部归一，不应该重复订阅或额外重渲染。
      values.push(
        useFieldValue({ nodeId: 'answer', fieldKey: 'extraText', kind: 'input' }, (field) =>
          field ? field.data.input?.value : undefined
        )
      );
      return null;
    };
    const KindLeaf = () => {
      kindRenders += 1;
      kinds.push(
        useFieldValue(
          { nodeId: 'answer', fieldKey: 'extraText', kind: 'input' },
          (field) => field?.data.kind
        )
      );
      return null;
    };
    await act(async () => {
      root.render(
        React.createElement(
          WorkflowEditorProvider,
          { runtime },
          React.createElement(ValueLeaf),
          React.createElement(KindLeaf)
        )
      );
    });
    await act(async () => undefined);

    expect(values).toEqual(['before']);
    expect(kinds).toEqual(['input']);

    // 无关节点写入：两个叶子都不通知。
    act(() => {
      runtime.dispatch({ type: 'updateNode', nodeId: 'start', patch: { name: 'Start2' } });
    });
    expect(valueRenders).toBe(1);
    expect(kindRenders).toBe(1);

    // 本字段写入：value 变了要重渲染，恒定的 kind 派生值被 Object.is 挡住。
    act(() => {
      runtime.dispatch({
        type: 'updateField',
        nodeId: 'answer',
        fieldKey: 'extraText',
        kind: 'input',
        value: 'after'
      });
    });
    expect(valueRenders).toBe(2);
    expect(values.at(-1)).toBe('after');
    expect(kindRenders).toBe(1);

    // 节点删除后字段 snapshot 为 undefined，selector 必须容忍。
    act(() => {
      runtime.dispatch({ type: 'removeNodes', nodeIds: ['answer'] });
    });
    expect(values.at(-1)).toBeUndefined();
    expect(kinds.at(-1)).toBeUndefined();
  });
});
