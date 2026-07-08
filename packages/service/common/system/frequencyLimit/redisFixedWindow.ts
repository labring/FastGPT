import { getGlobalRedisConnection } from '../../redis';

/**
 * 基于 Redis 固定窗口的轻量 QPM 限流。
 *
 * 该 helper 只负责窗口内计数并返回是否允许继续执行，不绑定任何业务错误码。
 * 调用方需要根据自身语义决定超限后的错误响应。
 */
export const checkFixedWindowQpmLimit = async ({
  key,
  limit,
  seconds = 60
}: {
  key: string;
  limit: number;
  seconds?: number;
}) => {
  const redis = getGlobalRedisConnection();
  const result = await redis.multi().incr(key).expire(key, seconds, 'NX').exec();
  const currentCount = Number(result?.[0]?.[1] ?? 0);

  return currentCount <= limit;
};
