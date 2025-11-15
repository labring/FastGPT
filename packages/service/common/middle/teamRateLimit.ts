import { type ApiRequestProps } from '../../type/next';
import { type NextApiResponse } from 'next';
import { jsonRes } from '../response';
import { getGlobalRedisConnection } from '../redis';

export interface TeamRateLimitOptions {
  seconds: number;
  limit: number;
  keyPrefix?: string;
}

/**
 * 基于团队ID的Redis限流中间件
 * 注意：这个中间件会在请求认证前执行，所以需要从请求中提取团队ID
 * @param options 限流配置
 * @returns 中间件函数
 * @example
 * export default NextAPI(
 *   useTeamFrequencyLimit({
 *     seconds: 60,
 *     limit: 1000,
 *     keyPrefix: 'chat-completions-rate-limit'
 *   }),
 *   handler
 * );
 */
export function useTeamFrequencyLimit(options: TeamRateLimitOptions) {
  const { seconds, limit, keyPrefix = 'team-rate-limit' } = options;

  return async (req: ApiRequestProps, res: NextApiResponse) => {
    // 尝试从请求的不同位置获取团队ID
    let teamId: string | undefined;

    // 1. 从请求体中获取（最常见的情况）
    if (req.body?.teamId) {
      teamId = req.body.teamId;
    }
    // 2. 从查询参数中获取
    else if (req.query?.teamId) {
      teamId = req.query.teamId as string;
    }
    // 3. 从Authorization header中解析（如果使用API Key）
    else if (req.headers?.authorization) {
      // 这里可以添加API Key解析逻辑来获取teamId
      // 但为了简单起见，我们暂时跳过这种情况
    }

    if (!teamId) {
      // 如果没有团队ID，跳过限流检查
      return;
    }

    try {
      const redis = getGlobalRedisConnection();
      const key = `${keyPrefix}:${teamId}`;

      // 使用Redis的滑动窗口限流算法
      const currentTime = Math.floor(Date.now() / 1000);
      const windowStart = currentTime - seconds;

      // 使用Redis Pipeline提高性能
      const pipeline = redis.pipeline();

      // 移除过期的请求记录
      pipeline.zremrangebyscore(key, 0, windowStart);

      // 添加当前请求记录
      pipeline.zadd(key, currentTime, `${currentTime}-${Math.random()}`);

      // 获取当前窗口内的请求数量
      pipeline.zcard(key);

      // 设置key的过期时间
      pipeline.expire(key, seconds);

      const results = await pipeline.exec();

      if (!results) {
        throw new Error('Redis pipeline execution failed');
      }

      // zcard的结果在pipeline的第三个操作中
      const currentRequestCount = results[2][1] as number;

      if (currentRequestCount > limit) {
        // 超出限流，返回429错误
        const remainingTime = await redis.ttl(key);
        jsonRes(res, {
          code: 429,
          error: `Rate limit exceeded. Maximum ${limit} requests per ${seconds} seconds for this team. Please try again in ${remainingTime} seconds.`
        });
        return;
      }

      // 在响应头中添加限流信息
      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - currentRequestCount));
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + seconds * 1000).toISOString());
    } catch (error) {
      console.error('Rate limit check failed:', error);
      // Redis错误时不阻断请求，继续处理
    }
  };
}
