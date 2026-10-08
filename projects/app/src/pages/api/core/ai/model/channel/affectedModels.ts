import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelManage } from '@fastgpt/service/support/permission/model/controller';
import {
  getBatchChannelsAffectedModels,
  getChannelAffectedModels
} from '@fastgpt/service/core/ai/channel/association';
import { resolveChannelsForOperation } from '@fastgpt/service/core/ai/channel/resolve';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetAffectedModelsQuerySchema,
  AffectedModelsResponseSchema,
  type GetAffectedModelsQuery,
  type AffectedModelsResponse
} from '@fastgpt/global/openapi/core/ai/model/channel/api';

/** 渠道删除影响预查：返回仅依赖该渠道（或该批渠道）的模型清单 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetAffectedModelsQuery>
): Promise<AffectedModelsResponse> {
  const { ids, channelType } = parseApiInput({
    req,
    querySchema: GetAffectedModelsQuerySchema
  }).query;

  if (ids.length === 0) {
    return AffectedModelsResponseSchema.parse({ affectedModels: [] });
  }

  const { tmbId } = await authModelManage({ req, channelType, resource: 'channel' });
  const resolved = await resolveChannelsForOperation({
    ids,
    channelType,
    tmbId
  });
  const affectedModels =
    ids.length === 1
      ? await getChannelAffectedModels(resolved[0].channel)
      : await getBatchChannelsAffectedModels(resolved.map((r) => r.channel));

  return AffectedModelsResponseSchema.parse({ affectedModels });
}

export default NextAPI(handler);
