import { authModelViewer } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  GetModelSummariesBodySchema,
  GetModelSummariesResponseSchema,
  type GetModelSummariesBody,
  type GetModelSummariesResponse
} from '@fastgpt/global/openapi/core/ai/model/summary';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { getAppDraftResourceBaseline } from '@fastgpt/service/core/app/version/controller';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { isKnownUnauthorizedError } from '@fastgpt/service/support/permission/app/resource';
import { authModels } from '@fastgpt/service/support/permission/model/auth';

/**
 * 只返回展示白名单字段；停用模型照常鉴权，无权限模型允许显示名称，但绝不泄露执行配置。
 * 若提供 appId，应用草稿资源基线中的已有模型视作当前应用已授权（同增量鉴权基线逻辑），返回 active 状态。
 */
export async function handler(
  req: ApiRequestProps<GetModelSummariesBody>
): Promise<GetModelSummariesResponse> {
  const { modelIds, appId, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: GetModelSummariesBodySchema
  }).body;
  const identity = await authModelViewer({ req, outLinkAuthData });
  const modelHandle = await getTeamModelHandle({ teamId: identity.teamId });
  const deniedIds = new Set(
    await authModels({ actor: identity, modelIds, action: 'use', handle: modelHandle })
  );

  const appBaselineModelIds = new Set<string>();
  if (appId && !outLinkAuthData) {
    try {
      await authApp({
        req,
        authToken: true,
        appId,
        per: ReadPermissionVal
      });
      const baseline = await getAppDraftResourceBaseline(appId);
      baseline.forEach((resource) => {
        if (resource.type === 'model') {
          appBaselineModelIds.add(resource.id);
        }
      });
    } catch (error) {
      // 鉴权失败或非本团队应用时不合并基线模型，回退到用户自身权限；存储异常正常抛出。
      if (!isKnownUnauthorizedError(error)) throw error;
    }
  }

  return GetModelSummariesResponseSchema.parse({
    models: modelIds.map((modelId) => {
      const model = modelHandle.findModelData({ modelId });
      if (!model) return { modelId, status: 'deleted' };
      const isPermitted = !deniedIds.has(modelId) || appBaselineModelIds.has(modelId);
      return {
        modelId,
        name: model.name,
        avatar: model.avatar,
        status: !isPermitted ? 'forbidden' : model.isActive ? 'active' : 'disabled'
      };
    })
  });
}

export default NextAPI(handler);
