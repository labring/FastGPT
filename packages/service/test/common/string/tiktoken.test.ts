import { describe, expect, it } from 'vitest';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import {
  GPT_TOKENIZER_ENCODING,
  countGptMessagesTokensInWorker,
  countPromptTokensInWorker
} from '@fastgpt/service/worker/countGptMessagesTokens/count';

describe('token counter', () => {
  it('should use the modern GPT o200k_base encoding', () => {
    const text =
      'FastGPT 是一个 AI Agent 构建平台，通过 Flow 提供数据处理、模型调用和可视化工作流编排。';

    expect(GPT_TOKENIZER_ENCODING).toBe('o200k_base');
    expect(countPromptTokensInWorker(text)).toBe(28);
  });

  it('should keep prompt-only counts compatible with empty role messages', () => {
    const text = 'FastGPT 是一个 AI Agent 构建平台。';
    const promptTokens = countPromptTokensInWorker(text);
    const messageTokens = countGptMessagesTokensInWorker({
      messages: [
        {
          // countPromptTokens 历史上会把普通 prompt 包成空 role message。
          // 该路径不能额外计算 chat message 的 role 固定开销。
          role: '' as any,
          content: text
        }
      ]
    });

    expect(messageTokens).toBe(promptTokens);
  });

  it('should count message content, role overhead, tools and assistant calls', () => {
    const tokens = countGptMessagesTokensInWorker({
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Search FastGPT docs.' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'search',
                arguments: '{"query":"FastGPT"}'
              }
            }
          ]
        }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'search',
            description: 'Search docs',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string' }
              },
              required: ['query']
            }
          }
        }
      ]
    });

    expect(tokens).toBeGreaterThan(40);
  });

  it.each(['tool', 'user'] as const)(
    'should count historical reasoning when the last message is %s',
    (lastRole) => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Search FastGPT docs.' },
        {
          role: 'assistant',
          content: '',
          reasoning_content: 'I need to inspect the documentation before answering. '.repeat(100),
          tool_calls: [
            {
              id: 'call_search',
              type: 'function',
              function: { name: 'search', arguments: '{}' }
            }
          ]
        },
        { role: 'tool', tool_call_id: 'call_search', content: 'Found the documentation.' }
      ];
      if (lastRole === 'user') {
        messages.push({ role: 'user', content: 'Continue with these results.' });
      }
      const originalMessages = structuredClone(messages);
      const withoutReasoning = messages.map(({ reasoning_content, ...message }) => message);
      const reasoningTokens = countPromptTokensInWorker(messages[1].reasoning_content);

      expect(countGptMessagesTokensInWorker({ messages })).toBeGreaterThan(
        countGptMessagesTokensInWorker({ messages: withoutReasoning }) + reasoningTokens * 0.9
      );
      expect(messages).toEqual(originalMessages);
    }
  );

  it('should match incremental counts after each append and when restoring the full history', () => {
    const tools: ChatCompletionTool[] = [
      {
        type: 'function',
        function: { name: 'search', parameters: { type: 'object', properties: {} } }
      }
    ];
    const initialMessages: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'Complete the search.' },
      { role: 'user', content: 'Compare the results.' }
    ];
    const newMessages: ChatCompletionMessageParam[] = Array.from({ length: 3 }, (_, index) => [
      {
        role: 'assistant' as const,
        content: '',
        reasoning_content: `Inspect result ${index} before the next search.`,
        tool_calls: [
          {
            id: `call_${index}`,
            type: 'function' as const,
            function: { name: 'search', arguments: JSON.stringify({ page: index + 1 }) }
          }
        ]
      },
      { role: 'tool' as const, tool_call_id: `call_${index}`, content: `Result ${index}` }
    ]).flat();
    newMessages.push({ role: 'user', content: 'Continue.' });
    const messages = [...initialMessages];
    let incrementalTokens = countGptMessagesTokensInWorker({ messages, tools });

    for (const message of newMessages) {
      messages.push(message);
      incrementalTokens += countGptMessagesTokensInWorker({ messages: [message] });
      expect(countGptMessagesTokensInWorker({ messages, tools })).toBe(incrementalTokens);
    }

    expect(countGptMessagesTokensInWorker({ messages: structuredClone(messages), tools })).toBe(
      incrementalTokens
    );
  });

  it('should keep missing and empty historical reasoning equivalent', () => {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'user', content: 'Hello.' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'Continue.' }
    ];

    expect(
      countGptMessagesTokensInWorker({
        messages: messages.map((message) =>
          message.role === 'assistant' ? { ...message, reasoning_content: '' } : message
        )
      })
    ).toBe(countGptMessagesTokensInWorker({ messages }));
  });

  it('should replace media payloads with bounded placeholders before tokenizing', () => {
    const largeBase64 = 'A'.repeat(1024 * 1024);
    const mediaMessages = [
      {
        role: 'user' as const,
        content: [
          {
            type: 'image_url' as const,
            image_url: { url: `data:image/png;base64,${largeBase64}`, detail: 'high' as const }
          },
          {
            type: 'input_audio' as const,
            input_audio: { format: 'wav' as const, data: largeBase64 }
          },
          {
            type: 'video_url' as const,
            video_url: { url: `data:video/mp4;base64,${largeBase64}` }
          },
          {
            type: 'file' as const,
            file: { filename: 'example.pdf', file_data: largeBase64 }
          }
        ]
      }
    ];
    const shortMediaMessages = [
      {
        role: 'user' as const,
        content: [
          {
            type: 'image_url' as const,
            image_url: { url: 'data:image/png;base64,short', detail: 'high' as const }
          },
          {
            type: 'input_audio' as const,
            input_audio: { format: 'wav' as const, data: 'short' }
          },
          {
            type: 'video_url' as const,
            video_url: { url: 'data:video/mp4;base64,short' }
          },
          {
            type: 'file' as const,
            file: { filename: 'example.pdf', file_data: 'short' }
          }
        ]
      }
    ];

    expect(countGptMessagesTokensInWorker({ messages: mediaMessages })).toBe(
      countGptMessagesTokensInWorker({ messages: shortMediaMessages })
    );
  });

  it('音频没有 format 时使用固定占位符，不计数二进制或 undefined', () => {
    const audioTokens = countGptMessagesTokensInWorker({
      messages: [
        {
          role: 'user',
          content: [{ type: 'input_audio', input_audio: { data: 'A'.repeat(4096) } }]
        }
      ]
    });

    expect(audioTokens).toBe(
      countGptMessagesTokensInWorker({ messages: [{ role: 'user', content: '[audio]' }] })
    );
  });
});
