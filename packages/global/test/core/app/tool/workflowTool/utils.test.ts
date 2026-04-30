import { describe, expect, it } from 'vitest';
import { getWorkflowToolInputsFromStoreNodes } from '@fastgpt/global/core/app/tool/workflowTool/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

describe('workflowTool utils', () => {
  describe('getWorkflowToolInputsFromStoreNodes', () => {
    it('should return inputs from pluginInput node', () => {
      const expectedInputs = [
        { key: 'input1', label: 'Input 1', valueType: 'string' },
        { key: 'input2', label: 'Input 2', valueType: 'number' }
      ];

      const nodes: StoreNodeItemType[] = [
        {
          nodeId: 'node-1',
          flowNodeType: FlowNodeTypeEnum.workflowStart,
          name: 'Start',
          inputs: [],
          outputs: [],
          position: { x: 0, y: 0 }
        },
        {
          nodeId: 'node-2',
          flowNodeType: FlowNodeTypeEnum.pluginInput,
          name: 'Plugin Input',
          inputs: expectedInputs as any,
          outputs: [],
          position: { x: 100, y: 0 }
        },
        {
          nodeId: 'node-3',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          name: 'Chat',
          inputs: [{ key: 'other', label: 'Other' }] as any,
          outputs: [],
          position: { x: 200, y: 0 }
        }
      ];

      const result = getWorkflowToolInputsFromStoreNodes(nodes);

      expect(result).toEqual(expectedInputs);
    });

    it('should return empty array when no pluginInput node exists', () => {
      const nodes: StoreNodeItemType[] = [
        {
          nodeId: 'node-1',
          flowNodeType: FlowNodeTypeEnum.workflowStart,
          name: 'Start',
          inputs: [{ key: 'start', label: 'Start Input' }] as any,
          outputs: [],
          position: { x: 0, y: 0 }
        },
        {
          nodeId: 'node-2',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          name: 'Chat',
          inputs: [{ key: 'chat', label: 'Chat Input' }] as any,
          outputs: [],
          position: { x: 100, y: 0 }
        }
      ];

      const result = getWorkflowToolInputsFromStoreNodes(nodes);

      expect(result).toEqual([]);
    });

    it('should return empty array for empty nodes array', () => {
      const result = getWorkflowToolInputsFromStoreNodes([]);
      expect(result).toEqual([]);
    });

    it('should return first pluginInput node inputs when multiple exist', () => {
      const firstInputs = [{ key: 'first', label: 'First' }];
      const secondInputs = [{ key: 'second', label: 'Second' }];

      const nodes: StoreNodeItemType[] = [
        {
          nodeId: 'node-1',
          flowNodeType: FlowNodeTypeEnum.pluginInput,
          name: 'First Plugin Input',
          inputs: firstInputs as any,
          outputs: [],
          position: { x: 0, y: 0 }
        },
        {
          nodeId: 'node-2',
          flowNodeType: FlowNodeTypeEnum.pluginInput,
          name: 'Second Plugin Input',
          inputs: secondInputs as any,
          outputs: [],
          position: { x: 100, y: 0 }
        }
      ];

      const result = getWorkflowToolInputsFromStoreNodes(nodes);

      expect(result).toEqual(firstInputs);
    });

    it('should return empty array when pluginInput has no inputs', () => {
      const nodes: StoreNodeItemType[] = [
        {
          nodeId: 'node-1',
          flowNodeType: FlowNodeTypeEnum.pluginInput,
          name: 'Empty Plugin Input',
          inputs: [],
          outputs: [],
          position: { x: 0, y: 0 }
        }
      ];

      const result = getWorkflowToolInputsFromStoreNodes(nodes);

      expect(result).toEqual([]);
    });

    it('should handle pluginInput with complex inputs', () => {
      const complexInputs = [
        {
          key: 'userInput',
          label: 'User Input',
          valueType: 'string',
          required: true,
          description: 'The user input text'
        },
        {
          key: 'options',
          label: 'Options',
          valueType: 'object',
          required: false,
          defaultValue: {}
        }
      ];

      const nodes: StoreNodeItemType[] = [
        {
          nodeId: 'node-1',
          flowNodeType: FlowNodeTypeEnum.pluginInput,
          name: 'Complex Plugin Input',
          inputs: complexInputs as any,
          outputs: [],
          position: { x: 0, y: 0 }
        }
      ];

      const result = getWorkflowToolInputsFromStoreNodes(nodes);

      expect(result).toEqual(complexInputs);
      expect(result).toHaveLength(2);
    });
  });
});
