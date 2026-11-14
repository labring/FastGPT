import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminModerationPluginItemType } from '@fastgpt/global/core/plugin/moderation/type';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  popoverConfirmRendered: 0,
  lastPopoverOnConfirm: undefined as (() => void) | undefined
}));

vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({
    i18n: { language: 'zh-CN' },
    t: (key: string) => key
  })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  Flex: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) =>
    React.createElement('div', { onClick }, children),
  HStack: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  Radio: ({ isChecked }: { isChecked: boolean }) =>
    React.createElement('input', { type: 'radio', checked: isChecked, readOnly: true }),
  Text: ({ children }: React.PropsWithChildren) => React.createElement('span', null, children)
}));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: React.PropsWithChildren) =>
    React.createElement(React.Fragment, null, children)
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
          onSelect: vi.fn(),
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
          onSelect: vi.fn(),
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
});
