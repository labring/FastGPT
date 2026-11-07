import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import AIResponseBox from '@/components/core/chat/components/AIResponseBox';

const mockContext = vi.hoisted(() => ({ chatRecords: [] as ChatItemMiniType[] }));

vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  Flex: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children)
}));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_context: unknown, selector: (value: object) => unknown) =>
    selector(mockContext)
}));
vi.mock('ahooks', () => ({ useMemoizedFn: (fn: unknown) => fn }));
vi.mock('@/web/core/chat/context/chatItemContext', () => ({ ChatItemContext: {} }));
vi.mock('@/web/core/chat/context/chatRecordContext', () => ({ ChatRecordContext: {} }));
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
  () => ({
    default: ({ isPending }: { isPending: boolean }) =>
      React.createElement('span', { 'data-pending': isPending }, 'interactive')
  })
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
  beforeEach(() => {
    mockContext.chatRecords = [];
  });

  it.each([
    { name: 'current preview', expected: true },
    { name: 'earlier display group', isLastChild: false, expected: true },
    { name: 'presentation appended after preview', displayOnly: true, expected: true },
    { name: 'not the last displayed value', isLastResponseValue: false, expected: true },
    { name: 'answered preview', answered: true, expected: false },
    { name: 'superseded preview', superseded: true, expected: false },
    {
      name: 'tool call ID reused in a newer message',
      superseded: true,
      reuseToolCallId: true,
      expected: false
    },
    { name: 'streaming preview', isChatting: true, expected: false }
  ])('uses the active interaction for $name', (state) => {
    const preview: WorkflowInteractiveResponseType = {
      type: 'workflowBuilderPreview',
      params: {
        toolCallId: 'preview-1',
        arguments: JSON.stringify({
          title: 'Plan',
          mermaid: 'flowchart LR; A --> B',
          sections: [{ title: 'Details', content: 'Plan' }]
        })
      }
    };
    mockContext.chatRecords = [
      {
        obj: ChatRoleEnum.AI,
        dataId: 'preview',
        value: [
          { interactive: preview },
          ...(state.displayOnly ? [{ displayOnly: true, text: { content: 'Presentation' } }] : [])
        ]
      }
    ];
    if (state.answered) {
      mockContext.chatRecords.push({ obj: ChatRoleEnum.Human, value: [] });
    }
    if (state.superseded) {
      mockContext.chatRecords.push({
        obj: ChatRoleEnum.AI,
        dataId: 'newer-preview',
        value: [
          {
            interactive: {
              ...preview,
              params: {
                ...preview.params,
                toolCallId: state.reuseToolCallId ? 'preview-1' : 'preview-2'
              }
            }
          }
        ]
      });
    }
    const html = renderToStaticMarkup(
      React.createElement(AIResponseBox, {
        chatItemDataId: 'preview',
        value: { interactive: preview },
        isLastChild: state.isLastChild ?? true,
        isLastResponseValue: state.isLastResponseValue ?? true,
        isChatting: state.isChatting ?? false
      })
    );
    expect(html).toContain(`data-pending="${state.expected}"`);
  });
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
