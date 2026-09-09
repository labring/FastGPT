import { authModelViewer } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  GetModelSummariesBodySchema,
  GetModelSummariesResponseSchema,
  type GetModelSummariesBody,
  type GetModelSummariesResponse
} from '@fastgpt/global/openapi/core/ai/model/summary';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getModelHandle } from '@fastgpt/service/core/ai/model';
import { getMemberModelCatalogPermission } from '@fastgpt/service/support/permission/model/controller';

/** 只返回展示白名单字段；停用模型照常鉴权，无权限模型允许显示名称，但绝不泄露执行配置。 */
export async function handler(
  req: ApiRequestProps<GetModelSummariesBody>
): Promise<GetModelSummariesResponse> {
  const { modelIds, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: GetModelSummariesBodySchema
  }).body;
  const identity = await authModelViewer({ req, outLinkAuthData });
  const modelHandle = await getModelHandle();
  const { modelIds: permittedIds } = await getMemberModelCatalogPermission({
    ...identity,
    includeInactive: true,
    catalogSnapshot: { models: modelHandle.getAllModels(), revision: modelHandle.revision }
  });
  const permitted = new Set(permittedIds);
  return GetModelSummariesResponseSchema.parse({
    models: modelIds.map((modelId) => {
      const model = modelHandle.findModelData({ modelId });
      if (!model) return { modelId, status: 'deleted' };
      return {
        modelId,
        name: model.name,
        avatar: model.avatar,
        status: !permitted.has(modelId) ? 'forbidden' : model.isActive ? 'active' : 'disabled'
      };
    })
  });
}

export default NextAPI(handler);
