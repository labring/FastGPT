import { authModelViewer } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { sortModelOrderItems } from '@fastgpt/global/core/ai/model/order';
import {
  GetModelCatalogQuerySchema,
  GetModelCatalogResponseSchema,
  type GetModelCatalogQuery,
  type GetModelCatalogResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { getModelProviderMetadata } from '@fastgpt/service/core/ai/model/provider/controller';
import { desensitizeModel } from '@fastgpt/service/core/ai/model/transform';
import { getAuthorizedModelIds } from '@fastgpt/service/support/permission/model/auth';

/** 返回当前成员完整模型目录；展示排序单独计算内容版本，避免影响运行时顺序与默认模型。 */
export async function handler(
  req: ApiRequestProps<Record<string, never>, GetModelCatalogQuery>
): Promise<GetModelCatalogResponse> {
  const {
    version: clientVersion,
    outLinkAuthData,
    orderBy
  } = parseApiInput({
    req,
    querySchema: GetModelCatalogQuerySchema
  }).query;

  const catalogIdentity = await authModelViewer({ req, outLinkAuthData });
  const modelHandle = await getTeamModelHandle({ teamId: catalogIdentity.teamId });
  const providers = getModelProviderMetadata().providers;
  // 复用同一目录快照计算使用权，保证目录内容与 version 对应同一快照。
  const authorizedIds = await getAuthorizedModelIds({
    actor: catalogIdentity,
    handle: modelHandle
  });
  const permissionVersion = hashStr(
    [modelHandle.version, ...[...authorizedIds].toSorted()].join('\n')
  );
  const runtimeVersion = `3:${modelHandle.version}:${permissionVersion}`;
  const availableModels = modelHandle
    .getActiveModels()
    .filter((model) => authorizedIds.has(model.modelId));
  // 展示顺序只作用于响应副本；自己的团队模型、共享模型、系统模型分别比较 rank。
  const models =
    orderBy === 'custom'
      ? [
          ...sortModelOrderItems(
            availableModels.filter(
              (model) =>
                model.scope === ModelScopeEnum.team && model.tmbId === catalogIdentity.tmbId
            )
          ),
          ...sortModelOrderItems(
            availableModels.filter(
              (model) =>
                model.scope === ModelScopeEnum.team && model.tmbId !== catalogIdentity.tmbId
            )
          ),
          ...sortModelOrderItems(
            availableModels.filter((model) => model.scope === ModelScopeEnum.system)
          )
        ]
      : availableModels;
  // rank 不进入运行时版本，展示请求需额外比较最终 ID 顺序，防止纯排序保存后命中旧缓存。
  const version =
    orderBy === 'custom'
      ? `${runtimeVersion}:custom:${hashStr(JSON.stringify(models.map((model) => model.modelId)))}`
      : runtimeVersion;

  if (clientVersion === version) {
    return GetModelCatalogResponseSchema.parse({ version });
  }

  return GetModelCatalogResponseSchema.parse({
    version,
    data: {
      models: models.map(desensitizeModel),
      providers,
      defaultModelIds: modelHandle.getDefaultModelIds(authorizedIds)
    }
  });
}

export default NextAPI(handler);
