import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { UserType } from '@fastgpt/global/support/user/type';
import { getTeamInfoByTmbId } from '@fastgpt/service/support/user/team/controller';

export async function getUserDetail({
  tmbId,
  userId
}: {
  tmbId?: string;
  userId?: string;
}): Promise<UserType> {
  const team = await getTeamInfoByTmbId({ tmbId, userId });
  const user = await MongoUser.findById(team.userId);

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
