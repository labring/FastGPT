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
  lastHeaderTitle: undefined as string | undefined,
  lastTocItems: [] as Array<{ id: string; label: string }>,
  lastOnSave: undefined as (() => void | Promise<unknown>) | undefined,
  lastNumberInputVariant: undefined as string | undefined,
  saveModerationConfig: vi.fn(),
  updateModerationPolicy: vi.fn(),
  lastModalOnSuccess: undefined as
    | ((savedPlugin: AdminModerationPluginItemType) => void)
    | undefined
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
  postAdminSaveModerationConfig: mocks.saveModerationConfig,
  postAdminUpdateModerationPolicy: mocks.updateModerationPolicy
}));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  Button: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) =>
    React.createElement('button', { onClick }, children),
  Flex: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) =>
    React.createElement('div', { onClick }, children),
  HStack: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  SimpleGrid: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  Text: ({ children }: React.PropsWithChildren) => React.createElement('span', null, children),
  useDisclosure: () => ({ isOpen: false, onOpen: vi.fn(), onClose: vi.fn() })
}));
vi.mock('@/pageComponents/admin/settings/AdminSettingPage', () => ({
  default: ({
    headerTitle,
    tocItems,
    onSave,
    children
  }: React.PropsWithChildren<{
    headerTitle?: string;
    tocItems: Array<{ id: string; label: string }>;
    onSave?: () => void | Promise<unknown>;
  }>) => {
    mocks.lastHeaderTitle = headerTitle;
    mocks.lastTocItems = tocItems;
    mocks.lastOnSave = onSave;
    return React.createElement(
      'div',
      { 'data-admin-setting-page': 'true', 'data-header-title': headerTitle },
      children
    );
  }
}));
vi.mock('@/pageComponents/admin/settings/AdminSettingSection', () => ({
  default: ({
    id,
    title,
    showDivider,
    children
  }: React.PropsWithChildren<{ id: string; title: string; showDivider?: boolean }>) =>
    React.createElement(
      'section',
      {
        id,
        'data-setting-section': id,
        'data-section-title': title,
        'data-show-divider': String(Boolean(showDivider))
      },
      React.createElement('h2', null, title),
      children
    )
}));
vi.mock('@/pageComponents/admin/settings/AdminSwitchRow', () => ({
  default: ({
    label,
    isChecked,
    onChange
  }: {
    label: string;
    isChecked?: boolean;
    onChange?: (checked: boolean) => void;
  }) =>
    React.createElement(
      'label',
      { 'data-switch-row': label },
      React.createElement('span', null, label),
      React.createElement('input', {
        type: 'checkbox',
        checked: Boolean(isChecked),
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.checked)
      })
    )
}));
vi.mock('@/pageComponents/admin/settings/AdminFormItem', () => ({
  default: ({ label, children }: React.PropsWithChildren<{ label: string }>) =>
    React.createElement('div', { 'data-form-item': label }, children)
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
vi.mock('@/pageComponents/admin/moderation/policy/PluginItemRow', () => ({
  default: ({
    plugin,
    isActive,
    onActivate,
    onEdit
  }: {
    plugin: AdminModerationPluginItemType;
    isActive: boolean;
    onActivate: () => void;
    onEdit: () => void;
  }) =>
    React.createElement(
      'div',
      { 'data-plugin-row': plugin.pluginId },
      React.createElement(
        'button',
        { 'data-plugin-activate': plugin.pluginId, disabled: isActive, onClick: onActivate },
        isActive ? 'in_use' : 'enable'
      ),
      React.createElement(
        'button',
        { 'data-plugin-edit': plugin.pluginId, onClick: onEdit },
        'edit'
      )
    )
}));
vi.mock('@/pageComponents/admin/moderation/policy/EditPluginModal', () => ({
  default: ({ onSuccess }: { onSuccess: (savedPlugin: AdminModerationPluginItemType) => void }) => {
    mocks.lastModalOnSuccess = onSuccess;
    return React.createElement('div', { 'data-edit-modal': 'true' });
  }
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
    mocks.lastHeaderTitle = undefined;
    mocks.lastTocItems = [];
    mocks.lastOnSave = undefined;
    mocks.lastNumberInputVariant = undefined;
    mocks.lastModalOnSuccess = undefined;
    mocks.saveModerationConfig.mockReset();
    mocks.updateModerationPolicy.mockReset();
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

    // Uses unified AdminSettingPage header title and AdminSettingSection layout
    expect(mocks.lastHeaderTitle).toBe('admin:page_title_moderation_policy');
    expect(
      host.querySelector('[data-setting-section="service"]')?.getAttribute('data-show-divider')
    ).toBe('false');
    expect(
      host.querySelector('[data-setting-section="hooks"]')?.getAttribute('data-show-divider')
    ).toBe('true');
    expect(
      host.querySelector('[data-setting-section="strategy"]')?.getAttribute('data-show-divider')
    ).toBe('true');

    // Test section and TOC anchor are completely hidden when there is no active service
    expect(host.querySelector('[data-test-card]')).toBeNull();
    expect(host.querySelector('[data-setting-section="test"]')).toBeNull();
    expect(mocks.lastTocItems).toEqual([
      { id: 'service', label: 'admin:moderation.service_title' },
      { id: 'hooks', label: 'admin:moderation.hooks_title' },
      { id: 'strategy', label: 'admin:moderation.strategy_title' }
    ]);

    await act(async () => {
      root.unmount();
    });
  });

  it('activates a configured plugin via the action button, forbids un-enabling, and shows test section', async () => {
    const baiduPlugin: AdminModerationPluginItemType = {
      pluginId: 'baidu',
      source: 'system',
      name: 'Baidu Moderation',
      provider: 'baidu',
      enabled: false,
      hasConfiguredSecrets: true
    };
    mocks.pluginsData = [baiduPlugin];
    mocks.saveModerationConfig.mockResolvedValueOnce({ ...baiduPlugin, enabled: true });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(ModerationPolicy));
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Still hidden before activating a plugin
    expect(host.querySelector('[data-test-card]')).toBeNull();

    // Activate plugin via action button
    const activateBtn = host.querySelector('[data-plugin-activate="baidu"]') as HTMLButtonElement;
    expect(activateBtn.disabled).toBe(false);
    await act(async () => {
      activateBtn.click();
    });

    expect(mocks.saveModerationConfig).toHaveBeenCalledWith({
      pluginId: 'baidu',
      enabled: true
    });
    expect(activateBtn.disabled).toBe(true);
    expect(activateBtn.textContent).toBe('in_use');
    expect(host.querySelector('[data-test-card="baidu"]')).not.toBeNull();
    expect(
      host.querySelector('[data-setting-section="test"]')?.getAttribute('data-show-divider')
    ).toBe('true');
    expect(mocks.lastTocItems).toEqual([
      { id: 'service', label: 'admin:moderation.service_title' },
      { id: 'hooks', label: 'admin:moderation.hooks_title' },
      { id: 'strategy', label: 'admin:moderation.strategy_title' },
      { id: 'test', label: 'admin:moderation.test_title' }
    ]);

    // Clicking an already active plugin button cannot un-enable it
    await act(async () => {
      activateBtn.click();
    });
    expect(mocks.saveModerationConfig).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-test-card="baidu"]')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('auto-enables the first configured plugin upon saving configuration and persists policy switch', async () => {
    mocks.policyData = {
      ...DefaultSystemModerationPolicy,
      enabled: false
    };
    const unconfiguredPlugin: AdminModerationPluginItemType = {
      pluginId: 'keyword',
      source: 'system',
      name: 'Keyword Moderation',
      provider: 'keyword',
      enabled: false,
      hasConfiguredSecrets: false
    };
    mocks.pluginsData = [unconfiguredPlugin];
    mocks.updateModerationPolicy.mockResolvedValue({
      ...DefaultSystemModerationPolicy,
      enabled: true,
      activePluginId: 'keyword'
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(ModerationPolicy));
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Turn on global moderation switch before configuring the first plugin
    const totalSwitch = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      totalSwitch.click();
    });

    // Open EditPluginModal and simulate backend returning auto-enabled first plugin
    const editBtn = host.querySelector('[data-plugin-edit="keyword"]') as HTMLButtonElement;
    await act(async () => {
      editBtn.click();
    });
    expect(host.querySelector('[data-edit-modal="true"]')).not.toBeNull();

    mocks.pluginsData = [{ ...unconfiguredPlugin, hasConfiguredSecrets: true, enabled: true }];
    await act(async () => {
      mocks.lastModalOnSuccess?.({
        ...unconfiguredPlugin,
        hasConfiguredSecrets: true,
        enabled: true
      });
    });

    expect(mocks.updateModerationPolicy).toHaveBeenCalledWith({
      ...DefaultSystemModerationPolicy,
      enabled: true,
      activePluginId: 'keyword'
    });
    expect(host.querySelector('[data-test-card="keyword"]')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('preserves draft edits made while plugin activation probe and policy sync are pending', async () => {
    mocks.policyData = {
      ...DefaultSystemModerationPolicy,
      enabled: false
    };
    const baiduPlugin: AdminModerationPluginItemType = {
      pluginId: 'baidu',
      source: 'system',
      name: 'Baidu Moderation',
      provider: 'baidu',
      enabled: false,
      hasConfiguredSecrets: true
    };
    mocks.pluginsData = [baiduPlugin];

    let resolveSave!: (value: AdminModerationPluginItemType) => void;
    mocks.saveModerationConfig.mockReturnValueOnce(
      new Promise<AdminModerationPluginItemType>((resolve) => {
        resolveSave = resolve;
      })
    );
    let resolvePolicyUpdate!: (value: SystemModerationPolicyType) => void;
    mocks.updateModerationPolicy.mockReturnValueOnce(
      new Promise<SystemModerationPolicyType>((resolve) => {
        resolvePolicyUpdate = resolve;
      })
    );

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(ModerationPolicy));
    });
    await act(async () => {
      await Promise.resolve();
    });

    // 1. 打开总开关并点击启用插件（此时探测请求处于等待中）
    const totalSwitch = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      totalSwitch.click();
    });
    const activateBtn = host.querySelector('[data-plugin-activate="baidu"]') as HTMLButtonElement;
    await act(async () => {
      activateBtn.click();
    });

    // 2. 在探测返回前关闭“用户输入”审核开关
    const checkboxesDuringSave = host.querySelectorAll('input[type="checkbox"]');
    const userInputSwitch = checkboxesDuringSave[1] as HTMLInputElement;
    expect(userInputSwitch.checked).toBe(true);
    await act(async () => {
      userInputSwitch.click();
    });
    expect(userInputSwitch.checked).toBe(false);

    // 3. 探测返回后应保留 userInput: false 并将其提交给策略接口
    await act(async () => {
      resolveSave({ ...baiduPlugin, enabled: true });
      await Promise.resolve();
    });
    expect(mocks.updateModerationPolicy).toHaveBeenCalledWith({
      ...DefaultSystemModerationPolicy,
      enabled: true,
      activePluginId: 'baidu',
      hooks: {
        ...DefaultSystemModerationPolicy.hooks,
        userInput: false
      }
    });

    // 4. 在策略接口返回前继续关闭“模型输入”开关，返回后不应被旧响应覆盖
    const checkboxesDuringSync = host.querySelectorAll('input[type="checkbox"]');
    const modelInputSwitch = checkboxesDuringSync[2] as HTMLInputElement;
    await act(async () => {
      modelInputSwitch.click();
    });
    expect(modelInputSwitch.checked).toBe(false);

    await act(async () => {
      resolvePolicyUpdate({
        ...DefaultSystemModerationPolicy,
        enabled: true,
        activePluginId: 'baidu',
        hooks: {
          ...DefaultSystemModerationPolicy.hooks,
          userInput: false,
          modelInput: true
        }
      });
      await Promise.resolve();
    });

    const finalCheckboxes = host.querySelectorAll('input[type="checkbox"]');
    expect((finalCheckboxes[0] as HTMLInputElement).checked).toBe(true);
    expect((finalCheckboxes[1] as HTMLInputElement).checked).toBe(false);
    expect((finalCheckboxes[2] as HTMLInputElement).checked).toBe(false);

    await act(async () => {
      root.unmount();
    });
  });

  it('keeps global switch disabled and skips policy persistence when user turns it off while activation probe is pending', async () => {
    mocks.policyData = {
      ...DefaultSystemModerationPolicy,
      enabled: false
    };
    const baiduPlugin: AdminModerationPluginItemType = {
      pluginId: 'baidu',
      source: 'system',
      name: 'Baidu Moderation',
      provider: 'baidu',
      enabled: false,
      hasConfiguredSecrets: true
    };
    mocks.pluginsData = [baiduPlugin];

    let resolveSave!: (value: AdminModerationPluginItemType) => void;
    mocks.saveModerationConfig.mockReturnValueOnce(
      new Promise<AdminModerationPluginItemType>((resolve) => {
        resolveSave = resolve;
      })
    );

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(ModerationPolicy));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const totalSwitch = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      totalSwitch.click();
    });
    const activateBtn = host.querySelector('[data-plugin-activate="baidu"]') as HTMLButtonElement;
    await act(async () => {
      activateBtn.click();
    });

    // 在探测返回前关闭总开关
    await act(async () => {
      totalSwitch.click();
    });
    expect(totalSwitch.checked).toBe(false);

    await act(async () => {
      resolveSave({ ...baiduPlugin, enabled: true });
      await Promise.resolve();
    });

    expect(mocks.updateModerationPolicy).not.toHaveBeenCalled();
    expect((host.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);

    await act(async () => {
      root.unmount();
    });
  });

  it('exposes only the service TOC item when disabled and wires AdminSettingPage onSave validation', async () => {
    mocks.policyData = {
      ...DefaultSystemModerationPolicy,
      enabled: false
    };
    mocks.updateModerationPolicy.mockResolvedValue({
      ...DefaultSystemModerationPolicy,
      enabled: false
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(ModerationPolicy));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.lastTocItems).toEqual([
      { id: 'service', label: 'admin:moderation.service_title' }
    ]);

    // Saving while disabled succeeds without requiring an active plugin
    await act(async () => {
      await mocks.lastOnSave?.();
    });
    expect(mocks.updateModerationPolicy).toHaveBeenCalledWith({
      ...DefaultSystemModerationPolicy,
      enabled: false
    });

    // Turning on moderation without an active plugin blocks save with an error toast
    const totalSwitch = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      totalSwitch.click();
    });
    mocks.updateModerationPolicy.mockClear();

    await act(async () => {
      await mocks.lastOnSave?.();
    });
    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'error',
      title: 'admin:moderation.select_plugin_required'
    });
    expect(mocks.updateModerationPolicy).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});
