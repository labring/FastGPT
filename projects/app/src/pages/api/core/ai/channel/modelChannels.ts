import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { isSystemModel, getModelOwnerTmbId } from '@fastgpt/global/core/ai/model';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getMemberModelIds } from '@fastgpt/service/support/permission/model/controller';
import { getModelHandle } from '@fastgpt/service/core/ai/model';
import {
  getModelChannelsMapByModels,
  type ChannelBrief,
  type ChannelAssociableModel
} from '@fastgpt/service/core/ai/channel/association';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetModelChannelsQuerySchema,
  ModelChannelsResponseSchema,
  type GetModelChannelsQuery,
  type ModelChannelsResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';

/** 查询指定模型在对应桶内关联的渠道清单 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetModelChannelsQuery>
): Promise<ModelChannelsResponse> {
  const { modelId } = parseApiInput({
    req,
    querySchema: GetModelChannelsQuerySchema
  }).query;

  const { teamId, tmbId, permission } = await authUserPer({ req, authToken: true });

  const modelHandle = await getModelHandle();
  const model = modelHandle.findModelData({ modelId });
  if (!model) {
    return Promise.reject(ModelErrEnum.unExist);
  }

  // Only channels of models the requester can access are exposed
  const accessibleModelIds = await getMemberModelIds({
    teamId,
    tmbId,
    isTeamOwner: permission.isOwner,
    includeInactive: true
  });
  if (!accessibleModelIds.includes(modelId)) {
    return Promise.reject(ModelErrEnum.unAuthModel);
  }

  const isSystem = isSystemModel(model);
  const associableModel: ChannelAssociableModel = {
    id: model.modelId,
    model: model.model,
    name: model.name,
    isSystem,
    tmbId: getModelOwnerTmbId(model)
  };

  let channels: ChannelBrief[] = [];
  try {
    channels = (await getModelChannelsMapByModels([associableModel])).get(modelId) || [];
  } catch (_error) {
    channels = [];
  }

  return ModelChannelsResponseSchema.parse({ channels });
}

export default NextAPI(handler);
