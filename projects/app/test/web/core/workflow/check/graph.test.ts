import { describe, expect, it } from 'vitest';
import {
  createWorkflowCheckContext,
  checkWorkflowNodeConnections,
  referenceValueIsLive
} from '@/web/core/workflow/check/graph';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import { getHandleId } from '@fastgpt/global/common/workflow/reference';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';

const start: FlowNodeItemType = {
  id: 'start',
  nodeId: 'start',
  name: 'Start',
  flowNodeType: FlowNodeTypeEnum.workflowStart,
  inputs: [],
  outputs: []
};
const target: FlowNodeItemType = {
  id: 'target',
  nodeId: 'target',
  name: 'Target',
  flowNodeType: FlowNodeTypeEnum.answerNode,
  inputs: [],
  outputs: []
};

describe('createWorkflowCheckContext', () => {
  it('ignores deleted branch handles when determining downstream reachability', () => {
    const select: FlowNodeItemType = {
      id: 'select',
      nodeId: 'select',
      name: 'Select',
      flowNodeType: FlowNodeTypeEnum.userSelect,
      inputs: [
        {
          key: NodeInputKeyEnum.userSelectOptions,
          label: 'Options',
          renderTypeList: [FlowNodeInputTypeEnum.input],
          value: [{ key: 'current', value: 'Current' }]
        }
      ],
      outputs: []
    };
    const edges = [
      { source: 'start', target: 'select' },
      {
        source: 'select',
        target: 'target',
        sourceHandle: getHandleId('select', 'source', 'deleted')
      }
    ];
    const context = createWorkflowCheckContext({ nodes: [start, select, target], edges });
    expect(context.reachableNodeSet.has('target')).toBe(false);
    expect(checkWorkflowNodeConnections({ data: target, context })).toEqual([
      { code: 'no_upstream' }
    ]);
    edges[1].sourceHandle = getHandleId('select', 'source', 'current');
    const valid = createWorkflowCheckContext({ nodes: [start, select, target], edges });
    expect(valid.reachableNodeSet.has('target')).toBe(true);
    expect(checkWorkflowNodeConnections({ data: target, context: valid })).toEqual([]);
  });
  it('handles cyclic graphs and checks live output references without rebuilding a node ID list', () => {
    const source: FlowNodeItemType = {
      ...target,
      outputs: [
        { id: 'output', key: 'output', label: 'Output', type: FlowNodeOutputTypeEnum.static }
      ]
    };
    const context = createWorkflowCheckContext({
      nodes: [start, source],
      edges: [
        { source: 'start', target: 'target' },
        { source: 'target', target: 'start' }
      ]
    });
    expect([...context.reachableNodeSet]).toEqual(['start', 'target']);
    expect(referenceValueIsLive(['target', 'output'], context)).toBe(true);
    expect(referenceValueIsLive(['target', 'deleted'], context)).toBe(false);
    expect(referenceValueIsLive(['missing', 'output'], context)).toBe(false);
    expect(referenceValueIsLive([VARIABLE_NODE_ID, 'global'], context)).toBe(true);
    expect(referenceValueIsLive(null, context)).toBe(false);
  });
});
