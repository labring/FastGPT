import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/index';
import { getModelProviderMetadata } from '@fastgpt/service/core/ai/model/provider/controller';
import { authModelViewer } from '@/service/core/ai/model/auth';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { getMemberModelCatalogPermission } from '@fastgpt/service/support/permission/model/catalog';
import {
  GetModelCatalogQuerySchema,
  GetModelCatalogResponseSchema,
  type GetModelCatalogQuery,
  type GetModelCatalogResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { desensitizeModel } from '@fastgpt/service/core/ai/model/transform';
import { resolveEffectiveDefaultModelIds } from '@fastgpt/service/core/ai/model/default/resolve';
import { isTeamModel } from '@fastgpt/global/core/ai/model/utils';

/** 返回当前成员完整模型目录；命中内容版本时只返回 version。 */
export async function handler(
  req: ApiRequestProps<Record<string, never>, GetModelCatalogQuery>
): Promise<GetModelCatalogResponse> {
  const { version: clientVersion, outLinkAuthData } = parseApiInput({
    req,
    querySchema: GetModelCatalogQuerySchema
  }).query;

  const catalogIdentity = await authModelViewer({ req, outLinkAuthData });
  const modelHandle = await getTeamModelHandle({ teamId: catalogIdentity.teamId });
  const activeModels = modelHandle.getActiveModels();
  const configuredDefaults = modelHandle.configuredDefaultModelIds;
  const providers = getModelProviderMetadata().providers;
  const permission = await getMemberModelCatalogPermission({
    ...catalogIdentity,
    catalogSnapshot: { models: activeModels, version: modelHandle.version }
  });
  const version = `3:${modelHandle.version}:${permission.version}`;

  if (clientVersion === version) {
    return GetModelCatalogResponseSchema.parse({ version });
  }

  const permittedModelIds = new Set(permission.modelIds);
  // 权限结果只决定可见性，目录顺序始终继承 plugin 排好的 active 模型列表。
  const models = activeModels.filter(
    (model) =>
      permittedModelIds.has(model.modelId) &&
      (!isTeamModel(model) || !model.teamId || String(model.teamId) === catalogIdentity.teamId)
  );

  return GetModelCatalogResponseSchema.parse({
    version,
    data: {
      models: models.map(desensitizeModel),
      providers,
      defaultModelIds: resolveEffectiveDefaultModelIds({
        models,
        configuredDefaults
      })
    }
  });
}

export default NextAPI(handler);
