import { describe, expect, it } from 'vitest';
import {
  convertChatMessagesToPiAgentMessages,
  convertPiAgentMessagesToChatMessages,
  mapStopReason,
  normalizePiAgentMessages,
  replaceInteractiveToolResult,
  resolveInteractiveToolCall
} from '@fastgpt/service/core/ai/llm/agentLoop/provider/piAgent/message';

const model = {
  api: 'openai-completions',
  provider: 'openai',
  id: 'gpt-5'
} as any;

describe('piAgent message conversion', () => {
  it('converts standard history while preserving reasoning and tool relationships', () => {
    const result = convertChatMessagesToPiAgentMessages({
      model,
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'search FastGPT' },
        {
          role: 'assistant',
          content: 'I will search.',
          reasoning_content: 'Need current information.',
          tool_calls: [
            {
              id: 'call_search',
              type: 'function',
              function: {
                name: 'search',
                arguments: '{"query":"FastGPT"}'
              }
            }
          ]
        },
        {
          role: 'tool',
          tool_call_id: 'call_search',
          content: 'search result'
        },
        {
          role: 'function',
          name: 'legacy_function',
          content: 'legacy result'
        },
        { role: 'developer', content: 'developer prompt' }
      ]
    });

    expect(result).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'search FastGPT'
      }),
      expect.objectContaining({
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Need current information.' },
          { type: 'text', text: 'I will search.' },
          {
            type: 'toolCall',
            id: 'call_search',
            name: 'search',
            arguments: { query: 'FastGPT' }
          }
        ],
        stopReason: 'toolUse'
      }),
      expect.objectContaining({
        role: 'toolResult',
        toolCallId: 'call_search',
        toolName: 'search',
        content: [{ type: 'text', text: 'search result' }]
      }),
      expect.objectContaining({
        role: 'user',
        content: '[Function legacy_function result]\nlegacy result'
      })
    ]);
  });

  it('converts supported images and safely degrades unsupported remote media', () => {
    const [message] = convertChatMessagesToPiAgentMessages({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'inspect' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,aW1hZ2U=' }
            },
            {
              type: 'image_url',
              image_url: { url: 'https://files.example.com/image.png' }
            },
            {
              type: 'video_url',
              video_url: { url: 'https://files.example.com/video.mp4' }
            }
          ]
        }
      ]
    });

    expect(message).toEqual(
      expect.objectContaining({
        role: 'user',
        content: [
          { type: 'text', text: 'inspect' },
          { type: 'image', mimeType: 'image/png', data: 'aW1hZ2U=' },
          { type: 'text', text: '[Image: https://files.example.com/image.png]' },
          { type: 'text', text: '[Video: https://files.example.com/video.mp4]' }
        ]
      })
    );
  });

  it('falls back to empty tool arguments when persisted JSON is malformed', () => {
    const [message] = convertChatMessagesToPiAgentMessages({
      model,
      messages: [
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_invalid',
              type: 'function',
              function: {
                name: 'search',
                arguments: '{invalid'
              }
            }
          ]
        }
      ]
    });

    expect(message).toEqual(
      expect.objectContaining({
        content: [
          expect.objectContaining({
            type: 'toolCall',
            id: 'call_invalid',
            arguments: {}
          })
        ]
      })
    );
  });

  it('converts pi context back to standard messages for checkpoint compression', () => {
    const result = convertPiAgentMessagesToChatMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'inspect' },
          { type: 'image', mimeType: 'image/png', data: 'aW1hZ2U=' }
        ],
        timestamp: 1
      },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'reason' },
          { type: 'text', text: 'answer' },
          { type: 'toolCall', id: 'call_search', name: 'search', arguments: { q: 'FastGPT' } }
        ],
        api: 'openai-completions',
        provider: 'openai',
        model: 'gpt-5',
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
        },
        stopReason: 'toolUse',
        timestamp: 1
      },
      {
        role: 'toolResult',
        toolCallId: 'call_search',
        toolName: 'search',
        content: [{ type: 'text', text: 'result' }],
        details: {},
        isError: false,
        timestamp: 1
      }
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'inspect' },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,aW1hZ2U=' }
          }
        ]
      },
      {
        role: 'assistant',
        content: 'answer',
        reasoning_content: 'reason',
        tool_calls: [
          {
            id: 'call_search',
            type: 'function',
            function: { name: 'search', arguments: '{"q":"FastGPT"}' }
          }
        ]
      },
      {
        role: 'tool',
        tool_call_id: 'call_search',
        name: 'search',
        content: 'result'
      }
    ]);
  });

  it('merges unnamed streamed tool blocks into the best matching named call', () => {
    const [message] = normalizePiAgentMessages({
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              id: 'call_search',
              name: 'search',
              arguments: {}
            },
            {
              type: 'toolCall',
              id: '',
              name: '',
              arguments: { query: 'FastGPT' }
            }
          ]
        } as any
      ],
      completionTools: [
        {
          type: 'function',
          function: {
            name: 'search',
            description: 'Search',
            parameters: {
              type: 'object',
              properties: { query: { type: 'string' } },
              required: ['query']
            }
          }
        }
      ] as any
    });

    expect((message as any).content).toEqual([
      {
        type: 'toolCall',
        id: 'call_search',
        name: 'search',
        arguments: { query: 'FastGPT' }
      }
    ]);
  });

  it('resolves interactive calls from standard history and replaces the persisted placeholder', () => {
    const call = resolveInteractiveToolCall({
      toolCallId: 'call_ask',
      messages: [
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_ask',
              type: 'function',
              function: {
                name: 'ask_user',
                arguments: '{"question":"Confirm?"}'
              }
            }
          ]
        }
      ],
      piMessages: []
    });
    const result = replaceInteractiveToolResult({
      messages: [
        {
          role: 'toolResult',
          toolCallId: 'call_ask',
          toolName: 'ask_user',
          content: [{ type: 'text', text: 'pending' }],
          details: {},
          isError: true,
          timestamp: 1
        } as any
      ],
      call,
      response: 'confirmed',
      isError: false
    });

    expect(call.function.name).toBe('ask_user');
    expect(result).toEqual([
      expect.objectContaining({
        toolCallId: 'call_ask',
        content: [{ type: 'text', text: 'confirmed' }],
        isError: false
      })
    ]);
  });

  it('maps pi stop reasons to the shared agent-loop finish reasons', () => {
    expect(mapStopReason('toolUse')).toBe('tool_calls');
    expect(mapStopReason('length')).toBe('length');
    expect(mapStopReason('error')).toBe('error');
    expect(mapStopReason('aborted')).toBe('close');
    expect(mapStopReason('stop')).toBe('stop');
  });
});
