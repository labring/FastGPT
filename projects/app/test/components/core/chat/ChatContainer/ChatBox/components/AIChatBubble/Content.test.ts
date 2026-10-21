import React from 'react';
import { describe, expect, it } from 'vitest';
import { contentProps, setupContentTest, versionValue } from './contentTestUtils';
import Content from '@/components/core/chat/ChatContainer/ChatBox/components/AIChatBubble/Content';

describe('ordinary AI chat content', () => {
  const view = setupContentTest();

  it('keeps every answer outside processing groups and renders combined reasoning only once', async () => {
    await view.render(
      React.createElement(
        Content,
        contentProps({
          chatValue: [
            { text: { content: 'First answer' } },
            { reasoning: { content: 'Thinking' }, text: { content: 'Second answer' } }
          ]
        })
      )
    );

    const answers = [...view.container.querySelectorAll('[data-content="answer"]')];
    expect(answers.map((element) => element.textContent)).toEqual([
      'First answer',
      'Second answer'
    ]);
    expect(answers.every((element) => !element.closest('[data-process]'))).toBe(true);
    expect(view.container.querySelectorAll('[data-content="reasoning"]')).toHaveLength(1);
    expect(
      view.container.querySelector('[data-process="workflow_builder_process_details"]')
    ).toBeNull();
  });

  it('ignores hidden and empty values while preserving standalone content', async () => {
    await view.render(
      React.createElement(
        Content,
        contentProps({
          chatValue: [
            { hideInUI: true, text: { content: 'Hidden' } },
            { text: { content: '' } },
            versionValue
          ]
        })
      )
    );

    expect(view.container.textContent).toBe('Workflow v1');
    expect(view.container.querySelectorAll('[data-content="version"]')).toHaveLength(1);
    expect(view.container.querySelector('[data-process]')).toBeNull();
  });

  it('does not mark an older message as processing while a newer message is generating', async () => {
    await view.render(
      React.createElement(
        Content,
        contentProps({
          chatValue: [{ reasoning: { content: 'Historical reasoning' } }],
          isChatting: true,
          isLastChild: false
        })
      )
    );

    expect(view.container.querySelector('[data-process]')?.getAttribute('data-active')).toBe(
      'false'
    );
  });
});
