import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { ChakraProvider } from '@chakra-ui/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatSiteItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import type AIChatBubble from '@/components/core/chat/ChatContainer/ChatBox/components/AIChatBubble';
import ChatItem from '@/components/core/chat/ChatContainer/ChatBox/components/ChatItem';
import type { WorkflowBuilderPreviewInteractive } from '@fastgpt/global/core/workflow/builder/type';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
// 图标异步加载不参与 SSR，用可查询的标记验证真实气泡的编辑入口。
vi.mock('@fastgpt/web/components/common/Icon', () => ({
  default: ({ name }: { name: string }) => React.createElement('svg', { 'data-icon': name })
}));
// 只隔离 AI 叶子展示和操作区，保留 ChatItem 分组和用户气泡的真实渲染。
vi.mock('@/components/core/chat/ChatContainer/ChatBox/components/AIChatBubble', () => ({
  default: ({ chatValue, children }: React.ComponentProps<typeof AIChatBubble>) =>
    React.createElement(
      'section',
      { 'data-ai-message': '' },
      chatValue
        .map((value) => {
          if (value.interactive?.type === 'workflowBuilderPreview') {
            return value.interactive.params.sections
              .map((section) => `${section.title}${section.content}`)
              .join('');
          }
          return value.text?.content ?? '';
        })
        .join(''),
      children
    )
}));

const answeredAsk: Extract<ChatSiteItemType, { obj: ChatRoleEnum.AI }> = {
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
          questions: [{ question: 'Question', options: [] }]
        },
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      }
    }
  ]
};

/** SSR 足以验证消息归属与顺序，避免为纯展示路由引入请求或生成状态 mock。 */
const renderChatItem = (
  chat: ChatSiteItemType | ChatSiteItemType[],
  children?: React.ReactNode
) => {
  const chats = Array.isArray(chat) ? chat : [chat];
  const markup = renderToStaticMarkup(
    React.createElement(
      ChakraProvider,
      null,
      chats.map((item, index) =>
        React.createElement(
          ChatItem,
          { key: item.dataId, chat: item, isLastChild: index === chats.length - 1 },
          children
        )
      )
    )
  );
  const dom = new JSDOM(markup, { url: 'https://fastgpt.example' });
  dom.window.document.querySelectorAll('style').forEach((style) => style.remove());
  return dom;
};

describe('ChatItem interactive replies', () => {
  beforeAll(() => vi.stubGlobal('React', React));
  afterAll(() => vi.unstubAllGlobals());

  it('renders Ask only on its real user record and preserves both AI segments', () => {
    const user: ChatSiteItemType = {
      id: 'answer-user',
      dataId: 'answer-user',
      obj: ChatRoleEnum.Human,
      status: ChatStatusEnum.finish,
      value: [
        {
          select: {
            type: 'agentAsk',
            questions: [{ question: 'Question', value: 'Answer' }]
          }
        }
      ]
    };
    const dom = renderChatItem([
      { ...answeredAsk, value: [{ text: { content: 'Before ask' } }, ...answeredAsk.value] },
      user,
      {
        ...answeredAsk,
        id: 'continued-ai',
        dataId: 'continued-ai',
        value: [{ text: { content: 'After ask' } }]
      }
    ]);
    const document = dom.window.document;
    const cards = [...document.querySelectorAll('.chat-box-card')];
    expect(cards.map((card) => card.textContent)).toEqual([
      'Before ask',
      'QuestionAnswer',
      'After ask'
    ]);
    const replyCard = document.querySelector('[data-chat-id="answer-user"] .chakra-card');
    expect(replyCard?.textContent).toBe('QuestionAnswer');
    expect(replyCard?.querySelector('[data-ai-message]')).toBeNull();
    expect(document.querySelector('[data-chat-id="ai-1"]')?.textContent).not.toContain('Question');
    expect(document.body.textContent).not.toContain('answers');
    dom.window.close();

    // 分页加载时即使没有原来的提问 AI，user 消息仍能独立渲染问答。
    const standalone = renderChatItem(user);
    expect(standalone.window.document.querySelector('.chakra-card')?.textContent).toBe(
      'QuestionAnswer'
    );
    standalone.window.close();
  });

  it('keeps resume errors and feedback on the AI record without rendering a user reply there', () => {
    const dom = renderChatItem(
      { ...answeredAsk, errorMsg: 'Resume failed' },
      React.createElement('div', null, 'Feedback')
    );
    const cards = [...dom.window.document.querySelectorAll('.chat-box-card')];
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain('Resume failed');
    expect(cards[0].textContent).toContain('Feedback');
    expect(cards[0].querySelector('[data-ai-message]')).not.toBeNull();
    expect(dom.window.document.querySelector('.chakra-card')).toBeNull();
    dom.window.close();
  });

  it('uses the same readonly question/answer layout for custom and skipped Ask answers', () => {
    const dom = renderChatItem({
      id: 'answer-user',
      dataId: 'answer-user',
      obj: ChatRoleEnum.Human,
      status: ChatStatusEnum.finish,
      value: [
        {
          text: { content: '{"answers":["custom",""]}' },
          select: {
            type: 'agentAsk',
            questions: [
              { question: 'Question 1', value: 'custom' },
              { question: 'Question 2', value: '' }
            ]
          }
        }
      ]
    });
    expect(dom.window.document.querySelector('.chakra-card')?.textContent).toBe(
      'Question 1customQuestion 2chat:interactive.agent_ask.unanswered'
    );
    expect(dom.window.document.body.textContent).not.toContain('answers');
    expect(dom.window.document.querySelector('[data-icon="copy"]')).not.toBeNull();
    expect(dom.window.document.querySelector('[data-icon="edit"]')).toBeNull();
    dom.window.close();
  });

  it('keeps the edit action for an ordinary text user message', () => {
    const dom = renderChatItem({
      id: 'plain-user',
      dataId: 'plain-user',
      obj: ChatRoleEnum.Human,
      status: ChatStatusEnum.finish,
      value: [{ text: { content: 'Plain input' } }]
    });
    expect(dom.window.document.querySelector('[data-icon="edit"]')).not.toBeNull();
    dom.window.close();
  });

  it('does not render a consultation row or an empty AI bubble while waiting for an answer', () => {
    const dom = renderChatItem(answeredAsk);
    const cards = [...dom.window.document.querySelectorAll('.chat-box-card')];
    expect(cards).toHaveLength(0);
    expect(dom.window.document.querySelector('[data-ai-message]')).toBeNull();
    dom.window.close();
  });

  it.each([
    { answerValue: 'confirm', answerText: undefined, expected: '确认并开始搭建' },
    { answerValue: 'revise', answerText: '增加审核分支', expected: '增加审核分支' },
    { answerValue: 'cancel', answerText: undefined, expected: '取消' }
  ] as const)(
    'renders a persisted $answerValue user reply once before the next AI message',
    (response) => {
      const preview: WorkflowBuilderPreviewInteractive = {
        type: 'workflowBuilderPreview',
        previewId: 'preview-1',
        params: {
          title: '确认工作流方案？',
          mermaid: 'flowchart LR\n  A --> B',
          sections: [{ title: '工作流说明', content: '预览内容' }],
          actions: [
            { value: 'confirm', label: '确认并开始搭建', inputMode: 'none' },
            { value: 'revise', label: '修改方案', inputMode: 'text' },
            { value: 'cancel', label: '取消', inputMode: 'none' }
          ]
        }
      };
      const dom = renderChatItem([
        {
          ...answeredAsk,
          value: [
            {
              interactive: { ...preview, entryNodeIds: [], memoryEdges: [], nodeOutputs: [] }
            }
          ]
        },
        {
          id: 'preview-reply',
          dataId: 'preview-reply',
          obj: ChatRoleEnum.Human,
          status: ChatStatusEnum.finish,
          value: [
            {
              text: { content: response.expected },
              select: {
                type: 'workflowBuilderPreview',
                questions: [{ question: preview.params.title, value: response.expected }]
              }
            }
          ]
        },
        {
          ...answeredAsk,
          id: 'continued-ai',
          dataId: 'continued-ai',
          value: [{ text: { content: '继续搭建' } }]
        }
      ]);
      const cards = [...dom.window.document.querySelectorAll('.chat-box-card')];
      expect(cards.map((card) => card.textContent)).toEqual([
        '工作流说明预览内容',
        `确认工作流方案？${response.expected}`,
        '继续搭建'
      ]);
      expect(dom.window.document.querySelector('[data-chat-id="preview-reply"] .chakra-card')).toBe(
        cards[1].querySelector('.chakra-card')
      );
      expect(dom.window.document.querySelector('[data-chat-id="ai-1"]')?.textContent).not.toContain(
        response.expected
      );
      expect(cards[0].querySelector('[data-ai-message]')).not.toBeNull();
      expect(cards[1].querySelector('.chakra-card')).not.toBeNull();
      expect(cards[1].querySelector('[data-ai-message]')).toBeNull();
      expect(cards[1].querySelector('[data-icon="copy"]')).not.toBeNull();
      expect(cards[1].querySelector('[data-icon="edit"]')).toBeNull();
      expect(dom.window.document.body.textContent).not.toContain(
        'interactive.user_select.selected'
      );
      expect(dom.window.document.body.textContent).not.toContain('interactive.agent_ask.waiting');
      dom.window.close();
    }
  );
});
