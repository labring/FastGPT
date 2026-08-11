import { type UserType } from '@fastgpt/global/support/user/type';
import { userDefaultFieldValues } from '@fastgpt/dal';
import { MongoUser } from './schema';
import { userRepository } from '../../common/dal';
import { getTmbInfoByTmbId, getUserDefaultTeam } from './team/controller';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import type { ClientSession } from '../../common/mongo';

export async function authUserExist({ userId, username }: { userId?: string; username?: string }) {
  if (userId) {
    return userRepository.findById(userId);
  }
  if (username) {
    return userRepository.findByUsername(username);
  }
  return null;
}

export async function getUserDetail({
  tmbId,
  userId,
  isRoot = false,
  session
}: {
  tmbId?: string;
  userId?: string;
  isRoot?: boolean;
  session?: ClientSession;
}): Promise<UserType> {
  const tmb = await (async () => {
    if (tmbId) {
      try {
        const result = await getTmbInfoByTmbId({ tmbId, session });
        return result;
      } catch (error) {}
    }
    if (userId) {
      return getUserDefaultTeam({ userId, session });
    }
    return Promise.reject(ERROR_ENUM.unAuthorization);
  })();
  const user = await (async () => {
    if (!session) {
      return userRepository.findById(String(tmb.userId));
    }

    // 登录事务仍使用旧 ClientSession；相关集合全部迁入 DAL 后再删除该兼容分支。
    const document = await MongoUser.findById(tmb.userId).session(session);
    if (!document) return null;
    return {
      id: String(document._id),
      username: document.username,
      timezone: document.timezone ?? userDefaultFieldValues.timezone,
      promotionRate: document.promotionRate ?? userDefaultFieldValues.promotionRate,
      contact: document.contact ?? undefined,
      language: document.language ?? userDefaultFieldValues.language,
      tags: document.tags ?? userDefaultFieldValues.tags
    };
  })();

  if (!user) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  const permission = isRoot ? new TeamPermission({ isOwner: true }) : tmb.permission;
  const team = {
    ...tmb,
    permission
  };

  return {
    _id: user.id,
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
