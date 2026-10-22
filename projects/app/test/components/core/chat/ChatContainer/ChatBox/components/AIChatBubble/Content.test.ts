import React from 'react';
import { describe, expect, it } from 'vitest';
import { confirmedPreview, contentProps, setupContentTest, versionValue } from './contentTestUtils';
import Content from '@/components/core/chat/ChatContainer/ChatBox/components/AIChatBubble/Content';

describe('AI chat content', () => {
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
    expect(view.container.querySelector('[data-process] [data-process]')).toBeNull();
  });

  it('keeps builder preview, resumed processing, answers and version cards in order', async () => {
    await view.render(
      React.createElement(
        Content,
        contentProps({
          chatValue: [
            { reasoning: { content: 'Before preview' }, text: { content: 'Intermediate answer' } },
            confirmedPreview,
            { reasoning: { content: 'After preview' } },
            {
              ...versionValue,
              reasoning: { content: 'Final reasoning' },
              text: { content: 'Final answer' }
            }
          ]
        })
      )
    );

    const answers = [...view.container.querySelectorAll('[data-content="answer"]')];
    const interactive = view.container.querySelector('[data-content="interactive"]')!;
    const version = view.container.querySelector('[data-content="version"]')!;
    const processes = view.container.querySelectorAll('[data-process]');
    expect(processes).toHaveLength(2);
    expect(view.container.querySelector('[data-process] [data-process]')).toBeNull();
    expect(answers.map((answer) => answer.textContent)).toEqual([
      'Intermediate answer',
      'Final answer'
    ]);
    expect(
      [...answers, interactive, version].every((node) => !node.closest('[data-process]'))
    ).toBe(true);
    expect(view.container.querySelectorAll('[data-content="version"]')).toHaveLength(1);
    expect(
      [...view.container.querySelectorAll('[data-content="reasoning"]')].map(
        (element) => element.textContent
      )
    ).toEqual(['Before preview', 'After preview', 'Final reasoning']);
    expect(
      answers[0].compareDocumentPosition(interactive) & window.Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      interactive.compareDocumentPosition(processes[1]) & window.Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('shows streaming answers directly without moving them when generation completes', async () => {
    const props = contentProps({
      chatValue: [{ reasoning: { content: 'Thinking' }, text: { content: 'Streaming answer' } }],
      isChatting: true
    });
    await view.render(React.createElement(Content, props));
    const answer = view.container.querySelector('[data-content="answer"]')!;
    expect(answer.textContent).toBe('Streaming answer');
    expect(answer.closest('[data-process]')).toBeNull();
    expect(view.container.querySelectorAll('[data-process]')).toHaveLength(1);

    await view.render(React.createElement(Content, { ...props, isChatting: false }));
    expect(view.container.querySelectorAll('[data-content="answer"]')).toHaveLength(1);
    expect(view.container.querySelector('[data-content="answer"]')).toBe(answer);
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

  it('renders a completed helper configuration reference outside processing groups', async () => {
    await view.render(
      React.createElement(
        Content,
        contentProps({
          chatValue: [
            {
              chatAgentBuilderVersion: {
                s3Key: 'chat/helper/config.json',
                expiresAt: '2099-01-01T00:00:00.000Z'
              }
            }
          ]
        })
      )
    );
    expect(view.container.querySelector('[data-content="config"]')?.textContent).toBe(
      'Apply configuration'
    );
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
