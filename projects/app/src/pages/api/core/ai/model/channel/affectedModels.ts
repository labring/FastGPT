import { authModelScope } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  AffectedModelsResponseSchema,
  GetAffectedModelsQuerySchema,
  type AffectedModelsResponse,
  type GetAffectedModelsQuery
} from '@fastgpt/global/openapi/core/ai/model/channel/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getChannelsAffectedModels } from '@fastgpt/service/core/ai/model/channel/association';
import { resolveChannelsForOperation } from '@fastgpt/service/core/ai/model/channel/resolve';

/** 渠道删除影响预查：返回仅依赖该渠道（或该批渠道）的模型清单 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetAffectedModelsQuery>
): Promise<AffectedModelsResponse> {
  const { ids, channelType } = parseApiInput({
    req,
    querySchema: GetAffectedModelsQuerySchema
  }).query;

  const { tmbId, teamId } = await authModelScope({ req, channelType });
  const channels = await resolveChannelsForOperation({ ids, channelType, tmbId });
  const affectedModels = await getChannelsAffectedModels({ channels, channelType, teamId, tmbId });

  return AffectedModelsResponseSchema.parse({ affectedModels });
}

export default NextAPI(handler);
