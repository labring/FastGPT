import { SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { MongoTeamSub } from './schema';

/** 从主库读取团队当前未过期的标准订阅，避免权益校验受从库复制延迟影响。 */
export const findActiveTeamStandardPlans = (teamId: string) =>
  MongoTeamSub.find(
    {
      teamId,
      type: SubTypeEnum.standard,
      expiredTime: { $gt: new Date() }
    },
    undefined,
    { readPreference: 'primary' }
  ).lean();
