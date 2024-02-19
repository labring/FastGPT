import { UserType } from '@fastgpt/global/support/user/type';
import { MongoUser } from './schema';
import { authTeamSurplusAiPoints, getTmbInfoByTmbId, getUserDefaultTeam } from './team/controller';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { MongoTeamMember } from './team/teamMemberSchema';

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

export async function getUserChatInfoAndAuthTeamPoints({
  teamId,
  userId,
  tmbId
}: {
  teamId?: string;
  userId?: string;
  tmbId?: string;
}) {
  if (tmbId) {
    const tmb = await MongoTeamMember.findById(tmbId, 'teamId userId');
    if (!tmb) return Promise.reject(UserErrEnum.unAuthUser);

    const [user] = await Promise.all([
      MongoUser.findById(tmb.userId, 'timezone openaiAccount'),
      authTeamSurplusAiPoints(tmb.teamId)
    ]);

    if (!user) {
      return Promise.reject(UserErrEnum.unAuthUser);
    }

    return user;
  } else if (teamId && userId) {
    const [user] = await Promise.all([
      MongoUser.findById(userId, 'timezone openaiAccount'),
      authTeamSurplusAiPoints(teamId)
    ]);

    if (!user) {
      return Promise.reject(UserErrEnum.unAuthUser);
    }

    return user;
  }

  return Promise.reject(UserErrEnum.unAuthUser);
}
