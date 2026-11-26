import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildLegacyDomainOverrides as buildFromLegacy,
  buildLegacyProOverrides,
  buildSparseLegacyOverrides,
  collectEnvRehomedWarnings
} from '@/migration/tasks/4180/20261116_migrate_system_configs/service';
import {
  SYSTEM_INSTANCE_CONFIG_DOMAINS,
  resolveDomainEffectiveConfig
} from '@fastgpt/global/common/system/config/schema';
import { readLegacyInstanceConfigEnv } from '@/migration/tasks/4180/20261116_migrate_system_configs/env';
const legacyEnv = readLegacyInstanceConfigEnv();
const buildLegacyDomainOverrides = (input: Parameters<typeof buildFromLegacy>[0]) =>
  buildFromLegacy({ ...input, legacyEnv });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('migration buildLegacyDomainOverrides', () => {
  it('maps the legacy main site URL into site.publicUrl', () => {
    const overrides = buildFromLegacy({
      feConfigs: {},
      systemEnv: {},
      legacyEnv: { ...legacyEnv, FE_DOMAIN: 'https://main.test' }
    });
    expect(overrides.site?.publicUrl).toBe('https://main.test');
  });
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
      concatMd: 'hello',
      appTemplateCourse: 'https://course.example.com',
      loginGuideDocUrl: 'https://guide.example.com',
      openApiPrefix: 'myorg'
    });
    expect(overrides.site).not.toHaveProperty('openApiDocUrl');
  });

  it('maps legacy fileUrlWhitelist / workflowHttpNode into security', () => {
    const overrides = buildLegacyDomainOverrides({
      feConfigs: {},
      systemEnv: {
        workflowHttpNode: { ignoreHttpsCertificate: true },
        fileUrlWhitelist: ['https://cdn.example.com']
      }
    });

    expect(overrides.security).toMatchObject({
      workflowHttpNode: { ignoreHttpsCertificate: true },
      checkExternalFile: true,
      fileUrlWhitelist: ['https://cdn.example.com']
    });
  });

  it('preserves an explicit legacy checkExternalFile=false with a non-empty whitelist', () => {
    const overrides = buildLegacyDomainOverrides({
      feConfigs: {},
      systemEnv: {
        checkExternalFile: false,
        fileUrlWhitelist: ['https://cdn.example.com']
      }
    });

    expect(overrides.security).toMatchObject({
      checkExternalFile: false,
      fileUrlWhitelist: ['https://cdn.example.com']
    });
  });

  it('ignores retired legacy censor from fastgptPro document while keeping security env fields', () => {
    // 旧版内置 censor 已由内容审核插件策略取代，不再迁入 security 域
    const pro = buildLegacyProOverrides({
      censor: {
        BAIDU_TEXT_CENSOR_CLIENTID: 'bid',
        BAIDU_TEXT_CENSOR_CLIENTSECRET: 'bsecret',
        customCensorURL: 'https://censor.example.com'
      }
    });

    expect(pro.security).toBeUndefined();

    const sparse = buildSparseLegacyOverrides({
      feConfigs: {},
      systemEnv: { fileUrlWhitelist: ['https://cdn.example.com'] },
      proConfig: {
        censor: { BAIDU_TEXT_CENSOR_CLIENTID: 'bid' }
      }
    });
    expect(sparse.security).toEqual({
      checkExternalFile: true,
      fileUrlWhitelist: ['https://cdn.example.com']
    });
  });

  it('preserves explicitly cleared site links instead of restoring official defaults', () => {
    const sparse = buildSparseLegacyOverrides({
      feConfigs: {
        systemTitle: '',
        docUrl: '',
        openAPIDocUrl: '',
        concatMd: '',
        appTemplateCourse: '',
        loginGuideDocUrl: ''
      },
      systemEnv: { openapiPrefix: '   ' }
    });

    expect(sparse.site).toMatchObject({
      docUrl: '',
      concatMd: '',
      appTemplateCourse: '',
      loginGuideDocUrl: ''
    });
    expect(sparse.site?.name).toBeUndefined();
    expect(sparse.site?.openApiPrefix).toBeUndefined();
  });

  it('reads current limit fields and preserves fractional rate limits', () => {
    const overrides = buildLegacyDomainOverrides({
      feConfigs: {
        limit: {
          uploadFileMaxSize: 900,
          uploadFileMaxAmount: 11,
          workflowParallelRunMaxConcurrency: 3,
          exportDatasetLimitMinutes: 0.1,
          websiteSyncLimitMinuted: 0.5
        }
      },
      systemEnv: {}
    });

    expect(overrides.resource).toMatchObject({
      uploadFileMaxSize: 900,
      uploadFileMaxAmount: 11,
      exportDatasetLimitMinutes: 0.1,
      websiteSyncLimitMinuted: 0.5
    });
    expect(overrides.performance?.workflow?.parallelMaxConcurrency).toBe(3);
    for (const domain of SYSTEM_INSTANCE_CONFIG_DOMAINS) {
      const domainOverrides = overrides[domain];
      if (!domainOverrides) continue;
      expect(() =>
        resolveDomainEffectiveConfig({ domain, overrides: domainOverrides })
      ).not.toThrow();
    }
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
        ],
        customApiDomain: 'https://api.custom.com',
        customSharePageDomain: 'https://share.custom.com',
        scripts: [{ src: 'https://cdn.example.com/analytics.js', async: 'true' }]
      },
      systemEnv: {}
    });

    for (const domain of SYSTEM_INSTANCE_CONFIG_DOMAINS) {
      const domainOverrides = overrides[domain];
      if (!domainOverrides) continue;
      expect(() =>
        resolveDomainEffectiveConfig({ domain, overrides: domainOverrides })
      ).not.toThrow();
    }

    expect(overrides.resource).toMatchObject({
      maxFolderDepth: 6,
      exportDatasetLimitMinutes: 30,
      websiteSyncLimitMinuted: 90
    });
    expect(overrides.site?.navbarItems).toHaveLength(1);
    expect(overrides.site?.customApiDomain).toBe('https://api.custom.com');
    expect(overrides.site?.customSharePageDomain).toBe('https://share.custom.com');
    expect(overrides.site?.scripts).toEqual([
      { src: 'https://cdn.example.com/analytics.js', async: 'true' }
    ]);
    expect(overrides.providers?.externalProviderWorkflowVariables).toHaveLength(1);
  });

  it('migrates all 4 PDF parser credentials from legacy systemEnv.customPdfParse', () => {
    const overrides = buildLegacyDomainOverrides({
      feConfigs: {},
      systemEnv: {
        customPdfParse: {
          url: 'https://pdf.legacy.com',
          key: 'pdf-key',
          somarkApiKey: 'somark-secret',
          doc2xKey: 'doc2x-secret',
          textinAppId: 'textin-id',
          textinSecretCode: 'textin-code'
        }
      }
    });

    expect(overrides.providers?.documentParse?.customPdf).toMatchObject({
      url: 'https://pdf.legacy.com',
      key: 'pdf-key',
      somarkApiKey: 'somark-secret',
      doc2xKey: 'doc2x-secret',
      textinAppId: 'textin-id',
      textinSecretCode: 'textin-code'
    });
  });
});

describe('migration buildSparseLegacyOverrides', () => {
  it('prunes values identical to schema defaults so defaults can evolve later', () => {
    const sparse = buildSparseLegacyOverrides({
      // 这些值全部等于 Schema 默认值，应被剪枝
      feConfigs: { systemTitle: 'AI', show_emptyChat: true },
      systemEnv: {}
    });

    // ENV 中的公网地址不是 Schema 默认值，需保留；其余站点默认字段仍被剪枝。
    expect(sparse.site).toEqual(
      legacyEnv.FE_DOMAIN ? { publicUrl: legacyEnv.FE_DOMAIN } : undefined
    );
    expect(sparse.feature).toBeUndefined();
  });

  it('keeps only genuinely customized values', () => {
    const sparse = buildSparseLegacyOverrides({
      feConfigs: { systemTitle: 'Custom Title', show_emptyChat: false },
      systemEnv: {}
    });

    expect(sparse.site?.name).toBe('Custom Title');
    // show_emptyChat 默认 true，改为 false 属真实修改，应保留
    // show_git 已回退为纯环境变量（SHOW_GIT），不再迁移进实例配置
    expect(sparse.feature?.showGit).toBeUndefined();
  });

  it('migrates legacy feature visibility flags', () => {
    const sparse = buildSparseLegacyOverrides({
      feConfigs: {
        show_workflow_builder: false,
        show_openai_account: true,
        enable_team_model: true
      },
      systemEnv: {}
    });

    expect(sparse.feature).toEqual({
      showOpenaiAccount: true,
      enableTeamModel: true
    });
  });

  it('migrates legacy custom domain settings', () => {
    const sparse = buildSparseLegacyOverrides({
      feConfigs: {
        customDomain: {
          enable: true,
          domain: {
            aliyun: 'aliyun.example.com',
            tencent: 'tencent.example.com'
          }
        }
      },
      systemEnv: {}
    });

    expect(sparse.site?.customDomain).toEqual({
      enable: true,
      domain: {
        aliyun: 'aliyun.example.com',
        tencent: 'tencent.example.com'
      }
    });
  });

  it('migrates legacy SSO display metadata', () => {
    const sparse = buildSparseLegacyOverrides({
      feConfigs: {
        sso: {
          title: 'SSO Login',
          icon: 'https://cdn.example.com/icon.png',
          autoLogin: true,
          disablePasswordForSsoUsers: true
        }
      },
      systemEnv: {}
    });

    expect(sparse.auth?.sso).toEqual({
      title: 'SSO Login',
      icon: 'https://cdn.example.com/icon.png',
      autoLogin: true,
      disablePasswordForSsoUsers: true
    });
  });

  it('migrates the custom PDF parsing price', () => {
    const sparse = buildSparseLegacyOverrides({
      feConfigs: {},
      systemEnv: { customPdfParse: { price: 3.5 } }
    });

    expect(sparse.providers?.documentParse?.customPdf?.price).toBe(3.5);
  });

  it('migrates the support bot iframe URL', () => {
    const sparse = buildSparseLegacyOverrides({
      feConfigs: { botIframeUrl: 'https://bot.example.com/embed' },
      systemEnv: {}
    });

    expect(sparse.site?.botIframeUrl).toBe('https://bot.example.com/embed');
  });

  it('keeps sparse output validated by the two-phase resolver', () => {
    const sparse = buildSparseLegacyOverrides({
      feConfigs: { limit: { maxFolderDepth: 8 } },
      systemEnv: {}
    });

    for (const domain of SYSTEM_INSTANCE_CONFIG_DOMAINS) {
      const domainOverrides = sparse[domain];
      if (!domainOverrides) continue;
      expect(() =>
        resolveDomainEffectiveConfig({ domain, overrides: domainOverrides })
      ).not.toThrow();
    }
  });

  it('derives email registration from legacy register_method when the Pro flag is absent', () => {
    const sparse = buildSparseLegacyOverrides({
      feConfigs: { register_method: ['email', 'phone'] },
      systemEnv: {},
      proConfig: { auth: { email: { smtp: 'smtp.example.com' } } }
    });

    expect(sparse.auth?.loginProviders?.email?.register).toBe(true);

    const disabled = buildSparseLegacyOverrides({
      feConfigs: { register_method: ['phone'] },
      systemEnv: {},
      proConfig: { auth: { email: { smtp: 'smtp.example.com' } } }
    });
    expect(
      resolveDomainEffectiveConfig({ domain: 'auth', overrides: disabled.auth ?? {} })
        .loginProviders.email.register
    ).toBe(false);
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
      expect(() =>
        resolveDomainEffectiveConfig({ domain, overrides: domainOverrides })
      ).not.toThrow();
    }
  });

  it('keeps only the Chinese sms template and falls back to English when missing', () => {
    const pro = buildLegacyProOverrides({
      auth: {
        sms: {
          LOGIN: 'SMS_LOGIN_ZH',
          REGISTER_EN: 'SMS_REGISTER_EN',
          MODEL_DEPRECATION_EN: 'SMS_MODEL_DEPRECATION_EN'
        }
      }
    });

    expect(pro.auth?.loginProviders?.sms?.login).toEqual({ zh: 'SMS_LOGIN_ZH' });
    // 中文缺失时用英文兜底，避免历史仅配置英文模板的实例丢失模板
    expect(pro.auth?.loginProviders?.sms?.register).toEqual({ zh: 'SMS_REGISTER_EN' });
    expect(pro.auth?.loginProviders?.sms?.modelDeprecation).toEqual({
      zh: 'SMS_MODEL_DEPRECATION_EN'
    });
  });

  it('migrates free-clean and 30-percent billing SMS templates', () => {
    const pro = buildLegacyProOverrides({
      auth: {
        sms: {
          FREE_CLEAN: 'SMS_FREE_CLEAN',
          POINTS_THIRTY_PERCENT_REMAIN: 'SMS_POINTS_30',
          POINTS_TEN_PERCENT_REMAIN: 'SMS_POINTS_10'
        }
      }
    });

    expect(pro.commercial?.billingNotify).toMatchObject({
      freeClean: { zh: 'SMS_FREE_CLEAN' },
      pointsThirtyPercentRemain: { zh: 'SMS_POINTS_30' },
      pointsTenPercentRemain: { zh: 'SMS_POINTS_10' }
    });
    expect(() =>
      resolveDomainEffectiveConfig({ domain: 'commercial', overrides: pro.commercial ?? {} })
    ).not.toThrow();
  });

  it('normalizes legacy object-shape fastLogin into the array contract', () => {
    // 旧商业版 Admin 存储的是 Record<key, { authUrl }> 对象形状
    const pro = buildLegacyProOverrides({
      fastLogin: {
        sso: { authUrl: 'https://sso.example.com/login' },
        oidc: { authUrl: 'https://oidc.example.com/auth' }
      }
    });

    expect(pro.auth?.fastLogin).toEqual([
      { key: 'sso', authUrl: 'https://sso.example.com/login' },
      { key: 'oidc', authUrl: 'https://oidc.example.com/auth' }
    ]);

    // 数组形状（新版表单形状）原样保留
    const arrayPro = buildLegacyProOverrides({
      fastLogin: [{ key: 'sso', authUrl: 'https://sso.example.com/login' }]
    });
    expect(arrayPro.auth?.fastLogin).toEqual([
      { key: 'sso', authUrl: 'https://sso.example.com/login' }
    ]);

    // 空对象/空数组不写覆盖项；缺 authUrl 的条目丢弃
    expect(buildLegacyProOverrides({ fastLogin: {} }).auth?.fastLogin).toBeUndefined();
    expect(buildLegacyProOverrides({ fastLogin: [] }).auth?.fastLogin).toBeUndefined();
    expect(buildLegacyProOverrides({ fastLogin: { broken: {} } }).auth?.fastLogin).toBeUndefined();

    // 数组分支同样过滤 authUrl 为空/缺失的条目，与对象分支语义一致
    const mixedArrayPro = buildLegacyProOverrides({
      fastLogin: [
        { key: 'sso', authUrl: 'https://sso.example.com/login' },
        { key: 'broken' },
        { key: 'empty', authUrl: '' }
      ]
    });
    expect(mixedArrayPro.auth?.fastLogin).toEqual([
      { key: 'sso', authUrl: 'https://sso.example.com/login' }
    ]);

    // 规范化结果必须通过 security/auth 域两阶段校验
    for (const domain of SYSTEM_INSTANCE_CONFIG_DOMAINS) {
      const domainOverrides = pro[domain];
      if (!domainOverrides) continue;
      expect(() =>
        resolveDomainEffectiveConfig({ domain, overrides: domainOverrides })
      ).not.toThrow();
    }
  });
});

describe('migration collectEnvRehomedWarnings', () => {
  it('warns when legacy show_git was disabled', () => {
    const warnings = collectEnvRehomedWarnings({ feConfigs: { show_git: false } });
    expect(warnings).toEqual([expect.stringContaining('SHOW_GIT=false')]);
  });

  it('does not warn when show_git was enabled or unset', () => {
    expect(collectEnvRehomedWarnings({ feConfigs: { show_git: true } })).toEqual([]);
    expect(collectEnvRehomedWarnings({ feConfigs: {} })).toEqual([]);
  });

  it('keeps custom-domain infrastructure in form configuration without an ENV warning', () => {
    const warnings = collectEnvRehomedWarnings({
      feConfigs: {},
      systemEnv: { customDomain: { kc: { aliyun: 'sensitive-kubeconfig' } } }
    });

    expect(warnings).toEqual([]);
  });
});

describe('migration env wiring', () => {
  const pick = (target: unknown, path: string): unknown =>
    path.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), target);

  it('prefers the legacy systemEnv agent sandbox limit over the env fallback', () => {
    const overrides = buildLegacyDomainOverrides({
      feConfigs: {},
      systemEnv: { agentSandboxMax: 42 }
    });

    expect(pick(overrides, 'subservice.agentSandbox.common.maxEditDebug')).toBe(42);
  });

  it('migrates the legacy vector recall concurrency into the vector domain', () => {
    const overrides = buildLegacyDomainOverrides({
      feConfigs: {},
      systemEnv: { vectorRecallConcurrency: 8 }
    });

    expect(pick(overrides, 'vector.vectorRecallConcurrency')).toBe(8);
  });

  it('migrates the per-team sandbox quota and preserves an unset value as unlimited', () => {
    expect(
      pick(
        buildLegacyDomainOverrides({
          feConfigs: {},
          systemEnv: { agentSandboxMaxPerTeam: 10000 }
        }),
        'subservice.agentSandbox.common.maxPerTeam'
      )
    ).toBe(10000);

    expect(
      pick(
        buildLegacyDomainOverrides({ feConfigs: {}, systemEnv: {} }),
        'subservice.agentSandbox.common.maxPerTeam'
      )
    ).toBeUndefined();
  });

  it('does not revive an explicit unlimited per-team quota from env', () => {
    const originalMaxPerTeam = legacyEnv.AGENT_SANDBOX_MAX_PER_TEAM;
    legacyEnv.AGENT_SANDBOX_MAX_PER_TEAM = 5;

    try {
      expect(
        pick(
          buildLegacyDomainOverrides({
            feConfigs: {},
            systemEnv: { agentSandboxMaxPerTeam: null }
          }),
          'subservice.agentSandbox.common.maxPerTeam'
        )
      ).toBeNull();
    } finally {
      legacyEnv.AGENT_SANDBOX_MAX_PER_TEAM = originalMaxPerTeam;
    }
  });

  it('migrates Sangfor credentials from the legacy document when env has no custom PDF URL', () => {
    const originalProvider = legacyEnv.DOCUMENT_PARSE_PROVIDER;
    const originalUrl = legacyEnv.CUSTOM_PDF_PARSE_URL;
    const originalKey = legacyEnv.CUSTOM_PDF_PARSE_KEY;
    legacyEnv.DOCUMENT_PARSE_PROVIDER = 'sangfor';
    legacyEnv.CUSTOM_PDF_PARSE_URL = undefined;
    legacyEnv.CUSTOM_PDF_PARSE_KEY = undefined;

    try {
      const overrides = buildLegacyDomainOverrides({
        feConfigs: {},
        systemEnv: {
          customPdfParse: { url: 'https://legacy-sangfor.example.com', key: 'legacy-key' }
        }
      });

      expect(pick(overrides, 'providers.documentParse.provider')).toBe('sangfor');
      expect(pick(overrides, 'providers.documentParse.sangfor.url')).toBe(
        'https://legacy-sangfor.example.com'
      );
      expect(pick(overrides, 'providers.documentParse.sangfor.key')).toBe('legacy-key');
    } finally {
      legacyEnv.DOCUMENT_PARSE_PROVIDER = originalProvider;
      legacyEnv.CUSTOM_PDF_PARSE_URL = originalUrl;
      legacyEnv.CUSTOM_PDF_PARSE_KEY = originalKey;
    }
  });

  it('freezes the legacy PDF credential order into provider when none is selected', () => {
    const originalProvider = legacyEnv.DOCUMENT_PARSE_PROVIDER;
    const originalUrl = legacyEnv.CUSTOM_PDF_PARSE_URL;
    const originalKey = legacyEnv.CUSTOM_PDF_PARSE_KEY;
    const originalSomark = legacyEnv.SOMARK_API_KEY;
    const originalDoc2x = legacyEnv.DOC2X_KEY;
    const originalTextinAppId = legacyEnv.TEXTIN_APP_ID;
    const originalTextinSecretCode = legacyEnv.TEXTIN_SECRET_CODE;
    legacyEnv.DOCUMENT_PARSE_PROVIDER = undefined;
    legacyEnv.CUSTOM_PDF_PARSE_URL = undefined;
    legacyEnv.CUSTOM_PDF_PARSE_KEY = undefined;
    legacyEnv.SOMARK_API_KEY = undefined;
    legacyEnv.DOC2X_KEY = undefined;
    legacyEnv.TEXTIN_APP_ID = undefined;
    legacyEnv.TEXTIN_SECRET_CODE = undefined;

    try {
      const overrides = buildLegacyDomainOverrides({
        feConfigs: {},
        systemEnv: { customPdfParse: { somarkApiKey: 'sk-legacy' } }
      });

      expect(pick(overrides, 'providers.documentParse.provider')).toBe('somark');
    } finally {
      legacyEnv.DOCUMENT_PARSE_PROVIDER = originalProvider;
      legacyEnv.CUSTOM_PDF_PARSE_URL = originalUrl;
      legacyEnv.CUSTOM_PDF_PARSE_KEY = originalKey;
      legacyEnv.SOMARK_API_KEY = originalSomark;
      legacyEnv.DOC2X_KEY = originalDoc2x;
      legacyEnv.TEXTIN_APP_ID = originalTextinAppId;
      legacyEnv.TEXTIN_SECRET_CODE = originalTextinSecretCode;
    }
  });

  it('backfills customPdf.timeoutSeconds only when PARSE_FILE_TIMEOUT_SECONDS > 600', () => {
    const baseEnv = readLegacyInstanceConfigEnv();

    const larger = buildFromLegacy({
      feConfigs: {},
      systemEnv: {},
      legacyEnv: { ...baseEnv, PARSE_FILE_TIMEOUT_SECONDS: 1200 }
    });
    expect(pick(larger, 'performance.parse.fileTimeoutSeconds')).toBe(1200);
    expect(pick(larger, 'providers.documentParse.customPdf.timeoutSeconds')).toBe(1200);

    const equal = buildFromLegacy({
      feConfigs: {},
      systemEnv: {},
      legacyEnv: { ...baseEnv, PARSE_FILE_TIMEOUT_SECONDS: 600 }
    });
    expect(pick(equal, 'providers.documentParse.customPdf.timeoutSeconds')).toBeUndefined();

    const smaller = buildFromLegacy({
      feConfigs: {},
      systemEnv: {},
      legacyEnv: { ...baseEnv, PARSE_FILE_TIMEOUT_SECONDS: 120 }
    });
    expect(pick(smaller, 'performance.parse.fileTimeoutSeconds')).toBe(120);
    expect(pick(smaller, 'providers.documentParse.customPdf.timeoutSeconds')).toBeUndefined();

    const sangforLarger = buildFromLegacy({
      feConfigs: {},
      systemEnv: {},
      legacyEnv: {
        ...baseEnv,
        DOCUMENT_PARSE_PROVIDER: 'sangfor',
        SANGFOR_PARSE_TIMEOUT_SECONDS: 900
      }
    });
    expect(pick(sangforLarger, 'providers.documentParse.customPdf.timeoutSeconds')).toBe(900);
    expect(pick(sangforLarger, 'providers.documentParse.sangfor.timeoutSeconds')).toBeUndefined();

    const sangforSmaller = buildFromLegacy({
      feConfigs: {},
      systemEnv: {},
      legacyEnv: {
        ...baseEnv,
        DOCUMENT_PARSE_PROVIDER: 'sangfor',
        SANGFOR_PARSE_TIMEOUT_SECONDS: 45
      }
    });
    expect(
      pick(sangforSmaller, 'providers.documentParse.customPdf.timeoutSeconds')
    ).toBeUndefined();
    expect(pick(sangforSmaller, 'providers.documentParse.sangfor.timeoutSeconds')).toBeUndefined();
  });

  /**
   * 客户的环境变量只在这条迁移链路上进入实例配置：任何一条映射断掉，
   * 客户已配置的 env 值在升级后就会变成 Schema 默认值。
   *
   * 这里逐项钉住「配置路径 ← 具体环境变量」的绑定，断言右侧取的是 env 变量本身，
   * 因此换绑到别的变量或删除映射都会失败，且不依赖测试环境里 env 的具体取值。
   * 测试环境未配置的可选 env 取值为 undefined，无法区分"映射断了"与"env 没配"，
   * 故另用最小可断言条数兜底，防止表格被悄悄清空。
   */
  it('maps every domain field back to the exact environment variable it reads', () => {
    // 所有可选或默认为空的绑定都显式提供合成值，避免 CI 与开发机 ENV 不同而漏测。
    const legacyEnv: ReturnType<typeof readLegacyInstanceConfigEnv> = {
      ...readLegacyInstanceConfigEnv(),
      FE_DOMAIN: 'https://migration.test',
      SYSTEM_DESCRIPTION: 'Migration fixture',
      SYSTEM_FAVICON: '/migration.svg',
      CUSTOM_API_DOMAIN: 'https://api.migration.test',
      CUSTOM_SHARE_PAGE_DOMAIN: 'https://share.migration.test',
      PASSWORD_EXPIRED_MONTH: 3,
      PAY_FORM_URL: 'https://pay.migration.test',
      STORAGE_EXTERNAL_ENDPOINT: 'https://storage.migration.test',
      STORAGE_S3_CDN_ENDPOINT: 'https://cdn.migration.test',
      DOCUMENT_PARSE_PROVIDER: '',
      CUSTOM_PDF_PARSE_URL: 'https://pdf.migration.test',
      CUSTOM_PDF_PARSE_KEY: 'synthetic-pdf-key',
      SOMARK_API_KEY: 'synthetic-somark-key',
      DOC2X_KEY: 'synthetic-doc2x-key',
      TEXTIN_APP_ID: 'synthetic-textin-app',
      TEXTIN_SECRET_CODE: 'synthetic-textin-secret',
      SSE_MCP_SERVER_PROXY_ENDPOINT: 'https://mcp.migration.test',
      AGENT_SANDBOX_PROVIDER: 'opensandbox',
      AGENT_SANDBOX_NPM_REGISTRY: 'https://npm.migration.test',
      AGENT_SANDBOX_PYPI_INDEX_URL: 'https://pypi.migration.test',
      AGENT_SANDBOX_APT_MIRROR: 'https://apt.migration.test',
      AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'https://opensandbox.migration.test',
      AGENT_SANDBOX_OPENSANDBOX_API_KEY: 'synthetic-opensandbox-key',
      AGENT_SANDBOX_OPENSANDBOX_IMAGE: 'migration-opensandbox:latest',
      AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL: 'https://volume.migration.test',
      AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN: 'synthetic-volume-token',
      AGENT_SANDBOX_PROXY_URL: 'wss://proxy.migration.test',
      AGENT_SANDBOX_PREVIEW_PROXY_URL: 'https://preview.migration.test',
      AGENT_SANDBOX_PROXY_SECRET: 'migration-proxy-secret-32-characters-min'
    } as typeof legacyEnv & Record<string, string>;
    const overrides = buildFromLegacy({ feConfigs: {}, systemEnv: {}, legacyEnv });
    const cases: [string, unknown][] = [
      // site
      ['site.publicUrl', legacyEnv.FE_DOMAIN],
      ['site.name', legacyEnv.SYSTEM_NAME],
      ['site.description', legacyEnv.SYSTEM_DESCRIPTION],
      ['site.favicon', legacyEnv.SYSTEM_FAVICON],
      ['site.customApiDomain', legacyEnv.CUSTOM_API_DOMAIN],
      ['site.customSharePageDomain', legacyEnv.CUSTOM_SHARE_PAGE_DOMAIN],
      // auth
      ['auth.openApiKeyMaxCount', legacyEnv.OPENAPI_KEY_MAX_COUNT],
      ['auth.passwordExpiredMonth', legacyEnv.PASSWORD_EXPIRED_MONTH ?? null],
      // security
      ['security.checkInternalIp', legacyEnv.CHECK_INTERNAL_IP],
      ['security.csrfEnabled', legacyEnv.CSRF_ENABLED],
      ['security.passwordLoginMinuteLimitCount', legacyEnv.PASSWORD_LOGIN_MINUTE_LIMIT_COUNT],
      ['security.maxLoginSession', legacyEnv.MAX_LOGIN_SESSION],
      ['security.skipFileTypeCheck', legacyEnv.SKIP_FILE_TYPE_CHECK],
      // feature
      ['feature.hideChatCopyrightSetting', legacyEnv.HIDE_CHAT_COPYRIGHT_SETTING],
      ['feature.multipleDataToBase64', legacyEnv.MULTIPLE_DATA_TO_BASE64],
      ['feature.agentEngine', legacyEnv.AGENT_ENGINE],
      // commercial
      ['commercial.showCoupon', legacyEnv.SHOW_COUPON],
      ['commercial.showDiscountCoupon', legacyEnv.SHOW_DISCOUNT_COUPON],
      ['commercial.payFormUrl', legacyEnv.PAY_FORM_URL],
      // resource
      ['resource.serviceRequestMaxContentLength', legacyEnv.SERVICE_REQUEST_MAX_CONTENT_LENGTH],
      ['resource.systemMaxStringLengthM', legacyEnv.SYSTEM_MAX_STRING_LENGTH_M],
      ['resource.maxFolderDepth', legacyEnv.MAX_FOLDER_DEPTH],
      ['resource.appFolderMaxAmount', legacyEnv.APP_FOLDER_MAX_AMOUNT],
      ['resource.datasetFolderMaxAmount', legacyEnv.DATASET_FOLDER_MAX_AMOUNT],
      ['resource.uploadFileMaxSize', legacyEnv.UPLOAD_FILE_MAX_SIZE],
      ['resource.uploadFileMaxAmount', legacyEnv.UPLOAD_FILE_MAX_AMOUNT],
      ['resource.datasetArchive.maxFiles', legacyEnv.DATASET_ARCHIVE_MAX_FILES],
      ['resource.datasetArchive.maxSourceSizeMiB', legacyEnv.DATASET_ARCHIVE_MAX_SOURCE_SIZE_MB],
      ['resource.datasetArchive.maxConcurrency', legacyEnv.DATASET_ARCHIVE_MAX_CONCURRENCY],
      [
        'resource.datasetArchive.prepareTimeoutSeconds',
        legacyEnv.DATASET_ARCHIVE_PREPARE_TIMEOUT_SECONDS
      ],
      // performance
      ['performance.workflow.maxRunTimes', legacyEnv.WORKFLOW_MAX_RUN_TIMES],
      ['performance.workflow.maxLoopTimes', legacyEnv.WORKFLOW_MAX_LOOP_TIMES],
      ['performance.workflow.parallelMaxConcurrency', legacyEnv.WORKFLOW_PARALLEL_MAX_CONCURRENCY],
      ['performance.parse.fileTimeoutSeconds', legacyEnv.PARSE_FILE_TIMEOUT_SECONDS],
      ['performance.parse.xlsxMaxRows', legacyEnv.XLSX_PARSE_MAX_ROWS],
      ['performance.parse.xlsxMaxColumns', legacyEnv.XLSX_PARSE_MAX_COLUMNS],
      ['performance.parse.xlsxMaxCells', legacyEnv.XLSX_PARSE_MAX_CELLS],
      ['performance.parse.xlsxMaxMergedCells', legacyEnv.XLSX_PARSE_MAX_MERGED_CELLS],
      ['performance.parse.maxHtmlTransformChars', legacyEnv.MAX_HTML_TRANSFORM_CHARS],
      ['performance.dataset.parseMaxProcess', legacyEnv.DATASET_PARSE_MAX_PROCESS],
      ['performance.dataset.vectorMaxProcess', legacyEnv.VECTOR_MAX_PROCESS],
      ['performance.dataset.qaMaxProcess', legacyEnv.QA_MAX_PROCESS],
      ['performance.dataset.vlmMaxProcess', legacyEnv.VLM_MAX_PROCESS],
      ['performance.chat.maxQpm', legacyEnv.CHAT_MAX_QPM],
      ['performance.tracking.retentionHours', legacyEnv.LLM_REQUEST_TRACKING_RETENTION_HOURS],
      // storage
      ['storage.downloadMode', legacyEnv.STORAGE_DOWNLOAD_URL_MODE],
      ['storage.externalEndpoint', legacyEnv.STORAGE_EXTERNAL_ENDPOINT],
      ['storage.cdnEndpoint', legacyEnv.STORAGE_S3_CDN_ENDPOINT],
      ['storage.fileUrlExpiredDays', legacyEnv.FILE_URL_EXPIRED_DAYS],
      // vector
      ['vector.hnswEfSearch', legacyEnv.HNSW_EF_SEARCH],
      // providers
      ['providers.documentParse.customPdf.url', legacyEnv.CUSTOM_PDF_PARSE_URL],
      ['providers.documentParse.customPdf.key', legacyEnv.CUSTOM_PDF_PARSE_KEY],
      ['providers.documentParse.customPdf.somarkApiKey', legacyEnv.SOMARK_API_KEY],
      ['providers.documentParse.customPdf.doc2xKey', legacyEnv.DOC2X_KEY],
      ['providers.documentParse.customPdf.textinAppId', legacyEnv.TEXTIN_APP_ID],
      ['providers.documentParse.customPdf.textinSecretCode', legacyEnv.TEXTIN_SECRET_CODE],
      ['providers.documentParse.sangfor.extensions', legacyEnv.SANGFOR_PARSE_EXTENSIONS],
      // subservice
      ['subservice.mcp.sseProxyUrl', legacyEnv.SSE_MCP_SERVER_PROXY_ENDPOINT],
      ['subservice.agentSandbox.enabled', true],
      ['subservice.agentSandbox.common.cpuCount', legacyEnv.AGENT_SANDBOX_CPU_COUNT],
      ['subservice.agentSandbox.common.memoryMiB', legacyEnv.AGENT_SANDBOX_MEMORY_MIB],
      ['subservice.agentSandbox.common.storageSizeGi', legacyEnv.AGENT_SANDBOX_STORAGE_SIZE_GI],
      ['subservice.agentSandbox.common.suspendMinutes', legacyEnv.AGENT_SANDBOX_SUSPEND_MINUTES],
      [
        'subservice.agentSandbox.common.archiveInactiveDays',
        legacyEnv.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS
      ],
      ['subservice.agentSandbox.common.maxEditDebug', legacyEnv.AGENT_SANDBOX_MAX],
      ['subservice.agentSandbox.common.npmRegistry', legacyEnv.AGENT_SANDBOX_NPM_REGISTRY],
      ['subservice.agentSandbox.common.pypiIndexUrl', legacyEnv.AGENT_SANDBOX_PYPI_INDEX_URL],
      ['subservice.agentSandbox.common.aptMirror', legacyEnv.AGENT_SANDBOX_APT_MIRROR],
      ['subservice.agentSandbox.opensandbox.baseUrl', legacyEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL],
      ['subservice.agentSandbox.opensandbox.apiKey', legacyEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY],
      ['subservice.agentSandbox.opensandbox.runtime', legacyEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME],
      ['subservice.agentSandbox.opensandbox.image', legacyEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE],
      [
        'subservice.agentSandbox.opensandbox.useServerProxy',
        legacyEnv.AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY
      ],
      [
        'subservice.agentSandbox.opensandbox.volumeManagerUrl',
        legacyEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL
      ],
      [
        'subservice.agentSandbox.opensandbox.volumeManagerToken',
        legacyEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN
      ],
      [
        'subservice.agentSandbox.opensandbox.volumeNamePrefix',
        legacyEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX
      ]
    ];

    // EVAL_CONCURRENCY 与 AGENT_SANDBOX_EPHEMERAL_STORAGE_SIZE 已明确弃用，本轮不迁入实例配置。
    expect(legacyEnv).not.toHaveProperty('EVAL_CONCURRENCY');
    expect(legacyEnv).not.toHaveProperty('AGENT_SANDBOX_EPHEMERAL_STORAGE_SIZE');
    expect(pick(overrides, 'performance.task.evalConcurrency')).toBeUndefined();
    expect(
      pick(overrides, 'subservice.agentSandbox.opensandbox.ephemeralStorageSize')
    ).toBeUndefined();

    // Marketplace、企业微信自动跳转与四项数据源地址只读运行时 ENV；三项 Sandbox 固定限制也不再计入迁移绑定数。
    // 兜底：有取值才能验证绑定，条数过少说明表格被削掉了。
    expect(
      cases.filter(([, expected]) => expected !== undefined && expected !== '').length
    ).toBeGreaterThanOrEqual(53);

    const mismatched = cases
      .filter(([path, expected]) => {
        const actual = pick(overrides, path);
        // 空字符串 env 按未配置处理、不写覆盖项（由「drops empty strings」用例覆盖），
        // 因此这类取值断言"应缺省"而不是等值
        return expected === '' ? actual !== undefined : actual !== expected;
      })
      .map(
        ([path, expected]) =>
          `${path}: 实际 ${JSON.stringify(pick(overrides, path))} != ${JSON.stringify(expected)}`
      );

    expect(mismatched).toEqual([]);
  });

  it('enables Agent Sandbox across explicit opensandbox and upgraded Helm/Compose envs while blocking disabled/placeholder envs', () => {
    const baseEnv = readLegacyInstanceConfigEnv();
    const completeOpenSandboxEnv = {
      AGENT_SANDBOX_OPENSANDBOX_API_KEY: 'osb-test-key',
      AGENT_SANDBOX_OPENSANDBOX_IMAGE: 'fastgpt-agent-sandbox:v0.5.0',
      AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL: 'http://volume-manager:8081',
      AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN: 'vm-test-token'
    };
    const upgradedHelmEnv = {
      ...baseEnv,
      ...completeOpenSandboxEnv,
      AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://fgc-opensandbox-server:8090',
      AGENT_SANDBOX_PROXY_URL: 'wss://proxy.migration.test',
      AGENT_SANDBOX_PREVIEW_PROXY_URL: 'https://preview.migration.test',
      AGENT_SANDBOX_PROXY_SECRET: 'proxy_generated_secret_32_characters_min'
    };
    const templatePlaceholderEnv = {
      ...baseEnv,
      ...completeOpenSandboxEnv,
      AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://localhost:8090',
      AGENT_SANDBOX_PROXY_URL: 'ws://localhost:3006',
      AGENT_SANDBOX_PREVIEW_PROXY_URL: 'http://localhost:3006',
      AGENT_SANDBOX_PROXY_SECRET: 'default_fastgpt_agent_sandbox_proxy_secret'
    };

    expect(baseEnv).not.toHaveProperty('AGENT_SANDBOX_PROVIDER');

    // 1. 显式声明旧 AGENT_SANDBOX_PROVIDER 为空 / none / sealosdevbox 时不得自动开启
    for (const provider of ['', 'none', 'sealosdevbox'] as const) {
      vi.stubEnv('AGENT_SANDBOX_PROVIDER', provider);
      const overrides = buildFromLegacy({
        feConfigs: {},
        systemEnv: {},
        legacyEnv: {
          ...upgradedHelmEnv,
          AGENT_SANDBOX_PROVIDER: provider
        } as typeof baseEnv & Record<string, string>
      });
      expect(pick(overrides, 'subservice.agentSandbox.enabled')).toBeUndefined();
    }

    // 2. 新版 Helm / Compose 已移除 AGENT_SANDBOX_PROVIDER：
    //    - 未填写代理地址（如 Compose 默认空 proxy url）或保留旧 .env.template 本地占位组合时保持关闭；
    //    - 控制面地址与代理配置齐全时在迁移后自动保留启用状态。
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', undefined);
    const placeholderOverrides = buildFromLegacy({
      feConfigs: {},
      systemEnv: {},
      legacyEnv: templatePlaceholderEnv as typeof baseEnv & Record<string, string>
    });
    expect(pick(placeholderOverrides, 'subservice.agentSandbox.enabled')).toBeUndefined();

    const unconfiguredComposeOverrides = buildFromLegacy({
      feConfigs: {},
      systemEnv: {},
      legacyEnv: {
        ...baseEnv,
        AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://fastgpt-opensandbox-server:8090',
        AGENT_SANDBOX_PROXY_URL: '',
        AGENT_SANDBOX_PREVIEW_PROXY_URL: '',
        AGENT_SANDBOX_PROXY_SECRET: 'default_fastgpt_agent_sandbox_proxy_secret'
      } as typeof baseEnv & Record<string, string>
    });
    expect(pick(unconfiguredComposeOverrides, 'subservice.agentSandbox.enabled')).toBeUndefined();

    const helmUpgradeOverrides = buildFromLegacy({
      feConfigs: {},
      systemEnv: {},
      legacyEnv: upgradedHelmEnv as typeof baseEnv & Record<string, string>
    });
    expect(pick(helmUpgradeOverrides, 'subservice.agentSandbox.enabled')).toBe(true);
    expect(pick(helmUpgradeOverrides, 'subservice.agentSandbox.proxy')).toEqual({
      wsUrl: 'wss://proxy.migration.test',
      previewUrl: 'https://preview.migration.test',
      secret: 'proxy_generated_secret_32_characters_min'
    });

    const composeUpgradeOverrides = buildFromLegacy({
      feConfigs: {},
      systemEnv: {},
      legacyEnv: {
        ...baseEnv,
        ...completeOpenSandboxEnv,
        AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://fastgpt-opensandbox-server:8090',
        AGENT_SANDBOX_PROXY_URL: 'wss://sandbox.example.com',
        AGENT_SANDBOX_PREVIEW_PROXY_URL: 'https://preview.example.com',
        AGENT_SANDBOX_PROXY_SECRET: 'default_fastgpt_agent_sandbox_proxy_secret'
      } as typeof baseEnv & Record<string, string>
    });
    expect(pick(composeUpgradeOverrides, 'subservice.agentSandbox.enabled')).toBe(true);

    // 2b. 缺少必填 apiKey / image / volumeManagerUrl / volumeManagerToken 时保持关闭，避免写入不完整且无法保存的配置
    for (const missingKey of [
      'AGENT_SANDBOX_OPENSANDBOX_API_KEY',
      'AGENT_SANDBOX_OPENSANDBOX_IMAGE',
      'AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL',
      'AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN'
    ] as const) {
      const incompleteOverrides = buildFromLegacy({
        feConfigs: {},
        systemEnv: {},
        legacyEnv: {
          ...upgradedHelmEnv,
          [missingKey]: ''
        } as typeof baseEnv & Record<string, string>
      });
      expect(pick(incompleteOverrides, 'subservice.agentSandbox.enabled')).toBeUndefined();
    }

    // 3. 显式 opensandbox 且缺少代理配置时仍保持关闭
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'opensandbox');
    const withoutProxyOverrides = buildFromLegacy({
      feConfigs: {},
      systemEnv: {},
      legacyEnv: {
        ...baseEnv,
        AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'https://opensandbox.migration.test',
        AGENT_SANDBOX_PROVIDER: 'opensandbox'
      } as typeof baseEnv & Record<string, string>
    });
    expect(pick(withoutProxyOverrides, 'subservice.agentSandbox.enabled')).toBeUndefined();

    // 4. process.env 显式 opensandbox 且使用本地开发配置时也允许开启
    const enabledViaEnv = buildFromLegacy({
      feConfigs: {},
      systemEnv: {},
      legacyEnv: templatePlaceholderEnv as typeof baseEnv & Record<string, string>
    });
    expect(pick(enabledViaEnv, 'subservice.agentSandbox.enabled')).toBe(true);
  });
});
