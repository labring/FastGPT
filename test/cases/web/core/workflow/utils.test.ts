import { vi, describe, it, expect } from 'vitest';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { Node, Edge } from 'reactflow';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  EDGE_TYPE
} from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  nodeTemplate2FlowNode,
  storeNode2FlowNode,
  storeEdgesRenderEdge,
  computedNodeInputReference,
  getRefData,
  filterWorkflowNodeOutputsByType,
  checkWorkflowNodeAndConnection,
  getLatestNodeTemplate
} from '@/web/core/workflow/utils';

describe('workflow utils', () => {
  describe('nodeTemplate2FlowNode', () => {
    it('should convert template to flow node', () => {
      const template: FlowNodeTemplateType = {
        name: 'Test Node',
        flowNodeType: FlowNodeTypeEnum.userInput,
        inputs: [],
        outputs: []
      };

      const result = nodeTemplate2FlowNode({
        template,
        position: { x: 100, y: 100 },
        selected: true,
        parentNodeId: 'parent1',
        t: (key) => key
      });

      expect(result).toMatchObject({
        type: FlowNodeTypeEnum.userInput,
        position: { x: 100, y: 100 },
        selected: true,
        data: {
          name: 'Test Node',
          flowNodeType: FlowNodeTypeEnum.userInput,
          parentNodeId: 'parent1'
        }
      });
      expect(result.id).toBeDefined();
    });
  });

  describe('storeNode2FlowNode', () => {
    it('should convert store node to flow node', () => {
      const storeNode: StoreNodeItemType = {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.userInput,
        position: { x: 100, y: 100 },
        inputs: [],
        outputs: [],
        name: 'Test Node',
        version: '1.0'
      };

      const result = storeNode2FlowNode({
        item: storeNode,
        selected: true,
        t: (key) => key
      });

      expect(result).toMatchObject({
        id: 'node1',
        type: FlowNodeTypeEnum.userInput,
        position: { x: 100, y: 100 },
        selected: true
      });
    });

    it('should handle dynamic inputs and outputs', () => {
      const storeNode: StoreNodeItemType = {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.userInput,
        position: { x: 0, y: 0 },
        inputs: [
          {
            key: 'dynamicInput',
            renderTypeList: [FlowNodeInputTypeEnum.addInputParam]
          }
        ],
        outputs: [
          {
            key: 'dynamicOutput',
            type: FlowNodeOutputTypeEnum.dynamic
          }
        ],
        name: 'Test Node',
        version: '1.0'
      };

      const result = storeNode2FlowNode({
        item: storeNode,
        t: (key) => key
      });

      expect(result.data.inputs).toHaveLength(1);
      expect(result.data.outputs).toHaveLength(1);
    });
  });

  describe('filterWorkflowNodeOutputsByType', () => {
    it('should filter outputs by type', () => {
      const outputs = [
        { id: '1', valueType: WorkflowIOValueTypeEnum.string },
        { id: '2', valueType: WorkflowIOValueTypeEnum.number },
        { id: '3', valueType: WorkflowIOValueTypeEnum.boolean }
      ];

      const result = filterWorkflowNodeOutputsByType(outputs, WorkflowIOValueTypeEnum.string);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should return all outputs for any type', () => {
      const outputs = [
        { id: '1', valueType: WorkflowIOValueTypeEnum.string },
        { id: '2', valueType: WorkflowIOValueTypeEnum.number }
      ];

      const result = filterWorkflowNodeOutputsByType(outputs, WorkflowIOValueTypeEnum.any);

      expect(result).toHaveLength(2);
    });

    it('should handle array types correctly', () => {
      const outputs = [
        { id: '1', valueType: WorkflowIOValueTypeEnum.string },
        { id: '2', valueType: WorkflowIOValueTypeEnum.arrayString }
      ];

      const result = filterWorkflowNodeOutputsByType(outputs, WorkflowIOValueTypeEnum.arrayString);
      expect(result).toHaveLength(2);
    });
  });

  describe('checkWorkflowNodeAndConnection', () => {
    it('should validate nodes and connections', () => {
      const nodes: Node[] = [
        {
          id: 'node1',
          type: FlowNodeTypeEnum.userInput,
          data: {
            nodeId: 'node1',
            flowNodeType: FlowNodeTypeEnum.userInput,
            inputs: [
              {
                key: NodeInputKeyEnum.userInput,
                required: true,
                value: undefined,
                renderTypeList: [FlowNodeInputTypeEnum.input]
              }
            ],
            outputs: []
          },
          position: { x: 0, y: 0 }
        }
      ];

      const edges: Edge[] = [
        {
          id: 'edge1',
          source: 'node1',
          target: 'node2',
          type: EDGE_TYPE
        }
      ];

      const result = checkWorkflowNodeAndConnection({ nodes, edges });
      expect(result).toEqual(['node1']);
    });

    it('should handle empty nodes and edges', () => {
      const result = checkWorkflowNodeAndConnection({ nodes: [], edges: [] });
      expect(result).toBeUndefined();
    });
  });

  describe('getLatestNodeTemplate', () => {
    it('should update node to latest template version', () => {
      const node = {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.userInput,
        inputs: [{ key: 'input1', value: 'test' }],
        outputs: [{ key: 'output1', value: 'test' }],
        name: 'Old Name',
        intro: 'Old Intro'
      };

      const template = {
        flowNodeType: FlowNodeTypeEnum.userInput,
        inputs: [{ key: 'input1' }, { key: 'input2' }],
        outputs: [{ key: 'output1' }, { key: 'output2' }]
      };

      const result = getLatestNodeTemplate(node, template);

      expect(result.inputs).toHaveLength(2);
      expect(result.outputs).toHaveLength(2);
      expect(result.name).toBe('Old Name');
    });

    it('should preserve existing values when updating template', () => {
      const node = {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.userInput,
        inputs: [{ key: 'input1', value: 'existingValue' }],
        outputs: [{ key: 'output1', value: 'existingOutput' }],
        name: 'Node Name',
        intro: 'Node Intro'
      };

      const template = {
        flowNodeType: FlowNodeTypeEnum.userInput,
        inputs: [{ key: 'input1', value: 'newValue' }],
        outputs: [{ key: 'output1', value: 'newOutput' }]
      };

      const result = getLatestNodeTemplate(node, template);

      expect(result.inputs[0].value).toBe('existingValue');
      expect(result.outputs[0].value).toBe('existingOutput');
    });
  });
});
