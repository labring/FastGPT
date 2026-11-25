import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';

vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/pageComponents/admin/AdminHeader', () => ({
  default: ({ title, rightContent }: { title?: string; rightContent?: React.ReactNode }) =>
    React.createElement('header', { 'data-header-title': title }, rightContent)
}));
vi.mock('@fastgpt/web/components/common/MyLoading', () => ({
  default: () => React.createElement('div', { 'data-my-loading': 'true' })
}));
vi.mock('@chakra-ui/react', () => ({
  Box: ({
    children,
    onClick,
    onScroll
  }: React.PropsWithChildren<{
    onClick?: () => void;
    onScroll?: React.UIEventHandler<HTMLDivElement>;
  }>) => React.createElement('div', { onClick, onScroll }, children),
  Button: ({
    children,
    onClick,
    isLoading,
    isDisabled
  }: React.PropsWithChildren<{
    onClick?: () => void;
    isLoading?: boolean;
    isDisabled?: boolean;
  }>) =>
    React.createElement(
      'button',
      {
        onClick,
        disabled: Boolean(isDisabled),
        'data-loading': String(Boolean(isLoading))
      },
      children
    ),
  Flex: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  Text: ({
    children,
    color,
    fontWeight
  }: React.PropsWithChildren<{ color?: string; fontWeight?: string }>) =>
    React.createElement(
      'span',
      {
        'data-toc-label': String(children),
        'data-active': String(color === 'primary.600' && fontWeight === 'semibold')
      },
      children
    )
}));

import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';

const getActiveTocLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-toc-label]'))
    .filter((el) => el.getAttribute('data-active') === 'true')
    .map((el) => el.getAttribute('data-toc-label'));

describe('AdminSettingPage dynamic TOC fallback', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    dom.window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('falls back to the first TOC item when the active item disappears and stays there if it returns', async () => {
    const fullItems: SettingTOCItem[] = [
      { id: 'service', label: 'Service' },
      { id: 'hooks', label: 'Hooks' },
      { id: 'strategy', label: 'Strategy' },
      { id: 'test', label: 'Test' }
    ];
    const collapsedItems: SettingTOCItem[] = [{ id: 'service', label: 'Service' }];

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    const renderPage = async (tocItems: SettingTOCItem[]) => {
      await act(async () => {
        root.render(
          React.createElement(
            AdminSettingPage,
            {
              headerTitle: 'Moderation Policy',
              tocItems
            },
            tocItems.map((item) => React.createElement('section', { key: item.id, id: item.id }))
          )
        );
      });
    };

    // Initial highlight defaults to the first item.
    await renderPage(fullItems);
    expect(getActiveTocLabels(host)).toEqual(['Service']);

    // Selecting the dynamic "Test" item highlights it and scrolls its section into view.
    const testLabel = host.querySelector('[data-toc-label="Test"]') as HTMLElement;
    await act(async () => {
      testLabel.click();
    });
    expect(getActiveTocLabels(host)).toEqual(['Test']);
    expect(dom.window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();

    // Removing "Test" from tocItems immediately falls back to "Service".
    await renderPage(collapsedItems);
    expect(getActiveTocLabels(host)).toEqual(['Service']);

    // Re-adding "Test" keeps "Service" active instead of jumping back to stale "Test".
    await renderPage(fullItems);
    expect(getActiveTocLabels(host)).toEqual(['Service']);

    await act(async () => {
      root.unmount();
    });
  });

  it('mounts MyLoading overlay and disables Save button whenever isLoading is true', async () => {
    const onSave = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(
          AdminSettingPage,
          {
            headerTitle: 'Moderation Policy',
            tocItems: [{ id: 'service', label: 'Service' }],
            isLoading: true,
            isSaving: false,
            onSave
          },
          React.createElement('div')
        )
      );
    });

    expect(host.querySelector('[data-my-loading="true"]')).not.toBeNull();
    const saveBtn = host.querySelector('button') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    expect(saveBtn.getAttribute('data-loading')).toBe('false');

    await act(async () => {
      saveBtn.click();
    });
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});
