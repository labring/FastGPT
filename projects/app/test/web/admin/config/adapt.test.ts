import { describe, expect, it } from 'vitest';
import { formatConfigStore2FormSchema, formatFormData2ConfigStore } from '@/web/admin/config/adapt';
import type { DeepPartial } from '@fastgpt/global/common/type/utils';

type ConfigFormInput = Parameters<typeof formatFormData2ConfigStore>[0];

/**
 * 构造 formatFormData2ConfigStore 的最小可用入参。
 * 该函数只读取少量字段，其余按空对象占位即可；测试通过 overrides 覆盖关注点，
 * 避免每个用例重复四十行字面量。
 * fixture 和 overrides 都用 DeepPartial 声明，字段名与取值仍受真实表单类型约束；
 * 只在返回时收敛一次为完整入参类型，未填字段交由被测函数按默认值处理。
 */
const createFormInput = (overrides: DeepPartial<ConfigFormInput> = {}): ConfigFormInput => {
  const defaults: DeepPartial<ConfigFormInput> = {
    siteSettings: {
      feConfigs: {},
      concatMd: '',
      scripts: '',
      limit: {},
      navbar: [],
      systemEnv: {}
    },
    loginSettings: {
      email: {},
      phone: {},
      sms: {},
      github: {},
      wechat: {},
      wecom: {},
      google: {},
      microsoft: {},
      fastLogin: '{}',
      teamMode: 'multi',
      accountCancellation: { enabled: true }
    },
    paySettings: {
      wx: {},
      alipay: {},
      bank: {},
      subPlans: {
        planDescriptionUrl: '',
        appRegistrationUrl: '',
        communitySupportTip: '',
        standard: {},
        extraDatasetSizePrice: 0,
        extraPointsPackages: []
      }
    },
    securitySettings: {},
    externalProviderSettings: {
      externalProviderWorkflowVariables: []
    }
  };

  return { ...defaults, ...overrides } as ConfigFormInput;
};

describe('formatFormData2ConfigStore', () => {
  it.each([undefined, 0, 8])(
    'round-trips vector recall concurrency with input %j',
    (concurrency) => {
      const form = formatConfigStore2FormSchema({
        fastgpt: { feConfigs: {}, systemEnv: { vectorRecallConcurrency: concurrency } } as any,
        fastgptPro: {} as any
      });
      expect(form.siteSettings.systemEnv.vectorRecallConcurrency).toBe(concurrency ?? 0);

      const stored = formatFormData2ConfigStore(form);
      expect(stored.fastgpt.systemEnv.vectorRecallConcurrency).toBe(concurrency ?? 0);
      expect(stored.fastgpt.feConfigs).not.toHaveProperty('vectorRecallConcurrency');
    }
  );

  it.each([undefined, { url: 'https://current-sso.example.com' }, { url: '' }])(
    'moves legacy SSO URLs into systemEnv without overriding explicit server config %j',
    (serverConfig) => {
      const source = {
        fastgpt: {
          feConfigs: { sso: { url: 'https://legacy-sso.example.com', title: 'SSO' } },
          systemEnv: { sso: serverConfig }
        },
        fastgptPro: {}
      };
      const form = formatConfigStore2FormSchema(source as any);
      const stored = formatFormData2ConfigStore(form);
      const expected = serverConfig ?? { url: 'https://legacy-sso.example.com' };
      expect(form.siteSettings.systemEnv.sso).toEqual(expected);
      expect(form.loginSettings.sso).not.toHaveProperty('url');
      expect(stored.fastgpt.systemEnv.sso).toEqual(expected);
      expect(stored.fastgpt.feConfigs.sso).toEqual({
        title: 'SSO',
        enabled: Boolean(expected.url)
      });
      expect(source.fastgpt.feConfigs.sso.url).toBe('https://legacy-sso.example.com');
    }
  );
  it('persists sandbox quotas in server configuration', () => {
    const form = createFormInput();
    form.siteSettings.systemEnv.agentSandboxMax = 12;
    form.siteSettings.systemEnv.agentSandboxMaxPerTeam = 3;

    const result = formatFormData2ConfigStore(form);

    expect(result.fastgpt.systemEnv).toMatchObject({
      agentSandboxMax: 12,
      agentSandboxMaxPerTeam: 3
    });
    expect(result.fastgpt.feConfigs.limit).not.toHaveProperty('agentSandboxMax');
    expect(result.fastgpt.feConfigs.limit).not.toHaveProperty('agentSandboxMaxPerTeam');
  });

  it('writes account cancellation to both fastgpt and fastgptPro configs', () => {
    const result = formatFormData2ConfigStore(createFormInput());

    expect(result.fastgpt.feConfigs.accountCancellation).toEqual({ enabled: true });
    expect(result.fastgptPro.accountCancellation).toEqual({ enabled: true });
  });

  it('persists login 2FA sms templates into fastgptPro auth config', () => {
    // 登录二次验证的短信模板 CODE 由 Pro 侧消费，管理端保存时必须原样透传到 fastgptPro.auth.sms，
    // 否则表单填写后 Pro 读不到模板，手机号账号会静默降级为纯密码登录。
    const result = formatFormData2ConfigStore(
      createFormInput({
        loginSettings: {
          email: {},
          phone: {},
          sms: { LOGIN: 'SMS_LOGIN', LOGIN_EN: 'SMS_LOGIN_EN' },
          github: {},
          wechat: {},
          wecom: {},
          google: {},
          microsoft: {},
          fastLogin: '{}',
          teamMode: 'multi',
          accountCancellation: { enabled: true }
        }
      })
    );

    expect(result.fastgptPro.auth?.sms).toMatchObject({
      LOGIN: 'SMS_LOGIN',
      LOGIN_EN: 'SMS_LOGIN_EN'
    });
  });

  it('adapts enable_team_model between form schema and config store', () => {
    // 1. Config store to form schema: defaults to false when missing
    const defaultSchema = formatConfigStore2FormSchema({
      fastgpt: { feConfigs: {} } as any,
      fastgptPro: {} as any
    });
    expect(defaultSchema.siteSettings.feConfigs.enable_team_model).toBe(false);

    // 2. Config store to form schema: reads true when set
    const enabledSchema = formatConfigStore2FormSchema({
      fastgpt: { feConfigs: { enable_team_model: true } } as any,
      fastgptPro: {} as any
    });
    expect(enabledSchema.siteSettings.feConfigs.enable_team_model).toBe(true);

    // 3. Form schema to config store: persists enable_team_model into fastgpt.feConfigs
    const result = formatFormData2ConfigStore(
      createFormInput({
        siteSettings: {
          feConfigs: { enable_team_model: true } as any,
          systemEnv: {}
        }
      })
    );
    expect(result.fastgpt.feConfigs.enable_team_model).toBe(true);
  });
});

describe('sandbox quota config round trip', () => {
  it('reads and saves sandbox quotas under systemEnv during config round trip, supporting empty values and preserving other limits', () => {
    const input = createFormInput();
    input.siteSettings.systemEnv.agentSandboxMax = 12;
    input.siteSettings.systemEnv.agentSandboxMaxPerTeam = undefined;
    input.siteSettings.limit = {
      uploadFileMaxAmount: 7,
      uploadFileMaxSize: 32,
      exportDatasetLimitMinutes: 20,
      websiteSyncLimitMinuted: 60
    };
    const stored = formatFormData2ConfigStore(input);
    const form = formatConfigStore2FormSchema(stored);

    expect(form.siteSettings.systemEnv).toMatchObject({
      agentSandboxMax: 12,
      agentSandboxMaxPerTeam: undefined
    });
    const saved = formatFormData2ConfigStore(form);
    expect(saved.fastgpt.systemEnv).toMatchObject(stored.fastgpt.systemEnv);
    expect(saved.fastgpt.feConfigs.limit).toEqual({
      uploadFileMaxAmount: 7,
      uploadFileMaxSize: 32,
      exportDatasetLimitMinutes: 20,
      websiteSyncLimitMinuted: 60
    });
  });
});

// 服务端策略只在 systemEnv 保存；兼容旧字段时不覆盖显式空白名单。
describe('backend configuration boundary', () => {
  it.each([undefined, []])(
    'migrates legacy policies with systemEnv whitelist %s taking precedence',
    (configured) => {
      const form = formatConfigStore2FormSchema({
        fastgpt: {
          feConfigs: {
            fileUrlWhitelist: ['private.internal'],
            ip_whitelist: '10.0.0.1',
            evalFileMaxLines: 100
          },
          systemEnv: { fileUrlWhitelist: configured }
        } as any,
        fastgptPro: {} as any
      });
      const stored = formatFormData2ConfigStore(form);
      expect(stored.fastgpt.systemEnv.fileUrlWhitelist).toEqual(configured ?? ['private.internal']);
      expect(stored.fastgpt.systemEnv.ip_whitelist).toBe('10.0.0.1');
      for (const key of [
        'fileUrlWhitelist',
        'ip_whitelist',
        'evalFileMaxLines',
        'uploadFileMaxAmount',
        'uploadFileMaxSize'
      ]) {
        expect(stored.fastgpt.feConfigs).not.toHaveProperty(key);
      }
    }
  );
});
