import { describe, expect, it, vi } from 'vitest';
import {
  uiWorkflow2StoreWorkflow,
  filterExportModules,
  getEditorVariables
} from '@/pageComponents/app/detail/WorkflowComponents/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import type { AppDetailType } from '@fastgpt/global/core/app/type';

vi.mock('@/web/core/workflow/utils', () => ({
  getNodeAllSource: vi.fn().mockReturnValue([])
}));

describe('WorkflowComponents utils', () => {
  describe('uiWorkflow2StoreWorkflow', () => {
    it('should convert UI workflow to store workflow', () => {
      const mockHandleList = [{ getAttribute: () => 'source1' }, { getAttribute: () => 'target1' }];

      const mockQuerySelector = vi.fn().mockReturnValue({
        querySelectorAll: () => mockHandleList
      });

      global.document = {
        querySelector: mockQuerySelector
      } as any;

      const nodes = [
        {
          data: {
            nodeId: '1',
            parentNodeId: 'parent1',
            name: 'Node 1',
            intro: 'Intro 1',
            toolDescription: 'Tool desc',
            avatar: 'avatar1',
            flowNodeType: FlowNodeTypeEnum.userInput,
            showStatus: true,
            version: 1,
            inputs: [],
            outputs: [],
            isFolded: false,
            pluginId: 'plugin1',
            toolConfig: {},
            catchError: false
          },
          position: { x: 100, y: 100 }
        }
      ];

      const edges = [
        {
          source: '1',
          target: '2',
          sourceHandle: 'source1',
          targetHandle: 'target1'
        }
      ];

      const result = uiWorkflow2StoreWorkflow({ nodes, edges });

      expect(result.nodes[0]).toMatchObject({
        nodeId: '1',
        parentNodeId: 'parent1',
        name: 'Node 1',
        intro: 'Intro 1',
        toolDescription: 'Tool desc',
        avatar: 'avatar1',
        flowNodeType: FlowNodeTypeEnum.userInput,
        position: { x: 100, y: 100 }
      });

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0]).toMatchObject({
        source: '1',
        target: '2',
        sourceHandle: 'source1',
        targetHandle: 'target1'
      });
    });
  });

  describe('filterExportModules', () => {
    it('should filter dataset search node values', () => {
      const modules = [
        {
          flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
          inputs: [
            {
              key: NodeInputKeyEnum.datasetSelectList,
              value: ['dataset1']
            }
          ]
        }
      ];

      const result = filterExportModules(modules);
      const parsed = JSON.parse(result);

      expect(parsed[0].inputs[0].value).toEqual([]);
    });

    it('should not modify non-dataset nodes', () => {
      const modules = [
        {
          flowNodeType: FlowNodeTypeEnum.userInput,
          inputs: [
            {
              key: 'someKey',
              value: ['value1']
            }
          ]
        }
      ];

      const result = filterExportModules(modules);
      const parsed = JSON.parse(result);

      expect(parsed[0].inputs[0].value).toEqual(['value1']);
    });
  });

  describe('getEditorVariables', () => {
    it('should return variables for node', () => {
      const nodeId = 'node1';
      const nodeList: FlowNodeItemType[] = [
        {
          nodeId: 'node1',
          name: 'Node 1',
          avatar: 'avatar1',
          inputs: [
            {
              key: 'input1',
              label: 'Input 1',
              canEdit: true
            }
          ],
          outputs: []
        }
      ];
      const edges = [];
      const appDetail = {
        chatConfig: {}
      } as AppDetailType;
      const t = (key: string) => key;

      const result = getEditorVariables({
        nodeId,
        nodeList,
        getNodeById: (nodeId: string) => nodeList.find((node) => node.nodeId === nodeId),
        edges,
        appDetail,
        t
      });

      expect(result[0]).toEqual({
        key: 'input1',
        label: 'Input 1',
        parent: {
          id: 'node1',
          label: 'Node 1',
          avatar: 'avatar1'
        }
      });
    });

    it('should return empty array when node not found', () => {
      const result = getEditorVariables({
        nodeId: 'nonexistent',
        nodeList: [],
        getNodeById: (nodeId: string) => undefined,
        edges: [],
        appDetail: {} as AppDetailType,
        t: (key: string) => key
      });

      expect(result).toEqual([]);
    });
  });
});
