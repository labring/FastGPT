import { AuthFrequencyLimitProps } from '@fastgpt/global/common/frequenctLimit/type';
import { POST } from '@fastgpt/service/common/api/plusRequest';

export const authFrequencyLimit = (data: AuthFrequencyLimitProps) => {
  if (!global.feConfigs.isPlus) return;

  return POST('/common/freequencyLimit/auth', data);
};
