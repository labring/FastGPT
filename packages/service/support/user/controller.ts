import { type UserType } from '@fastgpt/global/support/user/type';
import { MongoUser } from './schema';
import { getTmbInfoByTmbId } from './team/controller';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { getUserFallbackTeam } from './team/fallback';
import { hasStoredPassword } from '@fastgpt/global/support/user/utils';

export async function authUserExist({ userId, username }: { userId?: string; username?: string }) {
  if (userId) {
    return MongoUser.findOne({ _id: userId });
  }
  if (username) {
    return MongoUser.findOne({ username });
  }
  return null;
}

/**
 * 加载用户及团队详情。登录恢复可显式允许注销中的团队作为 fallback，便于用户进入等待页取消注销。
 */
export async function getUserDetail({
  tmbId,
  userId,
  isRoot = false,
  allowAccountCancellationTeamFallback = false
}: {
  tmbId?: string;
  userId?: string;
  isRoot?: boolean;
  allowAccountCancellationTeamFallback?: boolean;
}): Promise<UserType> {
  const tmb = await (async () => {
    if (tmbId) {
      try {
        const result = await getTmbInfoByTmbId({ tmbId });
        return result;
      } catch {}
    }
    if (userId) {
      const fallback = await getUserFallbackTeam({
        userId,
        allowAccountCancellationTeam: allowAccountCancellationTeamFallback
      });
      if (fallback) return getTmbInfoByTmbId({ tmbId: fallback.tmbId });
    }
    return Promise.reject(ERROR_ENUM.unAuthorization);
  })();
  const user = await MongoUser.findById(tmb.userId).select('+password');

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
    tags: user.tags,
    hasPassword: hasStoredPassword(user.password)
  };
}
