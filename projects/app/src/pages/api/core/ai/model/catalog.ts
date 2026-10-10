import { authModelViewer } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import { hashStr } from '@fastgpt/global/common/string/tools';
import {
  GetModelCatalogQuerySchema,
  GetModelCatalogResponseSchema,
  type GetModelCatalogQuery,
  type GetModelCatalogResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { resolveEffectiveDefaultModelIds } from '@fastgpt/service/core/ai/model/default/resolve';
import { getModelProviderMetadata } from '@fastgpt/service/core/ai/model/provider/controller';
import { desensitizeModel } from '@fastgpt/service/core/ai/model/transform';
import { getAuthorizedModelIds } from '@fastgpt/service/support/permission/model/auth';

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
  // 复用同一目录快照计算使用权，保证目录内容与 version 对应同一快照。
  const authorizedIds = await getAuthorizedModelIds({
    actor: catalogIdentity,
    handle: modelHandle
  });
  const models = activeModels.filter((model) => authorizedIds.has(model.modelId));
  const permissionVersion = hashStr(
    [modelHandle.version, ...models.map((model) => model.modelId).toSorted()].join('\n')
  );
  const version = `3:${modelHandle.version}:${permissionVersion}`;

  if (clientVersion === version) {
    return GetModelCatalogResponseSchema.parse({ version });
  }

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
