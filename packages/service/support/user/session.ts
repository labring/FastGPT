import { retryFn } from '@fastgpt/global/common/system/utils';
import { getAllKeysByPrefix, getGlobalRedisConnection } from '../../common/redis';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getLogger, LogCategories } from '../../common/logger';
import { serviceEnv } from '../../env';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { MongoTeamMember } from './team/teamMemberSchema';
import { MongoTeam } from './team/teamSchema';
import { getUserFallbackTeam } from './team/fallback';

const logger = getLogger(LogCategories.MODULE.USER.ACCOUNT);

const redisPrefix = 'session:';
const getSessionKey = (key: string) => `${redisPrefix}${key}`;

type SessionType = {
  userId: string;
  teamId: string;
  tmbId: string;
  isRoot?: boolean;
  createdAt: number;
  ip?: string | null;
};

export type UserSessionTeamFallback = {
  teamId: string;
  tmbId: string;
};

/**
 * 校验 Session 当前 team/tmb 是否仍有效；团队删除或成员关系失效时，原地迁移到共享 fallback。
 * 原地更新保留 Session 的过期时间和其它字段，避免旧 Cookie 在下一次请求继续携带已删除上下文。
 */
export const resolveUserSessionTeam = async ({
  userId,
  teamId,
  tmbId,
  sessionId
}: {
  userId: string;
  teamId: string;
  tmbId: string;
  sessionId?: string;
}): Promise<UserSessionTeamFallback> => {
  const [member, team] = await Promise.all([
    MongoTeamMember.findOne(
      {
        _id: tmbId,
        teamId,
        userId,
        status: TeamMemberStatusEnum.active
      },
      { _id: 1 }
    ).lean(),
    MongoTeam.findOne(
      {
        _id: teamId,
        $or: [{ deleteTime: { $exists: false } }, { deleteTime: null }]
      },
      { _id: 1 }
    ).lean()
  ]);

  if (member && team) return { teamId: String(teamId), tmbId: String(tmbId) };

  const fallback = await getUserFallbackTeam({ userId, excludedTeamId: teamId });
  if (!fallback || !sessionId) {
    if (sessionId) await delSession(sessionId);
    throw new Error(ERROR_ENUM.unAuthorization);
  }

  const redis = getGlobalRedisConnection();
  await redis.hmset(getSessionKey(sessionId), {
    teamId: String(fallback.teamId),
    tmbId: String(fallback.tmbId)
  });
  return fallback;
};

/* Session manager */
const setSession = async ({
  key,
  data,
  expireSeconds
}: {
  key: string;
  data: SessionType;
  expireSeconds: number;
}) => {
  return await retryFn(async () => {
    try {
      const redis = getGlobalRedisConnection();
      const formatKey = getSessionKey(key);

      // 使用 hmset 存储对象字段
      await redis.hmset(formatKey, {
        userId: data.userId,
        teamId: data.teamId,
        tmbId: data.tmbId,
        isRoot: data.isRoot ? '1' : '0',
        createdAt: data.createdAt.toString(),
        ip: data.ip
      });

      // 设置过期时间
      if (expireSeconds) {
        await redis.expire(formatKey, expireSeconds);
      }
    } catch (error) {
      logger.error('Failed to set session', { error });
      return Promise.reject(error);
    }
  });
};

const delSession = (key: string) => {
  const redis = getGlobalRedisConnection();
  retryFn(() => redis.del(getSessionKey(key)));
};

const getSession = async (key: string): Promise<SessionType> => {
  const formatKey = getSessionKey(key);
  const redis = getGlobalRedisConnection();

  // 使用 hgetall 获取所有字段
  const data = await retryFn(() => redis.hgetall(formatKey));

  if (!data || Object.keys(data).length === 0) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  try {
    return {
      userId: data.userId,
      teamId: data.teamId,
      tmbId: data.tmbId,
      isRoot: data.isRoot === '1',
      createdAt: parseInt(data.createdAt),
      ip: data.ip
    };
  } catch (error) {
    logger.error('Failed to parse session', { error });
    delSession(formatKey);
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }
};
export const delUserAllSession = async (userId: string, whiteList?: (string | undefined)[]) => {
  const formatWhiteList = whiteList?.map((item) => item && getSessionKey(item));
  const redis = getGlobalRedisConnection();
  const keys = (await getAllKeysByPrefix(`${redisPrefix}${String(userId)}`)).filter(
    (item) => !formatWhiteList?.includes(item)
  );

  if (keys.length > 0) {
    await redis.del(keys);
  }
};

export const getUserSessionCount = async (userId: string) => {
  const redis = getGlobalRedisConnection();
  const keys = await getAllKeysByPrefix(`${redisPrefix}${String(userId)}`);
  return keys.length;
};

/**
 * 仅处理指向已删除团队的会话。找到 fallback 时更新这部分会话，找不到时删除它们，
 * 这样成员在其它团队的会话不会因为某一个团队被删除而失效。
 */
export const migrateUserSessionsFromTeam = async ({
  userId,
  deletedTeamId,
  fallback
}: {
  userId: string;
  deletedTeamId: string;
  fallback?: UserSessionTeamFallback;
}) => {
  const redis = getGlobalRedisConnection();
  const keys = await getAllKeysByPrefix(`${redisPrefix}${String(userId)}`);
  const deletedTeam = String(deletedTeamId);
  const affectedKeys: string[] = [];

  await Promise.all(
    keys.map(async (key) => {
      const data = await redis.hgetall(key);
      if (!data || data.teamId !== deletedTeam) return;
      affectedKeys.push(key);

      if (fallback) {
        await redis.hmset(key, {
          teamId: String(fallback.teamId),
          tmbId: String(fallback.tmbId)
        });
      }
    })
  );

  if (!fallback && affectedKeys.length > 0) {
    await redis.del(affectedKeys);
  }

  return { affectedCount: affectedKeys.length };
};

// 会根据创建时间，删除超出客户端登录限制的 session
const delRedundantSession = async (userId: string) => {
  // 至少为 1，默认为 10
  let maxSession = serviceEnv.MAX_LOGIN_SESSION;
  if (maxSession < 1) {
    maxSession = 1;
  }

  const redis = getGlobalRedisConnection();
  const keys = await getAllKeysByPrefix(`${redisPrefix}${userId}`);

  if (keys.length <= maxSession) {
    return;
  }

  // 获取所有会话的创建时间
  const sessionList = await Promise.all(
    keys.map(async (key) => {
      try {
        const data = await redis.hgetall(key);
        if (!data || Object.keys(data).length === 0) return null;

        return {
          key,
          createdAt: parseInt(data.createdAt)
        };
      } catch (error) {
        return null;
      }
    })
  );

  // 过滤掉无效数据并按创建时间排序
  const validSessions = sessionList.filter(Boolean) as { key: string; createdAt: number }[];

  validSessions.sort((a, b) => a.createdAt - b.createdAt);

  // 删除最早创建的会话
  const delKeys = validSessions.slice(0, validSessions.length - maxSession).map((item) => item.key);

  if (delKeys.length > 0) {
    await redis.del(delKeys);
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

  await setSession({
    key,
    data: {
      userId: String(userId),
      teamId: String(teamId),
      tmbId: String(tmbId),
      isRoot,
      createdAt: new Date().getTime(),
      ip
    },
    expireSeconds: 7 * 24 * 60 * 60
  });

  delRedundantSession(userId);

  return key;
};

export const authUserSession = async (key: string): Promise<SessionType> => {
  const data = await getSession(key);
  return data;
};
