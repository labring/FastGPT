import { authModelViewer } from '@/service/core/ai/model/auth';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
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
export async function handler(
  req: ApiRequestProps<Record<string, never>, GetModelCatalogQuery>
): Promise<GetModelCatalogResponse> {
  const { version: clientVersion, outLinkAuthData } = parseApiInput({
    req,
    querySchema: GetModelCatalogQuerySchema
  }).query;

  const catalogIdentity = await authModelViewer({ req, outLinkAuthData });
  const permission = await getMemberModelCatalogPermission(catalogIdentity);
  const version = `3:${global.systemModelCatalogVersion}:${permission.version}`;

  if (clientVersion === version) {
    return GetModelCatalogResponseSchema.parse({ version });
  }

  const permittedModelIds = new Set(permission.modelIds);
  // 权限结果只决定可见性，目录顺序始终继承 plugin 排好的 active 模型列表。
  const models = global.systemActiveModelList.filter((model) =>
    permittedModelIds.has(model.modelId)
  );

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
