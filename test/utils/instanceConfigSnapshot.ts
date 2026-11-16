import { getSystemConfigRuntimeState } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';

/** 测试使用完整 Schema 默认快照；不再依赖缺叶子快照触发已移除的 ENV 兜底。 */
export const createDefaultInstanceConfig = () => resolveSystemInstanceConfig({});

/** 获取可修改的测试快照；测试通过配置字段驱动业务，旧环境变量不参与运行期读写。 */
export const getTestInstanceConfig = () => {
  global.systemInstanceConfig ??= createDefaultInstanceConfig();
  return global.systemInstanceConfig;
};

/** 生成已生效的合成授权，用于明确触发商业版业务分支，不使用前端 isPlus 作为后端配置。 */
export const setTestLicenseActive = (active: boolean) => {
  getSystemConfigRuntimeState().frontendContext.commercialService = true;
  getTestInstanceConfig().license.data = active
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
