import { describe, expect, it } from 'vitest';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { filterAgentLoopCoreToolResponseToPreview } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/assistantResponses/preview';
import {
  formatAgentLoopCoreToolResponse,
  initAgentLoopCoreWorkflowToolEdges,
  initAgentLoopCoreWorkflowToolNodes,
  updateAgentLoopCoreWorkflowToolInputValue
} from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/application/runtime/workflowToolRunner';

describe('workflow tool runner utils', () => {
  describe('updateAgentLoopCoreWorkflowToolInputValue', () => {
    it('should overwrite only agent generated params and preserve falsy valid values', () => {
      const sourceInputs = [
        {
          key: 'query',
          value: 'old query',
          renderTypeList: [FlowNodeInputTypeEnum.agentGenerated]
        },
        {
          key: 'limit',
          value: 10,
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
          selectedTypeIndex: 1
        },
        {
          key: 'enabled',
          value: true,
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
          selectedTypeIndex: 1
        },
        {
          key: 'manualText',
          value: 'fixed value',
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
          selectedTypeIndex: 0
        },
        {
          key: 'password',
          value: 'secret',
          renderTypeList: [FlowNodeInputTypeEnum.password, FlowNodeInputTypeEnum.agentGenerated],
          selectedTypeIndex: 1
        },
        {
          key: 'emptyText',
          value: 'fallback text',
          renderTypeList: [FlowNodeInputTypeEnum.agentGenerated]
        },
        {
          key: 'nullish',
          value: 'default value',
          renderTypeList: [FlowNodeInputTypeEnum.agentGenerated]
        }
      ] as any[];

      const result = updateAgentLoopCoreWorkflowToolInputValue({
        params: {
          query: 'new query',
          limit: 0,
          enabled: false,
          manualText: 'model value',
          password: 'model secret',
          emptyText: '',
          nullish: null
        },
        inputs: sourceInputs
      });

      expect(result).toEqual([
        {
          key: 'query',
          value: 'new query',
          renderTypeList: [FlowNodeInputTypeEnum.agentGenerated]
        },
        {
          key: 'limit',
          value: 0,
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
          selectedTypeIndex: 1
        },
        {
          key: 'enabled',
          value: false,
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
          selectedTypeIndex: 1
        },
        {
          key: 'manualText',
          value: 'fixed value',
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
          selectedTypeIndex: 0
        },
        {
          key: 'password',
          value: 'secret',
          renderTypeList: [FlowNodeInputTypeEnum.password, FlowNodeInputTypeEnum.agentGenerated],
          selectedTypeIndex: 1
        },
        {
          key: 'emptyText',
          value: '',
          renderTypeList: [FlowNodeInputTypeEnum.agentGenerated]
        },
        {
          key: 'nullish',
          value: 'default value',
          renderTypeList: [FlowNodeInputTypeEnum.agentGenerated]
        }
      ]);
      expect(result[0]).not.toBe(sourceInputs[0]);
      expect(sourceInputs[0].value).toBe('old query');
    });
  });

  describe('filterAgentLoopCoreToolResponseToPreview', () => {
    it('should keep non-tool items and trim long tool responses to head and tail preview', () => {
      const longResponse = `${'a'.repeat(510)}middle${'z'.repeat(510)}`;
      const response = [
        {
          text: {
            content: 'answer'
          }
        },
        {
          tools: [
            {
              id: 'tool_1',
              toolName: 'Search',
              toolAvatar: '',
              params: '{}',
              functionName: 'search',
              response: longResponse
            },
            {
              id: 'tool_2',
              toolName: 'Read',
              toolAvatar: '',
              params: '{}',
              functionName: 'read',
              response: 'short response'
            }
          ]
        }
      ] as AIChatItemValueItemType[];

      const result = filterAgentLoopCoreToolResponseToPreview(response);

      expect(result[0]).toBe(response[0]);
      expect(result[1].tools?.[0].response).toContain('...[hide 26 chars]...');
      expect(result[1].tools?.[0].response?.startsWith('a'.repeat(500))).toBe(true);
      expect(result[1].tools?.[0].response?.endsWith('z'.repeat(500))).toBe(true);
      expect(result[1].tools?.[1].response).toBe('short response');
      expect(response[1].tools?.[0].response).toBe(longResponse);
    });
  });

  describe('formatAgentLoopCoreToolResponse', () => {
    it('should stringify object responses with indentation', () => {
      expect(formatAgentLoopCoreToolResponse({ answer: 'ok', list: [1, 2] })).toBe(
        JSON.stringify({ answer: 'ok', list: [1, 2] }, null, 2)
      );
    });

    it('should convert primitive responses and normalize empty primitive responses', () => {
      expect(formatAgentLoopCoreToolResponse(123)).toBe('123');
      expect(formatAgentLoopCoreToolResponse(true)).toBe('true');
      expect(formatAgentLoopCoreToolResponse('')).toBe('none');
      expect(formatAgentLoopCoreToolResponse(undefined)).toBe('none');
      expect(formatAgentLoopCoreToolResponse(null)).toBe('null');
    });
  });

  describe('initAgentLoopCoreWorkflowToolEdges', () => {
    it('should activate only edges targeting entry nodes', () => {
      const edges = [
        { target: 'entry', status: 'waiting' },
        { target: 'other', status: 'waiting' },
        { target: 'secondEntry' }
      ] as any[];

      initAgentLoopCoreWorkflowToolEdges(edges, ['entry', 'secondEntry']);

      expect(edges).toEqual([
        { target: 'entry', status: 'active' },
        { target: 'other', status: 'waiting' },
        { target: 'secondEntry', status: 'active' }
      ]);
    });
  });

  describe('initAgentLoopCoreWorkflowToolNodes', () => {
    it('should mark entry nodes and inject start params only into entry inputs', () => {
      const nodes = [
        {
          nodeId: 'entry',
          isEntry: false,
          inputs: [
            {
              key: 'query',
              value: 'old query',
              renderTypeList: [FlowNodeInputTypeEnum.agentGenerated]
            },
            {
              key: 'limit',
              value: 5,
              renderTypeList: [FlowNodeInputTypeEnum.agentGenerated]
            }
          ]
        },
        {
          nodeId: 'other',
          isEntry: false,
          inputs: [{ key: 'query', value: 'other query' }]
        }
      ] as any[];

      initAgentLoopCoreWorkflowToolNodes(nodes, ['entry'], {
        query: 'new query',
        limit: 0
      });

      expect(nodes[0]).toMatchObject({
        nodeId: 'entry',
        isEntry: true,
        inputs: [
          {
            key: 'query',
            value: 'new query',
            renderTypeList: [FlowNodeInputTypeEnum.agentGenerated]
          },
          {
            key: 'limit',
            value: 0,
            renderTypeList: [FlowNodeInputTypeEnum.agentGenerated]
          }
        ]
      });
      expect(nodes[1]).toMatchObject({
        nodeId: 'other',
        isEntry: false,
        inputs: [{ key: 'query', value: 'other query' }]
      });
    });

    it('should not replace inputs when start params are not provided', () => {
      const inputs = [{ key: 'query', value: 'old query' }];
      const nodes = [
        {
          nodeId: 'entry',
          inputs
        }
      ] as any[];

      initAgentLoopCoreWorkflowToolNodes(nodes, ['entry']);

      expect(nodes[0].isEntry).toBe(true);
      expect(nodes[0].inputs).toBe(inputs);
    });
  });
});
