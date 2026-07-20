import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getChannelAffectedModels } from '@fastgpt/service/core/ai/channel';
import { resolveChannelForOperation } from '@/service/core/ai/channel/resolve';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetAffectedModelsQuerySchema,
  AffectedModelsResponseSchema,
  type GetAffectedModelsQuery,
  type AffectedModelsResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';

/**
 * Pre-check for the delete confirmation dialog (design §2.9.4 F2-S4/F3-S4):
 * models that would lose their only channel if this channel is deleted.
 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetAffectedModelsQuery>,
  _res: ApiResponseType<any>
): Promise<AffectedModelsResponse> {
  const { id, channelType } = parseApiInput({
    req,
    querySchema: GetAffectedModelsQuerySchema
  }).query;

  const { tmbId, isRoot } = await authUserPer({ req, authToken: true });

  if (channelType === 'system' && !isRoot) {
    return Promise.reject(ModelErrEnum.rootOnlyPermit);
  }
  const resolved = await resolveChannelForOperation({ id, channelType, tmbId, isRoot });
  const affectedModels = await getChannelAffectedModels(resolved.channel);

  return AffectedModelsResponseSchema.parse({ affectedModels });
}

export default NextAPI(handler);
