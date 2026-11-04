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
  getLimit: ({ limit }) => limit * 3,
  getWindowSeconds: () => 60,
  getIncrement: ({ increment }) => increment ?? 1,
  createError: () => ERROR_ENUM.tooManyRequest
});

/** 按上传身份限制每分钟上传额度，上限为文件数量 limit 的 3 倍，批量上传按文件数累计。 */
export const assertUploadRateLimit = uploadRateLimit.assert;
