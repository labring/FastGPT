import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';

vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/pageComponents/admin/AdminHeader', () => ({
  default: ({
    title,
    titleExtra,
    rightContent
  }: {
    title?: string;
    titleExtra?: React.ReactNode;
    rightContent?: React.ReactNode;
  }) =>
    React.createElement(
      'header',
      { 'data-header-title': title },
      React.createElement('div', { 'data-header-title-extra': 'true' }, titleExtra),
      rightContent
    )
}));
vi.mock('@fastgpt/web/components/common/Tag', () => ({
  default: ({
    children,
    colorSchema,
    showDot,
    bg
  }: React.PropsWithChildren<{
    colorSchema?: string;
    showDot?: boolean;
    bg?: string;
  }>) =>
    React.createElement(
      'span',
      {
        'data-my-tag': 'true',
        'data-color-schema': colorSchema,
        'data-show-dot': String(Boolean(showDot)),
        'data-bg': bg
      },
      children
    )
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

import { Controller, useForm } from 'react-hook-form';
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

  it('shows red dot unsaved badge after editing form and clears it on reset, and hides while loading', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    let formApi: ReturnType<typeof useForm<{ siteName: string }>> | undefined;

    const TestHarness = ({ isLoading = false, isUnsaved = false }) => {
      const form = useForm({ defaultValues: { siteName: 'FastGPT' } });
      formApi = form;
      return React.createElement(
        AdminSettingPage,
        {
          form,
          headerTitle: 'Site Settings',
          tocItems: [{ id: 'brand', label: 'Brand' }],
          isLoading,
          isUnsaved
        },
        React.createElement('input', { ...form.register('siteName') })
      );
    };

    await act(async () => {
      root.render(React.createElement(TestHarness));
    });
    expect(host.querySelector('[data-my-tag="true"]')).toBeNull();

    // Mark field dirty -> red dot unsaved tag appears in header titleExtra.
    await act(async () => {
      formApi!.setValue('siteName', 'FastGPT Pro', { shouldDirty: true });
    });
    const tag = host.querySelector('[data-my-tag="true"]') as HTMLElement | null;
    expect(tag).not.toBeNull();
    expect(tag?.getAttribute('data-color-schema')).toBe('red');
    expect(tag?.getAttribute('data-show-dot')).toBe('true');
    expect(tag?.getAttribute('data-bg')).toBe('transparent');
    expect(tag?.textContent).toBe('common:core.app.not_saved');

    // Hidden while loading.
    await act(async () => {
      root.render(React.createElement(TestHarness, { isLoading: true }));
    });
    expect(host.querySelector('[data-my-tag="true"]')).toBeNull();

    // Restored after loading finishes while still dirty, then cleared after reset (post-save).
    await act(async () => {
      root.render(React.createElement(TestHarness, { isLoading: false }));
    });
    expect(host.querySelector('[data-my-tag="true"]')).not.toBeNull();

    await act(async () => {
      formApi!.reset({ siteName: 'FastGPT Pro' });
    });
    expect(host.querySelector('[data-my-tag="true"]')).toBeNull();

    // External isUnsaved prop (for non-RHF / child form state) also toggles the badge.
    await act(async () => {
      root.render(React.createElement(TestHarness, { isUnsaved: true }));
    });
    expect(host.querySelector('[data-my-tag="true"]')?.textContent).toBe(
      'common:core.app.not_saved'
    );

    await act(async () => {
      root.unmount();
    });
  });

  it('does not show unsaved badge on mount when omitted secret fields register via Controller', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    let formApi:
      | ReturnType<
          typeof useForm<{ codeSandbox: { enabled: boolean; url: string; token?: string } }>
        >
      | undefined;

    const SecretControllerHarness = ({ loaded }: { loaded: boolean }) => {
      const form = useForm<{ codeSandbox: { enabled: boolean; url: string; token?: string } }>({
        defaultValues: {} as any
      });
      formApi = form;

      React.useEffect(() => {
        if (loaded) {
          // 模拟 omitDomainSecrets 省略 token 键后的服务端快照 reset
          form.reset({ codeSandbox: { enabled: true, url: 'http://code-sandbox:3000' } });
        }
      }, [loaded, form]);

      return React.createElement(
        AdminSettingPage,
        {
          form,
          headerTitle: 'Code Sandbox',
          tocItems: [{ id: 'connection', label: 'Connection' }],
          isLoading: !loaded
        },
        loaded
          ? React.createElement(Controller, {
              name: 'codeSandbox.token',
              control: form.control,
              render: ({ field }) =>
                React.createElement('input', {
                  value: field.value ?? '',
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                    field.onChange(e.target.value)
                })
            })
          : null
      );
    };

    await act(async () => {
      root.render(React.createElement(SecretControllerHarness, { loaded: false }));
    });
    await act(async () => {
      root.render(React.createElement(SecretControllerHarness, { loaded: true }));
    });
    // 首屏加载并挂载被 omitDomainSecrets 省略的密钥 Controller 后，必须仍为未编辑状态
    expect(host.querySelector('[data-my-tag="true"]')).toBeNull();

    // 真实修改后显示未保存
    await act(async () => {
      formApi!.setValue('codeSandbox.token', 'new-secret', { shouldDirty: true });
    });
    expect(host.querySelector('[data-my-tag="true"]')?.textContent).toBe(
      'common:core.app.not_saved'
    );

    // 保存后 reset 清除未保存标记
    await act(async () => {
      formApi!.reset({ codeSandbox: { enabled: true, url: 'http://code-sandbox:3000' } });
    });
    expect(host.querySelector('[data-my-tag="true"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
