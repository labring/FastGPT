import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
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
  Box: ({ children }: any) => React.createElement('div', null, children),
  SimpleGrid: ({ children }: any) => React.createElement('div', { 'data-grid': '' }, children)
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
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.patch.mockReset().mockResolvedValue(undefined);
  mocks.save = undefined;
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container?.remove();
  dom.window.close();
  vi.unstubAllGlobals();
});

/** 挂载真实表单并等待配置初始化，以验证隐藏输入与提交值之间的关系。 */
const renderSettings = async (overrides: Record<string, unknown>) => {
  mocks.effectiveConfig = resolveDomainEffectiveConfig({ domain: 'security', overrides });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(React.createElement(SecuritySettings)));
};

/** 通过 React change 事件更新受 react-hook-form 管理的 textarea。 */
const changeTextarea = async (textarea: HTMLTextAreaElement, value: string) => {
  await act(async () => {
    textarea.value = value;
    Simulate.change(textarea);
  });
};

describe('security allowlist controls', () => {
  it('shows the allowlist only when enabled and retains it across disabling and saving', async () => {
    await renderSettings({ checkExternalFile: false, fileUrlWhitelist: ['cdn.example.com'] });
    const switchButton = container.querySelector<HTMLButtonElement>(
      '[data-label="admin:check_external_file"]'
    )!;
    expect(switchButton.closest('[data-grid]')?.querySelectorAll('button')).toHaveLength(1);
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

    await changeTextarea(
      container.querySelector<HTMLTextAreaElement>('[name="fileUrlWhitelistText"]')!,
      'cdn.example.com\nstatic.example.com'
    );
    await act(async () => switchButton.click());
    expect(container.querySelector('[name="fileUrlWhitelistText"]')).toBeNull();
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        checkExternalFile: false,
        fileUrlWhitelist: ['cdn.example.com', 'static.example.com']
      })
    );

    await act(async () => switchButton.click());
    const textarea = container.querySelector<HTMLTextAreaElement>('[name="fileUrlWhitelistText"]');
    expect(textarea?.value).toBe('cdn.example.com\nstatic.example.com');
    expect(textarea?.getAttribute('aria-label')).toBe('admin:external_resource_domain_whitelist');
  });

  it('retains allowed origins while disabled and restores them on re-enabling', async () => {
    const allowedOrigins = ['https://app.example.com', 'https://chat.example.com'];
    await renderSettings({ allowedOriginsEnabled: false, allowedOrigins });

    const switchButton = container.querySelector<HTMLButtonElement>(
      '[data-label="admin:allowed_origins"]'
    )!;
    expect(switchButton.closest('[data-grid]')?.querySelectorAll('button')).toHaveLength(1);
    expect(switchButton.getAttribute('aria-checked')).toBe('false');
    expect(container.querySelector('[name="allowedOriginsText"]')).toBeNull();

    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowedOriginsEnabled: false, allowedOrigins })
    );

    await act(async () => switchButton.click());
    let textarea = container.querySelector<HTMLTextAreaElement>('[name="allowedOriginsText"]');
    expect(textarea?.value).toBe(allowedOrigins.join('\n'));
    expect(textarea?.getAttribute('aria-label')).toBe('admin:allowed_origins');
    const editedOrigins = [...allowedOrigins, 'https://new.example.com'];
    await changeTextarea(textarea!, editedOrigins.join('\n'));
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowedOriginsEnabled: true, allowedOrigins: editedOrigins })
    );

    await act(async () => switchButton.click());
    expect(container.querySelector('[name="allowedOriginsText"]')).toBeNull();
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowedOriginsEnabled: false, allowedOrigins: editedOrigins })
    );

    await act(async () => switchButton.click());
    textarea = container.querySelector<HTMLTextAreaElement>('[name="allowedOriginsText"]');
    expect(textarea?.value).toBe(editedOrigins.join('\n'));
  });

  it.each([
    { origins: [], expectedEnabled: false },
    { origins: ['https://legacy.example.com'], expectedEnabled: true }
  ])(
    'initializes legacy allowlists from their content: $origins',
    async ({ origins, expectedEnabled }) => {
      await renderSettings({ allowedOrigins: origins });

      const switchButton = container.querySelector<HTMLButtonElement>(
        '[data-label="admin:allowed_origins"]'
      )!;
      expect(switchButton.getAttribute('aria-checked')).toBe(String(expectedEnabled));
      const textarea = container.querySelector<HTMLTextAreaElement>('[name="allowedOriginsText"]');
      expect(textarea?.value ?? null).toBe(expectedEnabled ? origins.join('\n') : null);
    }
  );

  it('allows the origins switch to be explicitly enabled with an empty list', async () => {
    await renderSettings({ allowedOriginsEnabled: true, allowedOrigins: [] });

    expect(
      container.querySelector('[data-label="admin:allowed_origins"]')?.getAttribute('aria-checked')
    ).toBe('true');
    expect(container.querySelector<HTMLTextAreaElement>('[name="allowedOriginsText"]')?.value).toBe(
      ''
    );
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowedOriginsEnabled: true, allowedOrigins: [] })
    );
  });
});
