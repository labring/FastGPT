import type { NextApiRequest } from 'next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { rewriteAppWorkflowToDetail } from '@fastgpt/service/core/app/utils';
import { migrateWorkflowToCurrent } from '@fastgpt/global/core/workflow/migration';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetAppDetailQuerySchema,
  GetAppDetailResponseSchema,
  type GetAppDetailResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { decodeToolSetNodesFromStorage } from '@fastgpt/service/core/app/jsonSchemaStorage';

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
  const { app, teamId, isRoot } = await authApp({
    req,
    authToken: true,
    appId,
    per: ReadPermissionVal
  });

  const workflow = migrateWorkflowToCurrent({
    nodes: decodeToolSetNodesFromStorage(app.modules),
    edges: app.edges,
    chatConfig: app.chatConfig
  });
  await rewriteAppWorkflowToDetail({
    nodes: workflow.nodes,
    teamId,
    ownerTmbId: app.tmbId,
    isRoot,
    lang: getLocale(req)
  });

  if (!app.permission.hasWritePer) {
    return GetAppDetailResponseSchema.parse({
      ...app,
      avatar: app.avatar ?? '',
      intro: app.intro ?? '',
      modules: [],
      edges: []
    });
  }

  return GetAppDetailResponseSchema.parse({
    ...app,
    avatar: app.avatar ?? '',
    intro: app.intro ?? '',
    modules: workflow.nodes,
    edges: workflow.edges,
    chatConfig: workflow.chatConfig
  });
}

export default NextAPI(handler);
