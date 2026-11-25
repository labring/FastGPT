import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { AiChatRows } from '@/components/core/chat/components/WholeResponseModal/ResponseRows';

const translations: Record<string, string> = {
  'chat:response.llm_tokens': 'Tokens 消耗',
  'chat:response.tool_call_tokens': '工具调用 Tokens 消耗',
  'chat:response.compress_llm_usage': '问题优化模型 Tokens 消耗',
  'chat:response.compress_llm_usage_point': '问题优化模型积分消耗',
  'chat:response.token_input': '输入',
  'chat:response.token_output': '输出',
  'chat:response.token_cache_read': '缓存读取',
  'chat:response.token_cache_creation': '缓存创建'
};

vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => translations[key] ?? key })
}));
vi.mock('@/components/Markdown', () => ({
  default: ({ source }: { source: string }) => React.createElement('span', null, source)
}));
vi.mock('@/components/core/chat/ChatContainer/ChatBox/components/QuoteList', () => ({
  default: () => null
}));
vi.mock('@/components/core/chat/components/FormInputResult', () => ({ default: () => null }));

const renderAiChatRows = (moduleOverride: Partial<ChatHistoryItemResType>) => {
  const activeModule: ChatHistoryItemResType = {
    nodeId: 'node-1',
    moduleName: 'AI',
    moduleType: FlowNodeTypeEnum.chatNode,
    ...moduleOverride
  };
  const dom = new JSDOM(
    renderToStaticMarkup(
      React.createElement(
        ChakraProvider,
        null,
        React.createElement(
          'div',
          { id: 'root' },
          React.createElement(AiChatRows, { activeModule })
        )
      )
    )
  );
  try {
    dom.window.document.querySelectorAll('style').forEach((style) => style.remove());
    const root = dom.window.document.getElementById('root');
    return Array.from(root?.children ?? []).map((row) => ({
      label: row.children[0]?.textContent?.trim() ?? '',
      value: row.children[1]?.textContent?.trim() ?? ''
    }));
  } finally {
    dom.window.close();
  }
};

describe('AiChatRows token usage display', () => {
  it('renders input, output, cache read, and cache creation tokens with middle-dot separators', () => {
    const rows = renderAiChatRows({
      inputTokens: 4152,
      outputTokens: 735,
      cacheReadTokens: 2048,
      cacheCreationTokens: 512
    });

    expect(rows).toEqual([
      {
        label: 'Tokens 消耗',
        value: '输入 4152 · 输出 735 · 缓存读取 2048 · 缓存创建 512'
      }
    ]);
  });

  it('renders tool call tokens with cache usage under unified label and omits missing/zero values', () => {
    const rows = renderAiChatRows({
      moduleType: FlowNodeTypeEnum.toolCall,
      toolCallInputTokens: 4152,
      toolCallOutputTokens: 735,
      cacheReadTokens: 1024,
      cacheCreationTokens: 0
    });

    expect(rows).toEqual([
      {
        label: 'Tokens 消耗',
        value: '输入 4152 · 输出 735 · 缓存读取 1024'
      }
    ]);
  });

  it.each([
    {
      name: 'only input and output when cache values are zero or undefined',
      data: { inputTokens: 120, outputTokens: 30, cacheReadTokens: 0 },
      expected: [{ label: 'Tokens 消耗', value: '输入 120 · 输出 30' }]
    },
    {
      name: 'only input when output is zero',
      data: { inputTokens: 88, outputTokens: 0 },
      expected: [{ label: 'Tokens 消耗', value: '输入 88' }]
    },
    {
      name: 'only cache tokens when input and output are absent',
      data: { cacheReadTokens: 200, cacheCreationTokens: 50 },
      expected: [{ label: 'Tokens 消耗', value: '缓存读取 200 · 缓存创建 50' }]
    },
    {
      name: 'no row when all token fields are zero or missing',
      data: {
        tokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0
      },
      expected: []
    },
    {
      name: 'legacy total tokens row when positive',
      data: { tokens: 500 },
      expected: [{ label: 'Tokens 消耗', value: '500' }]
    }
  ])('handles $name', ({ data, expected }) => {
    expect(renderAiChatRows(data)).toEqual(expected);
  });

  it('avoids duplicating cache tokens when both llm and tool call token fields exist', () => {
    const rows = renderAiChatRows({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 4,
      toolCallInputTokens: 20,
      toolCallOutputTokens: 8
    });

    expect(rows).toEqual([
      { label: 'Tokens 消耗', value: '输入 10 · 输出 5 · 缓存读取 4' },
      { label: '工具调用 Tokens 消耗', value: '输入 20 · 输出 8' }
    ]);
  });

  it('renders compressTextAgent token breakdown with cache metrics and hides zero fields', () => {
    const rows = renderAiChatRows({
      compressTextAgent: {
        inputTokens: 300,
        outputTokens: 60,
        cacheReadTokens: 120,
        cacheCreationTokens: 0,
        totalPoints: 0.5
      }
    });

    expect(rows).toEqual([
      { label: '问题优化模型积分消耗', value: '0.5' },
      { label: '问题优化模型 Tokens 消耗', value: '输入 300 · 输出 60 · 缓存读取 120' }
    ]);
  });
});
