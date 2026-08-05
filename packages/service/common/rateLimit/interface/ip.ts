import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { defineRateLimitInterface } from '../core';
import { RateLimitSceneEnum } from '../type';

export type CheckIPRateLimitParams = {
  id: string;
  ip: string;
  limit: number;
  seconds: number;
  increment?: number;
};

const ipRateLimit = defineRateLimitInterface<CheckIPRateLimitParams>({
  scene: RateLimitSceneEnum.Ip,
  policy: ({ id }) => id,
  failureMode: 'open',
  getKeySegments: ({ ip }) => ['ip', ip],
  getLimit: ({ limit }) => limit,
  getWindowSeconds: ({ seconds }) => seconds,
  getIncrement: ({ increment }) => increment ?? 1,
  createError: () => ERROR_ENUM.tooManyRequest
});

/** 原子增加指定 IP 的接口计数，并返回是否仍在额度内。 */
export const checkIPRateLimit = ipRateLimit.check;
