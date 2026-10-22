import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  HydrateWorkflowBodySchema,
  HydrateWorkflowResponseSchema,
  type HydrateWorkflowBodyType,
  type HydrateWorkflowResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getAppDraftResourceBaseline } from '@fastgpt/service/core/app/resource/service';
import { rewriteAppWorkflowToDetail } from '@fastgpt/service/core/app/utils';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

/**
 * 导入工作流前的只读资源补全。
 *
 * 复用应用详情的资源装配逻辑，把工具、技能、知识库的展示信息和
 * `resource_missing` / `tool_missing` 等视图状态直接返回给画布，
 * 使导入后无需刷新即可看到缺失资源。该接口不写入数据库。
 */
async function handler(
  req: ApiRequestProps<HydrateWorkflowBodyType>
): Promise<HydrateWorkflowResponseType> {
  const {
    body: { appId, nodes }
  } = parseApiInput({
    req,
    bodySchema: HydrateWorkflowBodySchema
  });

  const { app, teamId, tmbId, isRoot } = await authApp({
    req,
    appId,
    per: WritePermissionVal,
    authToken: true
  });

  // 以当前应用已有资源快照为基线，避免把应用已授权但操作者个人无权限的资源误标为无权限。
  const resources = await getAppDraftResourceBaseline({ appId, teamId, isRoot });

  await rewriteAppWorkflowToDetail({
    nodes: nodes as StoreNodeItemType[],
    teamId,
    viewerTmbId: tmbId,
    ownerTmbId: app.tmbId,
    isRoot,
    lang: getLocale(req),
    resources
  });

  return HydrateWorkflowResponseSchema.parse({ nodes });
}

export default NextAPI(handler);
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb'
    }
  }
};
