/* 基于 Team 的限流 */
import { getGlobalRedisConnection } from '../../common/redis';
import { jsonRes } from '../../common/response';
import type { NextApiResponse } from 'next';
import {
  getCachedTeamQPMLimit,
  setCachedTeamQPMLimit,
  getTeamPlanStatus
} from '../../support/wallet/sub/utils';
import { SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';

export enum LimitTypeEnum {
  chat = 'chat'
}

const limitSecondsMap = {
  [LimitTypeEnum.chat]: 60
};

type FrequencyLimitOption = {
  teamId: string;
  type: LimitTypeEnum;
  res: NextApiResponse;
};

// Get team's dynamic QPM limit with caching
export const getTeamQPMLimit = async (teamId: string): Promise<number> => {
  // 1. Try to get from cache first
  const cachedLimit = await getCachedTeamQPMLimit(teamId);
  if (cachedLimit !== null) {
    return cachedLimit;
  }

  // 2. Cache miss, compute from database
  const teamPlanStatus = await getTeamPlanStatus({ teamId });
  const limit =
    teamPlanStatus[SubTypeEnum.standard]?.requestsPerMinute ??
    teamPlanStatus.standardConstants?.requestsPerMinute ??
    30;

  // 3. Write to cache
  await setCachedTeamQPMLimit(teamId, limit);

  return limit;
};

export const teamFrequencyLimit = async ({ teamId, type, res }: FrequencyLimitOption) => {
  const limit = await getTeamQPMLimit(teamId);
  const seconds = limitSecondsMap[type];

  const redis = getGlobalRedisConnection();
  const key = `frequency:${type}:${teamId}`;

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
