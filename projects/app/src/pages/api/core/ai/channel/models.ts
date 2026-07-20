import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getChannelModels } from '@fastgpt/service/core/ai/channel';
import { resolveChannelForOperation } from '@/service/core/ai/channel/resolve';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetChannelModelsQuerySchema,
  ChannelModelsResponseSchema,
  type GetChannelModelsQuery,
  type ChannelModelsResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';

/**
 * All models the channel serves within its own bucket (design §2.9.2/§9.1):
 * hover detail source for the channel list's related-model column (F2-S5 场景3/4).
 * Unlike /affectedModels, this is NOT limited to models that would lose their
 * only channel — it returns every model matched by upstream name in the bucket.
 *
 * Read-only view: members may inspect their own group channels (F1 场景1/场景3);
 * ownership is enforced by resolveChannelForOperation (group path resolves via
 * the session-derived groupId), and system channels stay root-only below.
 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetChannelModelsQuery>,
  _res: ApiResponseType<any>
): Promise<ChannelModelsResponse> {
  const { id, channelType } = parseApiInput({
    req,
    querySchema: GetChannelModelsQuerySchema
  }).query;

  const { tmbId, isRoot } = await authUserPer({ req, authToken: true });

  if (channelType === 'system' && !isRoot) {
    return Promise.reject(ModelErrEnum.rootOnlyPermit);
  }
  const resolved = await resolveChannelForOperation({ id, channelType, tmbId, isRoot });
  const models = getChannelModels(resolved.channel);

  return ChannelModelsResponseSchema.parse({ models });
}

export default NextAPI(handler);
