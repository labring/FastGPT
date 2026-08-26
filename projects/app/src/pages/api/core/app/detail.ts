import type { NextApiRequest } from 'next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { rewriteAppWorkflowToDetail } from '@fastgpt/service/core/app/utils';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetAppDetailQuerySchema,
  GetAppDetailResponseSchema,
  type GetAppDetailResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { getAppDraftWorkflow } from '@fastgpt/service/core/app/version/controller';

/* 获取应用详情 */
async function handler(req: NextApiRequest): Promise<GetAppDetailResponseType> {
  const { appId } = parseApiInput({
    req,
    querySchema: GetAppDetailQuerySchema
  }).query;

  if (!appId) {
    Promise.reject(CommonErrEnum.missingParams);
  }
  // 凭证校验
  const { app, teamId, tmbId, isRoot } = await authApp({
    req,
    authToken: true,
    appId,
    per: ReadPermissionVal
  });

  const workflow = await getAppDraftWorkflow(app._id);
  await rewriteAppWorkflowToDetail({
    nodes: workflow.nodes,
    teamId,
    viewerTmbId: tmbId,
    ownerTmbId: app.tmbId,
    isRoot,
    lang: getLocale(req),
    resources: workflow.resources
  });

  if (!app.permission.hasWritePer) {
    return GetAppDetailResponseSchema.parse({
      ...app,
      avatar: app.avatar ?? '',
      intro: app.intro ?? '',
      nodes: [],
      edges: [],
      chatConfig: workflow.chatConfig
    });
  }

  return GetAppDetailResponseSchema.parse({
    ...app,
    avatar: app.avatar ?? '',
    intro: app.intro ?? '',
    nodes: workflow.nodes,
    edges: workflow.edges,
    chatConfig: workflow.chatConfig
  });
}

export default NextAPI(handler);
