import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { rewriteAppWorkflowToDetail } from '@fastgpt/service/core/app/utils';
import { migrateWorkflowToCurrent } from '@fastgpt/global/core/workflow/migration';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { resolveStoredAppResources } from '@fastgpt/service/core/app/resources';
import {
  GetAppVersionDetailQuerySchema,
  GetAppVersionDetailResponseSchema,
  type GetAppVersionDetailResponseType
} from '@fastgpt/global/openapi/core/app/version/api';
import { decodeToolSetNodesFromStorage } from '@fastgpt/service/core/app/jsonSchemaStorage';

async function handler(req: NextApiRequest): Promise<GetAppVersionDetailResponseType> {
  const { versionId, appId } = parseApiInput({
    req,
    querySchema: GetAppVersionDetailQuerySchema
  }).query;

  const { app, teamId, tmbId, isRoot } = await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });
  const result = await MongoAppVersion.findOne({ _id: versionId, appId }).lean();

  if (!result) {
    return Promise.reject('version not found');
  }

  // 历史版本只迁移该版本自身的系统配置节点，不继承当前应用 chatConfig，
  // 避免当前配置占位导致该版本中的欢迎语、定时任务等旧值被丢弃。
  const decodedNodes = decodeToolSetNodesFromStorage(result.nodes);
  const normalizedWorkflow = migrateWorkflowToCurrent({
    nodes: decodedNodes,
    edges: result.edges,
    chatConfig: result.chatConfig
  });
  // 历史版本可能尚未完成资源快照迁移，缺失或非法快照需要按该版本内容回退提取。
  const resources = resolveStoredAppResources({
    resources: result.resources,
    nodes: normalizedWorkflow.nodes,
    chatConfig: normalizedWorkflow.chatConfig,
    resourceRefs: (result as { resourceRefs?: unknown }).resourceRefs
  });
  await rewriteAppWorkflowToDetail({
    nodes: normalizedWorkflow.nodes,
    teamId,
    viewerTmbId: tmbId,
    ownerTmbId: app.tmbId,
    isRoot,
    lang: getLocale(req),
    resources
  });
  return GetAppVersionDetailResponseSchema.parse({
    ...result,
    ...normalizedWorkflow,
    resources,
    versionName: result?.versionName ?? formatTime2YMDHM(result?.time)
  });
}

export default NextAPI(handler);
