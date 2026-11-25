import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import {
  markDomainSecrets,
  omitDomainSecrets
} from '@fastgpt/global/common/system/config/permission';
import { isConfiguredSecret } from '@fastgpt/global/common/system/config/secret';
import type { SystemInstanceConfigDomainKey } from '@fastgpt/global/common/system/config/schema';

const mocks = vi.hoisted(() => ({
  isPro: true,
  subPlans: undefined as undefined | { standard?: Record<string, unknown> },
  configs: {} as Record<string, any>,
  configured: {} as Record<string, Record<string, unknown>>,
  storageCapabilities: undefined as
    | undefined
    | {
        vendor: 'minio' | 'aws-s3' | 'r2' | 'cos' | 'oss';
        supportsExternalEndpoint: boolean;
        supportsCdnEndpoint: boolean;
      },
  update: vi.fn(),
  patch: vi.fn(),
  updateSystemStore: vi.fn(),
  save: undefined as undefined | (() => unknown),
  inputs: new Map<string, (value: string) => void>(),
  configListeners: new Set<() => void>()
}));

vi.mock('@/web/common/system/useDomainConfig', () => ({
  useDomainConfig: (domain: SystemInstanceConfigDomainKey) => {
    const [, setVersion] = React.useState(0);
    React.useEffect(() => {
      const notify = () => setVersion((version) => version + 1);
      mocks.configListeners.add(notify);
      return () => {
        mocks.configListeners.delete(notify);
      };
    }, []);
    return {
      effectiveConfig: mocks.configs[domain],
      storageCapabilities: domain === 'storage' ? mocks.storageCapabilities : undefined,
      isSecretConfigured: (path: string) =>
        isConfiguredSecret(
          path.split('.').reduce<any>((value, key) => value?.[key], mocks.configured[domain])
        ),
      overrides: {},
      revision: 1,
      isLoading: false,
      isUpdating: false,
      patchConfig: mocks.patch,
      refetch: vi.fn().mockResolvedValue(undefined)
    };
  },
  updateDomainConfigApi: mocks.update
}));
vi.mock('@/web/common/system/useAdminConfigSaveRequest', () => ({
  useAdminConfigSaveRequest: (save: (data: any) => Promise<unknown>) => ({
    runAsync: save,
    loading: false
  })
}));
vi.mock('@/pageComponents/admin/useAdminPermission', () => ({
  useAdminPermission: () => ({
    isPro: mocks.isPro,
    isFieldVisible: () => true,
    filterConfigData: (_domain: string, data: unknown) => data,
    filterConfigDataByEdition: (_domain: string, data: unknown) => data
  })
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: Object.assign(
    () => ({ feConfigs: {}, licenseData: {}, subPlans: mocks.subPlans }),
    {
      setState: mocks.updateSystemStore
    }
  )
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: vi.fn() })
}));
vi.mock('@chakra-ui/react', () => {
  const Box = ({ children }: any) => React.createElement('div', null, children);
  const Input = React.forwardRef(function Input(
    { isInvalid: _isInvalid, ...props }: any,
    ref: any
  ) {
    return React.createElement('input', { ...props, ref });
  });
  return {
    Box,
    Button: ({ children, type = 'button', onClick }: any) =>
      React.createElement('button', { type, onClick }, children),
    HStack: Box,
    Flex: Box,
    SimpleGrid: Box,
    Text: Box,
    Input,
    Switch: ({ isChecked, onChange, 'aria-label': label }: any) =>
      React.createElement('input', {
        type: 'checkbox',
        checked: isChecked,
        onChange,
        'aria-label': label
      }),
    Textarea: Input,
    NumberInput: Box,
    NumberInputField: () => null,
    NumberInputStepper: Box,
    NumberIncrementStepper: () => null,
    NumberDecrementStepper: () => null
  };
});
vi.mock('@/pageComponents/admin/settings/AdminSettingPage', () => ({
  default: ({ children, onSave }: any) => {
    mocks.save = onSave;
    return React.createElement('div', null, children);
  }
}));
vi.mock('@/pageComponents/admin/settings/AdminSettingSection', () => ({
  default: ({ children, id, title, rightContent }: any) =>
    React.createElement('section', { id, 'aria-label': title }, rightContent, children)
}));
vi.mock('@/pageComponents/admin/settings/AdminFormItem', () => ({
  default: ({ children }: any) => React.createElement('div', null, children)
}));
vi.mock('@/pageComponents/admin/settings/AdminSwitchRow', () => ({ default: () => null }));
vi.mock('@/pageComponents/admin/settings/AdminNumberInput', () => ({
  default: ({ name, value, step, onChange }: any) =>
    React.createElement('input', {
      name,
      type: 'number',
      step,
      value: value ?? '',
      onChange: (event: any) => onChange(Number(event.target.value))
    })
}));
vi.mock('@/pageComponents/admin/settings/ImageInput', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MySelect', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyPopover/PopoverConfirm', () => ({
  default: ({ Trigger, onConfirm, content }: any) =>
    React.createElement(
      'span',
      { 'data-confirm-content': content },
      Trigger,
      React.createElement(
        'button',
        { type: 'button', 'data-confirm-action': 'true', onClick: onConfirm },
        'confirm'
      )
    )
}));
vi.mock('@/pageComponents/admin/config/components/FormField/ThirdPartyVariables', () => ({
  default: ({ value, onChange }: any) =>
    React.createElement('input', {
      name: 'externalProviderWorkflowVariables',
      value: JSON.stringify(value),
      onChange: (event: any) => onChange(JSON.parse(event.target.value))
    })
}));
vi.mock('@/pageComponents/admin/settings/AdminSecretInput', () => ({
  default: ({ name, value, onChange, isConfigured }: any) => {
    mocks.inputs.set(name, onChange);
    return React.createElement('input', {
      name,
      value: value ?? '',
      onChange: (event: any) => onChange(event.target.value),
      'data-configured': isConfigured && value === undefined
    });
  }
}));
vi.mock('@/pageComponents/admin/settings/ConnectivityTestInput', () => ({
  default: ({ name, value, onChange, renderLayout, service }: any) => {
    const input = React.createElement('input', {
      name,
      value: value ?? '',
      onChange,
      'data-service': service
    });
    return renderLayout ? renderLayout({ input, button: null, result: null }) : input;
  }
}));
vi.mock('@/pageComponents/admin/settings/commercial/PlansSettingSection', () => ({
  default: React.forwardRef(function Plans(_props: any, ref: any) {
    React.useImperativeHandle(ref, () => ({
      getSubPlansData: async () => ({}),
      reload: async () => undefined
    }));
    return null;
  })
}));

import CoreSettings from '@/pageComponents/admin/settings/core';
import AuthSettings from '@/pageComponents/admin/settings/auth';
import CommercialSettings from '@/pageComponents/admin/settings/commercial';
import ProvidersSettings from '@/pageComponents/admin/settings/providers';
import CustomDomainSettings from '@/pageComponents/admin/settings/custom-domain';

let dom: JSDOM;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  mocks.inputs.clear();
  mocks.configListeners.clear();
  mocks.update.mockReset().mockResolvedValue({ results: [] });
  mocks.patch.mockReset().mockResolvedValue(undefined);
  mocks.updateSystemStore.mockReset();
  mocks.isPro = true;
  mocks.subPlans = { standard: { basic: {} } };
  mocks.storageCapabilities = undefined;
  const full = resolveSystemInstanceConfig({});
  full.auth.loginProviders.email.smtp = 'smtp.test';
  full.auth.loginProviders.email.user = 'user@test.com';
  full.auth.loginProviders.email.pass = 'stored-email';
  full.auth.loginProviders.phone.accessKeyId = 'stored-ak';
  full.auth.loginProviders.phone.accessKeySecret = 'stored-sms';
  full.auth.loginProviders.phone.signName = 'stored-sign';
  full.auth.loginProviders.wechat.appSecret = 'stored-wechat';
  full.auth.loginProviders.wecom.token = 'stored-wecom';
  full.commercial.payment.wx.apiV3Key = 'stored-wx';
  full.commercial.payment.wx.privateKey = 'stored-pem';
  full.providers.documentParse.provider = 'customPdf';
  full.providers.documentParse.customPdf.key = 'stored-parser';
  full.providers.documentParse.customPdf.somarkApiKey = 'stored-hidden-parser';
  full.site.customDomain.enable = true;
  full.site.customDomain.kc.aliyun = 'stored-aliyun';
  full.site.customDomain.kc.tencent = 'stored-tencent';
  for (const domain of Object.keys(full) as SystemInstanceConfigDomainKey[]) {
    mocks.configs[domain] = omitDomainSecrets(domain, full[domain]);
    mocks.configured[domain] = markDomainSecrets(domain, full[domain]);
  }
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  vi.unstubAllGlobals();
});

/** 以 JSON 传输语义检查提交，undefined 字段不会进入请求体。 */
const save = async () => {
  await act(async () => {
    await mocks.save?.();
    await Promise.resolve();
  });
};
const setSecret = async (name: string, value: string) => {
  expect(mocks.inputs.has(name)).toBe(true);
  await act(async () => mocks.inputs.get(name)!(value));
};
const sentOverrides = (domain: string) => {
  const body = JSON.parse(JSON.stringify(mocks.update.mock.lastCall?.[0]));
  return body.items.find((item: { domain: string }) => item.domain === domain).overrides;
};

describe('system configuration secret forms', () => {
  it('fills an unsaved site URL draft, validates it, and keeps the five core sections in order', async () => {
    mocks.configs.site = { ...mocks.configs.site, publicUrl: '' };
    await act(async () => root.render(React.createElement(CoreSettings)));
    const input = container.querySelector<HTMLInputElement>('[name="publicUrl"]')!;
    expect(input.value).toBe('http://localhost');
    expect(mocks.configs.site.publicUrl).toBe('');
    expect(mocks.update).not.toHaveBeenCalled();
    expect([...container.querySelectorAll('section')].map((section) => section.id)).toEqual([
      'basic',
      'download',
      'documentParse',
      'email',
      'sms'
    ]);
    for (const value of ['', 'not-a-url', 'ftp://main.test', 'https://user:password@main.test']) {
      await act(async () =>
        Simulate.change(input, { target: { name: 'publicUrl', value } } as any)
      );
      await save();
      expect(mocks.update).not.toHaveBeenCalled();
    }
    await act(async () =>
      Simulate.change(input, { target: { name: 'publicUrl', value: 'https://main.test' } } as any)
    );
    await save();
    expect(sentOverrides('site')).toEqual({ publicUrl: 'https://main.test' });
  });

  it('keeps a saved public site URL instead of replacing it with the current browser origin', async () => {
    mocks.configs.site = { ...mocks.configs.site, publicUrl: 'https://public.test' };
    await act(async () => root.render(React.createElement(CoreSettings)));
    expect(container.querySelector<HTMLInputElement>('[name="publicUrl"]')!.value).toBe(
      'https://public.test'
    );
  });
  it.each(['', '  ', '[]'])(
    'hides deprecated fast login only after saving the cleared draft %j',
    async (draft) => {
      const entries = [{ key: 'legacy', authUrl: 'https://legacy-login.test' }];
      mocks.configs.auth = { ...mocks.configs.auth, fastLogin: entries };
      await act(async () => root.render(React.createElement(AuthSettings)));
      expect(container.querySelector('#fastLogin')).not.toBeNull();
      await save();
      expect(sentOverrides('auth').fastLogin).toEqual(entries);

      await act(async () =>
        Simulate.change(container.querySelector('#fastLogin input')!, {
          target: { value: draft }
        } as any)
      );
      expect(container.querySelector('#fastLogin')).not.toBeNull();
      await save();
      expect(sentOverrides('auth').fastLogin).toEqual([]);

      mocks.configs.auth = { ...mocks.configs.auth, fastLogin: [] };
      // 模拟查询回读发布新快照；React.memo 页面仍应响应 hook 更新，无需重新挂载。
      await act(async () => {
        mocks.configListeners.forEach((notify) => notify());
      });
      expect(container.querySelector('#fastLogin')).toBeNull();
      await save();
      expect(sentOverrides('auth')).not.toHaveProperty('fastLogin');
    }
  );

  it.each(['short-proxy', 'short-redirect'] as const)(
    'shows redirect-only endpoints, keeps hidden values, and omits configurable TTL: %s',
    async (mode) => {
      mocks.configs.storage = {
        ...mocks.configs.storage,
        downloadMode: mode,
        externalEndpoint: 'https://storage.test',
        cdnEndpoint: 'https://cdn.test'
      };
      await act(async () => root.render(React.createElement(CoreSettings)));
      expect(
        container.querySelector('[name="fileDomain"][data-service="fileService"]')
      ).not.toBeNull();
      expect(container.querySelector('[name="externalEndpoint"]') !== null).toBe(
        mode === 'short-redirect'
      );
      expect(container.querySelector('[name="cdnEndpoint"][data-service="cdn"]') !== null).toBe(
        mode === 'short-redirect'
      );
      expect(container.querySelector('[name="redirectTtlSeconds"]')).toBeNull();
      await save();
      expect(sentOverrides('storage')).toMatchObject({
        downloadMode: mode,
        externalEndpoint: 'https://storage.test',
        cdnEndpoint: 'https://cdn.test'
      });
      expect(sentOverrides('storage')).not.toHaveProperty('redirectTtlSeconds');
    }
  );

  it.each([
    {
      capabilities: {
        vendor: 'oss' as const,
        supportsExternalEndpoint: false,
        supportsCdnEndpoint: true
      },
      expectExternal: false,
      expectCdn: true,
      expectedExternalOverride: '',
      expectedCdnOverride: 'https://cdn.test'
    },
    {
      capabilities: {
        vendor: 'r2' as const,
        supportsExternalEndpoint: false,
        supportsCdnEndpoint: false
      },
      expectExternal: false,
      expectCdn: false,
      expectedExternalOverride: '',
      expectedCdnOverride: ''
    }
  ])(
    'dynamically hides unsupported redirect endpoints for $capabilities.vendor and clears stale overrides on save',
    async ({
      capabilities,
      expectExternal,
      expectCdn,
      expectedExternalOverride,
      expectedCdnOverride
    }) => {
      mocks.storageCapabilities = capabilities;
      mocks.configs.storage = {
        ...mocks.configs.storage,
        downloadMode: 'short-redirect',
        externalEndpoint: 'https://legacy-minio.test',
        cdnEndpoint: 'https://cdn.test'
      };
      await act(async () => root.render(React.createElement(CoreSettings)));

      expect(container.textContent).toContain(
        `admin:object_storage_backend_read_only:${capabilities.vendor}`
      );
      expect(container.querySelector('[name="externalEndpoint"]') !== null).toBe(expectExternal);
      expect(container.querySelector('[name="cdnEndpoint"][data-service="cdn"]') !== null).toBe(
        expectCdn
      );

      await save();
      expect(sentOverrides('storage')).toMatchObject({
        downloadMode: 'short-redirect',
        externalEndpoint: expectedExternalOverride,
        cdnEndpoint: expectedCdnOverride
      });
    }
  );

  it('preserves SMTP and SMS credentials unless explicitly replaced or cleared', async () => {
    await act(async () => root.render(React.createElement(CoreSettings)));
    expect(container.querySelector('[name="email.pass"][data-configured="true"]')).not.toBeNull();
    await save();
    expect(sentOverrides('auth').loginProviders).toMatchObject({ email: {}, phone: {} });
    expect(sentOverrides('auth').loginProviders.email).not.toHaveProperty('pass');
    expect(sentOverrides('auth').loginProviders.phone).not.toHaveProperty('accessKeySecret');
    await setSecret('email.pass', 'new-email');
    await setSecret('phone.accessKeySecret', '');
    await act(async () => {
      for (const name of ['phone.accessKeyId', 'phone.signName']) {
        const input = container.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
        Simulate.change(input, { target: { name, value: '' } } as any);
      }
    });
    await save();
    expect(sentOverrides('auth').loginProviders.email.pass).toBe('new-email');
    expect(sentOverrides('auth').loginProviders.phone.accessKeySecret).toBe('');
  });

  it('requires SMTP user/pass when smtp host is set and all 3 Aliyun SMS fields when any is set', async () => {
    mocks.configs.auth = omitDomainSecrets('auth', resolveSystemInstanceConfig({}).auth);
    mocks.configured.auth = markDomainSecrets('auth', resolveSystemInstanceConfig({}).auth);
    await act(async () => root.render(React.createElement(CoreSettings)));

    const setInput = async (name: string, value: string) => {
      const input = container.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
      await act(async () => Simulate.change(input, { target: { name, value } } as any));
    };

    // 1. 填写 SMTP 服务地址后，user 与 pass 均为必填
    await setInput('email.smtp', 'smtp.example.com');
    await save();
    expect(mocks.update).not.toHaveBeenCalled();

    // 补全 SMTP 必填项但只填 1 个阿里云短信字段，仍被拦截
    await setInput('email.user', 'noreply@example.com');
    await setSecret('email.pass', 'mail-pass');
    await setInput('phone.accessKeyId', 'ak-1');
    await save();
    expect(mocks.update).not.toHaveBeenCalled();

    // 补全阿里云短信全部 3 个字段后保存成功
    await setSecret('phone.accessKeySecret', 'sk-1');
    await setInput('phone.signName', 'FastGPT');
    await save();
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(sentOverrides('auth').loginProviders).toMatchObject({
      email: { smtp: 'smtp.example.com', user: 'noreply@example.com', pass: 'mail-pass' },
      phone: { accessKeyId: 'ak-1', accessKeySecret: 'sk-1', signName: 'FastGPT' }
    });
  });

  it('clears all SMTP and Aliyun SMS fields including configured secrets via section Clear buttons', async () => {
    await act(async () => root.render(React.createElement(CoreSettings)));

    const emailClear = container.querySelector<HTMLButtonElement>(
      '#email button:not([data-confirm-action])'
    );
    const smsClear = container.querySelector<HTMLButtonElement>(
      '#sms button:not([data-confirm-action])'
    );
    const emailConfirm = container.querySelector<HTMLButtonElement>(
      '#email button[data-confirm-action]'
    );
    const smsConfirm = container.querySelector<HTMLButtonElement>(
      '#sms button[data-confirm-action]'
    );
    expect(emailClear?.textContent).toBe('common:Clear');
    expect(smsClear?.textContent).toBe('common:Clear');

    await act(async () => {
      emailConfirm!.click();
      smsConfirm!.click();
    });
    expect(container.querySelector('#email button')).toBeNull();
    expect(container.querySelector('#sms button')).toBeNull();

    await save();
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(sentOverrides('auth').loginProviders).toMatchObject({
      email: { smtp: '', user: '', pass: '', port: 465, secure: true },
      phone: { accessKeyId: '', accessKeySecret: '', signName: '' }
    });
  });

  it('preserves authentication secrets and submits explicit changes', async () => {
    await act(async () => root.render(React.createElement(AuthSettings)));
    for (const [section, field] of [
      ['wechatLogin', 'loginProviders.wechat.appId'],
      ['wecomLogin', 'loginProviders.wecom.suiteId'],
      ['githubLogin', 'loginProviders.github.clientId'],
      ['googleLogin', 'loginProviders.google.clientId'],
      ['microsoftLogin', 'loginProviders.microsoft.clientId']
    ]) {
      expect(container.querySelector(`#${section} input[name="${field}"]`)).not.toBeNull();
    }
    await save();
    expect(sentOverrides('auth').loginProviders.wechat).not.toHaveProperty('appSecret');
    expect(sentOverrides('auth').loginProviders.wecom).not.toHaveProperty('token');
    await setSecret('loginProviders.wechat.appSecret', 'new-wechat');
    await setSecret('loginProviders.wecom.token', '');
    await save();
    expect(sentOverrides('auth').loginProviders.wechat.appSecret).toBe('new-wechat');
    expect(sentOverrides('auth').loginProviders.wecom.token).toBe('');
  });

  it('preserves payment secrets and submits multiline replacements and clears', async () => {
    await act(async () => root.render(React.createElement(CommercialSettings)));
    await save();
    expect(sentOverrides('commercial').payment.wx).not.toHaveProperty('apiV3Key');
    expect(sentOverrides('commercial').payment.wx).not.toHaveProperty('privateKey');
    await setSecret('payment.wx.apiV3Key', '');
    await setSecret('payment.wx.privateKey', 'new\npem');
    await save();
    expect(sentOverrides('commercial').payment.wx.apiV3Key).toBe('');
    expect(sentOverrides('commercial').payment.wx.privateKey).toBe('new\npem');
  });

  it.each([
    { isPro: false, standard: undefined, provider: 'somark', visible: false },
    { isPro: false, standard: { basic: {} }, provider: 'somark', visible: false },
    { isPro: true, standard: undefined, provider: 'somark', visible: false },
    { isPro: true, standard: {}, provider: 'somark', visible: false },
    { isPro: true, standard: { basic: {} }, provider: 'none', visible: false },
    { isPro: true, standard: { basic: {} }, provider: 'somark', visible: true }
  ])(
    'shows PDF billing only with commercial subscriptions and an active parser: %j',
    async ({ isPro, standard, provider, visible }) => {
      mocks.isPro = isPro;
      mocks.subPlans = standard === undefined ? undefined : { standard };
      mocks.configs.providers.documentParse.provider = provider;
      mocks.configs.providers.documentParse.customPdf.price = 2.5;
      await act(async () => root.render(React.createElement(CoreSettings)));
      const input = container.querySelector<HTMLInputElement>(
        '[name="documentParse.customPdf.price"]'
      );
      expect(input !== null).toBe(visible);
      expect(container.textContent?.includes('admin:pdf_points_per_page')).toBe(visible);
      if (input) await act(async () => Simulate.change(input, { target: { value: '4.5' } } as any));
      await save();
      const customPdf = sentOverrides('providers').documentParse.customPdf;
      if (visible) expect(customPdf.price).toBe(4.5);
      else expect(customPdf).not.toHaveProperty('price');
      expect(mocks.configs.providers.documentParse.customPdf.price).toBe(2.5);
    }
  );

  it('preserves visible and hidden provider credentials and submits a changed key', async () => {
    mocks.configs.providers.documentParse.customPdf.price = 2.5;
    await act(async () => root.render(React.createElement(CoreSettings)));
    const parseSection = container.querySelector('#documentParse')!;
    expect(parseSection).not.toBeNull();
    expect(parseSection.textContent).toContain('admin:pdf_points_per_page');
    const priceInput = parseSection.querySelector<HTMLInputElement>(
      '[name="documentParse.customPdf.price"]'
    );
    expect(priceInput?.type).toBe('number');
    expect(priceInput?.step).toBe('0.1');
    const inputs = [...parseSection.querySelectorAll('input')].map((input) => input.name);
    expect(inputs.indexOf('documentParse.customPdf.price')).toBeLessThan(
      inputs.indexOf('documentParse.customPdf.key')
    );
    await save();
    let submitted = sentOverrides('providers');
    expect(submitted.documentParse.customPdf.price).toBe(2.5);
    expect(submitted.documentParse.customPdf).not.toHaveProperty('key');
    expect(submitted.documentParse.customPdf).not.toHaveProperty('somarkApiKey');
    await setSecret('documentParse.customPdf.key', 'new-parser');
    await save();
    submitted = sentOverrides('providers');
    expect(submitted.documentParse.customPdf.key).toBe('new-parser');
    expect(submitted.documentParse.customPdf).not.toHaveProperty('somarkApiKey');
    await setSecret('documentParse.customPdf.key', '');
    await save();
    expect(sentOverrides('providers').documentParse.customPdf.key).toBe('');
  });

  it.each([undefined, []])('hides an empty external provider configuration: %j', async (value) => {
    mocks.configs.providers = {
      ...mocks.configs.providers,
      externalProviderWorkflowVariables: value
    };
    await act(async () => root.render(React.createElement(ProvidersSettings)));
    expect(container.querySelector('#workflowVariables')).toBeNull();
    expect(mocks.save).toBeUndefined();
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it('keeps existing variables editable until the cleared list has been saved', async () => {
    const entries = [{ name: 'Legacy', key: 'System_legacy', isOpen: true, intro: '', url: '' }];
    mocks.configs.providers = {
      ...mocks.configs.providers,
      externalProviderWorkflowVariables: entries
    };
    await act(async () => root.render(React.createElement(ProvidersSettings)));
    expect(container.querySelector('#workflowVariables')).not.toBeNull();
    expect(container.querySelector('#documentParse')).toBeNull();
    await save();
    const submitted = JSON.parse(JSON.stringify(mocks.patch.mock.lastCall?.[0]));
    expect(submitted).not.toHaveProperty('documentParse');
    expect(container.querySelector('#dataSource')).toBeNull();
    expect(submitted).not.toHaveProperty('dataSource');
    expect(submitted.externalProviderWorkflowVariables).toEqual(entries);

    await act(async () =>
      Simulate.change(container.querySelector('[name="externalProviderWorkflowVariables"]')!, {
        target: { value: '[]' }
      } as any)
    );
    expect(container.querySelector('#workflowVariables')).not.toBeNull();
    await save();
    expect(mocks.patch.mock.lastCall?.[0].externalProviderWorkflowVariables).toEqual([]);
    expect(mocks.updateSystemStore).toHaveBeenCalledTimes(1);

    mocks.configs.providers = { ...mocks.configs.providers, externalProviderWorkflowVariables: [] };
    await act(async () => mocks.configListeners.forEach((notify) => notify()));
    expect(container.querySelector('#workflowVariables')).toBeNull();
    expect(mocks.save).toBeUndefined();
    const publish = mocks.updateSystemStore.mock.lastCall?.[0];
    expect(publish({ feConfigs: { isProService: false } }).feConfigs).toEqual({
      isProService: false,
      externalProviderWorkflowVariables: []
    });

    await save();
    expect(mocks.patch).toHaveBeenCalledTimes(2);
  });

  it('preserves custom-domain kubeconfigs and supports explicit clearing', async () => {
    await act(async () => root.render(React.createElement(CustomDomainSettings)));
    await save();
    let submitted = JSON.parse(JSON.stringify(mocks.patch.mock.lastCall?.[0]));
    expect(submitted.customDomain.kc).toEqual({});
    await setSecret('kc.aliyun', '');
    await save();
    submitted = JSON.parse(JSON.stringify(mocks.patch.mock.lastCall?.[0]));
    expect(submitted.customDomain.kc.aliyun).toBe('');
    expect(submitted.customDomain.kc).not.toHaveProperty('tencent');
  });
});
