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
  // 快照原样返回（含已到期的）：过期属于「状态」而非「数据不存在」，
  // 过滤掉会让界面无法区分「从未激活」与「已到期」。
  // 是否按商业版启用由调用方用 getLicenseStatus / isLicenseActive 判定。
  const licenseData = licenseConfig?.value?.data as LicenseDataType | undefined;

  const fastgptConfigTime = fastgptConfig?.createTime.getTime().toString();
  const licenseConfigTime = licenseConfig?.createTime.getTime().toString();
  // 仅当全局尚未生成过实例配置版本的 bufferId 时，才做旧格式兜底；
  // 避免在 initSystemConfig 并行加载中用旧配置时间戳覆写最新的实例版本号
  if (!global.systemInitBufferId) {
    global.systemInitBufferId = fastgptConfigTime
      ? `${fastgptConfigTime}-${licenseConfigTime}`
      : undefined;
  }

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
