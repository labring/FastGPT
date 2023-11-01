import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { UserType } from '@fastgpt/global/support/user/type';
import { getTeamInfoByUIdAndTmbId } from './team/controller';

export async function getUserDetail(userId: string, tmbId?: string): Promise<UserType> {
  const [user, team] = await Promise.all([
    MongoUser.findById(userId),
    getTeamInfoByUIdAndTmbId(userId, tmbId)
  ]);

  if (!user) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  return {
    _id: user._id,
    username: user.username,
    avatar: user.avatar,
    balance: user.balance,
    timezone: user.timezone,
    promotionRate: user.promotionRate,
    openaiAccount: user.openaiAccount,
    team
  };
}
