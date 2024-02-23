import { UserType } from '@fastgpt/global/support/user/type';
import { MongoUser } from './schema';
import { getTmbInfoByTmbId, getUserDefaultTeam } from './team/controller';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';

export async function authUserExist({ userId, username }: { userId?: string; username?: string }) {
  if (userId) {
    return MongoUser.findOne({ _id: userId });
  }
  if (username) {
    return MongoUser.findOne({ username });
  }
  return null;
}

export async function getUserDetail({
  tmbId,
  userId
}: {
  tmbId?: string;
  userId?: string;
}): Promise<UserType> {
  const tmb = await (async () => {
    if (tmbId) {
      return getTmbInfoByTmbId({ tmbId });
    }
    if (userId) {
      return getUserDefaultTeam({ userId });
    }
    return Promise.reject(ERROR_ENUM.unAuthorization);
  })();
  const user = await MongoUser.findById(tmb.userId);

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
    team: tmb
  };
}

export async function getUserAndAuthBalance({
  tmbId,
  minBalance
}: {
  tmbId: string;
  minBalance?: number;
}) {
  const user = await getUserDetail({ tmbId });

  if (!user) {
    return Promise.reject(UserErrEnum.unAuthUser);
  }
  if (minBalance !== undefined && user.team.balance < minBalance) {
    return Promise.reject(UserErrEnum.balanceNotEnough);
  }

  return user;
}
