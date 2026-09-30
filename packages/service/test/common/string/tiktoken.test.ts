import { describe, expect, it } from 'vitest';
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
});
