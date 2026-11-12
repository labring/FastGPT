import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DefaultSystemModerationPolicy,
  type AdminModerationPluginItemType,
  type SystemModerationPolicyType
} from '@fastgpt/global/core/plugin/moderation/type';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  push: vi.fn(),
  policyData: undefined as SystemModerationPolicyType | undefined,
  pluginsData: [] as AdminModerationPluginItemType[],
  lastTitles: [] as Array<{ mainTitle: string; subTitles: string[] }>,
  lastNumberInputVariant: undefined as string | undefined
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ push: mocks.push })
}));
vi.mock('next/dynamic', () => ({
  default: () => () => null
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
vi.mock('@fastgpt/web/hooks/useConfirm', () => ({
  useConfirm: () => ({
    openConfirm: () => () => undefined,
    ConfirmModal: () => null
  })
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (
    fn: () => Promise<unknown>,
    options?: { manual?: boolean; onSuccess?: (data: unknown) => void }
  ) => {
    React.useEffect(() => {
      if (options?.manual === false) {
        void fn().then((res) => options?.onSuccess?.(res));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return {
      loading: false,
      runAsync: fn
    };
  }
}));
vi.mock('@/web/core/plugin/admin/moderation/api', () => ({
  getAdminModerationPolicy: () => Promise.resolve(mocks.policyData),
  getAdminModerationPluginList: () => Promise.resolve(mocks.pluginsData),
  postAdminDeleteModerationPlugin: vi.fn(),
  postAdminUpdateModerationPolicy: vi.fn()
}));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  Button: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) =>
    React.createElement('button', { onClick }, children),
  Flex: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) =>
    React.createElement('div', { onClick }, children),
  Grid: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  HStack: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  Switch: ({
    isChecked,
    onChange
  }: {
    isChecked: boolean;
    onChange?: (e: { target: { checked: boolean } }) => void;
  }) =>
    React.createElement('input', {
      type: 'checkbox',
      checked: isChecked,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        onChange?.({ target: { checked: e.target.checked } })
    }),
  Text: ({ children }: React.PropsWithChildren) => React.createElement('span', null, children),
  useDisclosure: () => ({ isOpen: false, onOpen: vi.fn(), onClose: vi.fn() })
}));
vi.mock('@/pageComponents/admin/settings/SettingPage', () => ({
  default: ({
    titles,
    children
  }: React.PropsWithChildren<{ titles: Array<{ mainTitle: string; subTitles: string[] }> }>) => {
    mocks.lastTitles = titles;
    return React.createElement('div', { 'data-setting-page': 'true' }, children);
  }
}));
vi.mock('@/pageComponents/admin/settings/FirstTitle', () => ({
  default: ({ title }: { title: string }) =>
    React.createElement('h2', { 'data-first-title': title }, title)
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({
  default: () => null
}));
vi.mock('@fastgpt/web/components/common/Input/NumberInput', () => ({
  default: ({ variant, value }: { variant?: string; value?: number }) => {
    mocks.lastNumberInputVariant = variant;
    return React.createElement('input', {
      'data-number-input': 'true',
      'data-variant': variant,
      value,
      readOnly: true
    });
  }
}));
vi.mock('@fastgpt/web/components/common/MySelect', () => ({
  default: () => React.createElement('div', { 'data-my-select': 'true' })
}));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({
  default: () => null
}));
vi.mock('@/pageComponents/admin/moderation/policy/PluginItemRow', () => ({
  default: ({
    plugin,
    onSelect
  }: {
    plugin: AdminModerationPluginItemType;
    onSelect: () => void;
  }) =>
    React.createElement(
      'button',
      { 'data-plugin-select': plugin.pluginId, onClick: onSelect },
      plugin.name
    )
}));
vi.mock('@/pageComponents/admin/moderation/policy/EditPluginModal', () => ({
  default: () => null
}));
vi.mock('@/pageComponents/admin/moderation/policy/ModerationTestCard', () => ({
  default: ({ activePlugin }: { activePlugin?: AdminModerationPluginItemType }) =>
    React.createElement('div', {
      'data-test-card': activePlugin?.pluginId ?? 'none'
    })
}));

import ModerationPolicy from '@/pageComponents/admin/moderation/policy';

describe('ModerationPolicy page', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.policyData = {
      ...DefaultSystemModerationPolicy,
      enabled: true
    };
    mocks.pluginsData = [];
    mocks.lastTitles = [];
    mocks.lastNumberInputVariant = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
    dom?.window.close();
    vi.unstubAllGlobals();
  });

  it('enables all three hooks by default, uses whiteOutline on streamInterval, and hides test section when no active service exists', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(ModerationPolicy));
    });
    await act(async () => {
      await Promise.resolve();
    });

    // 1 total switch + 3 hook switches = 4 switches, all checked by default when policy.enabled is true
    const switches = Array.from(
      host.querySelectorAll('input[type="checkbox"]')
    ) as HTMLInputElement[];
    expect(switches).toHaveLength(4);
    expect(switches.every((el) => el.checked)).toBe(true);

    // Stream check interval input uses whiteOutline variant and defaults to 100
    const numberInput = host.querySelector('input[data-number-input="true"]') as HTMLInputElement;
    expect(mocks.lastNumberInputVariant).toBe('whiteOutline');
    expect(numberInput.value).toBe('100');

    // Test section and anchor title are completely hidden when there is no active service
    expect(host.querySelector('[data-test-card]')).toBeNull();
    expect(host.querySelector('[data-first-title="admin:moderation.test_title"]')).toBeNull();
    expect(mocks.lastTitles.map((item) => item.mainTitle)).toEqual([
      'admin:moderation.service_title',
      'admin:moderation.hooks_title',
      'admin:moderation.strategy_title'
    ]);

    await act(async () => {
      root.unmount();
    });
  });

  it('shows test section and right-side anchor once an active moderation service is selected', async () => {
    mocks.pluginsData = [
      {
        pluginId: 'baidu',
        source: 'system',
        name: 'Baidu Moderation',
        provider: 'baidu',
        enabled: false,
        hasConfiguredSecrets: true
      }
    ];

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(ModerationPolicy));
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Still hidden before selecting active plugin
    expect(host.querySelector('[data-test-card]')).toBeNull();

    // Select plugin as active service
    const selectBtn = host.querySelector('[data-plugin-select="baidu"]') as HTMLButtonElement;
    await act(async () => {
      selectBtn.click();
    });

    expect(host.querySelector('[data-test-card="baidu"]')).not.toBeNull();
    expect(host.querySelector('[data-first-title="admin:moderation.test_title"]')).not.toBeNull();
    expect(mocks.lastTitles.map((item) => item.mainTitle)).toEqual([
      'admin:moderation.service_title',
      'admin:moderation.hooks_title',
      'admin:moderation.strategy_title',
      'admin:moderation.test_title'
    ]);

    await act(async () => {
      root.unmount();
    });
  });
});
