import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { onCreateApp, type CreateAppBody } from '../create';
import { type AppSchema } from '@fastgpt/global/core/app/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { checkTeamAppLimit } from '@fastgpt/service/support/permission/teamLimit';
import { createHttpToolRuntimeNode } from '@fastgpt/global/core/app/httpPlugin/utils';

export type createHttpPluginQuery = {};

export type createHttpPluginBody = Omit<
  CreateAppBody,
  'type' | 'modules' | 'edges' | 'chatConfig'
> & {
  pluginData: AppSchema['pluginData'];
};

export type createHttpPluginResponse = {};

async function handler(
  req: ApiRequestProps<createHttpPluginBody, createHttpPluginQuery>,
  res: ApiResponseType<createHttpPluginResponse>
): Promise<createHttpPluginResponse> {
  const { name, avatar, intro, pluginData, parentId } = req.body;

  const { teamId, tmbId, userId } = parentId
    ? await authApp({ req, appId: parentId, per: WritePermissionVal, authToken: true })
    : await authUserPer({ req, authToken: true, per: TeamAppCreatePermissionVal });

  await checkTeamAppLimit(teamId);

  const httpPluginId = await mongoSessionRun(async (session) => {
    const httpPluginId = await onCreateApp({
      name,
      avatar,
      intro,
      parentId,
      teamId,
      tmbId,
      type: AppTypeEnum.httpToolSet,
      modules: [
        createHttpToolRuntimeNode({
          name,
          avatar,
          headerSecret: pluginData?.customHeaders
        })
      ],
      pluginData,
      session
    });

    return httpPluginId;
  });

  pushTrack.createApp({
    type: AppTypeEnum.httpToolSet,
    appId: httpPluginId,
    uid: userId,
    teamId,
    tmbId
  });

  return {};
}

export default NextAPI(handler);
