import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { MongoSystemConfigs } from './schema';
import { FeConfigsType } from '@fastgpt/global/common/system/types';

export const getFastGPTFeConfig = async () => {
  const res = await MongoSystemConfigs.findOne({
    type: SystemConfigsTypeEnum.fastgpt
  }).sort({
    createTime: -1
  });

  const config: FeConfigsType = res?.value?.FeConfig || {};

  return config;
};
