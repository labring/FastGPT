import React, { act } from 'react';
import { describe, expect, it } from 'vitest';
import { confirmedPreview, contentProps, setupContentTest, versionValue } from './contentTestUtils';
import ProcessingGroup from '@/components/core/chat/ChatContainer/ChatBox/components/AIChatBubble/ProcessingGroup';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';

describe('AI chat processing group', () => {
  const view = setupContentTest();

  it('opens the latest tool preview using original value indices without duplicating standalone content', async () => {
    const chatValue: AIChatItemValueItemType[] = [
      { text: { content: 'Earlier answer' } },
      { reasoning: { content: 'Thinking' } },
      {
        ...confirmedPreview,
        ...versionValue,
        text: { content: 'Standalone answer' },
        tools: [
          { id: 'tool-1', toolName: 'Tool', toolAvatar: '', functionName: 'tool', params: '{}' }
        ]
      }
    ];
    await view.render(
      React.createElement(ProcessingGroup, {
        ...contentProps({ chatValue, isChatting: true }),
        items: [
          { value: chatValue[1], index: 1 },
          { value: chatValue[2], index: 2 }
        ],
        isProcessing: true
      })
    );

    expect(view.container.querySelector('[data-content="answer"]')).toBeNull();
    expect(view.container.querySelector('[data-content="interactive"]')).toBeNull();
    expect(view.container.querySelector('[data-content="version"]')).toBeNull();

    await act(async () =>
      view.container.querySelector<HTMLButtonElement>('[data-preview-trigger]')!.click()
    );

    const responses = view.container.querySelectorAll('[data-response]');
    expect(responses[0].getAttribute('data-last')).toBe('false');
    expect(responses[0].getAttribute('data-target')).toBeNull();
    expect(responses[1].getAttribute('data-last')).toBe('true');
    expect(JSON.parse(responses[1].getAttribute('data-target')!)).toEqual({
      type: 'tool',
      toolId: 'tool-1'
    });
  });

  it('renders nothing for an empty group', async () => {
    await view.render(
      React.createElement(ProcessingGroup, { ...contentProps(), items: [], isProcessing: false })
    );

    expect(view.container.childElementCount).toBe(0);
  });
});
