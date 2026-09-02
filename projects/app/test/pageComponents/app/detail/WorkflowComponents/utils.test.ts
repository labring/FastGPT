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
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { AppDetailType } from '@fastgpt/global/core/app/type';
import { CanonicalWorkflowDataSchema } from '@fastgpt/global/core/workflow/migration/schema';
import { PublishAppBodySchema } from '@fastgpt/global/openapi/core/app/version/api';
import { storeNode2FlowNode } from '@/web/core/workflow/utils';
import {
  captureDeletedWorkflowReferenceSnapshots,
  getWorkflowReferenceItemsFromValue,
  getWorkflowReferenceStatuses
} from '@/web/core/workflow/referenceCheck';
import { checkWorkflowNodeIssues } from '@/web/core/workflow/workflowCheck';

const createReferenceInput = (key: string, value: unknown, referenceSnapshots?: unknown) => ({
  key,
  label: key,
  renderTypeList: [FlowNodeInputTypeEnum.reference],
  selectedType: FlowNodeInputTypeEnum.reference,
  valueType: WorkflowIOValueTypeEnum.any,
  value,
  ...(referenceSnapshots ? { referenceSnapshots } : {})
});

const createNode = ({
  nodeId,
  name,
  inputs = [],
  outputs = [],
  flowNodeType = FlowNodeTypeEnum.userInput,
  avatar
}: {
  nodeId: string;
  name: string;
  inputs?: any[];
  outputs?: any[];
  flowNodeType?: FlowNodeTypeEnum;
  avatar?: string;
}) =>
  ({
    id: nodeId,
    type: flowNodeType,
    data: {
      nodeId,
      name,
      ...(avatar ? { avatar } : {}),
      flowNodeType,
      inputs,
      outputs
    }
  }) as any;

const createOutput = (id: string, label: string, extra: Record<string, unknown> = {}) => ({
  id,
  key: id,
  label,
  type: FlowNodeOutputTypeEnum.static,
  ...extra
});

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

    it('should validate and restore folded Code tool nodes', () => {
      const nodes = [
        {
          data: {
            nodeId: 'agent-node',
            name: 'Agent',
            flowNodeType: FlowNodeTypeEnum.toolCall,
            inputs: [],
            outputs: []
          },
          position: { x: 0, y: 0 }
        },
        {
          data: {
            nodeId: 'code-node',
            name: 'Code',
            flowNodeType: FlowNodeTypeEnum.code,
            inputs: [
              {
                key: 'data1',
                label: 'data1',
                valueType: WorkflowIOValueTypeEnum.string,
                renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
                selectedType: FlowNodeInputTypeEnum.input,
                canEdit: true
              }
            ],
            outputs: [],
            isFolded: true
          },
          position: { x: 300, y: 0 }
        }
      ];
      const edges = [
        {
          source: 'agent-node',
          target: 'code-node',
          sourceHandle: 'tool-output',
          targetHandle: 'selectedTools'
        }
      ];

      const stored = uiWorkflow2StoreWorkflow({ nodes, edges });
      const workflow = CanonicalWorkflowDataSchema.parse({
        ...stored,
        chatConfig: {}
      });
      const published = PublishAppBodySchema.parse({
        ...stored,
        chatConfig: {}
      });

      expect(workflow.nodes[1]?.isFolded).toBe(true);
      expect(published.nodes?.[1]?.isFolded).toBe(true);

      const restored = storeNode2FlowNode({
        item: workflow.nodes[1],
        t: ((key: string) => key) as any
      });
      expect(restored.data.isFolded).toBe(true);
    });

    it('should preserve reference snapshots through canonical validation and restore', () => {
      const nodes = [
        {
          data: {
            nodeId: 'source-node',
            name: 'Source node',
            flowNodeType: FlowNodeTypeEnum.chatNode,
            inputs: [],
            outputs: [
              {
                id: 'output-key',
                key: 'output-key',
                label: 'Output label',
                type: FlowNodeOutputTypeEnum.static,
                valueType: WorkflowIOValueTypeEnum.string
              }
            ]
          },
          position: { x: 0, y: 0 }
        },
        {
          data: {
            nodeId: 'target-node',
            name: 'Target node',
            flowNodeType: FlowNodeTypeEnum.answerNode,
            inputs: [
              {
                key: 'text',
                label: 'Text',
                value: ['source-node', 'output-key'],
                referenceSnapshots: [
                  {
                    reference: ['source-node', 'output-key'],
                    sourceLabel: 'Source node',
                    outputLabel: 'Output label'
                  }
                ],
                renderTypeList: [FlowNodeInputTypeEnum.reference]
              }
            ],
            outputs: []
          },
          position: { x: 300, y: 0 }
        }
      ];

      const stored = uiWorkflow2StoreWorkflow({ nodes, edges: [] });
      const workflow = CanonicalWorkflowDataSchema.parse({
        ...stored,
        chatConfig: {}
      });
      const published = PublishAppBodySchema.parse({
        ...stored,
        chatConfig: {}
      });

      expect(workflow.nodes[1]?.inputs[0]?.referenceSnapshots).toEqual(
        stored.nodes[1]?.inputs[0]?.referenceSnapshots
      );
      expect(published.nodes?.[1]?.inputs[0]?.referenceSnapshots).toEqual(
        stored.nodes[1]?.inputs[0]?.referenceSnapshots
      );

      const restored = storeNode2FlowNode({
        item: workflow.nodes[1],
        t: ((key: string) => key) as any
      });
      expect(restored.data.inputs[0]?.referenceSnapshots).toEqual(
        stored.nodes[1]?.inputs[0]?.referenceSnapshots
      );
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
                selectedType: FlowNodeInputTypeEnum.reference,
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

    it('should preserve reference snapshots when saving workflow', () => {
      const referenceSnapshots = [
        {
          reference: ['sourceNode', 'text'],
          sourceLabel: 'Source before deletion',
          outputLabel: 'Text before deletion'
        }
      ];
      const nodes = [
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
                key: 'referenceInput',
                renderTypeList: [FlowNodeInputTypeEnum.reference],
                selectedType: FlowNodeInputTypeEnum.reference,
                valueType: WorkflowIOValueTypeEnum.string,
                value: ['sourceNode', 'text'],
                referenceSnapshots
              }
            ],
            outputs: []
          },
          position: { x: 0, y: 0 }
        }
      ];

      const result = uiWorkflow2StoreWorkflow({ nodes, edges: [] });

      expect(result.nodes[0].inputs[0].referenceSnapshots).toEqual(referenceSnapshots);
    });

    it('should preserve unselectable values from reference inputs', () => {
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
                selectedType: FlowNodeInputTypeEnum.textarea,
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
      expect(storedInputs.find((input) => input.key === 'invalidSingleReference')?.value).toEqual([
        'missingNode',
        'text'
      ]);
      expect(storedInputs.find((input) => input.key === 'multipleReferences')?.value).toEqual([
        ['sourceNode', 'files'],
        ['sourceNode', 'count'],
        ['missingNode', 'files']
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

    it('should preserve a canonical input selection when saving workflow', () => {
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
                selectedType: FlowNodeInputTypeEnum.input,
                value: 'test'
              }
            ],
            outputs: []
          },
          position: { x: 0, y: 0 }
        }
      ];

      const result = uiWorkflow2StoreWorkflow({ nodes, edges: [] });

      expect(result.nodes[0].inputs[0].selectedType).toBe(FlowNodeInputTypeEnum.input);
    });

    it('should preserve the canonical selectedType when saving workflow', () => {
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
                selectedType: FlowNodeInputTypeEnum.reference
              }
            ],
            outputs: []
          },
          position: { x: 0, y: 0 }
        }
      ];

      const result = uiWorkflow2StoreWorkflow({ nodes, edges: [] });

      expect(result.nodes[0].inputs[0].selectedType).toBe(FlowNodeInputTypeEnum.reference);
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
                selectedType: FlowNodeInputTypeEnum.selectDataset,
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

    it('should preserve custom labels while translating system variable labels', () => {
      const nodeList = [
        {
          nodeId: 'node1',
          name: 'Node 1',
          inputs: [],
          outputs: []
        }
      ] as FlowNodeItemType[];

      const result = getEditorVariables({
        nodeId: 'node1',
        nodeList,
        getNodeById: (nodeId: string) => nodeList.find((node) => node.nodeId === nodeId),
        edges: [],
        appDetail: {
          chatConfig: {
            variables: [{ key: 'name', label: 'name', description: '', type: 'input' }]
          }
        } as AppDetailType,
        t: (key: string) =>
          ({
            name: '名称',
            'workflow:use_user_id': '用户 ID'
          })[key] || key
      });

      expect(result.find((item) => item.key === 'name')?.label).toBe('name');
      expect(result.find((item) => item.key === 'userId')?.label).toBe('用户 ID');
    });

    it('should keep invalid reason and node icon for unavailable output variables', () => {
      const source = createNode({
        nodeId: 'source',
        name: 'Source',
        avatar: 'source-avatar',
        outputs: [
          createOutput('type-mismatch', 'Type mismatch', {
            valueType: WorkflowIOValueTypeEnum.number,
            icon: 'custom/type'
          }),
          createOutput('invalid', 'Invalid', {
            invalid: true,
            valueType: WorkflowIOValueTypeEnum.string
          })
        ]
      });
      const disconnected = createNode({
        nodeId: 'disconnected',
        name: 'Disconnected',
        outputs: [createOutput('output', 'Output', { valueType: WorkflowIOValueTypeEnum.string })]
      });
      const consumer = createNode({
        nodeId: 'consumer',
        name: 'Consumer',
        inputs: [
          {
            key: 'input',
            label: 'Input',
            canEdit: true,
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      });
      const nodeList = [source.data, disconnected.data, consumer.data];
      const result = getEditorVariables({
        nodeId: 'consumer',
        nodeList,
        getNodeById: (nodeId: string) => nodeList.find((node) => node.nodeId === nodeId),
        edges: [{ source: 'source', target: 'consumer' }],
        appDetail: { chatConfig: {} } as AppDetailType,
        t: (key: string) => key,
        valueType: WorkflowIOValueTypeEnum.string
      });

      expect(result.find((item) => item.key === 'type-mismatch')).toMatchObject({
        invalidReason: 'invalid_reference_type',
        parent: { avatar: 'source-avatar' }
      });
      expect(result.find((item) => item.key === 'invalid')).toMatchObject({
        invalidReason: 'invalid_reference'
      });
      expect(
        result.find((item) => item.key === 'output' && item.parent.id === 'disconnected')
      ).toMatchObject({
        invalidReason: 'unreachable_reference'
      });
      expect(result.find((item) => item.key === 'type-mismatch')).not.toHaveProperty('icon');
    });
  });

  describe('workflow references', () => {
    it('extracts canonical and text references from nested values', () => {
      expect(
        getWorkflowReferenceItemsFromValue({
          url: '{{$source.output$}}',
          params: [{ key: '{{$source.key$}}', value: '{{$source.output$}}' }],
          body: '{{$other.body$}}'
        })
      ).toEqual([
        ['source', 'output'],
        ['source', 'key'],
        ['other', 'body']
      ]);
    });

    it('keeps valid text references valid', () => {
      const source = createNode({
        nodeId: 'source',
        name: 'Source',
        outputs: [createOutput('output', 'Output')]
      });

      expect(
        getWorkflowReferenceStatuses({
          value: 'prefix {{$source.output$}}',
          sourceNodes: [source.data],
          getNodeById: () => undefined
        })
      ).toEqual([{ code: 'valid' }]);
    });

    it('captures deleted text references from normal and HTTP inputs', () => {
      const source = createNode({
        nodeId: 'source',
        name: 'Source',
        avatar: 'node-avatar',
        outputs: [createOutput('key', 'Key'), createOutput('output', 'Output', { icon: 'input' })]
      });
      const consumer = createNode({
        nodeId: 'consumer',
        name: 'Consumer',
        inputs: [
          {
            key: 'text',
            label: 'Text',
            renderTypeList: [FlowNodeInputTypeEnum.input],
            value: 'prefix {{$source.output$}}'
          },
          {
            key: NodeInputKeyEnum.httpParams,
            value: [{ key: '{{$source.key$}}', type: 'string', value: '{{$source.output$}}' }]
          },
          {
            key: NodeInputKeyEnum.httpJsonBody,
            value: 'body {{$source.output$}}'
          },
          {
            key: 'nestedText',
            value: {
              prompt: 'nested {{$source.key$}}'
            }
          }
        ]
      });

      const result = captureDeletedWorkflowReferenceSnapshots({
        previousNodes: [source, consumer],
        nextNodes: [consumer],
        previousChatConfig: {},
        nextChatConfig: {},
        nodeIds: ['source']
      });

      expect(result[0].data.inputs[0].referenceSnapshots).toEqual([
        {
          reference: ['source', 'output'],
          sourceLabel: 'Source',
          outputLabel: 'Output',
          icon: 'node-avatar'
        }
      ]);
      expect(result[0].data.inputs[1].referenceSnapshots).toEqual([
        {
          reference: ['source', 'key'],
          sourceLabel: 'Source',
          outputLabel: 'Key',
          icon: 'node-avatar'
        },
        {
          reference: ['source', 'output'],
          sourceLabel: 'Source',
          outputLabel: 'Output',
          icon: 'node-avatar'
        }
      ]);
      expect(result[0].data.inputs[2].referenceSnapshots).toEqual([
        {
          reference: ['source', 'output'],
          sourceLabel: 'Source',
          outputLabel: 'Output',
          icon: 'node-avatar'
        }
      ]);
      expect(result[0].data.inputs[3].referenceSnapshots).toEqual([
        {
          reference: ['source', 'key'],
          sourceLabel: 'Source',
          outputLabel: 'Key',
          icon: 'node-avatar'
        }
      ]);
    });

    it('only updates nodes affected by a deleted source', () => {
      const source = createNode({
        nodeId: 'source',
        name: 'Source',
        outputs: [createOutput('output', 'Output')]
      });
      const consumer = createNode({
        nodeId: 'consumer',
        name: 'Consumer',
        inputs: [{ key: 'text', value: '{{$source.output$}}' }]
      });
      const untouched = createNode({
        nodeId: 'untouched',
        name: 'Untouched',
        inputs: [
          { key: 'text', value: 'plain', referenceSnapshots: [{ reference: ['old', 'out'] }] }
        ]
      });

      const result = captureDeletedWorkflowReferenceSnapshots({
        previousNodes: [source, consumer, untouched],
        nextNodes: [consumer, untouched],
        previousChatConfig: {},
        nextChatConfig: {},
        nodeIds: ['source']
      });

      expect(result[0].data.inputs[0].referenceSnapshots).toHaveLength(1);
      expect(result[1]).toBe(untouched);
    });

    it('skips hidden HTTP tool parameter reference checks', () => {
      const toolCall = createNode({
        nodeId: 'tool-call',
        name: 'Tool call',
        flowNodeType: FlowNodeTypeEnum.toolCall
      });
      const httpTool = createNode({
        nodeId: 'http-tool',
        name: 'HTTP tool',
        flowNodeType: FlowNodeTypeEnum.httpRequest468,
        inputs: [
          {
            key: 'toolParam',
            label: 'Tool parameter',
            canEdit: true,
            defaultToAgentGenerated: true,
            renderTypeList: [FlowNodeInputTypeEnum.input],
            selectedType: FlowNodeInputTypeEnum.input,
            value: ['deleted', 'output'],
            valueType: WorkflowIOValueTypeEnum.string
          },
          {
            key: NodeInputKeyEnum.httpReqUrl,
            label: 'URL',
            renderTypeList: [FlowNodeInputTypeEnum.input],
            value: 'https://example.com'
          }
        ]
      });

      const issueMap = checkWorkflowNodeIssues({
        nodes: [toolCall, httpTool],
        edges: [
          {
            source: 'tool-call',
            target: 'http-tool',
            sourceHandle: 'tool',
            targetHandle: NodeOutputKeyEnum.selectedTools
          }
        ]
      });

      expect(issueMap['http-tool'] ?? []).not.toContainEqual(
        expect.objectContaining({ inputKey: 'toolParam', code: 'invalid_reference' })
      );
    });

    it('marks references to hidden HTTP tool parameters as invalid elsewhere', () => {
      const toolCall = createNode({
        nodeId: 'tool-call',
        name: 'Tool call',
        flowNodeType: FlowNodeTypeEnum.toolCall
      });
      const httpTool = createNode({
        nodeId: 'http-tool',
        name: 'HTTP tool',
        flowNodeType: FlowNodeTypeEnum.httpRequest468,
        outputs: [createOutput('result', 'Result')]
      });
      const consumer = createNode({
        nodeId: 'consumer',
        name: 'Consumer',
        inputs: [createReferenceInput('input', ['http-tool', 'toolParam'])]
      });

      const issueMap = checkWorkflowNodeIssues({
        nodes: [toolCall, httpTool, consumer],
        edges: [
          {
            source: 'tool-call',
            target: 'http-tool',
            sourceHandle: 'tool',
            targetHandle: NodeOutputKeyEnum.selectedTools
          },
          {
            source: 'http-tool',
            target: 'consumer',
            sourceHandle: 'result',
            targetHandle: 'input'
          }
        ]
      });

      expect(issueMap.consumer).toContainEqual(
        expect.objectContaining({ inputKey: 'input', code: 'invalid_reference' })
      );
    });
  });

  describe('captureDeletedWorkflowReferenceSnapshots', () => {
    it('captures deleted nodes and outputs, and clears a snapshot when the reference is valid', () => {
      const source = createNode({
        nodeId: 'source',
        name: 'Source',
        outputs: [createOutput('output', 'Output')]
      });
      const consumer = createNode({
        nodeId: 'consumer',
        name: 'Consumer',
        inputs: [createReferenceInput('input', ['source', 'output'])]
      });

      const deletedNode = captureDeletedWorkflowReferenceSnapshots({
        previousNodes: [source, consumer],
        nextNodes: [consumer],
        previousChatConfig: {},
        nextChatConfig: {}
      });
      expect(deletedNode[0].data.inputs[0].referenceSnapshots).toEqual([
        {
          reference: ['source', 'output'],
          sourceLabel: 'Source',
          outputLabel: 'Output'
        }
      ]);

      const deletedOutput = captureDeletedWorkflowReferenceSnapshots({
        previousNodes: [source, consumer],
        nextNodes: [createNode({ nodeId: 'source', name: 'Source' }), consumer],
        previousChatConfig: {},
        nextChatConfig: {}
      });
      expect(deletedOutput[1].data.inputs[0].referenceSnapshots).toEqual(
        deletedNode[0].data.inputs[0].referenceSnapshots
      );

      const valid = captureDeletedWorkflowReferenceSnapshots({
        previousNodes: [source, consumer],
        nextNodes: [
          source,
          createNode({
            nodeId: 'consumer',
            name: 'Consumer',
            inputs: [
              createReferenceInput(
                'input',
                ['source', 'output'],
                [
                  {
                    reference: ['source', 'output'],
                    sourceLabel: 'Source',
                    outputLabel: 'Output'
                  }
                ]
              )
            ]
          })
        ],
        previousChatConfig: {},
        nextChatConfig: {}
      });
      expect(valid[1].data.inputs[0]).not.toHaveProperty('referenceSnapshots');
    });

    it('preserves existing snapshots and captures nested references', () => {
      const source = createNode({
        nodeId: 'source',
        name: 'Source',
        outputs: [createOutput('variable', 'Variable'), createOutput('value', 'Value')]
      });
      const existingSnapshot = {
        reference: ['missing', 'output'],
        sourceLabel: 'Old source',
        outputLabel: 'Old output',
        icon: 'old-node-avatar'
      };
      const consumer = createNode({
        nodeId: 'consumer',
        name: 'Consumer',
        inputs: [
          createReferenceInput('old', ['missing', 'output'], [existingSnapshot]),
          {
            key: NodeInputKeyEnum.ifElseList,
            value: [
              {
                condition: 'AND',
                list: [
                  {
                    variable: ['source', 'variable'],
                    value: ['source', 'value'],
                    valueType: 'reference'
                  }
                ]
              }
            ]
          },
          {
            key: NodeInputKeyEnum.updateList,
            value: [
              {
                variable: ['source', 'variable'],
                value: [
                  ['source', 'value'],
                  ['source', 'variable']
                ],
                renderType: FlowNodeInputTypeEnum.reference
              },
              {
                variable: ['source', 'variable'],
                value: ['', 'prefix {{$source.value$}}'],
                renderType: FlowNodeInputTypeEnum.input
              }
            ]
          }
        ]
      });

      const result = captureDeletedWorkflowReferenceSnapshots({
        previousNodes: [source, consumer],
        nextNodes: [consumer],
        previousChatConfig: {},
        nextChatConfig: {}
      });

      expect(result[0].data.inputs[0].referenceSnapshots).toEqual([existingSnapshot]);
      expect(result[0].data.inputs[1].value[0].list[0]).toMatchObject({
        variableSnapshot: {
          reference: ['source', 'variable'],
          sourceLabel: 'Source',
          outputLabel: 'Variable'
        },
        valueSnapshot: {
          reference: ['source', 'value'],
          sourceLabel: 'Source',
          outputLabel: 'Value'
        }
      });
      expect(result[0].data.inputs[2].value[0]).toMatchObject({
        variableSnapshot: {
          reference: ['source', 'variable'],
          sourceLabel: 'Source',
          outputLabel: 'Variable'
        },
        valueReferenceSnapshots: [
          {
            reference: ['source', 'value'],
            sourceLabel: 'Source',
            outputLabel: 'Value'
          },
          {
            reference: ['source', 'variable'],
            sourceLabel: 'Source',
            outputLabel: 'Variable'
          }
        ]
      });
      expect(result[0].data.inputs[2].value[1]).toMatchObject({
        valueReferenceSnapshots: [
          {
            reference: ['source', 'value'],
            sourceLabel: 'Source',
            outputLabel: 'Value'
          }
        ]
      });
    });

    it('captures a deleted global variable from the previous chat config', () => {
      const consumer = createNode({
        nodeId: 'consumer',
        name: 'Consumer',
        inputs: [createReferenceInput('input', [VARIABLE_NODE_ID, 'deleted'])]
      });
      const variable = {
        key: 'deleted',
        label: 'Deleted variable',
        type: VariableInputEnum.input,
        description: ''
      };

      const result = captureDeletedWorkflowReferenceSnapshots({
        previousNodes: [consumer],
        nextNodes: [consumer],
        previousChatConfig: { variables: [variable] },
        nextChatConfig: { variables: [] },
        globalVariableSourceLabel: 'Variable'
      });

      expect(result[0].data.inputs[0].referenceSnapshots).toEqual([
        {
          reference: [VARIABLE_NODE_ID, 'deleted'],
          sourceLabel: 'Variable',
          outputLabel: 'Deleted variable',
          icon: 'core/workflow/template/variable'
        }
      ]);
    });

    it('captures deleted global references inside VariableUpdate input values', () => {
      const consumer = createNode({
        nodeId: 'consumer',
        name: 'Consumer',
        inputs: [
          {
            key: NodeInputKeyEnum.updateList,
            value: [
              {
                variable: [VARIABLE_NODE_ID, 'target'],
                value: ['', 'prefix {{$VARIABLE_NODE_ID.deleted$}}'],
                renderType: FlowNodeInputTypeEnum.input
              }
            ]
          }
        ]
      });

      const result = captureDeletedWorkflowReferenceSnapshots({
        previousNodes: [consumer],
        nextNodes: [consumer],
        previousChatConfig: {
          variables: [
            {
              key: 'deleted',
              label: 'Deleted variable',
              type: VariableInputEnum.input,
              description: ''
            }
          ]
        },
        nextChatConfig: { variables: [] },
        globalVariableSourceLabel: 'Variable'
      });

      expect(result[0].data.inputs[0].value[0].valueReferenceSnapshots).toEqual([
        {
          reference: [VARIABLE_NODE_ID, 'deleted'],
          sourceLabel: 'Variable',
          outputLabel: 'Deleted variable',
          icon: 'core/workflow/template/variable'
        }
      ]);
    });
  });
});
