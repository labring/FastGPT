import {
  fixedWindowRateLimitRepository,
  type FixedWindowRateLimitRepository
} from '@fastgpt/dal/redis/repositories';
import { RedisInvalidArgumentError } from '@fastgpt/dal/redis';
import { getLogger, LogCategories } from '../../logger';

const logger = getLogger(LogCategories.INFRA.REDIS);

/**
 * 基于 Redis 固定窗口的轻量 QPM 限流。
 *
 * 该 helper 只负责窗口内计数并返回是否允许继续执行，不绑定任何业务错误码。
 * 调用方需要根据自身语义决定超限后的错误响应。
 */
export const createFixedWindowQpmLimitChecker =
  ({
    repository = fixedWindowRateLimitRepository
  }: {
    repository?: Pick<FixedWindowRateLimitRepository, 'consume'>;
  } = {}) =>
  async ({ key, limit, seconds = 60 }: { key: string; limit: number; seconds?: number }) => {
    try {
      return (
        await repository.consume({
          key,
          limit,
          windowSeconds: seconds
        })
      ).allowed;
    } catch (error) {
      if (error instanceof RedisInvalidArgumentError) throw error;

      logger.error('Fixed window rate limit failed closed', { key, error });
      return false;
    }
  };

export const checkFixedWindowQpmLimit = createFixedWindowQpmLimitChecker();
