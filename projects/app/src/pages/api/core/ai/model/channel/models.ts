import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelManage } from '@fastgpt/service/support/permission/model/auth';
import { getChannelModels } from '@fastgpt/service/core/ai/model/channel/association';
import { resolveChannelForOperation } from '@fastgpt/service/core/ai/model/channel/resolve';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetChannelModelsQuerySchema,
  ChannelModelsResponseSchema,
  type GetChannelModelsQuery,
  type ChannelModelsResponse
} from '@fastgpt/global/openapi/core/ai/model/channel/api';

/** 查询指定渠道在其桶内关联的所有模型清单 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetChannelModelsQuery>
): Promise<ChannelModelsResponse> {
  const { id, channelType } = parseApiInput({
    req,
    querySchema: GetChannelModelsQuerySchema
  }).query;

  const { tmbId, teamId } = await authModelManage({ req, channelType, resource: 'channel' });
  const resolved = await resolveChannelForOperation({ id, channelType, tmbId });
  const models = await getChannelModels(resolved.channel, teamId);

  return ChannelModelsResponseSchema.parse({ models });
}

export default NextAPI(handler);
