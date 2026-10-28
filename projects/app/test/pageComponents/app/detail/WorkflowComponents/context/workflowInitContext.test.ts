import { checkExecutionConnection } from '@fastgpt/workflow-core/edge/validation';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { useContextSelector } from 'use-context-selector';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Node } from 'reactflow';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import WorkflowInitContextProvider, {
  WorkflowBufferDataContext,
  type WorkflowDataContextType
} from '@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext';

const node = (name: string, id = 'same-id'): Node<FlowNodeItemType> => ({
  id,
  position: { x: 0, y: 0 },
  data: {
    id,
    nodeId: id,
    flowNodeType: FlowNodeTypeEnum.workflowStart,
    name,
    intro: '',
    avatar: '',
    inputs: [],
    outputs: []
  }
});

describe('workflow canvas replacement', () => {
  let dom: JSDOM;
  let root: Root;
  let state: WorkflowDataContextType;
  const Consumer = () => {
    state = useContextSelector(WorkflowBufferDataContext, (value) => value);
    return null;
  };

  beforeEach(async () => {
    dom = new JSDOM('<!doctype html><div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    root = createRoot(document.getElementById('root')!);
    const props = { basicNodeTemplates: [], children: createElement(Consumer) };
    await act(async () => {
      root.render(createElement(WorkflowInitContextProvider, props));
    });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reads current branch values through the stable node lookup used by handle checks', async () => {
    const source = node('Branch', 'branch');
    source.data.flowNodeType = FlowNodeTypeEnum.ifElseNode;
    source.data.inputs = [
      {
        key: NodeInputKeyEnum.ifElseList,
        label: '',
        renderTypeList: [],
        value: [{ branchId: 'before' }]
      }
    ];
    const target = node('Target', 'target');
    target.data.flowNodeType = FlowNodeTypeEnum.chatNode;
    await act(async () => state.replaceWorkflowData({ nodes: [source, target], edges: [] }));
    const lookup = state.getNodeById;
    await act(async () =>
      state.setNodes((nodes) =>
        nodes.map((node) =>
          node.id === 'branch'
            ? {
                ...node,
                data: {
                  ...node.data,
                  inputs: node.data.inputs.map((input) => ({
                    ...input,
                    value: [{ branchId: 'after' }]
                  }))
                }
              }
            : node
        )
      )
    );
    expect(state.getNodeById).toBe(lookup);
    for (const [key, allowed] of [
      ['before', false],
      ['after', true]
    ] as const) {
      expect(
        checkExecutionConnection({
          connection: {
            source: 'branch',
            sourceHandle: `branch-source-${key}`,
            target: 'target',
            targetHandle: 'target-target-left'
          },
          edges: [],
          getNodeById: lookup
        }).allowed
      ).toBe(allowed);
    }
  });

  it('assigns distinct revisions to batched replacements even when their node IDs are identical', async () => {
    const versions: number[] = [];
    await act(async () => {
      versions.push(state.replaceWorkflowData({ nodes: [node('first')], edges: [] }));
      versions.push(
        state.replaceWorkflowData({
          nodes: [node('second')],
          edges: [{ id: 'latest-edge', source: 'same-id', target: 'same-id' }]
        })
      );
    });
    expect(versions).toEqual([1, 2]);
    expect(state.workflowDataRevision).toBe(2);
    expect(state.getNodes()[0].data.name).toBe('second');
    expect(state.getNodeById('same-id')?.name).toBe('second');
    expect(state.getEdges()).toEqual(state.edges);
    expect(state.getEdges().map(({ id }) => id)).toEqual(['latest-edge']);
  });

  it('keeps ordinary node and edge edits on the current revision and clears both on replacement', async () => {
    await act(async () => state.replaceWorkflowData({ nodes: [node('original')], edges: [] }));
    await act(async () => {
      state.setNodes((nodes) =>
        nodes.map((item) => ({ ...item, data: { ...item.data, name: 'edited' } }))
      );
      state.setEdges([{ id: 'edited-edge', source: 'same-id', target: 'same-id' }]);
    });
    expect(state.workflowDataRevision).toBe(1);
    expect(state.getNodes()[0].data.name).toBe('edited');
    expect(state.getEdges()[0].id).toBe('edited-edge');
    await act(async () => state.replaceWorkflowData({ nodes: [], edges: [] }));
    expect(state.workflowDataRevision).toBe(2);
    expect(state.getNodes()).toEqual([]);
    expect(state.getEdges()).toEqual([]);
    expect(state.getNodeById('same-id')).toBeUndefined();
  });

  it('preserves loop membership, tool attachment and editor flags across complete replacements', async () => {
    const loop = node('Loop', 'loop');
    loop.data.flowNodeType = FlowNodeTypeEnum.loopRun;
    const child = node('Child', 'child');
    child.data.parentNodeId = 'loop';
    child.data.isFolded = true;
    child.selected = true;
    child.data.inputs = [
      { key: 'query', label: 'Query', renderTypeList: [], value: 'saved input' }
    ];
    child.data.outputs = [
      { id: 'out', key: 'out', label: 'Output', type: FlowNodeOutputTypeEnum.static }
    ];
    const caller = node('Tools', 'caller');
    caller.data.flowNodeType = FlowNodeTypeEnum.toolCall;
    await act(async () =>
      state.replaceWorkflowData({
        nodes: [node('Start'), loop, child, caller],
        edges: [
          {
            id: 'tool',
            source: 'caller',
            target: 'child',
            targetHandle: NodeOutputKeyEnum.selectedTools
          }
        ]
      })
    );
    expect(state.childrenNodeIdListMap).toEqual({ loop: ['child'] });
    expect(state.hasLoopRunNode).toBe(true);
    expect(state.hasToolNode).toBe(true);
    expect(state.toolNodesMap).toEqual({ child: true });
    expect(state.foldedNodesMap).toEqual({ child: true });
    expect(state.getNodes().find(({ id }) => id === 'child')).toMatchObject({
      selected: true,
      zIndex: 1001
    });
    expect(state.getNodeById('child')?.inputs[0].value).toBe('saved input');
    expect(state.getNodeById('child', ({ parentNodeId }) => parentNodeId === 'loop')).toBeDefined();
    expect(state.getNodeById('child', () => false)).toBeUndefined();
    expect(state.getNodeById(undefined)).toBeUndefined();
  });
});
