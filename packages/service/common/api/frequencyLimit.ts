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

type TeamFrequencyLimitStatus = {
  limit: number;
  remaining: number;
  resetAt: number;
};

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

/**
 * 校验团队级请求频率并返回响应头所需的限流状态。
 *
 * 该函数不写 HTTP 响应，供 Next、Hono 等不同传输层复用；配置或 Redis
 * 不可用时保持 fail-closed，达到限额时抛出可展示的业务错误。
 */
export const checkTeamFrequencyLimit = async ({
  teamId,
  type
}: FrequencyLimitOption): Promise<TeamFrequencyLimitStatus | undefined> => {
  let data: Awaited<ReturnType<typeof getLimitData>>;
  try {
    data = await getLimitData({ type, teamId });
  } catch (error) {
    logger.error('Team QPM configuration lookup failed closed', { teamId, type, error });
    throw new UserError('Rate limit service unavailable. Please try again later.');
  }
  if (!data) return;

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
    throw new UserError('Rate limit service unavailable. Please try again later.');
  }

  if (!result.allowed) {
    logger.info('Completion QPM limit exceeded', {
      teamId,
      currentCount: result.currentCount,
      limit,
      ttlSeconds: result.ttlSeconds
    });
    throw new UserError(
      `Rate limit exceeded. Maximum ${limit} requests per ${seconds} seconds for this team. Please try again in ${result.ttlSeconds} seconds.`
    );
  }

  return {
    limit,
    remaining: result.remaining,
    resetAt: result.resetAt
  };
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
  try {
    const status = await checkTeamFrequencyLimit({ teamId, type });
    if (!status) return true;

    res.setHeader('X-RateLimit-Limit', status.limit);
    res.setHeader('X-RateLimit-Remaining', status.remaining);
    res.setHeader('X-RateLimit-Reset', status.resetAt);
    return true;
  } catch (error) {
    if (error instanceof RedisInvalidArgumentError) throw error;

    jsonRes(res, {
      code: 429,
      error
    });
    return false;
  }
};
