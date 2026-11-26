import { describe, expect, it } from 'vitest';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  isLegacyV1Workflow,
  migrateWorkflowToCurrent
} from '@fastgpt/global/common/workflow/migration';
import { migrateStoreWorkflow } from '@fastgpt/global/common/workflow/editor/protocol';
import { createWorkflowEditor } from '@fastgpt/global/common/workflow/editor/runtime/runtime';
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

describe('workflow reference snapshot migration', () => {
  const referenceSnapshots = [
    {
      reference: ['deleted-node', 'output'] as [string, string],
      sourceLabel: 'Deleted node'
    }
  ];

  it('round-trips snapshots and defaults missing snapshots for legacy input', () => {
    expect(
      migrateStoreWorkflow({ nodes: [], edges: [], referenceSnapshots }).referenceSnapshots
    ).toEqual(referenceSnapshots);
    expect(migrateStoreWorkflow({ nodes: [], edges: [] }).referenceSnapshots).toEqual([]);
  });

  it('preserves snapshots and removes canvas measurement inputs', () => {
    const result = migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'loop-node',
          flowNodeType: FlowNodeTypeEnum.loopRun,
          name: 'Loop',
          inputs: [
            {
              key: NodeInputKeyEnum.nodeWidth,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              valueType: WorkflowIOValueTypeEnum.number,
              value: 900
            },
            {
              key: NodeInputKeyEnum.nodeHeight,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              valueType: WorkflowIOValueTypeEnum.number,
              value: 600
            },
            {
              key: NodeInputKeyEnum.nestedNodeInputHeight,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              valueType: WorkflowIOValueTypeEnum.number,
              value: 120
            },
            {
              key: NodeInputKeyEnum.forbidStream,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.switch],
              valueType: WorkflowIOValueTypeEnum.boolean,
              value: false
            }
          ],
          outputs: []
        }
      ],
      edges: [],
      referenceSnapshots
    });

    expect(result.referenceSnapshots).toEqual(referenceSnapshots);
    expect(result.nodes[0].inputs.map((input) => input.key)).toEqual([
      NodeInputKeyEnum.forbidStream
    ]);
  });
});

describe('canvas measurement migration', () => {
  it('keeps same-named business inputs through migration and editor writes', () => {
    const businessInput = {
      key: NodeInputKeyEnum.nodeWidth,
      label: 'Width',
      renderTypeList: [FlowNodeInputTypeEnum.numberInput],
      valueType: WorkflowIOValueTypeEnum.number,
      canEdit: true,
      canAgentGenerated: false,
      value: 100
    };
    const sizeInput = {
      key: NodeInputKeyEnum.nodeHeight,
      label: '',
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.number,
      value: 500
    };
    const workflow = migrateWorkflowToCurrent({
      nodes: [FlowNodeTypeEnum.code, FlowNodeTypeEnum.loopRun].map((type) => ({
        nodeId: type,
        flowNodeType: type,
        name: type,
        inputs: [businessInput, sizeInput],
        outputs: []
      }))
    });

    expect(workflow.nodes.map((node) => node.inputs)).toMatchObject([
      [businessInput, sizeInput],
      [businessInput]
    ]);

    const editor = createWorkflowEditor(workflow);
    expect(editor.getWorkflowData().nodes.map((node) => node.inputs)).toMatchObject([
      [businessInput, sizeInput],
      [businessInput]
    ]);

    const updatedInput = { ...businessInput, value: 200 };
    expect(
      editor.dispatch({
        type: 'updateNode',
        nodeId: FlowNodeTypeEnum.code,
        patch: { inputs: [updatedInput, sizeInput] }
      }).ok
    ).toBe(true);
    expect(editor.getWorkflowData().nodes[0].inputs).toMatchObject([updatedInput, sizeInput]);
  });
});

describe('Agent tool input migration', () => {
  it('normalizes legacy NodeIO snapshots and derives modes from config', () => {
    const legacyInputs = [
      {
        key: 'query',
        label: 'Query',
        renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.input],
        selectedTypeIndex: 0,
        customJsonSchema: { type: 'string' },
        required: true,
        value: 'agent generated'
      },
      {
        key: 'fixed',
        label: 'Fixed',
        renderTypeList: [FlowNodeInputTypeEnum.input],
        selectedType: FlowNodeInputTypeEnum.input,
        value: 'saved from snapshot',
        defaultValue: 'default from snapshot',
        inputList: [{ key: 'secret', label: 'Secret', inputType: 'secret' }]
      }
    ];
    const workflow = migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'agent',
          flowNodeType: FlowNodeTypeEnum.agent,
          name: 'Agent',
          inputs: [
            {
              key: NodeInputKeyEnum.selectedTools,
              label: 'Tools',
              renderTypeList: [FlowNodeInputTypeEnum.selectTool],
              value: [
                {
                  id: 'tool',
                  config: {},
                  inputs: legacyInputs
                },
                {
                  id: 'config-only-tool',
                  config: { fixed: 'saved', empty: null }
                }
              ]
            }
          ],
          outputs: []
        }
      ],
      edges: []
    });
    const tools = workflow.nodes[0].inputs[0].value as Array<{
      inputs: unknown[];
      config: Record<string, unknown>;
    }>;

    expect(tools[0].inputs).toEqual([
      { key: 'query', mode: 'agentGenerated' },
      { key: 'fixed', mode: 'manual' }
    ]);
    expect(legacyInputs[0]).toHaveProperty('customJsonSchema');
    expect(legacyInputs[1]).toHaveProperty('inputList');
    expect(tools[0]).not.toHaveProperty('inputs.0.label');
    expect(tools[0].config).toEqual({ fixed: 'saved from snapshot' });
    expect(tools[1].inputs).toEqual([
      { key: 'fixed', mode: 'manual' },
      { key: 'empty', mode: 'agentGenerated' }
    ]);
  });
});
