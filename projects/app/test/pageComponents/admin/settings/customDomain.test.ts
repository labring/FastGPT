import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { omitDomainSecrets } from '@fastgpt/global/common/system/config/permission';
import CustomDomainSettingComponent from '@/pageComponents/admin/settings/custom-domain';

const mocks = vi.hoisted(() => ({
  enabled: true,
  patch: vi.fn(),
  save: undefined as undefined | (() => Promise<unknown>)
}));

vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/web/common/system/useDomainConfig', () => ({
  useDomainConfig: () => ({
    effectiveConfig: omitDomainSecrets(
      'site',
      resolveSystemInstanceConfig({
        site: { name: 'Unrelated site name', customDomain: { enable: mocks.enabled } }
      }).site
    ),
    isSecretConfigured: (path: string) => path === 'customDomain.kc.aliyun',
    isLoading: false,
    isUpdating: false,
    patchConfig: mocks.patch
  })
}));
vi.mock('@/pageComponents/admin/settings/AdminSecretInput', () => ({
  default: ({ name, isConfigured }: { name: string; isConfigured: boolean }) =>
    React.createElement('textarea', { name, 'data-configured': isConfigured })
}));
vi.mock('@/pageComponents/admin/useAdminPermission', () => ({
  useAdminPermission: () => ({ filterConfigData: (_domain: string, value: unknown) => value })
}));
vi.mock('@chakra-ui/react', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
    React.createElement('input', props),
  Textarea: ({
    resize: _resize,
    ...props
  }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { resize?: string }) =>
    React.createElement('textarea', props),
  SimpleGrid: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/pageComponents/admin/settings/AdminSettingPage', () => ({
  default: ({
    children,
    onSave
  }: {
    children: React.ReactNode;
    onSave: () => Promise<unknown>;
  }) => {
    mocks.save = onSave;
    return children;
  }
}));
vi.mock('@/pageComponents/admin/settings/AdminSettingSection', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/pageComponents/admin/settings/AdminFormItem', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/pageComponents/admin/settings/AdminSwitchRow', () => ({
  default: () => React.createElement('input', { type: 'checkbox', name: 'enable' })
}));

describe('SaaS custom domain settings page', () => {
  beforeEach(() => {
    mocks.enabled = true;
    mocks.patch.mockClear();
  });

  it('groups all three cloud providers and saves only custom-domain fields', async () => {
    const html = renderToStaticMarkup(React.createElement(CustomDomainSettingComponent));
    for (const provider of ['aliyun', 'tencent', 'volcengine']) {
      for (const group of ['domain', 'kc', 'issuerServiceName', 'nginxServiceName']) {
        expect(html).toContain(`name="${group}.${provider}"`);
      }
    }
    await mocks.save?.();
    expect(mocks.patch).toHaveBeenCalledOnce();
    expect(Object.keys(mocks.patch.mock.calls[0][0])).toEqual(['customDomain']);
    expect(mocks.patch.mock.calls[0][0].customDomain.enable).toBe(true);
    expect(mocks.patch.mock.calls[0][0].customDomain.kc).toEqual({});
  });

  it('hides provider fields when custom domains are disabled', () => {
    mocks.enabled = false;
    const html = renderToStaticMarkup(React.createElement(CustomDomainSettingComponent));
    expect(html).toContain('name="enable"');
    expect(html).not.toContain('name="kc.');
    expect(html).not.toContain('name="domain.');
  });
});
