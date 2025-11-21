import { getGlobalRedisConnection } from '../../common/redis';
import { jsonRes } from '../../common/response';
import type { NextApiResponse } from 'next';

type FrequencyLimitOption = {
  teamId: string;
  seconds: number;
  limit: number;
  keyPrefix: string;
  res: NextApiResponse;
};

export const teamFrequencyLimit = async ({
  teamId,
  seconds,
  limit,
  keyPrefix,
  res
}: FrequencyLimitOption) => {
  const redis = getGlobalRedisConnection();
  const key = `${keyPrefix}:${teamId}`;

  const result = await redis
    .multi()
    .incr(key)
    .expire(key, seconds, 'NX') // 只在key不存在时设置过期时间
    .exec();

  if (!result) {
    return Promise.reject(new Error('Redis connection error'));
  }

  const currentCount = result[0][1] as number;

  if (currentCount > limit) {
    const remainingTime = await redis.ttl(key);
    jsonRes(res, {
      code: 429,
      error: `Rate limit exceeded. Maximum ${limit} requests per ${seconds} seconds for this team. Please try again in ${remainingTime} seconds.`
    });
    return false;
  }

  // 在响应头中添加限流信息
  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - currentCount));
  res.setHeader('X-RateLimit-Reset', Date.now() + seconds * 1000);
  return true;
};
