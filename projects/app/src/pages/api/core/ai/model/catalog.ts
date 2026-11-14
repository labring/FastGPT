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
import { addSourceMember } from '@fastgpt/service/support/user/utils';

/** 返回当前身份可用的模型目录；创建人资料仅供成员展示页实时读取，不参与通用目录缓存。 */
export async function handler(
  req: ApiRequestProps<Record<string, never>, GetModelCatalogQuery>
): Promise<GetModelCatalogResponse> {
  const {
    version: clientVersion,
    outLinkAuthData,
    orderBy,
    includeSourceMember
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
  // 默认目录不再携带创建人资料，升级响应版本以替换旧客户端持久缓存中的冗余字段。
  const runtimeVersion = `4:${modelHandle.version}:${permissionVersion}`;
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

  const withSourceMember = includeSourceMember && catalogIdentity.source !== 'outLink';
  // 展示资料随成员记录变化，显式请求时始终读取最新资料，不复用通用目录的版本缓存。
  if (!withSourceMember && clientVersion === version) {
    return GetModelCatalogResponseSchema.parse({ version });
  }

  const desensitizedModels = models.map(desensitizeModel);
  const memberModels = withSourceMember
    ? await addSourceMember({
        list: desensitizedModels.filter(
          (model): model is typeof model & { tmbId: string } =>
            model.scope === ModelScopeEnum.team && Boolean(model.tmbId)
        )
      })
    : [];
  const memberModelMap = new Map(memberModels.map((model) => [model.modelId, model]));

  return GetModelCatalogResponseSchema.parse({
    version,
    data: {
      models: desensitizedModels.map((model) => memberModelMap.get(model.modelId) ?? model),
      providers,
      defaultModelIds: modelHandle.getDefaultModelIds(authorizedIds)
    }
  });
}

export default NextAPI(handler);
