import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { rewriteAppWorkflowToDetail } from '@fastgpt/service/core/app/utils';

export type getLatestVersionQuery = {
  appId: string;
};

export type getLatestVersionBody = {};

export type getLatestVersionResponse = {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  chatConfig: AppChatConfigType;
};

async function handler(
  req: ApiRequestProps<getLatestVersionBody, getLatestVersionQuery>,
  res: ApiResponseType<any>
): Promise<getLatestVersionResponse> {
  const { app } = await authApp({
    req,
    authToken: true,
    appId: req.query.appId,
    per: WritePermissionVal
  });

  const teamId = app.teamId;

  await rewriteAppWorkflowToDetail(app.modules, teamId);

  return getAppLatestVersion(req.query.appId, app);
}

export default NextAPI(handler);
