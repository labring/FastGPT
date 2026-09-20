import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  batchUpdateMemberChannelStatus,
  batchUpdateSystemChannelStatus,
  normalizeAiproxyError
} from '@fastgpt/service/core/ai/channel';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  BatchUpdateChannelStatusBodySchema,
  BatchUpdateChannelStatusResponseSchema,
  type BatchUpdateChannelStatusBody,
  type BatchUpdateChannelStatusResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';

/** 批量更新渠道启用/禁用状态 */
async function handler(
  req: ApiRequestProps<BatchUpdateChannelStatusBody>
): Promise<BatchUpdateChannelStatusResponse> {
  const { ids, status, channelType } = parseApiInput({
    req,
    bodySchema: BatchUpdateChannelStatusBodySchema
  }).body;

  const { tmbId, isRoot } = await authUserPer({ req, authToken: true });
  if (channelType === 'system' && !isRoot) {
    return Promise.reject(ModelErrEnum.rootOnlyPermit);
  }

  try {
    if (channelType === 'system') {
      await batchUpdateSystemChannelStatus({ ids, status });
    } else {
      await batchUpdateMemberChannelStatus({ tmbId, ids, status });
    }
  } catch (error) {
    return Promise.reject(normalizeAiproxyError(error));
  }

  return BatchUpdateChannelStatusResponseSchema.parse(undefined);
}

export default NextAPI(handler);
