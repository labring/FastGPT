import { describe, expect, it } from 'vitest';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { useToolNodeList } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/hooks/useToolNodeList';

const createToolNode = (overrides: Record<string, any> = {}) =>
  ({
    nodeId: 'tool_1',
    name: 'Search',
    flowNodeType: FlowNodeTypeEnum.tool,
    avatar: 'tool-avatar',
    intro: 'Search intro',
    toolDescription: 'Search data',
    inputs: [],
    ...overrides
  }) as any;

describe('useToolNodeList', () => {
  it('returns configured selected tool nodes and extracts params/schema', () => {
    const inputSchema = {
      type: 'object',
      properties: {
        q: { type: 'string' }
      }
    };
    const result = useToolNodeList({
      nodeId: 'toolcall',
      runtimeEdges: [
        {
          source: 'toolcall',
          target: 'tool_1',
          targetHandle: NodeOutputKeyEnum.selectedTools
        },
        {
          source: 'toolcall',
          target: 'ignored_by_handle',
          targetHandle: NodeOutputKeyEnum.answerText
        },
        {
          source: 'other',
          target: 'ignored_by_source',
          targetHandle: NodeOutputKeyEnum.selectedTools
        }
      ] as any,
      runtimeNodes: [
        createToolNode({
          inputs: [
            {
              key: 'q',
              valueType: 'string',
              toolDescription: 'Query',
              required: true,
              selectedType: FlowNodeInputTypeEnum.agentGenerated,
              renderTypeList: [FlowNodeInputTypeEnum.agentGenerated]
            },
            {
              key: 'apiKey',
              valueType: 'string',
              toolDescription: 'Developer config',
              required: true,
              value: 'secret',
              renderTypeList: [FlowNodeInputTypeEnum.password]
            },
            {
              key: NodeInputKeyEnum.toolData,
              value: {
                inputSchema
              },
              renderTypeList: []
            }
          ]
        })
      ]
    });

    expect(result).toEqual([
      expect.objectContaining({
        nodeId: 'tool_1',
        name: 'Search',
        flowNodeType: FlowNodeTypeEnum.tool,
        avatar: 'tool-avatar',
        intro: 'Search intro',
        toolDescription: 'Search data',
        jsonSchema: inputSchema,
        inputs: expect.arrayContaining([
          expect.objectContaining({
            key: 'q',
            toolDescription: 'Query'
          })
        ])
      })
    ]);
  });

  it('filters missing and waiting-for-config tools', () => {
    const result = useToolNodeList({
      nodeId: 'toolcall',
      runtimeEdges: [
        {
          source: 'toolcall',
          target: 'missing',
          targetHandle: NodeOutputKeyEnum.selectedTools
        },
        {
          source: 'toolcall',
          target: 'waiting',
          targetHandle: NodeOutputKeyEnum.selectedTools
        },
        {
          source: 'toolcall',
          target: 'ready',
          targetHandle: NodeOutputKeyEnum.selectedTools
        }
      ] as any,
      runtimeNodes: [
        createToolNode({
          nodeId: 'waiting',
          inputs: [
            {
              key: 'apiKey',
              required: true,
              value: '',
              renderTypeList: [FlowNodeInputTypeEnum.input]
            }
          ]
        }),
        createToolNode({
          nodeId: 'ready',
          name: 'Ready tool',
          inputs: [
            {
              key: 'apiKey',
              required: true,
              value: 'secret',
              renderTypeList: [FlowNodeInputTypeEnum.password]
            }
          ]
        })
      ]
    });

    expect(result).toEqual([
      expect.objectContaining({
        nodeId: 'ready',
        name: 'Ready tool'
      })
    ]);
  });

  it('uses normalized selectedType from the runtime boundary', () => {
    const result = useToolNodeList({
      nodeId: 'toolcall',
      runtimeEdges: [
        {
          source: 'toolcall',
          target: 'tool_1',
          targetHandle: NodeOutputKeyEnum.selectedTools
        }
      ] as any,
      runtimeNodes: [
        createToolNode({
          inputs: [
            {
              key: 'query',
              valueType: 'string',
              required: true,
              isToolParam: true,
              renderTypeList: [
                FlowNodeInputTypeEnum.agentGenerated,
                FlowNodeInputTypeEnum.input,
                FlowNodeInputTypeEnum.reference
              ],
              selectedType: FlowNodeInputTypeEnum.agentGenerated
            }
          ]
        })
      ]
    });

    expect(result[0].inputs).toEqual([
      expect.objectContaining({
        key: 'query',
        selectedType: FlowNodeInputTypeEnum.agentGenerated,
        renderTypeList: [
          FlowNodeInputTypeEnum.agentGenerated,
          FlowNodeInputTypeEnum.input,
          FlowNodeInputTypeEnum.reference
        ]
      })
    ]);
  });

  it('reads normalized system tool input modes', () => {
    const runtimeNodes = [
      createToolNode({
        nodeId: 'mkJ7eY',
        toolConfig: {
          systemTool: {
            toolId: 'bocha'
          }
        },
        inputs: [
          {
            key: 'query',
            valueType: 'string',
            required: true,
            toolDescription: 'Search query',
            renderTypeList: [
              FlowNodeInputTypeEnum.agentGenerated,
              FlowNodeInputTypeEnum.input,
              FlowNodeInputTypeEnum.reference
            ],
            selectedType: FlowNodeInputTypeEnum.agentGenerated
          },
          {
            key: 'freshness',
            valueType: 'string',
            value: 'noLimit',
            renderTypeList: [FlowNodeInputTypeEnum.select, FlowNodeInputTypeEnum.reference],
            selectedType: FlowNodeInputTypeEnum.select
          }
        ]
      })
    ];
    const result = useToolNodeList({
      nodeId: 'toolcall',
      runtimeEdges: [
        {
          source: 'toolcall',
          target: 'mkJ7eY',
          targetHandle: NodeOutputKeyEnum.selectedTools
        }
      ] as any,
      runtimeNodes
    });

    expect(result[0].inputs).toEqual([
      expect.objectContaining({
        key: 'query',
        selectedType: FlowNodeInputTypeEnum.agentGenerated
      }),
      expect.objectContaining({
        key: 'freshness',
        value: 'noLimit',
        selectedType: FlowNodeInputTypeEnum.select
      })
    ]);
    expect(runtimeNodes[0].inputs).toEqual(result[0].inputs);
  });

  it('keeps existing jsonSchema when no toolData schema is provided', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        city: { type: 'string' }
      }
    };
    const result = useToolNodeList({
      nodeId: 'toolcall',
      runtimeEdges: [
        {
          source: 'toolcall',
          target: 'tool_1',
          targetHandle: NodeOutputKeyEnum.selectedTools
        }
      ] as any,
      runtimeNodes: [
        createToolNode({
          jsonSchema,
          inputs: [
            {
              key: 'toolData',
              value: {},
              renderTypeList: []
            }
          ]
        })
      ]
    });

    expect(result[0].jsonSchema).toBe(jsonSchema);
  });
});
