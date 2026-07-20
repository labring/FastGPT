import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getUserAccessibleModels } from '@fastgpt/service/support/permission/model/controller';
import { getModelChannelsMapByModels, type ChannelBrief } from '@fastgpt/service/core/ai/channel';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetModelChannelsQuerySchema,
  ModelChannelsResponseSchema,
  type GetModelChannelsQuery,
  type ModelChannelsResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';

/**
 * Channels serving one model within its own bucket (design §7.3/F2-S5 场景2):
 * hover detail source for the model list's channelCount column. The reverse
 * direction of /channel/models — modelId selects the model, the bucket is
 * derived server-side (system model → system channels; private model → its
 * owner's group channels).
 *
 * Visibility: the model must be in the requester's accessible set, so the hover
 * never reveals channels of models the user cannot see. aiproxy is not on the
 * critical path: on failure fall back to an empty list (same policy as list.ts).
 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetModelChannelsQuery>,
  _res: ApiResponseType<any>
): Promise<ModelChannelsResponse> {
  const { modelId } = parseApiInput({
    req,
    querySchema: GetModelChannelsQuerySchema
  }).query;

  const { teamId, tmbId, tmb } = await authUserPer({ req, authToken: true });

  const model = global.systemModelIdMap.get(modelId);
  if (!model) {
    return Promise.reject(ModelErrEnum.unExist);
  }

  // Only channels of models the requester can access are exposed
  const accessibleModels = await getUserAccessibleModels({
    teamId,
    tmbId,
    tmbPer: tmb.permission
  });
  if (!accessibleModels.some((m) => m.id === modelId)) {
    return Promise.reject(ModelErrEnum.unAuthModel);
  }

  let channels: ChannelBrief[] = [];
  try {
    channels = (await getModelChannelsMapByModels([model])).get(modelId) || [];
  } catch (error) {
    channels = [];
  }

  return ModelChannelsResponseSchema.parse({ channels });
}

export default NextAPI(handler);
