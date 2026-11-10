import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseDomainOverrides,
  resolveSystemInstanceConfig
} from '@fastgpt/global/common/system/config/schema';
import { filterDomainDataByEdition } from '@fastgpt/global/common/system/config/permission';
import type { SystemInstanceConfigDomainKey } from '@fastgpt/global/common/system/config/schema';

const mocks = vi.hoisted(() => ({
  isPro: false,
  save: undefined as undefined | ((data: any) => Promise<unknown>),
  update: vi.fn(),
  patch: vi.fn(),
  pageSave: undefined as undefined | (() => Promise<void>),
  switchRows: new Map<string, { isChecked: boolean; onChange: (checked: boolean) => void }>(),
  formLabels: [] as string[],
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
    refetch: vi.fn(),
    patchConfig: mocks.patch
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
    Textarea: () => null,
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
  default: ({
    children,
    tocItems,
    onSave
  }: {
    children: React.ReactNode;
    tocItems: unknown;
    onSave: () => Promise<void>;
  }) => {
    mocks.pageSave = onSave;
    return React.createElement('main', { 'data-toc': JSON.stringify(tocItems) }, children);
  }
}));
vi.mock('@/pageComponents/admin/settings/AdminSettingSection', () => ({
  default: ({ children, id }: { children: React.ReactNode; id: string }) =>
    React.createElement('section', { id }, children)
}));
vi.mock('@/pageComponents/admin/settings/AdminFormItem', () => ({
  default: ({ children, label }: { children: React.ReactNode; label: string }) => {
    mocks.formLabels.push(label);
    return children;
  }
}));
vi.mock('@/pageComponents/admin/settings/AdminSwitchRow', () => ({
  default: (props: { label: string; isChecked: boolean; onChange: (checked: boolean) => void }) => {
    mocks.switchRows.set(props.label, props);
    return null;
  }
}));

import CoreSettings from '@/pageComponents/admin/settings/core';
import AuthSettings from '@/pageComponents/admin/settings/auth';
import LimitsSettings from '@/pageComponents/admin/settings/limits';
import SecuritySettings from '@/pageComponents/admin/settings/security';
import FeatureSettings from '@/pageComponents/admin/settings/feature';

describe('configuration form edition boundary', () => {
  beforeEach(() => {
    mocks.isPro = false;
    mocks.authOverrides = {};
    mocks.patch.mockReset().mockResolvedValue(undefined);
    mocks.pageSave = undefined;
    mocks.switchRows.clear();
    mocks.formLabels = [];
    mocks.update.mockReset().mockResolvedValue({ results: [] });
  });

  it('enables upload validation by default and maps the positive switch to persisted skip semantics', async () => {
    renderToStaticMarkup(React.createElement(SecuritySettings));
    const uploadValidation = mocks.switchRows.get('admin:upload_file_type_check')!;
    expect(uploadValidation.isChecked).toBe(true);
    expect(mocks.formLabels).not.toContain('admin:external_resource_domain_whitelist');
    expect(mocks.switchRows.get('admin:check_external_file')?.isChecked).toBe(false);

    await uploadValidation.onChange(false);
    await mocks.pageSave!();
    expect(mocks.patch).toHaveBeenLastCalledWith(
      expect.objectContaining({ skipFileTypeCheck: true, fileUrlWhitelist: [] })
    );

    await uploadValidation.onChange(true);
    await mocks.pageSave!();
    expect(mocks.patch).toHaveBeenLastCalledWith(
      expect.objectContaining({ skipFileTypeCheck: false, fileUrlWhitelist: [] })
    );
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
    // 整页提交必须符合新契约，不能夹带已移除的流恢复、埋点间隔或召回上限。
    for (const item of mocks.update.mock.calls[0][0].items) {
      expect(() =>
        parseDomainOverrides({ domain: item.domain, overrides: item.overrides })
      ).not.toThrow();
    }
  });

  it.each([false, true])('功能页按三方能力分组并可保存：isPro=%s', async (isPro) => {
    mocks.isPro = isPro;
    const html = renderToStaticMarkup(React.createElement(FeatureSettings));
    const datasets = html.match(/<section id="thirdPartyDatasets">(.*?)<\/section>/)?.[1];
    const channels = html.match(/<section id="thirdPartyPublishChannels">(.*?)<\/section>/)?.[1];
    expect(datasets).toBeDefined();
    expect(channels).toBeDefined();
    // 输入外观已 mock，Controller 仍会执行并记录实际绑定的字段标签。
    expect([...mocks.switchRows.keys()]).toEqual(
      expect.arrayContaining([
        'admin:enable_feishu_data_source',
        'admin:enable_yuque_data_source',
        'admin:enable_dingtalk_data_source',
        'admin:publish_channel_personal_wechat'
      ])
    );
    expect(mocks.switchRows.has('admin:show_workflow_builder')).toBe(false);
    expect(mocks.switchRows.has('admin:disable_runtime_cache')).toBe(false);
    const copyright = mocks.switchRows.get('admin:hide_chat_copyright_setting')!;
    expect(copyright.isChecked).toBe(true);
    copyright.onChange(false);
    mocks.switchRows.get('admin:enable_feishu_data_source')!.onChange(false);
    mocks.switchRows.get('admin:publish_channel_personal_wechat')!.onChange(false);
    await mocks.pageSave!();
    const overrides = mocks.patch.mock.calls[0][0];
    expect(() => parseDomainOverrides({ domain: 'feature', overrides })).not.toThrow();
    expect(overrides).toMatchObject({
      hideChatCopyrightSetting: true,
      showDatasetFeishu: false,
      showPublishWechat: false
    });
  });

  it('hides community SMTP/SMS sections and excludes their default form values from the save', async () => {
    const html = renderToStaticMarkup(React.createElement(CoreSettings));
    expect(html).not.toContain('id="email"');
    expect(html).not.toContain('id="sms"');
    const config = resolveSystemInstanceConfig({});
    await mocks.save!({
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
    expect(auth.overrides).toEqual({});
    expect(html).not.toContain('id="team"');
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

  it.each([false, true])(
    'preserves email registration when saving SMTP settings: register=%s',
    async (register) => {
      mocks.isPro = true;
      mocks.authOverrides = { loginProviders: { email: { register } } };
      renderToStaticMarkup(React.createElement(CoreSettings));
      expect(mocks.switchRows.has('admin:enable_email_self_registration')).toBe(false);

      const config = resolveSystemInstanceConfig({});
      await mocks.save!({
        // 即便传入旧页面遗留的注册值，核心页也只提交自己负责的 SMTP 字段。
        email: {
          ...config.auth.loginProviders.email,
          smtp: 'smtp.example.com',
          register: !register
        },
        phone: config.auth.loginProviders.phone
      });
      const auth = mocks.update.mock.calls[0][0].items.find(
        (item: { domain: string }) => item.domain === 'auth'
      );
      expect(auth.overrides.loginProviders.email).toMatchObject({
        smtp: 'smtp.example.com',
        register
      });
    }
  );

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
