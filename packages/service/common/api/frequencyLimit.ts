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

type TeamFrequencyLimitResponse =
  | {
      status: 'allowed';
      limit: number;
      remaining: number;
      resetAt: number;
    }
  | {
      status: 'rejected';
      code: 429;
      error: UserError;
    };

type TeamFrequencyLimitResponseHandler = (
  response: TeamFrequencyLimitResponse
) => void | Promise<void>;

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

/** 校验团队级请求频率，并通过回调把限流结果交给调用方的传输层处理。 */
export const teamFrequencyLimit = async ({
  teamId,
  type,
  limitResponse
}: FrequencyLimitOption & {
  limitResponse: TeamFrequencyLimitResponseHandler;
}): Promise<boolean> => {
  let data: Awaited<ReturnType<typeof getLimitData>>;
  try {
    data = await getLimitData({ type, teamId });
  } catch (error) {
    logger.error('Team QPM configuration lookup failed closed', { teamId, type, error });
    await limitResponse({
      status: 'rejected',
      code: 429,
      error: new UserError('Rate limit service unavailable. Please try again later.')
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
    await limitResponse({
      status: 'rejected',
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
    await limitResponse({
      status: 'rejected',
      code: 429,
      error: new UserError(
        `Rate limit exceeded. Maximum ${limit} requests per ${seconds} seconds for this team. Please try again in ${result.ttlSeconds} seconds.`
      )
    });
    return false;
  }

  await limitResponse({
    status: 'allowed',
    limit,
    remaining: result.remaining,
    resetAt: result.resetAt
  });
  return true;
};

/** 创建保持原有 Next API 响应行为的限流结果处理函数。 */
export const createNodeApiLimitResponse =
  (res: NodeApiResponse): TeamFrequencyLimitResponseHandler =>
  (response) => {
    if (response.status === 'allowed') {
      res.setHeader('X-RateLimit-Limit', response.limit);
      res.setHeader('X-RateLimit-Remaining', response.remaining);
      res.setHeader('X-RateLimit-Reset', response.resetAt);
      return;
    }
    jsonRes(res, {
      code: response.code,
      error: response.error
    });
  };
