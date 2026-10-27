import { describe, expect, it } from 'vitest';
import {
  areWorkflowValueTypesCompatible,
  getWorkflowReferenceSourceValueTypes,
  getSelectedInputRenderType,
  nodeInputIsReference,
  isValidReferenceValueFormat,
  isValidReferenceValue,
  isValidArrayReferenceValue,
  getHandleId,
  getWorkflowReferenceSourceNodes
} from '@fastgpt/global/common/workflow/reference';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  VARIABLE_NODE_ID
} from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

describe('getWorkflowReferenceSourceNodes', () => {
  it('keeps nearest sources first and ignores missing, self and cross-scope edges', () => {
    const nodes = new Map(
      ['target', 'direct', 'ancestor', 'foreign'].map((nodeId) => [
        nodeId,
        {
          nodeId,
          name: nodeId,
          flowNodeType: FlowNodeTypeEnum.code,
          parentNodeId: nodeId === 'foreign' ? 'other' : undefined,
          inputs: [],
          outputs: []
        } satisfies StoreNodeItemType
      ])
    );
    const params = {
      nodeId: 'target',
      getNodeById: (id: string) => nodes.get(id),
      edges: [
        { source: 'ancestor', target: 'direct' },
        { source: 'direct', target: 'target' },
        { source: 'target', target: 'ancestor' },
        { source: 'missing', target: 'target' },
        { source: 'foreign', target: 'target' }
      ]
    };
    expect(getWorkflowReferenceSourceNodes(params).map((node) => node.nodeId)).toEqual([
      'direct',
      'ancestor'
    ]);
    expect(getWorkflowReferenceSourceNodes({ ...params, nodeId: 'missing' })).toEqual([]);
  });
});

describe('nodeInputIsReference', () => {
  it('should use the canonical selectedType', () => {
    const input: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
      selectedType: FlowNodeInputTypeEnum.reference
    };

    expect(getSelectedInputRenderType(input)).toBe(FlowNodeInputTypeEnum.reference);
    expect(nodeInputIsReference(input)).toBe(true);
  });

  it('should return false when renderTypeList first item is not reference', () => {
    const input: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      renderTypeList: [FlowNodeInputTypeEnum.input]
    };
    expect(nodeInputIsReference(input)).toBe(false);
  });

  it('should return false when the current selected type is not a reference', () => {
    const input: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
      selectedType: FlowNodeInputTypeEnum.input
    };
    expect(nodeInputIsReference(input)).toBe(false);
  });

  it('should return false when renderTypeList is undefined', () => {
    const input = {
      key: 'test',
      label: 'Test'
    } as FlowNodeInputItemType;
    expect(nodeInputIsReference(input)).toBe(false);
  });

  it('should default to the first current render type when selectedType is absent', () => {
    const input: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input]
    };
    expect(nodeInputIsReference(input)).toBe(true);
  });

  it('should treat settingDatasetQuotePrompt as reference', () => {
    const input: FlowNodeInputItemType = {
      key: NodeInputKeyEnum.aiChatDatasetQuote,
      label: 'Dataset quote',
      renderTypeList: [FlowNodeInputTypeEnum.settingDatasetQuotePrompt],
      valueType: WorkflowIOValueTypeEnum.datasetQuote
    };
    expect(nodeInputIsReference(input)).toBe(true);
  });
});

describe('isValidReferenceValueFormat', () => {
  it('should return true for valid reference format [string, string]', () => {
    expect(isValidReferenceValueFormat(['nodeId', 'outputKey'])).toBe(true);
  });

  it('should return true for reference with optional second element', () => {
    expect(isValidReferenceValueFormat(['nodeId', undefined])).toBe(true);
  });

  it('should return false for non-array values', () => {
    expect(isValidReferenceValueFormat('not an array')).toBe(false);
    expect(isValidReferenceValueFormat(123)).toBe(false);
    expect(isValidReferenceValueFormat(null)).toBe(false);
    expect(isValidReferenceValueFormat(undefined)).toBe(false);
    expect(isValidReferenceValueFormat({})).toBe(false);
  });

  it('should return false for array with wrong length', () => {
    expect(isValidReferenceValueFormat(['single'])).toBe(false);
    expect(isValidReferenceValueFormat(['one', 'two', 'three'])).toBe(false);
    expect(isValidReferenceValueFormat([])).toBe(false);
  });

  it('should return false when first element is not string', () => {
    expect(isValidReferenceValueFormat([123, 'outputKey'])).toBe(false);
    expect(isValidReferenceValueFormat([null, 'outputKey'])).toBe(false);
  });
});

describe('isValidReferenceValue', () => {
  const nodeIds = ['node1', 'node2', 'node3'];

  it('should return true for valid reference with existing nodeId', () => {
    expect(isValidReferenceValue(['node1', 'output'], nodeIds)).toBe(true);
    expect(isValidReferenceValue(['node2', 'output'], nodeIds)).toBe(true);
  });

  it('should return true for VARIABLE_NODE_ID reference', () => {
    expect(isValidReferenceValue([VARIABLE_NODE_ID, 'varKey'], nodeIds)).toBe(true);
  });

  it('should return false for non-existent nodeId', () => {
    expect(isValidReferenceValue(['nonExistent', 'output'], nodeIds)).toBe(false);
  });

  it('should return false for invalid format', () => {
    expect(isValidReferenceValue('not an array', nodeIds)).toBe(false);
    expect(isValidReferenceValue(['single'], nodeIds)).toBe(false);
  });

  it('should handle empty nodeIds array', () => {
    expect(isValidReferenceValue(['node1', 'output'], [])).toBe(false);
    expect(isValidReferenceValue([VARIABLE_NODE_ID, 'varKey'], [])).toBe(true);
  });
});

describe('isValidArrayReferenceValue', () => {
  const nodeIds = ['node1', 'node2'];

  it('should return true for valid array of references', () => {
    const value = [
      ['node1', 'output1'],
      ['node2', 'output2']
    ];
    expect(isValidArrayReferenceValue(value, nodeIds)).toBe(true);
  });

  it('should return true for empty array', () => {
    expect(isValidArrayReferenceValue([], nodeIds)).toBe(true);
  });

  it('should return false for non-array value', () => {
    expect(isValidArrayReferenceValue('not an array', nodeIds)).toBe(false);
    expect(isValidArrayReferenceValue(null, nodeIds)).toBe(false);
  });

  it('should return false if any element is invalid', () => {
    const value = [
      ['node1', 'output1'],
      ['nonExistent', 'output2']
    ];
    expect(isValidArrayReferenceValue(value, nodeIds)).toBe(false);
  });

  it('should return true when all elements reference VARIABLE_NODE_ID', () => {
    const value = [
      [VARIABLE_NODE_ID, 'var1'],
      [VARIABLE_NODE_ID, 'var2']
    ];
    expect(isValidArrayReferenceValue(value, [])).toBe(true);
  });
});

describe('getHandleId', () => {
  it('should return correct handle id for source type', () => {
    const result = getHandleId('node1', 'source', 'output1');
    expect(result).toBe('node1-source-output1');
  });

  it('should return correct handle id for source_catch type', () => {
    const result = getHandleId('node2', 'source_catch', 'error');
    expect(result).toBe('node2-source_catch-error');
  });

  it('should return correct handle id for target type', () => {
    const result = getHandleId('node3', 'target', 'input1');
    expect(result).toBe('node3-target-input1');
  });

  it('should handle empty strings', () => {
    const result = getHandleId('', 'source', '');
    expect(result).toBe('-source-');
  });
});

describe('getWorkflowReferenceSourceValueTypes', () => {
  it('publishes the reference selector contract for array inputs', () => {
    expect(getWorkflowReferenceSourceValueTypes(WorkflowIOValueTypeEnum.arrayString)).toEqual([
      WorkflowIOValueTypeEnum.string,
      WorkflowIOValueTypeEnum.arrayString,
      WorkflowIOValueTypeEnum.arrayAny,
      WorkflowIOValueTypeEnum.any
    ]);
  });
});

describe('areWorkflowValueTypesCompatible', () => {
  it.each([
    [WorkflowIOValueTypeEnum.arrayString, WorkflowIOValueTypeEnum.string, true],
    [WorkflowIOValueTypeEnum.arrayString, WorkflowIOValueTypeEnum.arrayString, true],
    [WorkflowIOValueTypeEnum.arrayString, WorkflowIOValueTypeEnum.number, false],
    [WorkflowIOValueTypeEnum.arrayObject, WorkflowIOValueTypeEnum.datasetQuote, true],
    [WorkflowIOValueTypeEnum.string, WorkflowIOValueTypeEnum.arrayString, false],
    [WorkflowIOValueTypeEnum.arrayAny, WorkflowIOValueTypeEnum.string, true]
  ] as const)('checks %s input against %s source: %s', (expected, actual, compatible) => {
    expect(areWorkflowValueTypesCompatible({ expected, actual })).toBe(compatible);
  });
});
