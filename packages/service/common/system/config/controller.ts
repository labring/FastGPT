import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { MongoSystemConfigs } from './schema';
import { FastGPTConfigFileType } from '@fastgpt/global/common/system/types';
import { FastGPTProUrl } from '../constants';

export const getFastGPTConfigFromDB = async () => {
  if (!FastGPTProUrl) {
    return {
      config: {} as FastGPTConfigFileType,
      configId: undefined
    };
  }

  const res = await MongoSystemConfigs.findOne({
    type: SystemConfigsTypeEnum.fastgpt
  }).sort({
    createTime: -1
  });

  const config = res?.value || {};

  return {
    configId: res ? String(res._id) : undefined,
    config: config as FastGPTConfigFileType
  };
};
