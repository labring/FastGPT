import { describe, expect, it } from 'vitest';
import {
  buildLegacyDomainOverrides,
  buildLegacyProOverrides,
  buildSparseLegacyOverrides
} from '@/migration/tasks/20260928_migrate_instance_configs/service';
import {
  SYSTEM_INSTANCE_CONFIG_DOMAINS,
  resolveDomainEffectiveConfig
} from '@fastgpt/global/common/system/config/schema';

describe('migration buildLegacyDomainOverrides', () => {
  it('maps legacy feConfigs values into the site domain', () => {
    const overrides = buildLegacyDomainOverrides({
      feConfigs: {
        systemTitle: 'My Platform',
        favicon: '/custom.ico',
        docUrl: 'https://docs.example.com',
        openAPIDocUrl: 'https://docs.example.com/api',
        concatMd: 'hello',
        appTemplateCourse: 'https://course.example.com',
        loginGuideDocUrl: 'https://guide.example.com'
      },
      systemEnv: { openapiPrefix: 'myorg' }
    });

    expect(overrides.site).toMatchObject({
      name: 'My Platform',
      favicon: '/custom.ico',
      docUrl: 'https://docs.example.com',
      openApiDocUrl: 'https://docs.example.com/api',
      concatMd: 'hello',
      appTemplateCourse: 'https://course.example.com',
      loginGuideDocUrl: 'https://guide.example.com',
      openApiPrefix: 'myorg'
    });
  });

  it('maps legacy censor / fileUrlWhitelist / workflowHttpNode into security', () => {
    const overrides = buildLegacyDomainOverrides({
      feConfigs: {},
      systemEnv: {
        censor: {
          BAIDU_TEXT_CENSOR_CLIENTID: 'bid',
          BAIDU_TEXT_CENSOR_CLIENTSECRET: 'bsecret',
          customCensorURL: 'https://censor.example.com'
        },
        workflowHttpNode: { ignoreHttpsCertificate: true },
        fileUrlWhitelist: ['https://cdn.example.com']
      }
    });

    expect(overrides.security).toMatchObject({
      censor: {
        baiduClientId: 'bid',
        baiduClientSecret: 'bsecret',
        customCensorUrl: 'https://censor.example.com'
      },
      workflowHttpNode: { ignoreHttpsCertificate: true },
      fileUrlWhitelist: ['https://cdn.example.com']
    });
  });

  it('drops empty strings so schema defaults stay authoritative', () => {
    // 空值与纯空白不应产生覆盖项；env 兜底后等于默认值的项由 sparse 阶段剪枝
    const sparse = buildSparseLegacyOverrides({
      feConfigs: { systemTitle: '', docUrl: '' },
      systemEnv: { openapiPrefix: '   ' }
    });

    expect(sparse.site).toBeUndefined();
  });

  it('produces validated effective config for every mapped domain', () => {
    const overrides = buildLegacyDomainOverrides({
      feConfigs: {
        systemTitle: 'Platform',
        limit: { maxFolderDepth: 6, exportDatasetLimitMinutes: 30, websiteSyncLimitMinuted: 90 },
        navbarItems: [
          { id: 'docs', name: 'Docs', avatar: '', url: 'https://d.com', isActive: true }
        ],
        externalProviderWorkflowVariables: [
          { name: 'Var', key: 'var', intro: 'intro', isOpen: true }
        ]
      },
      systemEnv: {}
    });

    for (const domain of SYSTEM_INSTANCE_CONFIG_DOMAINS) {
      const domainOverrides = overrides[domain];
      if (!domainOverrides) continue;
      expect(() => resolveDomainEffectiveConfig(domain, domainOverrides)).not.toThrow();
    }

    expect(overrides.resource).toMatchObject({
      maxFolderDepth: 6,
      exportDatasetLimitMinutes: 30,
      websiteSyncLimitMinuted: 90
    });
    expect(overrides.site?.navbarItems).toHaveLength(1);
    expect(overrides.providers?.externalProviderWorkflowVariables).toHaveLength(1);
  });
});

describe('migration buildSparseLegacyOverrides', () => {
  it('prunes values identical to schema defaults so defaults can evolve later', () => {
    const sparse = buildSparseLegacyOverrides({
      // 这些值全部等于 Schema 默认值，应被剪枝
      feConfigs: { systemTitle: 'AI', show_emptyChat: true, show_git: true },
      systemEnv: {}
    });

    expect(sparse.site).toBeUndefined();
    expect(sparse.feature).toBeUndefined();
  });

  it('keeps only genuinely customized values', () => {
    const sparse = buildSparseLegacyOverrides({
      feConfigs: { systemTitle: 'Custom Title', show_emptyChat: false },
      systemEnv: {}
    });

    expect(sparse.site?.name).toBe('Custom Title');
    // show_emptyChat 默认 true，改为 false 属真实修改，应保留
    expect(sparse.feature?.showEmptyChat).toBe(false);
    // 未修改的默认值不应出现
    expect(sparse.feature?.showGit).toBeUndefined();
  });

  it('keeps sparse output validated by the two-phase resolver', () => {
    const sparse = buildSparseLegacyOverrides({
      feConfigs: { limit: { maxFolderDepth: 8 } },
      systemEnv: {}
    });

    for (const domain of SYSTEM_INSTANCE_CONFIG_DOMAINS) {
      const domainOverrides = sparse[domain];
      if (!domainOverrides) continue;
      expect(() => resolveDomainEffectiveConfig(domain, domainOverrides)).not.toThrow();
    }
  });

  it('merges legacy fastgptPro login and payment config into auth/commercial', () => {
    const sparse = buildSparseLegacyOverrides({
      feConfigs: {},
      systemEnv: {},
      proConfig: {
        auth: {
          github: { clientId: 'gh-id', secret: 'gh-secret' },
          email: {
            smtp: 'smtp.example.com',
            user: 'no-reply@example.com',
            pass: 'pwd',
            port: 587,
            secure: false,
            register: true
          },
          sms: { LOGIN: 'SMS_LOGIN', LACK_OF_POINTS: 'SMS_LACK', LACK_OF_POINTS_EN: 'SMS_LACK_EN' },
          phone: {
            SNED_PHONE_ACCESSKEYID: 'ak',
            SNED_PHONE_ACCESSSECRET: 'sk',
            SNED_PHONE_SIGNNAME: 'Sign'
          }
        },
        teamMode: 'multi',
        pay: {
          wx: { WX_APPID: 'wx-app', WX_MCHID: 'mch' },
          alipay: { APP_ID: 'ali-app' }
        }
      }
    });

    expect(sparse.auth?.teamMode).toBe('multi');
    expect(sparse.auth?.loginProviders?.github).toMatchObject({
      clientId: 'gh-id',
      secret: 'gh-secret'
    });
    expect(sparse.auth?.loginProviders?.email).toMatchObject({
      smtp: 'smtp.example.com',
      port: 587,
      secure: false,
      register: true
    });
    expect(sparse.auth?.loginProviders?.phone).toMatchObject({
      accessKeyId: 'ak',
      signName: 'Sign'
    });
    expect(sparse.commercial?.payment?.wx).toMatchObject({ appId: 'wx-app', mchId: 'mch' });
    expect(sparse.commercial?.payment?.alipay).toMatchObject({ appId: 'ali-app' });
    // 账单通知模板（LACK_OF_POINTS）归入 commercial
    expect(sparse.commercial?.billingNotify?.lackOfPoints).toEqual({
      zh: 'SMS_LACK'
    });

    // pro 迁移结果同样必须通过两阶段校验
    for (const domain of SYSTEM_INSTANCE_CONFIG_DOMAINS) {
      const domainOverrides = sparse[domain];
      if (!domainOverrides) continue;
      expect(() => resolveDomainEffectiveConfig(domain, domainOverrides)).not.toThrow();
    }
  });

  it('keeps only the Chinese sms template and falls back to English when missing', () => {
    const pro = buildLegacyProOverrides({
      auth: { sms: { LOGIN: 'SMS_LOGIN_ZH', REGISTER_EN: 'SMS_REGISTER_EN' } }
    });

    expect(pro.auth?.loginProviders?.sms?.login).toEqual({ zh: 'SMS_LOGIN_ZH' });
    // 中文缺失时用英文兜底，避免历史仅配置英文模板的实例丢失模板
    expect(pro.auth?.loginProviders?.sms?.register).toEqual({ zh: 'SMS_REGISTER_EN' });
  });
});
