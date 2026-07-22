import { withTimeout } from '@fastgpt/global/common/system/utils';
import { redisCapabilities, type RedisStringCapability } from '../capability';
import { asRedisLogicalKey } from '../runtime/keyspace';
import { getLogger, LogCategories } from '../../logger';

const TEAM_VECTOR_COUNT_CACHE_TTL_MS = 30 * 60 * 1000;
const TEAM_VECTOR_CACHE_OPERATION_TIMEOUT_MS = 3000;

type TeamVectorCountStoreLogger = {
  warn: (message: string, metadata: Record<string, unknown>) => void;
};

type TeamVectorCountStoreDependencies = {
  stringStore?: Pick<RedisStringCapability, 'delete' | 'get' | 'set'>;
  logger?: TeamVectorCountStoreLogger;
};

/**
 * 创建团队向量数量缓存。
 *
 * 所有 Redis 操作都有独立 3 秒 deadline；读取失败按 miss 回源，写入和失效失败只记录
 * 日志。Store 不重试非幂等操作，也不在业务层叠加 legacy cache helper 的通用重试。
 */
export const createTeamVectorCountStore = ({
  stringStore = redisCapabilities.string,
  logger = getLogger(LogCategories.INFRA.REDIS)
}: TeamVectorCountStoreDependencies = {}) => {
  const getKey = (teamId: string) => asRedisLogicalKey(`cache:team_vector_count:${teamId}`);

  const runOperation = async <T>({
    teamId,
    operation,
    warnMessage,
    action
  }: {
    teamId: string;
    operation: string;
    warnMessage: string;
    action: () => Promise<T>;
  }) => {
    try {
      return await withTimeout(
        action(),
        TEAM_VECTOR_CACHE_OPERATION_TIMEOUT_MS,
        `${operation} timed out after ${TEAM_VECTOR_CACHE_OPERATION_TIMEOUT_MS}ms`
      );
    } catch (error) {
      logger.warn(warnMessage, { teamId, error });
      return undefined;
    }
  };

  return {
    /** 读取团队向量数量；miss、错误和超时统一返回 undefined 触发 VectorDB 回源。 */
    get: async (teamId: string) => {
      const count = await runOperation({
        teamId,
        operation: 'Get team vector count cache',
        warnMessage: 'Failed to get team vector count cache',
        action: () => stringStore.get(getKey(teamId))
      });
      return count ? Number(count) : undefined;
    },
    /** best-effort 写入缓存；调用方无需等待该结果才能返回 VectorDB 主结果。 */
    set: async ({ teamId, count }: { teamId: string; count: number }) => {
      await runOperation({
        teamId,
        operation: 'Set team vector count cache',
        warnMessage: 'Failed to set team vector count cache',
        action: () =>
          stringStore.set({
            key: getKey(teamId),
            value: String(count),
            ttlMs: TEAM_VECTOR_COUNT_CACHE_TTL_MS
          })
      });
    },
    /** best-effort 失效缓存；Redis 故障不得覆盖 VectorDB 写入或删除结果。 */
    invalidate: async (teamId: string) => {
      await runOperation({
        teamId,
        operation: 'Invalidate team vector count cache',
        warnMessage: 'Failed to invalidate team vector count cache',
        action: () => stringStore.delete(getKey(teamId))
      });
    }
  };
};

export const teamVectorCountStore = createTeamVectorCountStore();
