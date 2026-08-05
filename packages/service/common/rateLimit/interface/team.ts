import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { defineRateLimitInterface } from '../core';
import { RateLimitSceneEnum } from '../type';

type TeamChatRateLimitParams = {
  teamId: string;
  limit: number;
  seconds: number;
};

const teamChatRateLimit = defineRateLimitInterface<TeamChatRateLimitParams>({
  scene: RateLimitSceneEnum.Team,
  policy: 'chat-qpm',
  failureMode: 'closed',
  getKeySegments: ({ teamId }) => ['team', teamId],
  getLimit: ({ limit }) => limit,
  getWindowSeconds: ({ seconds }) => seconds,
  createError: () => ERROR_ENUM.tooManyRequest
});

/** 返回团队聊天 QPM 的原始计数结果，供统一 API 包装层保留现有错误映射。 */
export const consumeTeamChatRateLimit = teamChatRateLimit.consume;
