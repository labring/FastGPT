/* 基于 Team 的限流 */
import { getGlobalRedisConnection } from '../../common/redis';
import { jsonRes } from '../../common/response';
import type { NextApiResponse } from 'next';
import { teamQPM } from '../../support/wallet/sub/utils';
import z from 'zod';
import { addLog } from '../system/log';

export enum LimitTypeEnum {
  chat = 'chat'
}

const FrequencyLimitOptionSchema = z.union([
  z.object({
    type: z.literal(LimitTypeEnum.chat),
    teamId: z.string()
  })
]);
type FrequencyLimitOption = z.infer<typeof FrequencyLimitOptionSchema>;

const getLimitData = async (data: FrequencyLimitOption) => {
  if (data.type === LimitTypeEnum.chat) {
    const qpm = await teamQPM.getTeamQPMLimit(data.teamId);

    if (!qpm) return;

    return {
      limit: qpm,
      seconds: 60
    };
  }
  return;
};

/*
  true: 未达到限制
  false: 达到了限制
*/
export const teamFrequencyLimit = async ({
  teamId,
  type,
  res
}: FrequencyLimitOption & { res: NextApiResponse }) => {
  const data = await getLimitData({ type, teamId });
  if (!data) return true;

  const { limit, seconds } = data;

  const redis = getGlobalRedisConnection();
  const key = `frequency:${type}:${teamId}`;

  const result = await redis
    .multi()
    .incr(key)
    .expire(key, seconds, 'NX') // 只在key不存在时设置过期时间
    .exec();

  if (!result) {
    return true;
  }

  const currentCount = result[0][1] as number;

  if (currentCount > limit) {
    const remainingTime = await redis.ttl(key);
    addLog.info(`[Completion Limit] Over qpm limit`, { teamId, currentCount, limit });
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
