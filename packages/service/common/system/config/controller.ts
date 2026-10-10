import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { MongoSystemConfigs } from './schema';
import type { FastGPTConfigFileType, LicenseDataType } from '@fastgpt/global/common/system/types';
import { FastGPTProUrl } from '../constants';

export const getFastGPTConfigFromDB = async (): Promise<{
  fastgptConfig: FastGPTConfigFileType;
  fastgptConfigTime?: number;
  licenseData?: LicenseDataType;
  licenseUpdateTime?: number;
}> => {
  if (!FastGPTProUrl) {
    return {
      fastgptConfig: {} as FastGPTConfigFileType
    };
  }

  const [fastgptConfig, licenseConfig] = await Promise.all([
    MongoSystemConfigs.findOne({
      type: SystemConfigsTypeEnum.fastgpt
    }).sort({
      createTime: -1
    }),

    MongoSystemConfigs.findOne({
      type: SystemConfigsTypeEnum.license
    }).sort({
      createTime: -1
    })
  ]);

  const config = fastgptConfig?.value || {};
  // 快照原样返回（含已到期的）：过期属于「状态」而非「数据不存在」，
  // 过滤掉会让界面无法区分「从未激活」与「已到期」。
  // 是否按商业版启用由调用方用 getLicenseStatus / isLicenseActive 判定。
  const licenseData = licenseConfig?.value?.data as LicenseDataType | undefined;

  const fastgptConfigTime = fastgptConfig?.createTime
    ? new Date(fastgptConfig.createTime).getTime()
    : undefined;
  const licenseUpdateTime = licenseConfig?.createTime
    ? new Date(licenseConfig.createTime).getTime()
    : undefined;

  return {
    fastgptConfig: config as FastGPTConfigFileType,
    fastgptConfigTime,
    licenseData,
    licenseUpdateTime
  };
};

export const updateFastGPTConfigBuffer = async () => {
  const res = await MongoSystemConfigs.findOne({
    type: SystemConfigsTypeEnum.fastgpt
  }).sort({
    createTime: -1
  });

  if (!res) return;

  res.createTime = new Date();
  await res.save();

  global.systemInitBufferId = res.createTime.getTime().toString();
};

export const reloadFastGPTConfigBuffer = async () => {
  const res = await MongoSystemConfigs.findOne({
    type: SystemConfigsTypeEnum.fastgpt
  }).sort({
    createTime: -1
  });
  if (!res) return;
  global.systemInitBufferId = res.createTime.getTime().toString();
};
