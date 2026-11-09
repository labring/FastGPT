import { describe, expect, it, vi } from 'vitest';
import { convertMessages } from '@mariozechner/pi-ai/openai-completions';
import { serviceEnv } from '@fastgpt/service/env';

const previewProxyEnv: { AGENT_SANDBOX_PREVIEW_PROXY_URL?: string | undefined } = serviceEnv;
import {
  convertChatMessagesToPiAgentMessages,
  convertPiAgentMessagesToChatMessages,
  convertToolResponseContentToPiContent,
  mapStopReason,
  normalizePiAgentMessages,
  replaceInteractiveToolResult,
  resolveInteractiveToolCall
} from '@fastgpt/service/core/ai/llm/agentLoop/provider/piAgent/message';

vi.mock('@fastgpt/service/common/file/image/utils', () => ({
  getImageBase64: vi.fn()
}));

import { getImageBase64 } from '@fastgpt/service/common/file/image/utils';

const model = {
  api: 'openai-completions',
  provider: 'openai',
  id: 'gpt-5',
  reasoning: true
} as any;

describe('piAgent message conversion', () => {
  it.each(['', 'Original reasoning.'])(
    'keeps the reasoning field and its signature across context conversion: %s',
    async (reasoning) => {
      const converted = await convertChatMessagesToPiAgentMessages({
        model,
        messages: [{ role: 'assistant', content: 'Answer.', reasoning_content: reasoning }]
      });
      expect(converted[0]).toMatchObject({
        content: [
          { type: 'thinking', thinking: reasoning, thinkingSignature: 'reasoning_content' },
          { type: 'text', text: 'Answer.' }
        ]
      });
      expect(convertPiAgentMessagesToChatMessages(converted)).toEqual([
        { role: 'assistant', content: 'Answer.', reasoning_content: reasoning }
      ]);
      if (reasoning) {
        const outgoing = convertMessages(
          { ...model, baseUrl: 'https://example.com/v1' },
          { messages: converted },
          {} as Parameters<typeof convertMessages>[2]
        );
        expect(outgoing[0]).toHaveProperty('reasoning_content', reasoning);
      }
    }
  );

  it('does not add thinking blocks to non-reasoning models', async () => {
    const converted = await convertChatMessagesToPiAgentMessages({
      model: { ...model, reasoning: false },
      messages: [{ role: 'assistant', content: 'Answer.', reasoning_content: '' }]
    });
    expect(converted[0]).toMatchObject({ content: [{ type: 'text', text: 'Answer.' }] });
    expect(convertPiAgentMessagesToChatMessages(converted)[0]).not.toHaveProperty(
      'reasoning_content'
    );
  });

  it('converts standard history while preserving reasoning and tool relationships', async () => {
    const result = await convertChatMessagesToPiAgentMessages({
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
          {
            type: 'thinking',
            thinking: 'Need current information.',
            thinkingSignature: 'reasoning_content'
          },
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

  it('converts supported images and safely degrades unsupported remote media', async () => {
    const [message] = await convertChatMessagesToPiAgentMessages({
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

  it('rehydrates remote tool images when vision is enabled during recovery', async () => {
    vi.mocked(getImageBase64).mockResolvedValue({
      completeBase64: 'data:image/png;base64,aW1hZ2U=',
      base64: 'aW1hZ2U=',
      mime: 'image/png'
    });
    const result = await convertChatMessagesToPiAgentMessages({
      model,
      useVision: true,
      messages: [
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_image',
              type: 'function',
              function: { name: 'render', arguments: '{}' }
            }
          ]
        },
        {
          role: 'tool',
          tool_call_id: 'call_image',
          content: [
            { type: 'text', text: 'rendered' },
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/result.png' }
            }
          ]
        }
      ]
    });

    expect(result[1]).toMatchObject({
      role: 'toolResult',
      content: [
        { type: 'text', text: 'rendered' },
        { type: 'image', mimeType: 'image/png', data: 'aW1hZ2U=' }
      ]
    });
  });

  it('drops tool images during recovery when vision is disabled', async () => {
    const result = await convertChatMessagesToPiAgentMessages({
      model,
      useVision: false,
      messages: [
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_image',
              type: 'function',
              function: { name: 'render', arguments: '{}' }
            }
          ]
        },
        {
          role: 'tool',
          tool_call_id: 'call_image',
          content: [
            { type: 'text', text: 'rendered' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,aW1hZ2U=' }
            }
          ]
        }
      ]
    });

    expect(result[1]).toMatchObject({
      role: 'toolResult',
      content: [
        { type: 'text', text: 'rendered' },
        { type: 'text', text: '[Image: image/png]' }
      ]
    });
  });

  it('falls back to empty tool arguments when persisted JSON is malformed', async () => {
    const [message] = await convertChatMessagesToPiAgentMessages({
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

  it('drops user images during recovery when vision is disabled', async () => {
    const [message] = await convertChatMessagesToPiAgentMessages({
      model,
      useVision: false,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'inspect' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,aW1hZ2U=' }
            }
          ]
        }
      ]
    });

    expect(message).toMatchObject({
      role: 'user',
      content: [
        { type: 'text', text: 'inspect' },
        { type: 'text', text: '[Image: image/png]' }
      ]
    });
  });

  it('keeps user images during recovery when vision is enabled', async () => {
    const [message] = await convertChatMessagesToPiAgentMessages({
      model,
      useVision: true,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'inspect' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,aW1hZ2U=' }
            }
          ]
        }
      ]
    });

    expect(message).toMatchObject({
      role: 'user',
      content: [
        { type: 'text', text: 'inspect' },
        { type: 'image', mimeType: 'image/png', data: 'aW1hZ2U=' }
      ]
    });
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

  it('keeps tool images when converting pi context back for checkpoint compression', () => {
    const result = convertPiAgentMessagesToChatMessages([
      {
        role: 'toolResult',
        toolCallId: 'call_image',
        toolName: 'render',
        content: [
          { type: 'text', text: 'result' },
          { type: 'image', mimeType: 'image/png', data: 'aW1hZ2U=' }
        ],
        details: {},
        isError: false,
        timestamp: 1
      }
    ]);

    expect(result[0]).toMatchObject({
      role: 'tool',
      tool_call_id: 'call_image',
      content: [
        { type: 'text', text: 'result' },
        {
          type: 'image_url',
          image_url: { url: 'data:image/png;base64,aW1hZ2U=' }
        }
      ]
    });
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

  it('keeps tool image content when an interactive tool resumes', () => {
    const call = {
      id: 'call_ask',
      type: 'function',
      function: { name: 'ask_user', arguments: '{}' }
    } as any;

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
      response: '{"jobId":"task-123"}',
      isError: false,
      content: [
        { type: 'text', text: '{"jobId":"task-123"}' },
        { type: 'image', mimeType: 'image/png', data: 'AAAA' }
      ]
    });

    // 恢复路径必须和普通路径一样保留图片，否则 ask_user 续跑会丢视觉输入。
    expect((result[0] as any).content).toEqual([
      { type: 'text', text: '{"jobId":"task-123"}' },
      { type: 'image', mimeType: 'image/png', data: 'AAAA' }
    ]);
  });

  it('converts tool response parts to pi content and degrades images when vision is disabled', async () => {
    const parts = [
      { type: 'text', text: 'ok' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } }
    ];

    const withVision = await convertToolResponseContentToPiContent(parts as any);
    expect(withVision).toEqual([
      { type: 'text', text: 'ok' },
      { type: 'image', mimeType: 'image/png', data: 'aW1hZ2U=' }
    ]);

    const withoutVision = await convertToolResponseContentToPiContent(parts as any, {
      useVision: false
    });
    expect(withoutVision).toEqual([
      { type: 'text', text: 'ok' },
      // data URI 不能原样铺进文本，只保留 mime 占位。
      { type: 'text', text: '[Image: image/png]' }
    ]);
  });

  it('never echoes a malformed data uri into the placeholder text', async () => {
    const result = await convertToolResponseContentToPiContent(
      [
        {
          type: 'image_url',
          image_url: { url: 'data:;base64,THIS_IS_PAYLOAD' }
        }
      ] as any,
      { useVision: false }
    );

    // 缺 mime 的 data URI 也要脱敏，否则整段 base64 会进 prompt 文本。
    expect(result).toEqual([{ type: 'text', text: '[Image: data URI]' }]);
  });

  it('masks sandbox preview urls in image placeholders when vision is disabled', async () => {
    const original = previewProxyEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL;
    previewProxyEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL = 'https://sandbox-preview.example.com';
    try {
      const result = await convertToolResponseContentToPiContent(
        [
          {
            type: 'image_url',
            image_url: {
              url: 'https://sandbox-preview.example.com/preview/sandbox-1/session-1/a.png'
            }
          }
        ] as any,
        { useVision: false }
      );

      expect(result).toEqual([{ type: 'text', text: '[Image: sandbox preview file]' }]);
    } finally {
      previewProxyEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL = original;
    }
  });

  it('masks sandbox preview urls when image download fails', async () => {
    const original = previewProxyEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL;
    previewProxyEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL = 'https://sandbox-preview.example.com';
    vi.mocked(getImageBase64).mockRejectedValue(new Error('download failed'));
    try {
      const result = await convertToolResponseContentToPiContent(
        [
          {
            type: 'image_url',
            image_url: {
              url: 'https://sandbox-preview.example.com/preview/sandbox-1/session-1/a.png'
            }
          }
        ] as any,
        { useVision: true }
      );

      expect(result).toEqual([{ type: 'text', text: '[Image: sandbox preview file]' }]);
    } finally {
      previewProxyEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL = original;
    }
  });

  it('converts string tool responses to a single text part', async () => {
    const result = await convertToolResponseContentToPiContent('plain');
    expect(result).toEqual([{ type: 'text', text: 'plain' }]);
  });

  it('maps pi stop reasons to the shared agent-loop finish reasons', () => {
    expect(mapStopReason('toolUse')).toBe('tool_calls');
    expect(mapStopReason('length')).toBe('length');
    expect(mapStopReason('error')).toBe('error');
    expect(mapStopReason('aborted')).toBe('close');
    expect(mapStopReason('stop')).toBe('stop');
  });
});
