import { type UserType } from '@fastgpt/global/support/user/type';
import { MongoUser } from './schema';
import { getTmbInfoByTmbId } from './team/controller';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { getUserFallbackTeam } from './team/fallback';

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
  userId,
  isRoot = false
}: {
  tmbId?: string;
  userId?: string;
  isRoot?: boolean;
}): Promise<UserType> {
  const tmb = await (async () => {
    if (tmbId) {
      try {
        const result = await getTmbInfoByTmbId({ tmbId });
        return result;
      } catch (error) {}
    }
    if (userId) {
      const fallback = await getUserFallbackTeam({ userId });
      if (fallback) return getTmbInfoByTmbId({ tmbId: fallback.tmbId });
    }
    return Promise.reject(ERROR_ENUM.unAuthorization);
  })();
  const user = await MongoUser.findById(tmb.userId);

  if (!user) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  const permission = isRoot ? new TeamPermission({ isOwner: true }) : tmb.permission;
  const team = {
    ...tmb,
    permission
  };

  return {
    _id: user._id,
    username: user.username,
    avatar: tmb.avatar,
    timezone: user.timezone,
    promotionRate: user.promotionRate,
    team,
    permission,
    contact: user.contact,
    language: user.language,
    tags: user.tags
  };
}
