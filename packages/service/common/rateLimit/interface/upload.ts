import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { defineRateLimitInterface } from '../core';
import { RateLimitSceneEnum } from '../type';

type UploadRateLimitParams = {
  identity: string;
  limit: number;
  increment?: number;
};

const uploadRateLimit = defineRateLimitInterface<UploadRateLimitParams>({
  scene: RateLimitSceneEnum.Upload,
  policy: 'presign',
  failureMode: 'open',
  getKeySegments: ({ identity }) => ['identity', identity],
  getLimit: ({ limit }) => limit,
  getWindowSeconds: () => 60,
  getIncrement: ({ increment }) => increment ?? 1,
  createError: () => ERROR_ENUM.tooManyRequest
});

/** 按调用方已解析的上传身份，限制每分钟签发上传 URL 的次数。 */
export const assertUploadRateLimit = uploadRateLimit.assert;
