import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { replaceEditorVariable } from '@fastgpt/service/core/workflow/dispatch/utils/replaceEditorVariable';

const { loggerInfoMock } = vi.hoisted(() => ({
  loggerInfoMock: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => ({
    info: loggerInfoMock
  }),
  LogCategories: {
    SYSTEM: ['system']
  }
}));

describe('replaceEditorVariable', () => {
  beforeEach(() => {
    loggerInfoMock.mockClear();
  });

  it('should return non-string values as is', () => {
    expect(replaceEditorVariable({ text: 123, nodesMap: {}, variables: {} })).toBe(123);
    expect(replaceEditorVariable({ text: null, nodesMap: {}, variables: {} })).toBe(null);
  });

  it('should return empty string as is', () => {
    expect(replaceEditorVariable({ text: '', nodesMap: {}, variables: {} })).toBe('');
  });

  it('should replace global variables', () => {
    const result = replaceEditorVariable({
      text: 'Hello {{name}}',
      nodesMap: {},
      variables: { name: 'World' }
    });
    expect(result).toBe('Hello World');
  });

  it('should return strings without placeholders before reading variables', () => {
    let stringifyCount = 0;
    const result = replaceEditorVariable({
      text: 'plain text',
      nodesMap: {},
      variables: {
        unused: {
          toJSON() {
            stringifyCount += 1;
            return { value: 'unused' };
          }
        }
      }
    });

    expect(result).toBe('plain text');
    expect(stringifyCount).toBe(0);
  });

  it('should not stringify unused global variables when replacing node references', () => {
    let stringifyCount = 0;
    const nodesMap: Record<string, RuntimeNodeItemType> = {
      node1: {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          {
            id: 'out1',
            key: 'output1',
            type: FlowNodeOutputTypeEnum.static,
            value: 'outputValue',
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      }
    };

    const result = replaceEditorVariable({
      text: 'Result: {{$node1.out1$}}',
      nodesMap,
      variables: {
        unused: {
          toJSON() {
            stringifyCount += 1;
            return { value: 'unused' };
          }
        }
      }
    });

    expect(result).toBe('Result: outputValue');
    expect(stringifyCount).toBe(0);
  });

  it('should replace node output variables', () => {
    const nodesMap: Record<string, RuntimeNodeItemType> = {
      node1: {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          {
            id: 'out1',
            key: 'output1',
            type: FlowNodeOutputTypeEnum.static,
            value: 'outputValue',
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      }
    };
    const result = replaceEditorVariable({
      text: 'Result: {{$node1.out1$}}',
      nodesMap,
      variables: {}
    });
    expect(result).toBe('Result: outputValue');
  });

  it('should replace VARIABLE_NODE_ID variables', () => {
    const result = replaceEditorVariable({
      text: `Value: {{$${VARIABLE_NODE_ID}.myVar$}}`,
      nodesMap: {},
      variables: { myVar: 'varValue' }
    });
    expect(result).toBe('Value: varValue');
  });

  it('should handle nested variable replacement', () => {
    const nodesMap: Record<string, RuntimeNodeItemType> = {
      node1: {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          {
            id: 'out1',
            key: 'output1',
            type: FlowNodeOutputTypeEnum.static,
            value: '{{$node2.out2$}}',
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      },
      node2: {
        nodeId: 'node2',
        name: 'test2',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          {
            id: 'out2',
            key: 'output2',
            type: FlowNodeOutputTypeEnum.static,
            value: 'finalValue',
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      }
    };
    const result = replaceEditorVariable({
      text: 'Result: {{$node1.out1$}}',
      nodesMap,
      variables: {}
    });
    expect(result).toBe('Result: finalValue');
  });

  it('should handle circular reference protection', () => {
    const nodesMap: Record<string, RuntimeNodeItemType> = {
      node1: {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          {
            id: 'out1',
            key: 'output1',
            type: FlowNodeOutputTypeEnum.static,
            value: '{{$node1.out1$}}',
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      }
    };
    const result = replaceEditorVariable({
      text: 'Result: {{$node1.out1$}}',
      nodesMap,
      variables: {}
    });
    expect(result).toBe('Result: {{$node1.out1$}}');
  });

  it('should stop node reference replacement rounds when the result exceeds the system string limit', async () => {
    vi.resetModules();
    const text = 'Result: {{$node1.out1$}}';
    vi.doMock('@fastgpt/service/env', () => ({
      SYSTEM_MAX_STRING_LENGTH: text.length
    }));
    const { replaceEditorVariable: replaceEditorVariableWithSmallLimit } =
      await import('@fastgpt/service/core/workflow/dispatch/utils/replaceEditorVariable');
    const nodesMap: Record<string, RuntimeNodeItemType> = {
      node1: {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          {
            id: 'out1',
            key: 'output1',
            type: FlowNodeOutputTypeEnum.static,
            value: 'x'.repeat(text.length + 1),
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      }
    };

    expect(
      replaceEditorVariableWithSmallLimit({
        text,
        nodesMap,
        variables: {}
      })
    ).toBe(`Result: ${'x'.repeat(text.length + 1)}`);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      'Oversize string detected during synchronous string processing',
      {
        source: 'replaceEditorVariable',
        reason: 'node_reference_result',
        length: text.length + 9,
        maxLength: text.length
      }
    );

    vi.doUnmock('@fastgpt/service/env');
    vi.resetModules();
  });

  it('should handle node input as variable source', () => {
    const nodesMap: Record<string, RuntimeNodeItemType> = {
      node1: {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [{ key: 'myInput', label: '', renderTypeList: [], value: 'inputValue' }],
        outputs: []
      }
    };
    const result = replaceEditorVariable({
      text: 'Input: {{$node1.myInput$}}',
      nodesMap,
      variables: {}
    });
    expect(result).toBe('Input: inputValue');
  });

  it('should convert object values to string', () => {
    const nodesMap: Record<string, RuntimeNodeItemType> = {
      node1: {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          {
            id: 'out1',
            key: 'output1',
            type: FlowNodeOutputTypeEnum.static,
            value: { a: 1 },
            valueType: WorkflowIOValueTypeEnum.object
          }
        ]
      }
    };
    const result = replaceEditorVariable({
      text: 'Object: {{$node1.out1$}}',
      nodesMap,
      variables: {}
    });
    expect(result).toBe('Object: {"a":1}');
  });

  it('should keep old empty-string behavior when node not found', () => {
    const result = replaceEditorVariable({
      text: '{{$nonexistent.out$}}',
      nodesMap: {},
      variables: {}
    });
    expect(result).toBe('');
  });

  it('should skip duplicate variable pattern in the same text', () => {
    const nodesMap: Record<string, RuntimeNodeItemType> = {
      node1: {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          {
            id: 'out1',
            key: 'output1',
            type: FlowNodeOutputTypeEnum.static,
            value: 'val',
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      }
    };
    const result = replaceEditorVariable({
      text: '{{$node1.out1$}} and {{$node1.out1$}}',
      nodesMap,
      variables: {}
    });
    expect(result).toBe('val and val');
  });

  it('should support Map as nodesMap', () => {
    const nodesMap = new Map<string, RuntimeNodeItemType>([
      [
        'node1',
        {
          nodeId: 'node1',
          name: 'test',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          inputs: [],
          outputs: [
            {
              id: 'out1',
              key: 'output1',
              type: FlowNodeOutputTypeEnum.static,
              value: 'mapValue',
              valueType: WorkflowIOValueTypeEnum.string
            }
          ]
        }
      ]
    ]);
    const result = replaceEditorVariable({
      text: 'Result: {{$node1.out1$}}',
      nodesMap,
      variables: {}
    });
    expect(result).toBe('Result: mapValue');
  });

  it('should handle $ special characters in variable values literally', () => {
    const result1 = replaceEditorVariable({
      text: `Value: {{$${VARIABLE_NODE_ID}.myVar$}}`,
      nodesMap: {},
      variables: { myVar: '$& some text' }
    });
    expect(result1).toBe('Value: $& some text');

    const result2 = replaceEditorVariable({
      text: `Price: {{$${VARIABLE_NODE_ID}.price$}}`,
      nodesMap: {},
      variables: { price: '$100' }
    });
    expect(result2).toBe('Price: $100');

    const result3 = replaceEditorVariable({
      text: `Code: {{$${VARIABLE_NODE_ID}.code$}}`,
      nodesMap: {},
      variables: { code: '$$' }
    });
    expect(result3).toBe('Code: $$');
  });
});
