import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { onCreateApp } from './create';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { getI18nAppType } from '@fastgpt/service/support/user/audit/util';

export type copyAppQuery = {};

export type copyAppBody = { appId: string };

export type copyAppResponse = {
  appId: string;
};

async function handler(
  req: ApiRequestProps<copyAppBody, copyAppQuery>,
  res: ApiResponseType<any>
): Promise<copyAppResponse> {
  const { app, teamId } = await authApp({
    req,
    authToken: true,
    per: WritePermissionVal,
    appId: req.body.appId
  });

  const { tmbId } = app.parentId
    ? await authApp({ req, appId: app.parentId, per: WritePermissionVal, authToken: true })
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
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_APP_COPY,
      params: {
        appName: app.name,
        appType: getI18nAppType(app.type)
      }
    });
  })();

  return { appId };
}

export default NextAPI(handler);
