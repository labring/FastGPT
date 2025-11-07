import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { MongoSystemConfigs } from './schema';
import { type FastGPTConfigFileType } from '@fastgpt/global/common/system/types';
import { FastGPTProUrl } from '../constants';
import { type LicenseDataType } from '@fastgpt/global/common/system/types';

export const getFastGPTConfigFromDB = async (): Promise<{
  fastgptConfig: FastGPTConfigFileType;
  licenseData?: LicenseDataType;
  operationalAd?: {
    operationalAdImage: string;
    operationalAdLink: string;
  };
}> => {
  if (!FastGPTProUrl) {
    return {
      fastgptConfig: {} as FastGPTConfigFileType
    };
  }

  const [fastgptConfig, licenseConfig, operationalAdConfig] = await Promise.all([
    MongoSystemConfigs.findOne({
      type: SystemConfigsTypeEnum.fastgpt
    }).sort({
      createTime: -1
    }),
    MongoSystemConfigs.findOne({
      type: SystemConfigsTypeEnum.license
    }).sort({
      createTime: -1
    }),
    MongoSystemConfigs.findOne({
      type: SystemConfigsTypeEnum.operationalAd
    }).sort({
      createTime: -1
    })
  ]);

  const config = fastgptConfig?.value || {};
  const licenseData = licenseConfig?.value?.data as LicenseDataType | undefined;
  const operationalAd = operationalAdConfig?.value as
    | {
        operationalAdImage: string;
        operationalAdLink: string;
      }
    | undefined;

  const fastgptConfigTime = fastgptConfig?.createTime.getTime().toString();
  const licenseConfigTime = licenseConfig?.createTime.getTime().toString();
  const operationalAdConfigTime = operationalAdConfig?.createTime.getTime().toString();
  // 利用配置文件的创建时间（更新时间）来做缓存，如果前端命中缓存，则不需要再返回配置文件
  global.systemInitBufferId = fastgptConfigTime
    ? `${fastgptConfigTime}-${licenseConfigTime}-${operationalAdConfigTime || ''}`
    : undefined;

  return {
    fastgptConfig: config as FastGPTConfigFileType,
    licenseData,
    operationalAd
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
