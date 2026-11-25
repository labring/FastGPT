import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminModerationPluginItemType } from '@fastgpt/global/core/plugin/moderation/type';

const mocks = vi.hoisted(() => ({
  popoverConfirmRendered: 0,
  lastPopoverOnConfirm: undefined as (() => void) | undefined,
  lastTooltipLabel: undefined as string | undefined
}));

vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({
    i18n: { language: 'zh-CN' },
    t: (key: string) => key
  })
}));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  Button: ({
    children,
    onClick,
    isDisabled
  }: React.PropsWithChildren<{ onClick?: (e: React.MouseEvent) => void; isDisabled?: boolean }>) =>
    React.createElement('button', { disabled: isDisabled, onClick }, children),
  Flex: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) =>
    React.createElement('div', { onClick }, children),
  HStack: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  Text: ({ children }: React.PropsWithChildren) => React.createElement('span', null, children)
}));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children, label }: React.PropsWithChildren<{ label?: string }>) => {
    if (label && label !== 'Baidu Moderation') {
      mocks.lastTooltipLabel = label;
    }
    return React.createElement(React.Fragment, null, children);
  }
}));
vi.mock('@fastgpt/web/components/common/Icon/button', () => ({
  default: ({ icon, onClick }: { icon: string; onClick?: (e: React.MouseEvent) => void }) =>
    React.createElement('button', { 'data-icon': icon, onClick }, icon)
}));
vi.mock('@fastgpt/web/components/common/MyPopover/PopoverConfirm', () => ({
  default: ({ Trigger, onConfirm }: { Trigger: React.ReactNode; onConfirm: () => void }) => {
    mocks.popoverConfirmRendered += 1;
    mocks.lastPopoverOnConfirm = onConfirm;
    return React.createElement('div', { 'data-popover-confirm': 'true' }, Trigger);
  }
}));

import PluginItemRow from '@/pageComponents/admin/moderation/policy/PluginItemRow';

const basePlugin: AdminModerationPluginItemType = {
  pluginId: 'baidu',
  source: 'system',
  name: 'Baidu Moderation',
  provider: 'baidu',
  enabled: false,
  hasConfiguredSecrets: true
};

describe('PluginItemRow delete confirmation', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.popoverConfirmRendered = 0;
    mocks.lastPopoverOnConfirm = undefined;
    mocks.lastTooltipLabel = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
    dom?.window.close();
    vi.unstubAllGlobals();
  });

  it('requires PopoverConfirm even when plugin is selected (isActive=true) while moderation is disabled and plugin.enabled=false', async () => {
    const onDelete = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(PluginItemRow, {
          plugin: basePlugin,
          isActive: true,
          isModerationEnabled: false,
          isLastPlugin: false,
          onActivate: vi.fn(),
          onEdit: vi.fn(),
          onDelete
        })
      );
    });

    expect(mocks.popoverConfirmRendered).toBe(1);
    const trashBtn = host.querySelector('button[data-icon="common/trash"]') as HTMLButtonElement;
    await act(async () => {
      trashBtn.click();
    });
    expect(onDelete).not.toHaveBeenCalled();

    await act(async () => {
      mocks.lastPopoverOnConfirm?.();
    });
    expect(onDelete).toHaveBeenCalledOnce();

    await act(async () => {
      root.unmount();
    });
  });

  it('bypasses row PopoverConfirm so parent handles blocking tip or last-plugin Modal when active under enabled policy or last plugin', async () => {
    const onDelete = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(PluginItemRow, {
          plugin: basePlugin,
          isActive: true,
          isModerationEnabled: true,
          isLastPlugin: false,
          onActivate: vi.fn(),
          onEdit: vi.fn(),
          onDelete
        })
      );
    });

    expect(mocks.popoverConfirmRendered).toBe(0);
    const trashBtn = host.querySelector('button[data-icon="common/trash"]') as HTMLButtonElement;
    await act(async () => {
      trashBtn.click();
    });
    expect(onDelete).toHaveBeenCalledOnce();

    await act(async () => {
      root.unmount();
    });
  });

  it('renders action column enable/in-use button states and disables unconfigured and active actions', async () => {
    const onActivate = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    // 1. 待配置状态：显示禁用的“启用”按钮与“请先完成插件配置”提示
    await act(async () => {
      root.render(
        React.createElement(PluginItemRow, {
          plugin: { ...basePlugin, hasConfiguredSecrets: false },
          isActive: false,
          onActivate,
          onEdit: vi.fn(),
          onDelete: vi.fn()
        })
      );
    });
    expect(host.querySelector('input[type="radio"]')).toBeNull();
    expect(mocks.lastTooltipLabel).toBe('admin:moderation.configure_params_first');
    const unconfiguredBtn = Array.from(host.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'admin:moderation.enable'
    ) as HTMLButtonElement;
    expect(unconfiguredBtn.disabled).toBe(true);
    await act(async () => {
      unconfiguredBtn.click();
    });
    expect(onActivate).not.toHaveBeenCalled();

    // 2. 已配置但未启用状态：显示可点击的“启用”按钮
    await act(async () => {
      root.render(
        React.createElement(PluginItemRow, {
          plugin: basePlugin,
          isActive: false,
          onActivate,
          onEdit: vi.fn(),
          onDelete: vi.fn()
        })
      );
    });
    const enableBtn = Array.from(host.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'admin:moderation.enable'
    ) as HTMLButtonElement;
    expect(enableBtn.disabled).toBe(false);
    await act(async () => {
      enableBtn.click();
    });
    expect(onActivate).toHaveBeenCalledOnce();

    // 3. 使用中状态：显示禁用的“使用中”按钮，不可点击取消启用
    onActivate.mockClear();
    await act(async () => {
      root.render(
        React.createElement(PluginItemRow, {
          plugin: { ...basePlugin, enabled: true },
          isActive: true,
          onActivate,
          onEdit: vi.fn(),
          onDelete: vi.fn()
        })
      );
    });
    const inUseBtn = Array.from(host.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'admin:moderation.in_use'
    ) as HTMLButtonElement;
    expect(inUseBtn.disabled).toBe(true);
    await act(async () => {
      inUseBtn.click();
    });
    expect(onActivate).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('blocks activate, edit, delete, and PopoverConfirm when isDisabled is true', async () => {
    const onActivate = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(PluginItemRow, {
          plugin: basePlugin,
          isActive: false,
          isModerationEnabled: true,
          isLastPlugin: false,
          isDisabled: true,
          onActivate,
          onEdit,
          onDelete
        })
      );
    });

    expect(mocks.popoverConfirmRendered).toBe(0);
    const enableBtn = Array.from(host.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'admin:moderation.enable'
    ) as HTMLButtonElement;
    const editBtn = host.querySelector('button[data-icon="common/setting"]') as HTMLButtonElement;
    const trashBtn = host.querySelector('button[data-icon="common/trash"]') as HTMLButtonElement;
    expect(enableBtn.disabled).toBe(true);

    await act(async () => {
      enableBtn.click();
      editBtn.click();
      trashBtn.click();
    });

    expect(onActivate).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});
