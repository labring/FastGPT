import { describe, expect, it } from 'vitest';
import {
  CanonicalFlowNodeInputItemSchema,
  LegacyFlowNodeInputItemSchema,
  migrateAgentToolInputConfigToCurrent,
  migrateFlowNodeInputToCurrent,
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
});
