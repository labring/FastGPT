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
              renderTypeList: [FlowNodeInputTypeEnum.input]
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
        toolParams: [
          expect.objectContaining({
            key: 'q',
            toolDescription: 'Query'
          })
        ]
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
    expect(result[0].toolParams).toEqual([]);
  });
});
