import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  batchDeleteMemberChannels,
  batchDeleteSystemChannels,
  normalizeAiproxyError
} from '@fastgpt/service/core/ai/channel';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  BatchDeleteChannelsBodySchema,
  BatchDeleteChannelsResponseSchema,
  type BatchDeleteChannelsBody,
  type BatchDeleteChannelsResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';

/** 批量删除渠道 */
async function handler(
  req: ApiRequestProps<BatchDeleteChannelsBody>
): Promise<BatchDeleteChannelsResponse> {
  const { ids, channelType } = parseApiInput({
    req,
    bodySchema: BatchDeleteChannelsBodySchema
  }).body;

  const { tmbId, isRoot } = await authUserPer({ req, authToken: true });
  if (channelType === 'system' && !isRoot) {
    return Promise.reject(ModelErrEnum.rootOnlyPermit);
  }

  try {
    if (channelType === 'system') {
      await batchDeleteSystemChannels({ ids });
    } else {
      await batchDeleteMemberChannels({ tmbId, ids });
    }
  } catch (error) {
    return Promise.reject(normalizeAiproxyError(error));
  }

  return BatchDeleteChannelsResponseSchema.parse(undefined);
}

export default NextAPI(handler);
