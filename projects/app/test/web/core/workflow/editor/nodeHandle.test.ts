import { describe, expect, it } from 'vitest';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  getNodeShellHandleModel,
  type NodeShellHandleData
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/utils/nodeHandle';

const createNode = (patch: Partial<NodeShellHandleData> = {}): NodeShellHandleData => ({
  nodeId: 'node-1',
  flowNodeType: FlowNodeTypeEnum.emptyNode,
  inputs: [],
  outputs: [],
  ...patch
});

describe('workflow shell handle topology', () => {
  it('keeps branch handle ids identical to the full if/else node', () => {
    const model = getNodeShellHandleModel(
      createNode({
        flowNodeType: FlowNodeTypeEnum.ifElseNode,
        inputs: [
          {
            key: NodeInputKeyEnum.ifElseList,
            value: [
              {
                branchId: 'branch-a',
                condition: 'AND',
                list: []
              }
            ]
          }
        ]
      })
    );

    expect(model.replacesDefaultSource).toBe(true);
    expect(model.sourceHandles.map((handle) => handle.handleId)).toEqual([
      'node-1-source-branch-a',
      'node-1-source-ELSE'
    ]);
  });

  it('keeps option, source output and catch handles', () => {
    const model = getNodeShellHandleModel(
      createNode({
        flowNodeType: FlowNodeTypeEnum.userSelect,
        catchError: true,
        inputs: [
          {
            key: NodeInputKeyEnum.userSelectOptions,
            value: [{ key: 'option-a' }, { key: 'option-b' }]
          }
        ],
        outputs: [
          {
            key: 'custom-output',
            type: FlowNodeOutputTypeEnum.source,
            label: 'Custom output'
          }
        ]
      })
    );

    expect(model.sourceHandles.map((handle) => handle.handleId)).toEqual([
      'node-1-source-option-a',
      'node-1-source-option-b',
      'node-1-source-custom-output'
    ]);
    expect(model.hasCatchSource).toBe(true);
  });
});
