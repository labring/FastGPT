import React from 'react';
import { describe, expect, it } from 'vitest';
import { confirmedPreview, contentProps, setupContentTest, versionValue } from './contentTestUtils';
import WorkflowBuilderContent from '@/components/core/chat/ChatContainer/ChatBox/components/AIChatBubble/WorkflowBuilderContent';

describe('Workflow Builder AI chat content', () => {
  const view = setupContentTest();
  const processSelector = '[data-process="workflow_builder_process_details"]';

  it('keeps interaction order and renders mixed final text and version content once outside processing', async () => {
    await view.render(
      React.createElement(
        WorkflowBuilderContent,
        contentProps({
          chatValue: [
            { reasoning: { content: 'Before preview' }, text: { content: 'Intermediate text' } },
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

    const processes = view.container.querySelectorAll(processSelector);
    const answers = view.container.querySelectorAll('[data-content="answer"]');
    const interactive = view.container.querySelector('[data-content="interactive"]')!;
    const version = view.container.querySelector('[data-content="version"]')!;
    expect(processes).toHaveLength(2);
    expect(answers).toHaveLength(2);
    expect(answers[0].closest(processSelector)).toBe(processes[0]);
    expect(answers[1].textContent).toBe('Final answer');
    expect(answers[1].closest(processSelector)).toBeNull();
    expect(interactive.closest(processSelector)).toBeNull();
    expect(version.closest(processSelector)).toBeNull();
    expect(view.container.querySelectorAll('[data-content="version"]')).toHaveLength(1);
    expect(
      [...view.container.querySelectorAll('[data-content="reasoning"]')].map(
        (element) => element.textContent
      )
    ).toEqual(['Before preview', 'After preview', 'Final reasoning']);
    expect(
      processes[0].compareDocumentPosition(interactive) & window.Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      interactive.compareDocumentPosition(processes[1]) & window.Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('keeps streaming text in processing until the response completes', async () => {
    const props = contentProps({
      chatValue: [{ text: { content: 'Streaming output' } }],
      isChatting: true
    });
    await view.render(React.createElement(WorkflowBuilderContent, props));

    expect(
      view.container.querySelector('[data-content="answer"]')?.closest(processSelector)
    ).not.toBeNull();
    expect(view.container.querySelector(processSelector)?.getAttribute('data-active')).toBe('true');

    await view.render(React.createElement(WorkflowBuilderContent, { ...props, isChatting: false }));

    expect(view.container.querySelectorAll('[data-content="answer"]')).toHaveLength(1);
    expect(
      view.container.querySelector('[data-content="answer"]')?.closest(processSelector)
    ).toBeNull();
  });

  it('shows an active empty processing segment after confirmation before the next event arrives', async () => {
    await view.render(
      React.createElement(
        WorkflowBuilderContent,
        contentProps({
          chatValue: [confirmedPreview],
          isChatting: true
        })
      )
    );

    const interactive = view.container.querySelector('[data-content="interactive"]')!;
    const process = view.container.querySelector(processSelector)!;
    expect(process.getAttribute('data-active')).toBe('true');
    expect(process.querySelector('[data-response]')).toBeNull();
    expect(
      interactive.compareDocumentPosition(process) & window.Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
