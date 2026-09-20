import { describe, expect, it } from 'vitest';
import { formatFormData2ConfigStore } from '@/web/admin/config/adapt';

describe('formatFormData2ConfigStore', () => {
  it('writes account cancellation to both fastgpt and fastgptPro configs', () => {
    const result = formatFormData2ConfigStore({
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
    } as any);

    expect(result.fastgpt.feConfigs.accountCancellation).toEqual({ enabled: true });
    expect(result.fastgptPro.accountCancellation).toEqual({ enabled: true });
  });
});
