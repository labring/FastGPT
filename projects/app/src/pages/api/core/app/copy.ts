import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { onCreateApp } from './create';

export type copyAppQuery = {};

export type copyAppBody = { appId: string };

export type copyAppResponse = {
  appId: string;
};

async function handler(
  req: ApiRequestProps<copyAppBody, copyAppQuery>,
  res: ApiResponseType<any>
): Promise<copyAppResponse> {
  const [{ app, tmbId }] = await Promise.all([
    authApp({
      req,
      authToken: true,
      per: WritePermissionVal,
      appId: req.body.appId
    }),
    authUserPer({
      req,
      authToken: true,
      per: WritePermissionVal
    })
  ]);

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
