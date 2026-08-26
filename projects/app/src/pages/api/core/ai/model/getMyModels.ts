import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getMyModelIds } from '@fastgpt/service/support/permission/model/controller';
import {
  GetMyModelsQuerySchema,
  GetMyModelsResponseSchema,
  type GetMyModelsQuery,
  type GetMyModelsResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getModelProvider } from '@fastgpt/service/core/app/provider/controller';
import { paginateAvailableModels } from '@fastgpt/service/core/ai/list';

export type {
  GetMyModelsQuery,
  GetMyModelsResponse
} from '@fastgpt/global/openapi/core/ai/model/api';

/** 分页获取当前成员有权使用的模型。Provider 列表不受 provider 条件影响，用于选择器首屏发现。 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetMyModelsQuery>
): Promise<GetMyModelsResponse> {
  const { query } = parseApiInput({ req, querySchema: GetMyModelsQuerySchema });
  const { teamId, tmbId, isRoot, tmb } = await authUserPer({
    req,
    authToken: true,
    per: ReadPermissionVal
  });
  const allowedModelIds = await getMyModelIds({
    teamId,
    tmbId,
    isTeamOwner: tmb.role === 'owner' || isRoot
  });

  const allowedModels = allowedModelIds
    .map((modelId) => global.systemModelMap.get(`id:${modelId}`))
    .filter((model): model is NonNullable<typeof model> => !!model?.isActive);

  return GetMyModelsResponseSchema.parse(
    paginateAvailableModels({
      models: allowedModels,
      ...query,
      getProviderOrder: (provider) => getModelProvider(provider).order
    })
  );
}

export default NextAPI(handler);
