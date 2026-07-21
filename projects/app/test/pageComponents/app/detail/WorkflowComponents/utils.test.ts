import { describe, expect, it, vi } from 'vitest';
import {
  uiWorkflow2StoreWorkflow,
  filterExportModules,
  getEditorVariables
} from '@/pageComponents/app/detail/WorkflowComponents/utils';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { AppDetailType } from '@fastgpt/global/core/app/type';

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
        },
        {
          data: {
            nodeId: '2',
            name: 'Node 2',
            intro: 'Intro 2',
            avatar: 'avatar2',
            flowNodeType: FlowNodeTypeEnum.userInput,
            showStatus: true,
            inputs: [],
            outputs: []
          },
          position: { x: 300, y: 100 }
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

    it('should keep valid edges when ReactFlow handles have not mounted yet', () => {
      const mockQuerySelector = vi.fn().mockReturnValue({
        querySelectorAll: () => []
      });

      global.document = {
        querySelector: mockQuerySelector
      } as any;

      const nodes = [
        {
          data: {
            nodeId: 'sourceNode',
            name: 'Source',
            intro: '',
            avatar: '',
            flowNodeType: FlowNodeTypeEnum.chatNode,
            showStatus: true,
            inputs: [],
            outputs: [],
            isFolded: false
          },
          position: { x: 0, y: 0 }
        },
        {
          data: {
            nodeId: 'targetNode',
            name: 'Target',
            intro: '',
            avatar: '',
            flowNodeType: FlowNodeTypeEnum.answerNode,
            showStatus: true,
            inputs: [],
            outputs: []
          },
          position: { x: 300, y: 0 }
        }
      ];

      const edges = [
        {
          source: 'sourceNode',
          target: 'targetNode',
          sourceHandle: 'sourceNode-source-right',
          targetHandle: 'targetNode-target-left'
        }
      ];

      const result = uiWorkflow2StoreWorkflow({ nodes, edges });

      expect(result.edges).toEqual([
        {
          source: 'sourceNode',
          target: 'targetNode',
          sourceHandle: 'sourceNode-source-right',
          targetHandle: 'targetNode-target-left'
        }
      ]);
    });

    it('should filter malformed edges that cannot be restored', () => {
      const nodes = [
        {
          data: {
            nodeId: 'sourceNode',
            name: 'Source',
            intro: '',
            avatar: '',
            flowNodeType: FlowNodeTypeEnum.chatNode,
            showStatus: true,
            inputs: [],
            outputs: []
          },
          position: { x: 0, y: 0 }
        },
        {
          data: {
            nodeId: 'targetNode',
            name: 'Target',
            intro: '',
            avatar: '',
            flowNodeType: FlowNodeTypeEnum.answerNode,
            showStatus: true,
            inputs: [],
            outputs: []
          },
          position: { x: 300, y: 0 }
        }
      ];

      const edges = [
        {
          source: 'sourceNode',
          target: 'targetNode',
          sourceHandle: '',
          targetHandle: 'targetNode-target-left'
        },
        {
          source: 'sourceNode',
          target: 'missingNode',
          sourceHandle: 'sourceNode-source-right',
          targetHandle: 'missingNode-target-left'
        },
        {
          source: 'sourceNode',
          target: 'targetNode',
          sourceHandle: 'sourceNode-source-right',
          targetHandle: 'targetNode-target-left'
        }
      ];

      const result = uiWorkflow2StoreWorkflow({ nodes, edges });

      expect(result.edges).toEqual([
        {
          source: 'sourceNode',
          target: 'targetNode',
          sourceHandle: 'sourceNode-source-right',
          targetHandle: 'targetNode-target-left'
        }
      ]);
    });

    it('should keep selected skill snapshot for later server-side save formatting', () => {
      const nodes = [
        {
          data: {
            nodeId: 'agentNode',
            name: 'Agent',
            intro: '',
            avatar: '',
            flowNodeType: FlowNodeTypeEnum.agent,
            showStatus: true,
            inputs: [
              {
                key: NodeInputKeyEnum.skills,
                value: [
                  {
                    skillId: 'skill-1',
                    name: 'Deleted Skill',
                    description: '',
                    isDeleted: true
                  },
                  {
                    skillId: 'skill-2',
                    name: 'Normal Skill',
                    description: ''
                  }
                ]
              }
            ],
            outputs: []
          },
          position: { x: 0, y: 0 }
        }
      ];

      const result = uiWorkflow2StoreWorkflow({ nodes, edges: [] });

      expect(result.nodes[0].inputs[0].value).toEqual([
        {
          skillId: 'skill-1',
          name: 'Deleted Skill',
          description: '',
          isDeleted: true
        },
        {
          skillId: 'skill-2',
          name: 'Normal Skill',
          description: ''
        }
      ]);
    });

    it('should keep dataset reference value when saving workflow', () => {
      const referenceValue = ['sourceNode', 'datasets'];
      const nodes = [
        {
          data: {
            nodeId: 'sourceNode',
            name: 'Source',
            intro: '',
            avatar: '',
            flowNodeType: FlowNodeTypeEnum.workflowStart,
            showStatus: true,
            inputs: [],
            outputs: [
              {
                id: 'datasets',
                key: 'datasets',
                label: 'Datasets',
                type: FlowNodeOutputTypeEnum.static,
                valueType: WorkflowIOValueTypeEnum.arrayObject
              }
            ]
          },
          position: { x: 0, y: 0 }
        },
        {
          data: {
            nodeId: 'datasetNode',
            name: 'Dataset Search',
            intro: '',
            avatar: '',
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            showStatus: true,
            inputs: [
              {
                key: NodeInputKeyEnum.datasetSelectList,
                renderTypeList: [
                  FlowNodeInputTypeEnum.selectDataset,
                  FlowNodeInputTypeEnum.reference
                ],
                selectedTypeIndex: 1,
                valueType: WorkflowIOValueTypeEnum.arrayObject,
                value: referenceValue
              }
            ],
            outputs: []
          },
          position: { x: 0, y: 0 }
        }
      ];

      const result = uiWorkflow2StoreWorkflow({
        nodes,
        edges: [
          {
            source: 'sourceNode',
            target: 'datasetNode',
            sourceHandle: 'sourceNode-source-right',
            targetHandle: 'datasetNode-target-left'
          }
        ]
      });

      expect(result.nodes[1].inputs[0].value).toEqual(referenceValue);
    });

    it('should filter only unselectable values from reference inputs', () => {
      const nodes = [
        {
          data: {
            nodeId: 'sourceNode',
            name: 'Source',
            intro: '',
            avatar: '',
            flowNodeType: FlowNodeTypeEnum.workflowStart,
            showStatus: true,
            inputs: [],
            outputs: [
              {
                id: 'text',
                key: 'text',
                label: 'Text',
                type: FlowNodeOutputTypeEnum.static,
                valueType: WorkflowIOValueTypeEnum.string
              },
              {
                id: 'files',
                key: 'files',
                label: 'Files',
                type: FlowNodeOutputTypeEnum.static,
                valueType: WorkflowIOValueTypeEnum.arrayString
              },
              {
                id: 'count',
                key: 'count',
                label: 'Count',
                type: FlowNodeOutputTypeEnum.static,
                valueType: WorkflowIOValueTypeEnum.number
              }
            ]
          },
          position: { x: 0, y: 0 }
        },
        {
          data: {
            nodeId: 'targetNode',
            name: 'Target',
            intro: '',
            avatar: '',
            flowNodeType: FlowNodeTypeEnum.chatNode,
            showStatus: true,
            inputs: [
              {
                key: 'validSingleReference',
                renderTypeList: [FlowNodeInputTypeEnum.reference],
                valueType: WorkflowIOValueTypeEnum.string,
                value: ['sourceNode', 'text']
              },
              {
                key: 'invalidSingleReference',
                renderTypeList: [FlowNodeInputTypeEnum.reference],
                valueType: WorkflowIOValueTypeEnum.string,
                value: ['missingNode', 'text']
              },
              {
                key: 'multipleReferences',
                renderTypeList: [FlowNodeInputTypeEnum.reference],
                valueType: WorkflowIOValueTypeEnum.arrayString,
                value: [
                  ['sourceNode', 'files'],
                  ['sourceNode', 'count'],
                  ['missingNode', 'files']
                ]
              },
              {
                key: 'textareaValue',
                renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
                selectedTypeIndex: 1,
                valueType: WorkflowIOValueTypeEnum.string,
                value: '{{missingNode.text}}'
              }
            ],
            outputs: []
          },
          position: { x: 300, y: 0 }
        }
      ];

      const result = uiWorkflow2StoreWorkflow({
        nodes,
        edges: [
          {
            source: 'sourceNode',
            target: 'targetNode',
            sourceHandle: 'sourceNode-source-right',
            targetHandle: 'targetNode-target-left'
          }
        ]
      });
      const storedInputs = result.nodes[1].inputs;

      expect(storedInputs.find((input) => input.key === 'validSingleReference')?.value).toEqual([
        'sourceNode',
        'text'
      ]);
      expect(
        storedInputs.find((input) => input.key === 'invalidSingleReference')?.value
      ).toBeUndefined();
      expect(storedInputs.find((input) => input.key === 'multipleReferences')?.value).toEqual([
        ['sourceNode', 'files']
      ]);
      expect(storedInputs.find((input) => input.key === 'textareaValue')?.value).toBe(
        '{{missingNode.text}}'
      );
    });

    it('should keep loop custom output references to child nodes', () => {
      const nodes = [
        {
          data: {
            nodeId: 'loopNode',
            name: 'Loop',
            intro: '',
            avatar: '',
            flowNodeType: FlowNodeTypeEnum.loopRun,
            showStatus: true,
            inputs: [
              {
                key: 'customOutput',
                label: 'Custom output',
                canEdit: true,
                renderTypeList: [FlowNodeInputTypeEnum.reference],
                valueType: WorkflowIOValueTypeEnum.string,
                value: ['childNode', 'result']
              }
            ],
            outputs: []
          },
          position: { x: 0, y: 0 }
        },
        {
          data: {
            nodeId: 'childNode',
            parentNodeId: 'loopNode',
            name: 'Child',
            intro: '',
            avatar: '',
            flowNodeType: FlowNodeTypeEnum.chatNode,
            showStatus: true,
            inputs: [],
            outputs: [
              {
                id: 'result',
                key: 'result',
                label: 'Result',
                type: FlowNodeOutputTypeEnum.static,
                valueType: WorkflowIOValueTypeEnum.string
              }
            ]
          },
          position: { x: 100, y: 100 }
        }
      ];

      const result = uiWorkflow2StoreWorkflow({ nodes, edges: [] });

      expect(result.nodes[0].inputs[0].value).toEqual(['childNode', 'result']);
    });

    it('should remove negative selectedTypeIndex before saving workflow', () => {
      const nodes = [
        {
          data: {
            nodeId: 'toolNode',
            name: 'Tool',
            intro: '',
            avatar: '',
            flowNodeType: FlowNodeTypeEnum.toolCall,
            showStatus: true,
            inputs: [
              {
                key: 'query',
                renderTypeList: [FlowNodeInputTypeEnum.input],
                selectedTypeIndex: -1,
                value: 'test'
              }
            ],
            outputs: []
          },
          position: { x: 0, y: 0 }
        }
      ];

      const result = uiWorkflow2StoreWorkflow({ nodes, edges: [] });

      expect(result.nodes[0].inputs[0].selectedTypeIndex).toBeUndefined();
    });

    it('should not materialize fallback selectedType when saving workflow', () => {
      const nodes = [
        {
          data: {
            nodeId: 'chatNode',
            name: 'Chat node',
            intro: '',
            avatar: '',
            flowNodeType: FlowNodeTypeEnum.chatNode,
            showStatus: true,
            inputs: [
              {
                key: NodeInputKeyEnum.userChatInput,
                renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
                selectedTypeIndex: 0
              }
            ],
            outputs: []
          },
          position: { x: 0, y: 0 }
        }
      ];

      const result = uiWorkflow2StoreWorkflow({ nodes, edges: [] });

      expect(result.nodes[0].inputs[0].selectedType).toBeUndefined();
      expect(result.nodes[0].inputs[0].selectedTypeIndex).toBe(0);
    });

    it('should keep selected dataset snapshot for later server-side save formatting', () => {
      const nodes = [
        {
          data: {
            nodeId: 'datasetNode',
            name: 'Dataset Search',
            intro: '',
            avatar: '',
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            showStatus: true,
            inputs: [
              {
                key: NodeInputKeyEnum.datasetSelectList,
                renderTypeList: [
                  FlowNodeInputTypeEnum.selectDataset,
                  FlowNodeInputTypeEnum.reference
                ],
                selectedTypeIndex: 0,
                value: [
                  {
                    datasetId: 'dataset-1',
                    avatar: 'avatar.png',
                    name: 'Deleted Dataset',
                    vectorModel: {
                      model: 'text-embedding'
                    },
                    isDeleted: true
                  }
                ]
              }
            ],
            outputs: []
          },
          position: { x: 0, y: 0 }
        }
      ];

      const result = uiWorkflow2StoreWorkflow({ nodes, edges: [] });

      expect(result.nodes[0].inputs[0].value).toEqual([
        {
          datasetId: 'dataset-1',
          avatar: 'avatar.png',
          name: 'Deleted Dataset',
          vectorModel: {
            model: 'text-embedding'
          },
          isDeleted: true
        }
      ]);
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
        getNodeById: () => undefined,
        edges: [],
        appDetail: {} as AppDetailType,
        t: (key: string) => key
      });

      expect(result).toEqual([]);
    });
  });
});
