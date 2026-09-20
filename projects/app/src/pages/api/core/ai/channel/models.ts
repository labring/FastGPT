import type { ApiRequestProps } from '@fastgpt/next/type';
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

/** 查询指定渠道在其桶内关联的所有模型清单 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetChannelModelsQuery>
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
