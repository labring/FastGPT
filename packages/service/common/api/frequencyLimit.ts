/* 基于 Team 的限流 */
import { RedisInvalidArgumentError } from '@fastgpt/dal/redis';
import { jsonRes } from '../../common/response';
import type { NodeApiResponse } from '../../types/http';
import { teamQPM } from '../../support/wallet/sub/utils';
import z from 'zod';
import { getLogger, LogCategories } from '../logger';
import { consumeTeamChatRateLimit } from '../rateLimit/interface/team';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

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

/**
 * 校验团队频次限制（无 HTTP 依赖）。
 * 未配置限流时静默放行；未超限时返回限流元数据；
 * Redis 运行时异常时记录日志并跳过检查（fail open），避免阻塞工作流；
 * Redis 参数非法（RedisInvalidArgumentError）为代码层错误，继续抛出；
 * 达到频次限制时抛出携带 ERROR_ENUM.tooManyRequest 的 UserError。
 */
export const assertTeamFrequencyLimit = async ({
  teamId,
  type
}: FrequencyLimitOption): Promise<{
  limit?: number;
  remaining?: number;
  resetAt?: number;
}> => {
  let data: Awaited<ReturnType<typeof getLimitData>>;
  try {
    data = await getLimitData({ type, teamId });
  } catch (error) {
    logger.error('Team QPM configuration lookup failed, skipping rate limit', {
      teamId,
      type,
      error
    });
    return {};
  }
  if (!data) return {};

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

    logger.error('Team QPM rate limit check failed, skipping rate limit (fail open)', {
      teamId,
      type,
      error
    });
    return {};
  }

  if (!result.allowed) {
    logger.info('Completion QPM limit exceeded', {
      teamId,
      currentCount: result.currentCount,
      limit,
      ttlSeconds: result.ttlSeconds
    });
    throw new UserError(
      ERROR_ENUM.tooManyRequest,
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
    const { limit, remaining, resetAt } = await assertTeamFrequencyLimit({ teamId, type });
    if (limit !== undefined && remaining !== undefined && resetAt !== undefined) {
      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', resetAt);
    }
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
