import { describe, expect, it } from 'vitest';
import { formatFormData2ConfigStore } from '@/web/admin/config/adapt';
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
});
