import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { onCreateApp } from './create';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';

export type copyAppQuery = {};

export type copyAppBody = { appId: string };

export type copyAppResponse = {
  appId: string;
};

async function handler(
  req: ApiRequestProps<copyAppBody, copyAppQuery>,
  res: ApiResponseType<any>
): Promise<copyAppResponse> {
  const { app } = await authApp({
    req,
    authToken: true,
    per: WritePermissionVal,
    appId: req.body.appId
  });

  const { tmbId } = app.parentId
    ? await authApp({ req, appId: app.parentId, per: TeamAppCreatePermissionVal, authToken: true })
    : await authUserPer({ req, authToken: true, per: TeamAppCreatePermissionVal });

  const appId = await onCreateApp({
    parentId: app.parentId,
    name: app.name + ' Copy',
    intro: app.intro,
    avatar: app.avatar,
    type: app.type,
    modules: app.modules,
    edges: app.edges,
    chatConfig: app.chatConfig,
    teamId: app.teamId,
    tmbId,
    pluginData: app.pluginData
  });

  return { appId };
}

export default NextAPI(handler);
