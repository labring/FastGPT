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
  enableSaasAdminConfig: false,
  login2faEnabled: false,
  enableSangforAdminConfig: false,
  save: undefined as undefined | ((data: any) => Promise<unknown>),
  update: vi.fn(),
  patch: vi.fn(),
  pageSave: undefined as undefined | (() => Promise<void>),
  switchRows: new Map<string, { isChecked: boolean; onChange: (checked: boolean) => void }>(),
  selectLists: [] as Array<Array<{ label: string; value: string }>>,
  formLabels: [] as string[],
  authOverrides: {} as Record<string, unknown>,
  authSecretKeys: new Set<string>(),
  featureOverrides: {} as Record<string, unknown>,
  providersOverrides: {} as Record<string, unknown>
}));

vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({
    feConfigs: {
      isProService: mocks.isPro,
      enableSaasAdminConfig: mocks.enableSaasAdminConfig,
      login2faEnabled: mocks.login2faEnabled,
      enableSangforAdminConfig: mocks.enableSangforAdminConfig
    }
  })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/web/common/system/useDomainConfig', () => ({
  useDomainConfig: (domain: SystemInstanceConfigDomainKey) => ({
    revision: 1,
    isSecretConfigured: (path: string) => domain === 'auth' && mocks.authSecretKeys.has(path),
    isLoading: false,
    overrides:
      domain === 'auth'
        ? mocks.authOverrides
        : domain === 'providers'
          ? mocks.providersOverrides
          : {},
    effectiveConfig: filterDomainDataByEdition({
      domain,
      data: resolveSystemInstanceConfig({
        auth: mocks.authOverrides as any,
        feature: mocks.featureOverrides as any,
        providers: mocks.providersOverrides as any
      })[domain],
      edition: mocks.isPro ? 'pro' : 'community'
    }),
    refetch: vi.fn(),
    patchConfig: mocks.patch
  }),
  updateDomainConfigApi: mocks.update
}));
vi.mock('@/pageComponents/admin/settings/AdminSecretInput', () => ({ default: () => null }));
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
    Box: element,
    Icon: () => null,
    Flex: element,
    HStack: element,
    Button: element,
    Tag: element,
    Input: () => null,
    Switch: () => null,
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
vi.mock('@fastgpt/web/components/common/MySelect', () => ({
  default: ({ list }: { list?: Array<{ label: string; value: string }> }) => {
    if (list) mocks.selectLists.push(list);
    return null;
  }
}));
vi.mock('@fastgpt/web/components/common/MyPopover/PopoverConfirm', () => ({
  default: ({ Trigger }: any) => Trigger
}));
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
    mocks.enableSaasAdminConfig = false;
    mocks.login2faEnabled = false;
    mocks.enableSangforAdminConfig = false;
    mocks.authOverrides = {};
    mocks.authSecretKeys = new Set<string>();
    mocks.featureOverrides = {};
    mocks.providersOverrides = {};
    mocks.patch.mockReset().mockResolvedValue(undefined);
    mocks.pageSave = undefined;
    mocks.switchRows.clear();
    mocks.selectLists = [];
    mocks.formLabels = [];
    mocks.update.mockReset().mockResolvedValue({ results: [] });
  });

  it.each([
    [false, true, false],
    [true, false, false],
    [true, true, true]
  ])(
    'shows login 2FA SMS template input only for Pro=%s / 2FA=%s',
    (isPro, login2faEnabled, visible) => {
      mocks.isPro = isPro;
      mocks.login2faEnabled = login2faEnabled;
      mocks.authOverrides = {
        loginProviders: { phone: { accessKeyId: 'ak', signName: 'sign' } }
      };
      mocks.authSecretKeys = new Set(['loginProviders.phone.accessKeySecret']);
      const html = renderToStaticMarkup(React.createElement(AuthSettings));
      expect(html.includes('id="smsLogin"')).toBe(isPro);
      expect(mocks.formLabels.includes('admin:login_code_chinese_template')).toBe(visible);
    }
  );

  it('shows prerequisite links instead of email switch or SMS templates when SMTP/Aliyun SMS are unconfigured', () => {
    mocks.isPro = true;
    const unconfiguredHtml = renderToStaticMarkup(React.createElement(AuthSettings));
    expect(unconfiguredHtml).toContain('href="/admin/settings/core#email"');
    expect(unconfiguredHtml).toContain('admin:please_configure_smtp_first');
    expect(unconfiguredHtml).toContain('admin:smtp_service');
    expect(mocks.switchRows.has('admin:enable_email_self_registration')).toBe(false);

    expect(unconfiguredHtml).toContain('href="/admin/settings/core#sms"');
    expect(unconfiguredHtml).toContain('admin:aliyun_sms_not_configured');
    expect(unconfiguredHtml).toContain('admin:aliyun_sms');
    expect(mocks.formLabels).not.toContain('admin:registration_code_chinese_template');

    mocks.switchRows.clear();
    mocks.authOverrides = { loginProviders: { email: { register: true } } };
    const legacyEnabledWithoutSmtpHtml = renderToStaticMarkup(React.createElement(AuthSettings));
    expect(legacyEnabledWithoutSmtpHtml).toContain('href="/admin/settings/core#email"');
    expect(mocks.switchRows.has('admin:enable_email_self_registration')).toBe(true);

    mocks.switchRows.clear();
    mocks.formLabels = [];
    mocks.authOverrides = {
      loginProviders: {
        email: { smtp: 'smtp.example.com', user: 'noreply@example.com' },
        phone: { accessKeyId: 'ak', signName: 'sign' }
      }
    };
    mocks.authSecretKeys = new Set([
      'loginProviders.email.pass',
      'loginProviders.phone.accessKeySecret'
    ]);
    const configuredHtml = renderToStaticMarkup(React.createElement(AuthSettings));
    expect(configuredHtml).not.toContain('href="/admin/settings/core#email"');
    expect(configuredHtml).not.toContain('href="/admin/settings/core#sms"');
    expect(mocks.switchRows.has('admin:enable_email_self_registration')).toBe(true);
    expect(mocks.formLabels).toContain('admin:registration_code_chinese_template');
  });

  it.each([false, true])(
    'shows cancellation SMS template inputs only when accountCancellation.enabled=%s',
    (enabled) => {
      mocks.isPro = true;
      mocks.authOverrides = { accountCancellation: { enabled } };
      const html = renderToStaticMarkup(React.createElement(AuthSettings));
      expect(html.includes('id="accountCancellation"')).toBe(true);
      expect(mocks.formLabels.includes('admin:cancellation_request_chinese_template')).toBe(
        enabled
      );
      expect(mocks.formLabels.includes('admin:cancellation_reminder_chinese_template')).toBe(
        enabled
      );
      expect(mocks.formLabels.includes('admin:same_day_cancellation_chinese_template')).toBe(
        enabled
      );
    }
  );

  it.each([
    [false, true, false],
    [true, false, false],
    [true, true, true]
  ])(
    'shows WeCom service-provider section and directory for Pro=%s / SaaS=%s',
    (isPro, saas, visible) => {
      mocks.isPro = isPro;
      mocks.enableSaasAdminConfig = saas;
      const html = renderToStaticMarkup(React.createElement(AuthSettings));
      expect(html.includes('id="wecomLogin"')).toBe(visible);
      expect(html.includes('admin:wecom_login')).toBe(visible);
      expect(mocks.formLabels.includes('SuiteId')).toBe(visible);
    }
  );

  it('places account cancellation after login protection in both content and directory', () => {
    mocks.isPro = true;
    const html = renderToStaticMarkup(React.createElement(AuthSettings));
    const sections = [...html.matchAll(/<section id="([^"]+)"/g)].map((match) => match[1]);
    expect(sections.slice(0, 3)).toEqual([
      'passwordSecurity',
      'loginProtection',
      'accountCancellation'
    ]);
    const tocValue = html.match(/data-toc="([^"]+)"/)?.[1].replaceAll('&quot;', '"');
    expect(tocValue).toBeDefined();
    const toc = JSON.parse(tocValue!) as { id: string; label: string }[];
    expect(toc.slice(0, 3).map((item) => item.id)).toEqual(sections.slice(0, 3));
    expect(toc[0].label).toBe('admin:password_security');
  });

  it.each([false, true])(
    'hides missing or empty deprecated fast-login entries for Pro=%s',
    (isPro) => {
      mocks.isPro = isPro;
      for (const overrides of [{}, { fastLogin: [] }]) {
        mocks.authOverrides = overrides;
        const html = renderToStaticMarkup(React.createElement(AuthSettings));
        expect(html.includes('id="fastLogin"')).toBe(false);
      }
    }
  );

  it.each([false, true])('keeps existing fast-login entries visible only for Pro=%s', (isPro) => {
    mocks.isPro = isPro;
    mocks.authOverrides = { fastLogin: [{ key: 'legacy', authUrl: 'https://login.test' }] };
    const html = renderToStaticMarkup(React.createElement(AuthSettings));
    expect(html.includes('id="fastLogin"')).toBe(isPro);
  });

  it.each([false, true])(
    'places the editable file domain under core downloads for Pro=%s',
    async (isPro) => {
      mocks.isPro = isPro;
      renderToStaticMarkup(React.createElement(CoreSettings));
      expect(mocks.formLabels).toContain('admin:file_service_domain');
      expect(mocks.formLabels).not.toContain('admin:openapi_key_prefix');
      const config = resolveSystemInstanceConfig({});
      await mocks.save!({
        agentEngine: 'fastAgent',
        multipleDataToBase64: false,
        downloadMode: 'short-proxy',
        fileDomain: 'https://files.test',
        externalEndpoint: '',
        cdnEndpoint: '',
        publicUrl: 'https://main.test',
        openApiPrefix: 'fastgpt',
        email: config.auth.loginProviders.email,
        documentParse: config.providers.documentParse,
        phone: config.auth.loginProviders.phone
      });
      const storage = mocks.update.mock.calls[0][0].items.find(
        (item: { domain: string }) => item.domain === 'storage'
      );
      expect(storage.overrides.fileDomain).toBe('https://files.test');
      const siteItem = mocks.update.mock.calls[0][0].items.find(
        (item: { domain: string }) => item.domain === 'site'
      );
      expect(siteItem.overrides).toEqual({ publicUrl: 'https://main.test' });
      expect(() =>
        parseDomainOverrides({ domain: 'storage', overrides: storage.overrides })
      ).not.toThrow();
      mocks.formLabels = [];
      renderToStaticMarkup(React.createElement(LimitsSettings));
      expect(mocks.formLabels).not.toContain('admin:file_service_domain');
    }
  );

  it.each([false, true])('shows the evaluation row limit only for Pro=%s', (isPro) => {
    mocks.isPro = isPro;
    renderToStaticMarkup(React.createElement(LimitsSettings));
    expect(mocks.formLabels.includes('admin:evaluation_max_rows')).toBe(isPro);
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
      expect.objectContaining({
        skipFileTypeCheck: true,
        allowedOriginsEnabled: false,
        allowedOrigins: [],
        fileUrlWhitelist: []
      })
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
    expect(html.includes('id="exportSync"')).toBe(isPro);
    expect(html.includes('id="task"')).toBe(isPro);
    expect(mocks.formLabels.includes('admin:dataset_export_cooldown_minutes_2')).toBe(isPro);
    expect(mocks.formLabels.includes('admin:website_sync_cooldown_minutes_2')).toBe(isPro);
    expect(mocks.formLabels.includes('admin:evaluation_task_concurrency_limit')).toBe(isPro);
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
      vectorRecallConcurrency: 8,
      exportDatasetLimitMinutes: 20,
      websiteSyncLimitMinuted: 60,
      evaluationMaxRows: 0,
      datasetArchive
    });
    const resource = mocks.update.mock.calls[0][0].items.find(
      (item: { domain: string }) => item.domain === 'resource'
    );
    expect(resource.overrides.datasetArchive).toEqual(datasetArchive);
    if (isPro) expect(resource.overrides.evaluationMaxRows).toBe(0);
    else expect(resource.overrides).not.toHaveProperty('evaluationMaxRows');
    const items = mocks.update.mock.calls[0][0].items;
    expect(
      items.find((item: { domain: string }) => item.domain === 'vector').overrides
        .vectorRecallConcurrency
    ).toBe(8);
    if (isPro) {
      expect(resource.overrides).toMatchObject({
        exportDatasetLimitMinutes: 20,
        websiteSyncLimitMinuted: 60
      });
      expect(
        items.find((item: { domain: string }) => item.domain === 'performance').overrides.task
      ).toEqual(config.performance.task);
    } else {
      expect(resource.overrides).not.toHaveProperty('exportDatasetLimitMinutes');
      expect(resource.overrides).not.toHaveProperty('websiteSyncLimitMinuted');
      expect(
        items.find((item: { domain: string }) => item.domain === 'performance').overrides
      ).not.toHaveProperty('task');
    }
    // 整页提交必须符合新契约，不能夹带已移除的流恢复、埋点间隔或召回上限。
    for (const item of mocks.update.mock.calls[0][0].items) {
      expect(() =>
        parseDomainOverrides({ domain: item.domain, overrides: item.overrides })
      ).not.toThrow();
    }
  });

  it.each([undefined, false])(
    'hides deprecated OpenAI accounts when saved value is %s',
    (value) => {
      mocks.featureOverrides = value === undefined ? {} : { showOpenaiAccount: value };
      renderToStaticMarkup(React.createElement(FeatureSettings));
      expect(mocks.switchRows.has('admin:show_openai_account')).toBe(false);
    }
  );

  it('lets an existing enabled instance disable OpenAI accounts and hides the saved false value', async () => {
    mocks.isPro = true;
    mocks.featureOverrides = { showOpenaiAccount: true };
    renderToStaticMarkup(React.createElement(FeatureSettings));
    const toggle = mocks.switchRows.get('admin:show_openai_account')!;
    expect(toggle.isChecked).toBe(true);
    toggle.onChange(false);
    await mocks.pageSave!();
    const saved = mocks.patch.mock.calls[0][0];
    expect(saved.showOpenaiAccount).toBe(false);

    mocks.featureOverrides = saved;
    mocks.switchRows.clear();
    renderToStaticMarkup(React.createElement(FeatureSettings));
    expect(mocks.switchRows.has('admin:show_openai_account')).toBe(false);
  });

  it('商业版功能页按三方能力分组并可保存', async () => {
    mocks.isPro = true;
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
      publicUrl: 'https://main.test',
      openApiPrefix: 'community',
      email: config.auth.loginProviders.email,
      documentParse: config.providers.documentParse,
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
      documentParse: config.providers.documentParse,
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
        documentParse: config.providers.documentParse,
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
    expect(html).not.toContain('id="passwordSecurity"');
    expect(html).not.toContain('id="loginProtection"');
    const config = resolveSystemInstanceConfig({});
    await mocks.save!({
      ...config.auth,
      passwordLoginMinuteLimitCount: 10,
      maxLoginSession: 10
    });
    const auth = mocks.update.mock.calls[0][0].items[0];
    expect(auth.overrides).not.toHaveProperty('loginProviders.email');
    expect(auth.overrides).not.toHaveProperty('passwordExpiredMonth');
    const security = mocks.update.mock.calls[0][0].items[1];
    expect(security.overrides).not.toHaveProperty('passwordLoginMinuteLimitCount');
    expect(security.overrides).not.toHaveProperty('maxLoginSession');
  });

  it('removes team mode from the core page and excludes historical overrides on save', async () => {
    mocks.isPro = true;
    mocks.authOverrides = {
      teamMode: 'sync',
      loginProviders: { wecom: { providerSecret: 'keep-secret' } }
    };
    const html = renderToStaticMarkup(React.createElement(CoreSettings));
    expect(html).not.toContain('name="teamMode"');
    expect(html).not.toContain('id="team"');
    const config = resolveSystemInstanceConfig({});
    await mocks.save!({
      agentEngine: 'fastAgent',
      multipleDataToBase64: false,
      downloadMode: 'short-proxy',
      externalEndpoint: '',
      cdnEndpoint: '',
      publicUrl: 'https://main.test',
      openApiPrefix: 'fastgpt',
      email: config.auth.loginProviders.email,
      documentParse: config.providers.documentParse,
      phone: config.auth.loginProviders.phone
    });
    const submitted = mocks.update.mock.calls[0][0].items.find(
      (item: { domain: string }) => item.domain === 'auth'
    );
    expect(submitted.overrides).not.toHaveProperty('teamMode');
    expect(submitted.overrides.loginProviders.wecom.providerSecret).toBe('keep-secret');
  });

  it.each([false, true])(
    'controls Sangfor parser visibility via ENABLE_SANGFOR_ADMIN_CONFIG=%s and translates TextIn option',
    async (enableSangfor) => {
      mocks.enableSangforAdminConfig = enableSangfor;
      mocks.providersOverrides = {
        documentParse: {
          provider: 'sangfor',
          sangfor: {
            url: 'https://sangfor.internal.test',
            extensions: 'pdf,docx',
            timeoutSeconds: 45
          }
        }
      };
      renderToStaticMarkup(React.createElement(CoreSettings));
      const providerOptions = mocks.selectLists.find((list) =>
        list.some((item) => item.value === 'somark')
      )!;
      expect(providerOptions).toContainEqual({
        label: 'admin:document_parse_provider_textin',
        value: 'textln'
      });
      expect(providerOptions.some((item) => item.value === 'sangfor')).toBe(enableSangfor);
      expect(mocks.formLabels.includes('admin:sangfor_parsing_api_endpoint')).toBe(enableSangfor);

      // 关闭深信服展示开关时保存核心页，数据库中已有深信服配置（含 v4.17.5 的 45 秒超时）应原样保留且通过严格校验。
      if (!enableSangfor) {
        const config = resolveSystemInstanceConfig({
          providers: mocks.providersOverrides as any
        });
        await mocks.save!({
          agentEngine: 'fastAgent',
          multipleDataToBase64: false,
          downloadMode: 'short-proxy',
          externalEndpoint: '',
          cdnEndpoint: '',
          publicUrl: 'https://main.test',
          email: config.auth.loginProviders.email,
          documentParse: {
            ...config.providers.documentParse,
            provider: 'somark'
          },
          phone: config.auth.loginProviders.phone
        });
        const providersItem = mocks.update.mock.calls[0][0].items.find(
          (item: { domain: string }) => item.domain === 'providers'
        );
        expect(providersItem.overrides.documentParse.sangfor).toEqual({
          url: 'https://sangfor.internal.test',
          extensions: 'pdf,docx',
          timeoutSeconds: 45
        });
        expect(() =>
          parseDomainOverrides({ domain: 'providers', overrides: providersItem.overrides })
        ).not.toThrow();
      }
    }
  );
});
