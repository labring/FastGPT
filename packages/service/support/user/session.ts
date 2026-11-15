import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getLogger, LogCategories } from '../../common/logger';
import { serviceEnv } from '../../env';
import { SessionCache, type SessionData } from '@fastgpt/dal/redis/caches';
import { SessionTokenCache } from '@fastgpt/dal/redis/caches/sessionToken';
import { UserSessionTokenService } from './session/service';
import type {
  IssuedSessionCredentials,
  SessionLifecycle
} from '@fastgpt/global/support/user/session/type';
import { SESSION_REFRESH_TTL_SECONDS } from '@fastgpt/global/support/user/session/constants';
import { SessionErrEnum } from '@fastgpt/global/common/error/code/session';

const logger = getLogger(LogCategories.MODULE.USER.ACCOUNT);
type SessionType = SessionData;

const sessionCache = new SessionCache({ logger });
export const sessionTokenCache = new SessionTokenCache();
export const userSessionTokenService = new UserSessionTokenService({
  cache: sessionTokenCache,
  secret: serviceEnv.AES256_SECRET_KEY,
  policy: {
    accessTtlSeconds: serviceEnv.AUTH_ACCESS_TTL_SECONDS,
    refreshTtlSeconds: serviceEnv.AUTH_REFRESH_TTL_SECONDS,
    absoluteTtlSeconds: serviceEnv.AUTH_SESSION_ABSOLUTE_TTL_SECONDS
  }
});

/** 兼容期合并两代设备会话，刷新辅助 Key 不计入登录数量。 */
const listUserSessions = async (userId: string) => [
  ...(await sessionCache.listByUser(String(userId))),
  ...(await sessionTokenCache.listByUser(String(userId)))
];

export const delUserAllSession = async (userId: string, whiteList?: (string | undefined)[]) => {
  const sessions = await listUserSessions(userId);
  const whiteListSet = new Set(whiteList?.filter((item): item is string => Boolean(item)));
  const sessionIds = sessions
    .filter(({ sessionId }) => !whiteListSet.has(sessionId))
    .map(({ sessionId }) => sessionId);

  await Promise.all(sessionIds.map(delUserSession));
};

export const getUserSessionCount = async (userId: string) => {
  const sessions = await listUserSessions(userId);
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
    const sessions = await listUserSessions(userId);
    if (sessions.length <= maxSession) return;

    // 删除最早创建的会话；损坏记录已由 Cache 在读取时处理。
    sessions.sort((a, b) => a.data.createdAt - b.data.createdAt);
    const redundantSessionIds = sessions
      .slice(0, sessions.length - maxSession)
      .map(({ sessionId }) => sessionId);
    await Promise.all(redundantSessionIds.map(delUserSession));
  } catch (error) {
    logger.warn('Failed to remove redundant sessions', { userId, error });
  }
};

/** 创建会话；调用方必须显式传入账号的 root 身份，避免重签会话时静默丢失管理员权限。 */
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
  isRoot: boolean;
  ip?: string | null;
}): Promise<IssuedSessionCredentials> => {
  if (serviceEnv.AUTH_DUAL_TOKEN_ENABLED) {
    const credentials = await userSessionTokenService.create({
      userId: String(userId),
      teamId: String(teamId),
      tmbId: String(tmbId),
      isRoot,
      ip
    });
    void delRedundantSession(userId);
    return credentials;
  }
  const key = `${String(userId)}:${getNanoid(32)}`;

  await sessionCache.set({
    sessionId: key,
    data: {
      userId: String(userId),
      teamId: String(teamId),
      tmbId: String(tmbId),
      isRoot,
      createdAt: new Date().getTime(),
      ip
    }
  });

  void delRedundantSession(userId);

  return { token: key };
};

/** 普通请求只接受 Access 或历史单 Token，返回稳定会话身份及公开生命周期。 */
export const authUserSession = async (
  key: string
): Promise<SessionType & { sessionId: string; session?: SessionLifecycle }> => {
  if (key.startsWith('at.')) {
    const data = await userSessionTokenService.auth(key);
    return {
      ...data,
      session: userSessionTokenService.lifecycle(data.sessionId, {
        ...data,
        generation: data.accessGeneration,
        accessExpiresAt: data.authenticatedAccessExpiresAt
      })
    };
  }
  const data = await sessionCache.get(key);
  if (!data) return Promise.reject(ERROR_ENUM.unAuthorization);
  return { ...data, sessionId: key };
};

/** 删除单个登录会话，供团队切换等场景替换旧令牌时清理无用会话。 */
export const delUserSession = async (sessionId?: string) => {
  if (!sessionId) return;
  await Promise.all([sessionCache.delete(sessionId), sessionTokenCache.delete(sessionId)]);
};

/**
 * 认证后的改密 / 切团队复用稳定新会话；历史登录只重签剩余期限的旧凭证，不提升 RT 资格。
 * 调用方需持有用户锁并先验证当前会话与目标成员，避免跨数据库安全操作交错。
 */
export const rekeyUserSession = async ({
  sessionId,
  teamId,
  tmbId
}: {
  sessionId: string;
  teamId?: string;
  tmbId?: string;
}): Promise<IssuedSessionCredentials> => {
  if (await sessionTokenCache.get(sessionId))
    return userSessionTokenService.rekey({ sessionId, teamId, tmbId });
  const legacy = await sessionCache.get(sessionId);
  const remainingSeconds = legacy
    ? Math.ceil((legacy.createdAt + SESSION_REFRESH_TTL_SECONDS * 1000 - Date.now()) / 1000)
    : 0;
  if (!legacy || remainingSeconds <= 0) throw new Error(SessionErrEnum.revoked);
  const token = `${legacy.userId}:${getNanoid(32)}`;
  await sessionCache.set({
    sessionId: token,
    data: { ...legacy, teamId: teamId ?? legacy.teamId, tmbId: tmbId ?? legacy.tmbId },
    ttlSeconds: remainingSeconds
  });
  await sessionCache.delete(sessionId);
  return { token };
};
