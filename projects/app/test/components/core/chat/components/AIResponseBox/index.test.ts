import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import AIResponseBox from '@/components/core/chat/components/AIResponseBox';

vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  Flex: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children)
}));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_context: unknown, selector: (value: object) => unknown) => selector({})
}));
vi.mock('ahooks', () => ({ useMemoizedFn: (fn: unknown) => fn }));
vi.mock('@/web/core/chat/context/chatItemContext', () => ({ ChatItemContext: {} }));
vi.mock('@/components/core/chat/ChatContainer/context/quickReplyContext', () => ({
  QuickReplyContext: {}
}));
vi.mock('@/components/core/chat/ChatContainer/context/chatInstanceActionsContext', () => ({
  useChatInstanceActions: () => ({ sendMessage: vi.fn(), fillInput: vi.fn() })
}));
vi.mock('@/components/core/chat/components/AIResponseBox/RenderPaymentPauseInteractive', () => ({
  default: () => React.createElement('span', null, 'interactive')
}));
vi.mock('@/components/core/chat/components/AIResponseBox/RenderPlan', () => ({
  default: () => React.createElement('span', null, 'interactive')
}));
vi.mock('@/components/core/chat/components/AIResponseBox/RenderChatAgentBuilderVersion', () => ({
  default: ({ isChatting }: { isChatting: boolean }) =>
    React.createElement('button', { disabled: isChatting }, 'interactive')
}));
vi.mock('@/components/core/chat/components/AIResponseBox/RenderPlanStatus', () => ({
  default: () => React.createElement('span', null, 'interactive')
}));
vi.mock('@/components/core/chat/components/AIResponseBox/RenderProcessingCollapse', () => ({
  default: () => React.createElement('span', null, 'interactive')
}));
vi.mock('@/components/core/chat/components/AIResponseBox/RenderReasoningContent', () => ({
  default: () => React.createElement('span', null, 'interactive')
}));
vi.mock('@/components/core/chat/components/AIResponseBox/RenderSkill', () => ({
  default: () => React.createElement('span', null, 'interactive')
}));
vi.mock('@/components/core/chat/components/AIResponseBox/RenderTool', () => ({
  default: () => React.createElement('span', null, 'interactive')
}));
vi.mock('@/components/core/chat/components/AIResponseBox/RenderUserFormInteractive', () => ({
  default: () => React.createElement('span', null, 'interactive')
}));
vi.mock('@/components/core/chat/components/AIResponseBox/RenderUserSelectInteractive', () => ({
  default: () => React.createElement('span', null, 'interactive')
}));
vi.mock(
  '@/components/core/chat/components/AIResponseBox/WorkflowBuilder/RenderWorkflowBuilderVersion',
  () => ({ default: () => React.createElement('span', null, 'interactive') })
);
vi.mock(
  '@/components/core/chat/components/AIResponseBox/WorkflowBuilder/RenderWorkflowBuilderPreview',
  () => ({ default: () => React.createElement('span', null, 'interactive') })
);
vi.mock('@/components/core/chat/components/AIResponseBox/RenderText', () => ({
  default: ({ text }: { text: string }) => React.createElement('span', null, text)
}));

/** 保留正文，避免历史交互载荷缺失时连带隐藏整条回答。 */
const render = (interactive: unknown) =>
  renderToStaticMarkup(
    React.createElement(AIResponseBox, {
      chatItemDataId: 'ai-1',
      value: {
        text: { content: 'Answer text' },
        interactive: interactive as WorkflowInteractiveResponseType
      },
      isLastResponseValue: true,
      isLastChild: true,
      isChatting: false
    })
  );

describe('AIResponseBox interactive history compatibility', () => {
  it.each([true, false])(
    'only blocks the configuration card of the generating message (last: %s)',
    (isLastChild) => {
      const html = renderToStaticMarkup(
        React.createElement(AIResponseBox, {
          chatItemDataId: 'ai-1',
          value: {
            chatAgentBuilderVersion: {
              s3Key: 'chat/helper/config.json',
              expiresAt: '2099-01-01T00:00:00.000Z'
            }
          },
          isLastResponseValue: true,
          isLastChild,
          isChatting: true
        })
      );
      expect(html.includes('disabled')).toBe(isLastChild);
    }
  );
  it.each(['userSelect', 'userInput', 'paymentPause', 'agentAsk', 'workflowBuilderPreview'])(
    'preserves the answer while skipping invalid %s cards',
    (type) => {
      for (const params of [
        undefined,
        null,
        'legacy',
        { userSelectOptions: null, inputForm: null }
      ]) {
        if (type === 'paymentPause' && typeof params === 'object' && params !== null) continue;
        for (const interactive of [
          { type, params },
          { type: 'childrenInteractive', params: { childrenResponse: { type, params } } }
        ]) {
          const html = render(interactive);
          expect(html).toContain('Answer text');
          expect(html).not.toContain('interactive');
        }
      }
    }
  );

  it.each([undefined, null, 'legacy', {}])(
    'ignores broken nested leaves: %j',
    (childrenResponse) => {
      expect(render({ type: 'childrenInteractive', params: { childrenResponse } })).toBe(
        '<span>Answer text</span>'
      );
    }
  );

  it.each([
    { type: 'userSelect', params: { userSelectOptions: [{ key: 'a', value: 'A' }] } },
    { type: 'userInput', params: { inputForm: [] } },
    { type: 'paymentPause', params: {} },
    {
      type: 'workflowBuilderPreview',
      params: {
        toolCallId: 'preview',
        arguments: JSON.stringify({
          title: 'Plan',
          mermaid: 'flowchart LR; A --> B',
          sections: [{ title: 'Goal', content: 'Build' }]
        })
      }
    }
  ])('continues rendering valid $type cards', (interactive) => {
    expect(render(interactive)).toContain('interactive');
  });
});
