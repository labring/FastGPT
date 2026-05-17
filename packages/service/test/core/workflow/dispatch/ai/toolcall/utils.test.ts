import { describe, expect, it } from 'vitest';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import {
  filterToolResponseToPreview,
  formatToolResponse,
  initToolCallEdges,
  initToolNodes,
  updateToolInputValue
} from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/utils';

describe('toolcall utils', () => {
  describe('updateToolInputValue', () => {
    it('should overwrite only params provided by tool call and preserve falsy valid values', () => {
      const sourceInputs = [
        { key: 'query', value: 'old query' },
        { key: 'limit', value: 10 },
        { key: 'enabled', value: true },
        { key: 'emptyText', value: 'fallback text' },
        { key: 'nullish', value: 'default value' }
      ] as any[];

      const result = updateToolInputValue({
        params: {
          query: 'new query',
          limit: 0,
          enabled: false,
          emptyText: '',
          nullish: null
        },
        inputs: sourceInputs
      });

      expect(result).toEqual([
        { key: 'query', value: 'new query' },
        { key: 'limit', value: 0 },
        { key: 'enabled', value: false },
        { key: 'emptyText', value: '' },
        { key: 'nullish', value: 'default value' }
      ]);
      expect(result[0]).not.toBe(sourceInputs[0]);
      expect(sourceInputs[0].value).toBe('old query');
    });
  });

  describe('filterToolResponseToPreview', () => {
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

      const result = filterToolResponseToPreview(response);

      expect(result[0]).toBe(response[0]);
      expect(result[1].tools?.[0].response).toContain('...[hide 26 chars]...');
      expect(result[1].tools?.[0].response?.startsWith('a'.repeat(500))).toBe(true);
      expect(result[1].tools?.[0].response?.endsWith('z'.repeat(500))).toBe(true);
      expect(result[1].tools?.[1].response).toBe('short response');
      expect(response[1].tools?.[0].response).toBe(longResponse);
    });
  });

  describe('formatToolResponse', () => {
    it('should stringify object responses with indentation', () => {
      expect(formatToolResponse({ answer: 'ok', list: [1, 2] })).toBe(
        JSON.stringify({ answer: 'ok', list: [1, 2] }, null, 2)
      );
    });

    it('should convert primitive responses and normalize empty primitive responses', () => {
      expect(formatToolResponse(123)).toBe('123');
      expect(formatToolResponse(true)).toBe('true');
      expect(formatToolResponse('')).toBe('none');
      expect(formatToolResponse(undefined)).toBe('none');
      expect(formatToolResponse(null)).toBe('null');
    });
  });

  describe('initToolCallEdges', () => {
    it('should activate only edges targeting entry nodes', () => {
      const edges = [
        { target: 'entry', status: 'waiting' },
        { target: 'other', status: 'waiting' },
        { target: 'secondEntry' }
      ] as any[];

      initToolCallEdges(edges, ['entry', 'secondEntry']);

      expect(edges).toEqual([
        { target: 'entry', status: 'active' },
        { target: 'other', status: 'waiting' },
        { target: 'secondEntry', status: 'active' }
      ]);
    });
  });

  describe('initToolNodes', () => {
    it('should mark entry nodes and inject start params only into entry inputs', () => {
      const nodes = [
        {
          nodeId: 'entry',
          isEntry: false,
          inputs: [
            { key: 'query', value: 'old query' },
            { key: 'limit', value: 5 }
          ]
        },
        {
          nodeId: 'other',
          isEntry: false,
          inputs: [{ key: 'query', value: 'other query' }]
        }
      ] as any[];

      initToolNodes(nodes, ['entry'], {
        query: 'new query',
        limit: 0
      });

      expect(nodes[0]).toMatchObject({
        nodeId: 'entry',
        isEntry: true,
        inputs: [
          { key: 'query', value: 'new query' },
          { key: 'limit', value: 0 }
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

      initToolNodes(nodes, ['entry']);

      expect(nodes[0].isEntry).toBe(true);
      expect(nodes[0].inputs).toBe(inputs);
    });
  });
});
