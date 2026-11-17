import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { useContextSelector } from 'use-context-selector';
import { AppContext, TabEnum } from '@/pageComponents/app/detail/context';
import {
  WorkflowModalContext,
  WorkflowModalProvider
} from '@/pageComponents/app/detail/WorkflowComponents/context/workflowModalContext';

vi.mock('@/pageComponents/app/detail/context', async () => {
  const { createContext } = await import('use-context-selector');
  return {
    AppContext: createContext({ currentTab: 'appEdit' }),
    TabEnum: { appEdit: 'appEdit', logs: 'logs', publish: 'publish' }
  };
});
vi.mock('@/web/core/chat/context/useChatStore', () => ({
  useChatStore: () => ({ chatId: 'chat' })
}));
vi.mock('@fastgpt/web/hooks/useMemoEnhance', () => ({
  useMemoEnhance: (fn: () => unknown) => fn()
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/ChatTest', async () => {
  const { createElement } = await import('react');
  return {
    default: ({ isOpen }: { isOpen: boolean }) =>
      createElement(
        'div',
        { 'data-open': String(isOpen) },
        createElement('input', { defaultValue: '草稿' })
      )
  };
});

describe('WorkflowModalProvider', () => {
  it('离开编辑页时隐藏调试，返回时保留草稿', () => {
    const dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const root = createRoot(document.getElementById('root')!);
    const Open = () => {
      const setActivePanel = useContextSelector(
        WorkflowModalContext,
        (value) => value.setActivePanel
      );
      return React.createElement('button', { onClick: () => setActivePanel('run') }, '打开');
    };
    const render = (currentTab: TabEnum) =>
      act(() =>
        root.render(
          React.createElement(
            AppContext.Provider,
            { value: { currentTab } },
            React.createElement(WorkflowModalProvider, null, React.createElement(Open))
          )
        )
      );
    render(TabEnum.appEdit);
    const input = document.querySelector('input')!;
    act(() => document.querySelector('button')!.click());
    expect(document.querySelector('[data-open]')?.getAttribute('data-open')).toBe('true');
    for (const tab of [TabEnum.logs, TabEnum.publish]) {
      render(tab);
      expect(document.querySelector('[data-open]')?.getAttribute('data-open')).toBe('false');
      render(TabEnum.appEdit);
      expect(document.querySelector('[data-open]')?.getAttribute('data-open')).toBe('true');
      expect(document.querySelector('input')).toBe(input);
      expect(input.value).toBe('草稿');
    }
    act(() => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });
});
