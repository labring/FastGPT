import { MongoSystemInstanceConfig } from '../systemInstanceConfig/schema';
import type { FastGPTConfigFileType, LicenseDataType } from '@fastgpt/global/common/system/types';
import { FastGPTProUrl } from '../constants';
import { readRuntimeConfigScopes } from './runtimeScopes';

/** 从独立 scope 生成运行时投影；授权继续按原有保存时间读取。 */
export const getFastGPTConfigFromDB = async (): Promise<{
  fastgptConfig: FastGPTConfigFileType;
  fastgptConfigTime?: number;
  proEnvUpdateTime?: number;
  licenseData?: LicenseDataType;
  licenseUpdateTime?: number;
}> => {
  if (!FastGPTProUrl) {
    return {
      fastgptConfig: {} as FastGPTConfigFileType
    };
  }

  const [runtimeConfig, licenseConfig] = await Promise.all([
    readRuntimeConfigScopes(),
    MongoSystemInstanceConfig.findOne({ domain: 'license' })
  ]);

  // 快照原样返回（含已到期的）：过期属于「状态」而非「数据不存在」，
  // 过滤掉会让界面无法区分「从未激活」与「已到期」。
  // 是否按商业版启用由调用方用 getLicenseStatus / isLicenseActive 判定。
  const licenseData = licenseConfig?.overrides?.data as LicenseDataType | undefined;

  const licenseUpdateTime = licenseConfig?.revision;

  return {
    ...runtimeConfig,
    licenseData,
    licenseUpdateTime
  };
};
