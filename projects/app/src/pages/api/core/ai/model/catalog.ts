import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getMemberModelCatalogPermission } from '@fastgpt/service/support/permission/model/controller';
import {
  GetModelCatalogQuerySchema,
  GetModelCatalogResponseSchema,
  type GetModelCatalogQuery,
  type GetModelCatalogResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { desensitizeSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { resolveEffectiveDefaultModelIds } from '@fastgpt/service/core/ai/catalog';

/** 返回当前成员完整模型目录；命中内容版本时只返回 version。 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetModelCatalogQuery>
): Promise<GetModelCatalogResponse> {
  const { version: clientVersion } = parseApiInput({
    req,
    querySchema: GetModelCatalogQuerySchema
  }).query;
  const { teamId, tmbId, isRoot, tmb } = await authUserPer({
    req,
    authToken: true,
    per: ReadPermissionVal
  });
  const permission = await getMemberModelCatalogPermission({
    teamId,
    tmbId,
    isTeamOwner: tmb.role === 'owner' || isRoot
  });
  const version = `1:${global.systemModelCatalogVersion}:${permission.version}`;

  if (clientVersion === version) {
    return GetModelCatalogResponseSchema.parse({ version });
  }

  const models = permission.modelIds
    .map((modelId) => global.systemModelMap.get(`id:${modelId}`))
    .filter((model): model is NonNullable<typeof model> => !!model?.isActive);

  return GetModelCatalogResponseSchema.parse({
    version,
    data: {
      models: models.map(desensitizeSystemModel),
      providers: global.ModelProviderRawCache,
      defaultModelIds: resolveEffectiveDefaultModelIds({
        models,
        configuredDefaults: global.systemConfiguredDefaultModelIds
      })
    }
  });
}

export default NextAPI(handler);
