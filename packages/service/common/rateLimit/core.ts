import { RedisInvalidArgumentError } from '@fastgpt/dal/redis';
import { rateLimitCache } from '@fastgpt/dal/redis/caches';
import { createRedisLogicalKey } from '@fastgpt/dal/redis/runtime';
import { getLogger, LogCategories } from '../logger';
import type { RateLimitInterface, RateLimitInterfaceDefinition } from './type';

export const RATE_LIMIT_KEY_PREFIX = 'rate-limit';

const logger = getLogger(LogCategories.INFRA.REDIS);

/**
 * 创建统一的场景限流接口。
 *
 * definition 持有 key、额度和故障策略，调用方只能提交业务输入，不能直接传 Redis key。
 */
export const defineRateLimitInterface = <TInput>(
  definition: RateLimitInterfaceDefinition<TInput>
): RateLimitInterface<TInput> => {
  const getKey = (input: TInput) => {
    const policy =
      typeof definition.policy === 'function' ? definition.policy(input) : definition.policy;

    return createRedisLogicalKey({
      namespace: RATE_LIMIT_KEY_PREFIX,
      segments: [definition.scene, policy, ...definition.getKeySegments(input)]
    });
  };

  const consume: RateLimitInterface<TInput>['consume'] = (input) =>
    rateLimitCache.consume({
      key: getKey(input),
      limit: definition.getLimit(input),
      windowSeconds: definition.getWindowSeconds(input),
      increment: definition.getIncrement?.(input) ?? 1
    });

  const check: RateLimitInterface<TInput>['check'] = async (input) => {
    try {
      return (await consume(input)).allowed;
    } catch (error) {
      if (error instanceof RedisInvalidArgumentError) throw error;

      logger.error('Rate limit execution failed', {
        key: getKey(input),
        failureMode: definition.failureMode,
        error
      });
      return definition.failureMode === 'open';
    }
  };

  const assert: RateLimitInterface<TInput>['assert'] = async (input) => {
    if (!(await check(input))) {
      throw definition.createError(input);
    }
  };

  return { consume, check, assert };
};
