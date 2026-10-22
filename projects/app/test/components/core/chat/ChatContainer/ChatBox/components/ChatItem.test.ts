import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { ChakraProvider } from '@chakra-ui/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatSiteItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import type AIChatBubble from '@/components/core/chat/ChatContainer/ChatBox/components/AIChatBubble';
import ChatItem from '@/components/core/chat/ChatContainer/ChatBox/components/ChatItem';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
// 这里只隔离 AI 叶子的 Markdown、工具与操作区，保留 ChatItem 和用户气泡的真实渲染。
vi.mock('@/components/core/chat/ChatContainer/ChatBox/components/AIChatBubble', () => ({
  default: ({ chatValue, children }: React.ComponentProps<typeof AIChatBubble>) =>
    React.createElement(
      'section',
      { 'data-ai-message': '' },
      chatValue.map((value) => value.text?.content ?? '').join(''),
      children
    )
}));

const answeredAsk: ChatSiteItemType = {
  id: 'ai-1',
  dataId: 'ai-1',
  obj: ChatRoleEnum.AI,
  status: ChatStatusEnum.finish,
  value: [
    {
      interactive: {
        type: 'agentAsk',
        askId: 'ask-1',
        params: {
          description: '',
          questions: [{ question: 'Question', options: [], answer: 'Answer' }],
          submitted: true
        },
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      }
    }
  ]
};

/** SSR 足以验证消息归属与顺序，避免为纯展示路由引入请求或生成状态 mock。 */
const renderChatItem = (chat: ChatSiteItemType, children?: React.ReactNode) => {
  const markup = renderToStaticMarkup(
    React.createElement(
      ChakraProvider,
      null,
      React.createElement(ChatItem, { chat, isLastChild: true }, children)
    )
  );
  const dom = new JSDOM(markup);
  dom.window.document.querySelectorAll('style').forEach((style) => style.remove());
  return dom;
};

describe('ChatItem Agent Ask messages', () => {
  beforeAll(() => vi.stubGlobal('React', React));
  afterAll(() => vi.unstubAllGlobals());

  it('renders the reply between AI segments as a separate user bubble', () => {
    const dom = renderChatItem({
      ...answeredAsk,
      value: [
        { text: { content: 'Before ask' } },
        ...answeredAsk.value,
        { text: { content: 'After ask' } }
      ]
    });
    const cards = [...dom.window.document.querySelectorAll('.chat-box-card')];
    expect(cards.map((card) => card.textContent)).toEqual([
      'Before ask',
      'QuestionAnswer',
      'After ask'
    ]);
    expect(cards[1].querySelector('.chakra-card')).not.toBeNull();
    expect(cards[1].querySelector('[data-ai-message]')).toBeNull();
    dom.window.close();
  });

  it('keeps resume errors and feedback after an Ask that has no other AI output', () => {
    const dom = renderChatItem(
      { ...answeredAsk, errorMsg: 'Resume failed' },
      React.createElement('div', null, 'Feedback')
    );
    const cards = [...dom.window.document.querySelectorAll('.chat-box-card')];
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toBe('QuestionAnswer');
    expect(cards[1].textContent).toContain('Resume failed');
    expect(cards[1].textContent).toContain('Feedback');
    expect(cards[1].querySelector('[data-ai-message]')).not.toBeNull();
    dom.window.close();
  });
});
