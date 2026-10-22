import { JSDOM } from 'jsdom';
import React, { act, Suspense } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Markdown from '@/components/Markdown';
import Guide from '@/components/Markdown/components/Guide';
import QuestionGuide from '@/components/Markdown/components/QuestionGuide';
import QuickReplies from '@/components/Markdown/components/QuickReplies';
import { ChatInstanceActionsContext } from '@/components/core/chat/ChatContainer/context/chatInstanceActionsContext';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('next/dynamic', async () => {
  const { lazy } = await import('react');
  return { default: (loader: Parameters<typeof lazy>[0]) => lazy(loader) };
});
vi.mock('@fastgpt/web/components/common/Icon', async () => {
  const { createElement } = await import('react');
  return {
    default: ({ name, onClick }: { name: string; onClick?: () => void }) =>
      onClick ? createElement('button', { 'data-icon': name, onClick }, name) : null
  };
});
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));

describe('Markdown action callbacks', () => {
  let root: Root;
  let container: HTMLDivElement;
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
    vi.stubGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
    vi.stubGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    dom.window.matchMedia = vi.fn((media) => ({
      media,
      matches: false,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  const render = async (element: React.ReactNode) => {
    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(Suspense, { fallback: 'loading' }, element)
        )
      );
    });
    // react-markdown 的自定义组件由 next/dynamic 加载，等待导入完成后再操作按钮。
    await act(async () => vi.dynamicImportSettled());
  };

  const click = async (selector: string) => {
    const target = container.querySelector<HTMLElement>(selector);
    expect(target).not.toBeNull();
    await act(async () => target!.click());
  };

  it('uses only explicitly supplied callbacks for each Markdown instance', async () => {
    const left = vi.fn();
    const right = vi.fn();
    const inherited = { sendMessage: vi.fn(), fillInput: vi.fn(), continueInteractive: vi.fn() };
    await render(
      React.createElement(
        ChatInstanceActionsContext.Provider,
        { value: inherited },
        React.createElement(
          'div',
          { id: 'left' },
          React.createElement(Markdown, {
            source: '[Left]()',
            onSendQuestion: left
          })
        ),
        React.createElement(
          'div',
          { id: 'right' },
          React.createElement(Markdown, {
            source: '[Right]()',
            onSendQuestion: right
          })
        )
      )
    );
    await click('#left button');
    expect(left).toHaveBeenCalledExactlyOnceWith('Left');
    expect(right).not.toHaveBeenCalled();
    expect(inherited.sendMessage).not.toHaveBeenCalled();
    await click('#right button');
    expect(right).toHaveBeenCalledExactlyOnceWith('Right');
  });

  it('renders a plain label without a callback even inside a chat provider', async () => {
    const sendMessage = vi.fn();
    await render(
      React.createElement(
        ChatInstanceActionsContext.Provider,
        {
          value: { sendMessage, fillInput: vi.fn(), continueInteractive: vi.fn() }
        },
        React.createElement(Markdown, { source: '[Read only]()' })
      )
    );
    expect(container.textContent).toContain('Read only');
    expect(container.querySelector('button')).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('keeps callbacks available after a streamed block becomes a completed message', async () => {
    const onSendQuestion = vi.fn();
    await render(
      React.createElement(Markdown, {
        source: '[Completed]()',
        showAnimation: true,
        onSendQuestion
      })
    );
    await render(
      React.createElement(Markdown, {
        source: '[Completed]()',
        showAnimation: false,
        onSendQuestion
      })
    );
    await click('button');
    expect(onSendQuestion).toHaveBeenCalledExactlyOnceWith('Completed');
  });

  it('passes guide callbacks through the code renderer and keeps ordinary links navigable', async () => {
    const onSendQuestion = vi.fn();
    await render(
      React.createElement(Markdown, {
        source: '```guide\n[Ask]\n\n[Docs](https://example.com)\n```',
        onSendQuestion
      })
    );
    await click('button');
    expect(onSendQuestion).toHaveBeenCalledExactlyOnceWith('Ask');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com');

    await render(React.createElement(Guide, { text: '[Read only]' }));
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).toContain('Read only');
  });

  it('passes edit and send callbacks to question guides independently', async () => {
    const onSendQuestion = vi.fn();
    const onEditQuestion = vi.fn();
    await render(
      React.createElement(Markdown, {
        source: '```questionguide\n["Question"]\n```',
        onSendQuestion,
        onEditQuestion
      })
    );
    await click('[data-icon="edit"]');
    expect(onEditQuestion).toHaveBeenCalledExactlyOnceWith('Question');
    expect(onSendQuestion).not.toHaveBeenCalled();
    await click('[data-icon="core/chat/sendLight"]');
    expect(onSendQuestion).toHaveBeenCalledExactlyOnceWith('Question');

    await render(React.createElement(QuestionGuide, { text: '["Question"]' }));
    expect(container.querySelector('button')).toBeNull();
  });

  it('enables quick replies only when the caller supplies the matching callback', async () => {
    const onQuickReplyClick = vi.fn();
    await render(
      React.createElement(Markdown, {
        source: '```quick-replies\n First \n Second \n```',
        onQuickReplyClick
      })
    );
    await click('button');
    expect(onQuickReplyClick).toHaveBeenCalledExactlyOnceWith('First');
    expect(container.querySelectorAll('button')).toHaveLength(2);

    await render(React.createElement(QuickReplies, { text: 'Read only' }));
    expect(container.querySelector('button')).toBeNull();
    await render(React.createElement(QuickReplies, { text: ' '.repeat(301), onQuickReplyClick }));
    expect(container.querySelector('button')).toBeNull();
  });
});
