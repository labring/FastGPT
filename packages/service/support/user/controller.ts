import { type UserType } from '@fastgpt/global/support/user/type';
import { MongoUser } from './schema';
import { getTmbInfoByTmbId } from './team/controller';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import type { ClientSession } from '../../common/mongo';
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

/**
 * 加载用户及团队详情；tmb 失效时回退到用户可用团队。
 * 只有显式传入创建回调的登录流程，才允许在没有可用团队时补建团队。
 */
export async function getUserDetail({
  tmbId,
  userId,
  isRoot = false,
  session,
  createTeamIfUnavailable
}: {
  tmbId?: string;
  userId?: string;
  isRoot?: boolean;
  session?: ClientSession;
  createTeamIfUnavailable?: (params: {
    userId: string;
    session?: ClientSession;
  }) => Promise<string | null | undefined>;
}): Promise<UserType> {
  const tmb = await (async () => {
    if (tmbId) {
      try {
        const result = await getTmbInfoByTmbId({ tmbId, session });
        return result;
      } catch {}
    }
    if (userId) {
      const fallback = await getUserFallbackTeam({
        userId,
        session
      });
      if (fallback) return getTmbInfoByTmbId({ tmbId: fallback.tmbId, session });
    }
    if (userId && createTeamIfUnavailable) {
      const fallbackTmbId = await createTeamIfUnavailable({
        userId: String(userId),
        session
      });
      if (fallbackTmbId) return getTmbInfoByTmbId({ tmbId: fallbackTmbId, session });
    }
    return Promise.reject(ERROR_ENUM.unAuthorization);
  })();
  const query = MongoUser.findById(tmb.userId);
  if (session) query.session(session);
  const user = await query;

  if (!user) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  const permission = isRoot ? new TeamPermission({ isOwner: true }) : tmb.permission;
  const team = {
    ...tmb,
    permission
  };

  return {
    _id: String(user._id),
    username: user.username,
    avatar: tmb.avatar,
    timezone: user.timezone,
    team,
    permission,
    contact: user.contact,
    language: user.language,
    tags: user.tags
  };
}
