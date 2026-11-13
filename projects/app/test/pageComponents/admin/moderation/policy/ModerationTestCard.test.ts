import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawModerationCheckResponseType } from '@fastgpt/global/openapi/core/plugin/admin/moderation/api';
import type { AdminModerationPluginItemType } from '@fastgpt/global/core/plugin/moderation/type';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  checkResponse: undefined as RawModerationCheckResponseType | undefined,
  postAdminCheckModeration: vi.fn()
}));

vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({
    i18n: { language: 'zh-CN' },
    t: (key: string) => key
  })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (fn: () => Promise<unknown>) => ({
    loading: false,
    runAsync: fn
  })
}));
vi.mock('@/web/core/plugin/admin/moderation/api', () => ({
  postAdminCheckModeration: mocks.postAdminCheckModeration
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({
  default: ({ name }: { name: string }) => React.createElement('span', { 'data-icon': name })
}));
vi.mock('@/web/core/plugin/admin/moderation/highlight', () => ({
  extractContentSnippet: (text: string) => text,
  renderHighlightedModerationContent: (text: string) => text
}));
vi.mock('@chakra-ui/react', () => {
  const toDataProps = (props: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const key of ['bg', 'color', 'border', 'borderColor', 'boxShadow', 'borderRadius']) {
      if (props[key] !== undefined) out[`data-${key.toLowerCase()}`] = String(props[key]);
    }
    return out;
  };
  return {
    Box: ({
      children,
      onClick,
      title,
      ...rest
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('div', { onClick, title, ...toDataProps(rest) }, children),
    Button: ({
      children,
      variant,
      onClick,
      isDisabled
    }: React.PropsWithChildren<{
      variant?: string;
      onClick?: () => void;
      isDisabled?: boolean;
    }>) =>
      React.createElement(
        'button',
        { 'data-variant': variant, disabled: isDisabled, onClick },
        children
      ),
    Flex: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('div', toDataProps(rest), children),
    HStack: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
    Text: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('span', toDataProps(rest), children),
    Textarea: ({
      value,
      onChange
    }: {
      value: string;
      onChange?: (e: { target: { value: string } }) => void;
    }) =>
      React.createElement('textarea', {
        defaultValue: value,
        onInput: (e: React.FormEvent<HTMLTextAreaElement>) =>
          onChange?.({ target: { value: (e.target as HTMLTextAreaElement).value } })
      })
  };
});

import ModerationTestCard from '@/pageComponents/admin/moderation/policy/ModerationTestCard';

const activePlugin: AdminModerationPluginItemType = {
  pluginId: 'baidu-moderation',
  source: 'system',
  version: '1.0.0',
  name: '百度内容审核',
  provider: 'baidu',
  enabled: true,
  available: true
};

describe('ModerationTestCard', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.postAdminCheckModeration.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    dom?.window.close();
    vi.unstubAllGlobals();
  });

  const renderCardAndSubmit = async (response: RawModerationCheckResponseType) => {
    mocks.postAdminCheckModeration.mockResolvedValueOnce(response);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(ModerationTestCard, { activePlugin }));
    });

    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      textarea.value = '测试博彩文本';
      textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });

    const buttons = Array.from(host.querySelectorAll('button'));
    const startBtn = buttons.find((b) => b.textContent === 'admin:moderation.start_test')!;
    await act(async () => {
      startBtn.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    return { host, root, buttons };
  };

  it('uses primaryOutline for start button and whiteBase for clear button, and renders pass badge without icon or border', async () => {
    const { host, root, buttons } = await renderCardAndSubmit({
      verdict: 'pass',
      provider: 'baidu',
      hits: [],
      keywords: []
    });

    const clearBtn = buttons.find((b) => b.textContent === 'admin:moderation.clear');
    const startBtn = buttons.find((b) => b.textContent === 'admin:moderation.start_test');
    expect(clearBtn?.getAttribute('data-variant')).toBe('whiteBase');
    expect(startBtn?.getAttribute('data-variant')).toBe('primaryOutline');

    const verdictBadge = host.querySelector('[data-bg="green.50"]') as HTMLElement;
    expect(verdictBadge).not.toBeNull();
    expect(verdictBadge.getAttribute('data-color')).toBe('green.600');
    expect(verdictBadge.getAttribute('data-border')).toBeNull();
    expect(verdictBadge.querySelector('[data-icon]')).toBeNull();
    expect(verdictBadge.textContent).toBe('admin:moderation.verdict_pass');

    await act(async () => {
      root.unmount();
    });
  });

  it.each([
    { verdict: 'block' as const, label: 'admin:moderation.verdict_block' },
    { verdict: 'suspected' as const, label: 'admin:moderation.verdict_suspected' }
  ])(
    'renders $verdict with block red badge style and white detail card background',
    async ({ verdict, label }) => {
      const { host, root } = await renderCardAndSubmit({
        verdict,
        provider: 'baidu',
        hits: [{ label: 'gambling', providerLabel: '涉赌风险', keywords: ['博彩'] }],
        keywords: ['博彩']
      });

      const verdictBadge = host.querySelector('[data-bg="red.50"]') as HTMLElement;
      expect(verdictBadge).not.toBeNull();
      expect(verdictBadge.getAttribute('data-color')).toBe('red.500');
      expect(verdictBadge.getAttribute('data-border')).toBeNull();
      expect(verdictBadge.querySelector('[data-icon]')).toBeNull();
      expect(verdictBadge.textContent).toBe(label);

      const detailCard = host.querySelector('[data-bg="white"][data-boxshadow="1.5"]');
      expect(detailCard).not.toBeNull();
      expect(host.querySelector('[data-bg="myGray.50"]')).toBeNull();

      await act(async () => {
        root.unmount();
      });
    }
  );
});
