import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getLogger, LogCategories } from '../../common/logger';
import { serviceEnv } from '../../env';
import { SessionCache, type SessionData } from '@fastgpt/dal/redis/caches';

const logger = getLogger(LogCategories.MODULE.USER.ACCOUNT);
type SessionType = SessionData;

const sessionCache = new SessionCache({ logger });

export const delUserAllSession = async (userId: string, whiteList?: (string | undefined)[]) => {
  const sessions = await sessionCache.listByUser(String(userId));
  const whiteListSet = new Set(whiteList?.filter((item): item is string => Boolean(item)));
  const sessionIds = sessions
    .filter(({ sessionId }) => !whiteListSet.has(sessionId))
    .map(({ sessionId }) => sessionId);

  await sessionCache.deleteMany(sessionIds);
};

export const getUserSessionCount = async (userId: string) => {
  const sessions = await sessionCache.listByUser(String(userId));
  return sessions.length;
};

// 会根据创建时间，删除超出客户端登录限制的 session
const delRedundantSession = async (userId: string) => {
  // 至少为 1，默认为 10
  let maxSession = serviceEnv.MAX_LOGIN_SESSION;
  if (maxSession < 1) {
    maxSession = 1;
  }

  try {
    const sessions = await sessionCache.listByUser(String(userId));
    if (sessions.length <= maxSession) return;

    // 删除最早创建的会话；损坏记录已由 Cache 在读取时处理。
    sessions.sort((a, b) => a.data.createdAt - b.data.createdAt);
    const redundantSessionIds = sessions
      .slice(0, sessions.length - maxSession)
      .map(({ sessionId }) => sessionId);
    await sessionCache.deleteMany(redundantSessionIds);
  } catch (error) {
    logger.warn('Failed to remove redundant sessions', { userId, error });
  }
};

export const createUserSession = async ({
  userId,
  teamId,
  tmbId,
  isRoot,
  ip
}: {
  userId: string;
  teamId: string;
  tmbId: string;
  isRoot?: boolean;
  ip?: string | null;
}) => {
  const key = `${String(userId)}:${getNanoid(32)}`;

  await sessionCache.set({
    sessionId: key,
    data: {
      userId: String(userId),
      teamId: String(teamId),
      tmbId: String(tmbId),
      isRoot: isRoot ?? false,
      createdAt: new Date().getTime(),
      ip
    }
  });

  void delRedundantSession(userId);

  return key;
};

export const authUserSession = async (key: string): Promise<SessionType> => {
  const data = await sessionCache.get(key);
  if (!data) return Promise.reject(ERROR_ENUM.unAuthorization);
  return data;
};
