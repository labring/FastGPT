import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { MongoSystemConfigs } from './schema';
import type { FastGPTConfigFileType, LicenseDataType } from '@fastgpt/global/common/system/types';
import { FastGPTProUrl } from '../constants';
import { isLicenseExpired } from '@fastgpt/global/common/system/license/utils';

export const getFastGPTConfigFromDB = async (): Promise<{
  fastgptConfig: FastGPTConfigFileType;
  licenseData?: LicenseDataType;
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
  const storedLicenseData = licenseConfig?.value?.data as LicenseDataType | undefined;
  // 过期即视为未授权：DB 里的快照不会因到期自动清除，若原样返回，调用方（isPlus、功能开关、
  // 前端展示）会把已到期的商业版授权当成有效。这里统一过滤，语义与 pro 的验签校验一致。
  const licenseData =
    storedLicenseData && !isLicenseExpired(storedLicenseData) ? storedLicenseData : undefined;

  const fastgptConfigTime = fastgptConfig?.createTime.getTime().toString();
  const licenseConfigTime = licenseConfig?.createTime.getTime().toString();
  // 利用配置文件的创建时间（更新时间）来做缓存，如果前端命中缓存，则不需要再返回配置文件
  global.systemInitBufferId = fastgptConfigTime
    ? `${fastgptConfigTime}-${licenseConfigTime}`
    : undefined;

  return {
    fastgptConfig: config as FastGPTConfigFileType,
    licenseData
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
