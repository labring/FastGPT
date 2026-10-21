import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { ChakraProvider } from '@chakra-ui/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import InteractiveReply from '@/components/core/chat/ChatContainer/ChatBox/components/InteractiveReply';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

describe('InteractiveReply', () => {
  // Vitest 使用 classic JSX 转换；生产中的 Next.js 自动注入 JSX runtime。
  beforeAll(() => vi.stubGlobal('React', React));
  afterAll(() => vi.unstubAllGlobals());

  it('renders questions and readable answers in a user card without the AI accordion', () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        ChakraProvider,
        null,
        React.createElement(InteractiveReply, {
          chatValue: [{ text: { content: '{"answers":["confirm","Custom feedback",""]}' } }],
          reply: {
            type: 'agentAsk',
            interactionId: 'ask-1',
            questions: [
              {
                question: 'Choose an action',
                answer: 'Confirm action'
              },
              { question: 'Add feedback', answer: 'Custom feedback\nMore details' },
              { question: 'Optional detail', answer: '' }
            ]
          }
        })
      )
    );
    const dom = new JSDOM(markup);
    const card = dom.window.document.querySelector('.chakra-card');
    card?.querySelectorAll('style').forEach((style) => style.remove());

    expect(card).not.toBeNull();
    expect(card?.textContent).toBe(
      'Choose an actionConfirm actionAdd feedbackCustom feedback\nMore detailsOptional detailchat:interactive.agent_ask.unanswered'
    );
    expect(dom.window.document.querySelector('.chakra-accordion')).toBeNull();
    expect(markup.includes('--chakra-line-clamp:1')).toBe(true);
    dom.window.close();
  });
});
