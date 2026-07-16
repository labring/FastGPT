import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { filterAgentLoopCoreToolResponseToPreview } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/assistantResponses/preview';
import { describe, expect, it } from 'vitest';

describe('filterAgentLoopCoreToolResponseToPreview', () => {
  it('keeps non-tool items and trims long tool responses to head and tail preview', () => {
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
