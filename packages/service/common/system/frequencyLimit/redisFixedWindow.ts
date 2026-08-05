import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import {
  fixedWindowRateLimitCache,
  type FixedWindowRateLimitCache
} from '@fastgpt/dal/redis/caches';
import { RedisInvalidArgumentError } from '@fastgpt/dal/redis';
import { getLogger, LogCategories } from '../../logger';

export const FREQUENCY_LIMIT_KEY_PREFIX = 'frequency-limit';

export type RedisFrequencyLimitGroup =
  | 'ip'
  | 'account-verification'
  | 'enterprise-auth'
  | 'out-link'
  | 'upload'
  | 'member';

type FixedWindowQpmLimitParams = {
  key: string;
  limit: number;
  seconds?: number;
  increment?: number;
};

const logger = getLogger(LogCategories.INFRA.REDIS);

const consumeFixedWindowQpmLimit = async ({
  cache,
  key,
  limit,
  seconds = 60,
  increment = 1
}: FixedWindowQpmLimitParams & {
  cache: Pick<FixedWindowRateLimitCache, 'consume'>;
}) =>
  (
    await cache.consume({
      key,
      limit,
      windowSeconds: seconds,
      increment
    })
  ).allowed;

/**
 * 基于 Redis 固定窗口创建轻量 QPM 限流检查器。
 *
 * Redis 执行故障时失败关闭，非法参数继续抛出，避免把配置错误伪装成普通限流。
 */
export const createFixedWindowQpmLimitChecker =
  ({
    cache = fixedWindowRateLimitCache
  }: {
    cache?: Pick<FixedWindowRateLimitCache, 'consume'>;
  } = {}) =>
  async (params: FixedWindowQpmLimitParams) => {
    try {
      return await consumeFixedWindowQpmLimit({ cache, ...params });
    } catch (error) {
      if (error instanceof RedisInvalidArgumentError) throw error;

      logger.error('Fixed window rate limit failed closed', { key: params.key, error });
      return false;
    }
  };

export const checkFixedWindowQpmLimit = createFixedWindowQpmLimitChecker();

/**
 * 使用统一业务前缀执行 Redis 固定窗口限流。
 *
 * Redis 故障时保持历史 Mongo 限流的故障放行语义，避免迁移期间阻断现有业务；
 * 非法参数属于配置错误，仍然向上抛出。
 */
export const checkRedisFrequencyLimit = async ({
  group,
  id,
  limit,
  seconds,
  increment = 1
}: {
  group: RedisFrequencyLimitGroup;
  id: string;
  limit: number;
  seconds: number;
  increment?: number;
}) => {
  const key = `${FREQUENCY_LIMIT_KEY_PREFIX}:${group}:${id}`;

  try {
    return await consumeFixedWindowQpmLimit({
      cache: fixedWindowRateLimitCache,
      key,
      limit,
      seconds,
      increment
    });
  } catch (error) {
    if (error instanceof RedisInvalidArgumentError) throw error;

    logger.error('Failed to update Redis frequency limit', { key, error });
    return true;
  }
};

/** 执行统一 Redis 限流，并在超过窗口额度时抛出兼容的业务错误。 */
export const assertRedisFrequencyLimit = async (
  params: Parameters<typeof checkRedisFrequencyLimit>[0]
) => {
  if (!(await checkRedisFrequencyLimit(params))) {
    throw ERROR_ENUM.tooManyRequest;
  }
};

/** 统一按接口标识和客户端 IP 执行 Redis 固定窗口限流。 */
export const checkIPFrequencyLimit = ({
  id,
  ip,
  limit,
  seconds
}: {
  id: string;
  ip: string;
  limit: number;
  seconds: number;
}) =>
  checkRedisFrequencyLimit({
    group: 'ip',
    id: `${id}:${ip}`,
    limit,
    seconds
  });
