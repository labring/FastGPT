import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveDomainEffectiveConfig } from '@fastgpt/global/common/system/config/schema';

const mocks = vi.hoisted(() => ({
  patch: vi.fn(),
  effectiveConfig: {} as Record<string, unknown>,
  save: undefined as undefined | (() => Promise<unknown>)
}));
vi.mock('@/web/common/system/useDomainConfig', () => ({
  useDomainConfig: () => ({
    effectiveConfig: mocks.effectiveConfig,
    isLoading: false,
    isUpdating: false,
    patchConfig: mocks.patch
  })
}));
vi.mock('@/pageComponents/admin/useAdminPermission', () => ({
  useAdminPermission: () => ({ isFieldVisible: () => false })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@chakra-ui/react', () => ({
  Input: React.forwardRef(function Input(props: any, ref: any) {
    return React.createElement('input', { ...props, ref });
  }),
  Textarea: React.forwardRef(function Textarea(props: any, ref: any) {
    return React.createElement('textarea', { ...props, ref });
  }),
  SimpleGrid: ({ children }: any) => children
}));
vi.mock('@/pageComponents/admin/settings/AdminSettingPage', () => ({
  default: ({ children, onSave }: any) => {
    mocks.save = onSave;
    return React.createElement('div', null, children);
  }
}));
vi.mock('@/pageComponents/admin/settings/AdminSettingSection', () => ({
  default: ({ children }: any) => children
}));
vi.mock('@/pageComponents/admin/settings/AdminFormItem', () => ({
  default: ({ children, label }: any) => React.createElement('label', null, label, children)
}));
vi.mock('@/pageComponents/admin/settings/AdminSwitchRow', () => ({
  default: ({ label, isChecked, onChange }: any) =>
    React.createElement(
      'button',
      {
        'data-label': label,
        'aria-checked': isChecked,
        onClick: () => onChange(!isChecked)
      },
      label
    )
}));

import SecuritySettings from '@/pageComponents/admin/settings/security';

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
let dom: JSDOM;

beforeEach(() => {
  // 共享 setup 先在 Node 环境加载服务端配置，再为表单交互挂载 DOM。
  dom = new JSDOM('<!doctype html><html><body></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container?.remove();
  dom.window.close();
  vi.unstubAllGlobals();
});

describe('external file check controls', () => {
  it('shows the allowlist only when enabled and retains it across disabling and saving', async () => {
    mocks.patch.mockReset().mockResolvedValue(undefined);
    mocks.effectiveConfig = resolveDomainEffectiveConfig({
      domain: 'security',
      overrides: { checkExternalFile: false, fileUrlWhitelist: ['cdn.example.com'] }
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(React.createElement(SecuritySettings)));
    const switchButton = container.querySelector<HTMLButtonElement>(
      '[data-label="admin:check_external_file"]'
    )!;
    expect(switchButton.getAttribute('aria-checked')).toBe('false');
    expect(container.querySelector('[name="fileUrlWhitelistText"]')).toBeNull();

    await act(async () => switchButton.click());
    expect(
      container.querySelector<HTMLTextAreaElement>('[name="fileUrlWhitelistText"]')?.value
    ).toBe('cdn.example.com');
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).toHaveBeenLastCalledWith(
      expect.objectContaining({ checkExternalFile: true, fileUrlWhitelist: ['cdn.example.com'] })
    );

    await act(async () => switchButton.click());
    expect(container.querySelector('[name="fileUrlWhitelistText"]')).toBeNull();
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).toHaveBeenLastCalledWith(
      expect.objectContaining({ checkExternalFile: false, fileUrlWhitelist: ['cdn.example.com'] })
    );
  });
});
