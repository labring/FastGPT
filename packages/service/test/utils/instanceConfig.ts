import { getSystemConfigRuntimeState } from '../../common/system/systemInstanceConfig/runtime';
import { getTestInstanceConfig } from '@test/utils/instanceConfigSnapshot';

/** 为商业能力测试设置有效授权；未启用时清除授权数据。 */
export const setTestProLicense = (enabled: boolean) => {
  getSystemConfigRuntimeState().frontendContext.commercialService = true;
  getTestInstanceConfig().license.data = enabled
    ? {
        schemaVersion: 2,
        licenseType: 'official',
        company: 'test',
        startTime: '2000-01-01T00:00:00.000Z',
        expiredTime: '2099-01-01T00:00:00.000Z',
        limits: { maxUsers: 0, maxApps: 0, maxDatasets: 0 },
        functions: {
          sso: true,
          pay: true,
          eval: true,
          datasetEnhance: true,
          assistantGenerate: true,
          portal: true,
          sandboxSkills: true
        }
      }
    : undefined;
};
