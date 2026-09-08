import { verifyLicenseSignature, normalizeLicenseData, isLicenseExpired } from '../license/verify';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { MongoSystemConfigs } from './schema';
import type { FastGPTConfigFileType, LicenseDataType } from '@fastgpt/global/common/system/types';
import { FastGPTProUrl } from '../constants';

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
  // 决策版 §4：DB 只存原始 license 字符串；启动时从原始 license 重新验签，
  // 验签/归一化失败或过期则视为未激活（undefined），不信任落库的解析结果。
  let licenseData: LicenseDataType | undefined;
  const licenseStr = licenseConfig?.value?.license as string | undefined;
  if (licenseStr) {
    try {
      const raw = verifyLicenseSignature(licenseStr);
      const normalized = normalizeLicenseData(raw);
      if (!isLicenseExpired(normalized)) {
        licenseData = normalized;
      }
    } catch (error) {
      licenseData = undefined;
    }
  }

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
