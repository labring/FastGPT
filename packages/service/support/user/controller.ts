import { type UserType } from '@fastgpt/global/support/user/type';
import { userRepository } from '../../common/dal';
import { getTmbInfoByTmbId, getUserDefaultTeam } from './team/controller';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';

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
      return getUserDefaultTeam({ userId });
    }
    return Promise.reject(ERROR_ENUM.unAuthorization);
  })();
  const user = await userRepository.findById(String(tmb.userId));

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
