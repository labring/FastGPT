/* 基于 Team 的限流 */
import { RedisInvalidArgumentError } from '@fastgpt/dal/redis';
import { jsonRes } from '../../common/response';
import type { NodeApiResponse } from '../../types/http';
import { teamQPM } from '../../support/wallet/sub/utils';
import z from 'zod';
import { getLogger, LogCategories } from '../logger';
import { consumeTeamChatRateLimit } from '../rateLimit/interface/team';
import { UserError } from '@fastgpt/global/common/error/utils';

const logger = getLogger(LogCategories.HTTP.RESPONSE);

export enum LimitTypeEnum {
  chat = 'chat'
}

const _FrequencyLimitOptionSchema = z.union([
  z.object({
    type: z.literal(LimitTypeEnum.chat),
    teamId: z.string()
  })
]);
type FrequencyLimitOption = z.infer<typeof _FrequencyLimitOptionSchema>;

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
}: FrequencyLimitOption & {
  res: NodeApiResponse;
}) => {
  let data: Awaited<ReturnType<typeof getLimitData>>;
  try {
    data = await getLimitData({ type, teamId });
  } catch (error) {
    logger.error('Team QPM configuration lookup failed closed', { teamId, type, error });
    jsonRes(res, {
      code: 429,
      error: 'Rate limit service unavailable. Please try again later.'
    });
    return false;
  }
  if (!data) return true;

  const { limit, seconds } = data;

  let result: Awaited<ReturnType<typeof consumeTeamChatRateLimit>>;
  try {
    result = await consumeTeamChatRateLimit({
      teamId,
      limit,
      seconds
    });
  } catch (error) {
    if (error instanceof RedisInvalidArgumentError) throw error;

    logger.error('Team QPM rate limit failed closed', { teamId, type, error });
    jsonRes(res, {
      code: 429,
      error: new UserError('Rate limit service unavailable. Please try again later.')
    });
    return false;
  }

  if (!result.allowed) {
    logger.info('Completion QPM limit exceeded', {
      teamId,
      currentCount: result.currentCount,
      limit,
      ttlSeconds: result.ttlSeconds
    });
    jsonRes(res, {
      code: 429,
      error: new UserError(
        `Rate limit exceeded. Maximum ${limit} requests per ${seconds} seconds for this team. Please try again in ${result.ttlSeconds} seconds.`
      )
    });
    return false;
  }

  // 在响应头中添加限流信息
  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', result.resetAt);
  return true;
};
