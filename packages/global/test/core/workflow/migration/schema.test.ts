import { describe, expect, it } from 'vitest';
import {
  CanonicalFlowNodeInputItemSchema,
  LegacyFlowNodeInputItemSchema,
  migrateAgentToolInputConfigToCurrent,
  migrateFlowNodeInputToCurrent,
  migrateLegacyWorkflowHttpToolInputsDefaultMode,
  migrateWorkflowToCurrent
} from '@fastgpt/global/core/workflow/migration';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const inputWithLegacyIndex = {
  key: 'query',
  label: 'Query',
  renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
  selectedTypeIndex: 1
};

describe('workflow input schema boundaries', () => {
  it('accepts the historical index only through the Legacy schema', () => {
    expect(LegacyFlowNodeInputItemSchema.parse(inputWithLegacyIndex)).toMatchObject({
      selectedTypeIndex: 1
    });
    expect(CanonicalFlowNodeInputItemSchema.parse(inputWithLegacyIndex)).not.toHaveProperty(
      'selectedTypeIndex'
    );
  });

  it('keeps current selectedType in canonical data', () => {
    const input = CanonicalFlowNodeInputItemSchema.parse({
      key: 'query',
      label: 'Query',
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
      selectedType: FlowNodeInputTypeEnum.reference
    });

    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.reference);
    expect(input).not.toHaveProperty('selectedTypeIndex');
  });
});

describe('workflow v0 to v1 migration', () => {
  it('derives selectedType and drops the legacy index', () => {
    const result = migrateFlowNodeInputToCurrent(inputWithLegacyIndex);
    expect(result.selectedType).toBe(FlowNodeInputTypeEnum.reference);
    expect(result).not.toHaveProperty('selectedTypeIndex');
  });

  it('accepts legacy inputs without renderTypeList and emits an empty list', () => {
    const result = migrateFlowNodeInputToCurrent({
      key: 'query',
      label: 'Query',
      selectedTypeIndex: 0
    } as any);
    expect(result.renderTypeList).toEqual([]);
    expect(result).not.toHaveProperty('selectedTypeIndex');
  });

  it('keeps explicit selectedType and falsy values', () => {
    const result = migrateFlowNodeInputToCurrent({
      ...inputWithLegacyIndex,
      selectedType: FlowNodeInputTypeEnum.input,
      value: false,
      valueDesc: '',
      selectedTypeIndex: 1
    });
    expect(result.selectedType).toBe(FlowNodeInputTypeEnum.input);
    expect(result.value).toBe(false);
    expect(result.valueDesc).toBe('');
  });

  it('normalizes legacy Agent snapshots to key and mode', () => {
    expect(
      migrateAgentToolInputConfigToCurrent({
        key: 'query',
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
        selectedTypeIndex: 1,
        value: 0
      } as any)
    ).toEqual({ key: 'query', mode: 'agentGenerated' });
  });

  it('restores legacy toolDescription defaults for tool nodes', () => {
    const [input] = migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'tool-1',
          flowNodeType: 'pluginModule',
          pluginId: 'commercial-test-tool',
          name: 'Tool',
          inputs: [
            {
              key: 'query',
              label: 'Query',
              toolDescription: 'Query from user',
              renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
              selectedTypeIndex: 0
            }
          ],
          outputs: []
        }
      ],
      edges: [
        {
          source: 'agent-1',
          target: 'tool-1',
          sourceHandle: '',
          targetHandle: 'selectedTools'
        }
      ]
    } as any).nodes[0].inputs;

    expect(input).toMatchObject({
      selectedType: FlowNodeInputTypeEnum.agentGenerated,
      renderTypeList: [
        FlowNodeInputTypeEnum.agentGenerated,
        FlowNodeInputTypeEnum.input,
        FlowNodeInputTypeEnum.reference
      ]
    });
  });

  it('restores legacy HTTP tool input default mode', () => {
    const [input] = migrateLegacyWorkflowHttpToolInputsDefaultMode([
      {
        key: 'query',
        label: 'Query',
        canEdit: true,
        toolDescription: 'Query from user',
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
      }
    ]);

    expect(input.isToolParam).toBe(true);
  });

  it('is idempotent for workflow data', () => {
    const input = {
      nodes: [
        {
          nodeId: 'node-1',
          flowNodeType: 'workflowStart',
          name: 'Start',
          inputs: [inputWithLegacyIndex],
          outputs: []
        }
      ],
      edges: []
    } as any;
    const first = migrateWorkflowToCurrent(input);
    expect(migrateWorkflowToCurrent(first as any)).toEqual(first);
  });

  it('does not change an already canonical Agent resource selection', () => {
    const input = {
      nodes: [
        {
          nodeId: 'agent-1',
          flowNodeType: 'agent',
          name: 'Agent',
          inputs: [
            {
              key: 'selectedTools',
              label: 'Selected tools',
              renderTypeList: [FlowNodeInputTypeEnum.selectTool, FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              value: ['source-node', 'tools']
            }
          ],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {}
    };

    expect(migrateWorkflowToCurrent(input as any)).toEqual(input);
  });
});
