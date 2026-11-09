import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { filterDomainDataByEdition } from '@fastgpt/global/common/system/config/permission';
import type { SystemInstanceConfigDomainKey } from '@fastgpt/global/common/system/config/schema';

const mocks = vi.hoisted(() => ({
  isPro: false,
  save: undefined as undefined | ((data: any) => Promise<unknown>),
  update: vi.fn(),
  authOverrides: {} as Record<string, unknown>
}));

vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: { isProService: mocks.isPro, enableSaasAdminConfig: false } })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/web/common/system/useDomainConfig', () => ({
  useDomainConfig: (domain: SystemInstanceConfigDomainKey) => ({
    revision: 1,
    isLoading: false,
    overrides: domain === 'auth' ? mocks.authOverrides : {},
    effectiveConfig: filterDomainDataByEdition({
      domain,
      data: resolveSystemInstanceConfig({})[domain],
      edition: mocks.isPro ? 'pro' : 'community'
    }),
    refetch: vi.fn()
  }),
  updateDomainConfigApi: mocks.update
}));
vi.mock('@/web/common/system/useAdminConfigSaveRequest', () => ({
  useAdminConfigSaveRequest: (save: (data: any) => Promise<unknown>) => {
    mocks.save = save;
    return { runAsync: save, loading: false };
  }
}));

// 仅替换布局与输入外观；表单 Hook、权限规则、提交组装和深合并使用真实实现。
vi.mock('@chakra-ui/react', () => {
  const element = ({ children }: { children?: React.ReactNode }) => children;
  return {
    SimpleGrid: element,
    Flex: element,
    Input: () => null,
    Text: element,
    NumberInput: element,
    NumberInputField: () => null,
    NumberInputStepper: element,
    NumberIncrementStepper: () => null,
    NumberDecrementStepper: () => null,
    useToast: () => ({ toast: vi.fn() })
  };
});
vi.mock('@fastgpt/web/components/common/MySelect', () => ({ default: () => null }));
vi.mock('@/pageComponents/admin/settings/AdminSettingPage', () => ({
  default: ({ children, tocItems }: { children: React.ReactNode; tocItems: unknown }) =>
    React.createElement('main', { 'data-toc': JSON.stringify(tocItems) }, children)
}));
vi.mock('@/pageComponents/admin/settings/AdminSettingSection', () => ({
  default: ({ children, id }: { children: React.ReactNode; id: string }) =>
    React.createElement('section', { id }, children)
}));
vi.mock('@/pageComponents/admin/settings/AdminFormItem', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/pageComponents/admin/settings/AdminSwitchRow', () => ({ default: () => null }));

import CoreSettings from '@/pageComponents/admin/settings/core';
import AuthSettings from '@/pageComponents/admin/settings/auth';
import LimitsSettings from '@/pageComponents/admin/settings/limits';

describe('configuration form edition boundary', () => {
  beforeEach(() => {
    mocks.isPro = false;
    mocks.authOverrides = {};
    mocks.update.mockReset().mockResolvedValue({ results: [] });
  });

  it.each([false, true])('社区版和商业版都展示并保存归档下载配置：isPro=%s', async (isPro) => {
    mocks.isPro = isPro;
    const html = renderToStaticMarkup(React.createElement(LimitsSettings));
    expect(html).toContain('id="datasetArchive"');
    expect(html).toContain('admin:dataset_archive_download');
    const config = resolveSystemInstanceConfig({});
    const datasetArchive = {
      maxFiles: 123,
      maxSourceSizeMiB: 456,
      maxConcurrency: 7,
      prepareTimeoutSeconds: 89
    };
    await mocks.save!({
      ...config.resource,
      ...config.performance,
      openApiKeyMaxCount: config.auth.openApiKeyMaxCount,
      fileUrlExpiredDays: config.storage.fileUrlExpiredDays,
      hnswEfSearch: config.vector.hnswEfSearch,
      vectorRecallConcurrency: config.vector.vectorRecallConcurrency,
      datasetArchive
    });
    const resource = mocks.update.mock.calls[0][0].items.find(
      (item: { domain: string }) => item.domain === 'resource'
    );
    expect(resource.overrides.datasetArchive).toEqual(datasetArchive);
  });

  it('hides community SMTP/SMS sections and excludes their default form values from the save', async () => {
    const html = renderToStaticMarkup(React.createElement(CoreSettings));
    expect(html).not.toContain('id="email"');
    expect(html).not.toContain('id="sms"');
    const config = resolveSystemInstanceConfig({});
    await mocks.save!({
      defaultTeamBasicPermissionsEnabled: true,
      teamMode: 'multi',
      agentEngine: 'fastAgent',
      multipleDataToBase64: false,
      downloadMode: 'short-proxy',
      externalEndpoint: '',
      cdnEndpoint: '',
      redirectTtlSeconds: 300,
      openApiPrefix: 'community',
      email: config.auth.loginProviders.email,
      phone: config.auth.loginProviders.phone
    });
    const auth = mocks.update.mock.calls[0][0].items.find(
      (item: { domain: string }) => item.domain === 'auth'
    );
    expect(auth.overrides).toEqual({ defaultTeamBasicPermissionsEnabled: true });
  });

  it('keeps Pro SMTP/SMS editable and preserves another hidden provider override', async () => {
    mocks.isPro = true;
    mocks.authOverrides = { loginProviders: { wecom: { providerSecret: 'keep-hidden-secret' } } };
    const html = renderToStaticMarkup(React.createElement(CoreSettings));
    expect(html).toContain('id="email"');
    expect(html).toContain('id="sms"');
    const config = resolveSystemInstanceConfig({});
    await mocks.save!({
      email: { ...config.auth.loginProviders.email, smtp: 'smtp.example.com' },
      phone: config.auth.loginProviders.phone
    });
    const auth = mocks.update.mock.calls[0][0].items.find(
      (item: { domain: string }) => item.domain === 'auth'
    );
    expect(auth.overrides.loginProviders).toMatchObject({
      email: { smtp: 'smtp.example.com' },
      wecom: { providerSecret: 'keep-hidden-secret' }
    });
  });

  it('hides community email registration and filters it from the auth page payload', async () => {
    const html = renderToStaticMarkup(React.createElement(AuthSettings));
    expect(html).not.toContain('id="emailLogin"');
    const config = resolveSystemInstanceConfig({});
    await mocks.save!({
      ...config.auth,
      passwordLoginMinuteLimitCount: 10,
      maxLoginSession: 10
    });
    const auth = mocks.update.mock.calls[0][0].items[0];
    expect(auth.overrides).not.toHaveProperty('loginProviders.email');
  });
});
