import { describe, expect, it } from 'vitest';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  isLegacyV1Workflow,
  migrateWorkflowToCurrent
} from '@fastgpt/global/core/workflow/migration/migrate';
import { migrateLegacyWorkflowStructureData } from '@fastgpt/global/core/workflow/migration/legacy/structure';

describe('workflow migration V1 detection', () => {
  it.each([
    ['missing flowType', { moduleId: 'legacy-module' }],
    ['invalid nodeId', { moduleId: 'legacy-module', nodeId: null }],
    ['partially damaged nodeId', { moduleId: 'legacy-module', nodeId: 42, flowType: null }]
  ])('detects V1 payload with %s', (_, node) => {
    expect(isLegacyV1Workflow([node])).toBe(true);
    expect(() => migrateWorkflowToCurrent({ nodes: [node], edges: [] })).toThrow(
      'V1 workflows are no longer supported'
    );
  });

  it('accepts a normal current payload', () => {
    const workflow = migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'current-node',
          name: 'Answer',
          flowNodeType: FlowNodeTypeEnum.answerNode,
          inputs: [],
          outputs: []
        }
      ],
      edges: []
    });

    expect(isLegacyV1Workflow(workflow.nodes)).toBe(false);
    expect(workflow.nodes[0]).toMatchObject({
      nodeId: 'current-node',
      flowNodeType: FlowNodeTypeEnum.answerNode,
      inputs: [],
      outputs: []
    });
  });
});

describe('legacy workflow structure migration', () => {
  it('repairs node identity, type, inputs, outputs, and empty-node fallback', () => {
    const { nodes } = migrateLegacyWorkflowStructureData({
      nodes: [
        {
          moduleId: 'module-node',
          flowNodeType: FlowNodeTypeEnum.answerNode,
          inputs: [null],
          outputs: [null]
        },
        {
          nodeId: 'damaged-node',
          flowNodeType: 'unknown-node-type',
          inputs: 'damaged',
          outputs: 'damaged'
        },
        null
      ],
      edges: [],
      chatConfig: undefined
    });

    expect(nodes[0]).toMatchObject({
      nodeId: 'module-node',
      flowNodeType: FlowNodeTypeEnum.answerNode,
      inputs: [
        {
          key: 'inputs_0',
          label: 'inputs_0',
          renderTypeList: [FlowNodeInputTypeEnum.reference]
        }
      ],
      outputs: [
        {
          key: 'outputs_0',
          id: 'outputs_0',
          label: 'outputs_0',
          type: FlowNodeOutputTypeEnum.static
        }
      ]
    });
    expect(nodes[1]).toMatchObject({
      nodeId: 'damaged-node',
      flowNodeType: FlowNodeTypeEnum.emptyNode,
      inputs: [],
      outputs: []
    });
    expect(nodes[2]).toEqual({
      nodeId: 'legacy-2',
      name: FlowNodeTypeEnum.emptyNode,
      flowNodeType: FlowNodeTypeEnum.emptyNode,
      inputs: [],
      outputs: []
    });
  });
});
