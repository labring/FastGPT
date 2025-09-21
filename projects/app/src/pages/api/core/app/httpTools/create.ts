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
import { checkTeamAppLimit } from '@fastgpt/service/support/permission/teamLimit';
import { getHTTPToolSetRuntimeNode } from '@fastgpt/global/core/app/httpTools/utils';

export type createHttpToolsQuery = {};

export type createHttpToolsBody = Omit<CreateAppBody, 'type' | 'modules' | 'edges' | 'chatConfig'>;

async function handler(
  req: ApiRequestProps<createHttpToolsBody, createHttpToolsQuery>,
  res: ApiResponseType<string>
): Promise<string> {
  const { name, avatar, intro, parentId } = req.body;

  const { teamId, tmbId, userId } = parentId
    ? await authApp({ req, appId: parentId, per: TeamAppCreatePermissionVal, authToken: true })
    : await authUserPer({ req, authToken: true, per: TeamAppCreatePermissionVal });

  await checkTeamAppLimit(teamId);

  const httpToolsetId = await mongoSessionRun(async (session) => {
    const httpToolsetId = await onCreateApp({
      parentId,
      name,
      avatar,
      intro,
      teamId,
      tmbId,
      type: AppTypeEnum.httpToolSet,
      modules: [
        getHTTPToolSetRuntimeNode({
          name,
          avatar
        })
      ],
      session
    });

    return httpToolsetId;
  });

  pushTrack.createApp({
    type: AppTypeEnum.httpToolSet,
    appId: httpToolsetId,
    uid: userId,
    teamId,
    tmbId
  });

  return httpToolsetId;
}

export default NextAPI(handler);
