import { authModelScope } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  ChannelModelsResponseSchema,
  GetChannelModelsQuerySchema,
  type ChannelModelsResponse,
  type GetChannelModelsQuery
} from '@fastgpt/global/openapi/core/ai/model/channel/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getChannelModels } from '@fastgpt/service/core/ai/model/channel/association';
import { resolveChannelForOperation } from '@fastgpt/service/core/ai/model/channel/resolve';

/** 查询指定渠道在其桶内关联的所有模型清单 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetChannelModelsQuery>
): Promise<ChannelModelsResponse> {
  const { id, channelType } = parseApiInput({
    req,
    querySchema: GetChannelModelsQuerySchema
  }).query;

  const { tmbId, teamId } = await authModelScope({ req, channelType });
  const channel = await resolveChannelForOperation({ id, channelType, tmbId });
  const models = await getChannelModels({ channel, channelType, teamId, tmbId });

  return ChannelModelsResponseSchema.parse({ models });
}

export default NextAPI(handler);
