import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { onCreateApp, type CreateAppBody } from '../create';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { checkTeamAppTypeLimit } from '@fastgpt/service/support/permission/teamLimit';
import { getHTTPToolSetRuntimeNode } from '@fastgpt/global/core/app/tool/httpTool/utils';

export type createHttpToolsQuery = {};

export type createHttpToolsBody = {
  createType: 'batch' | 'manual';
} & Omit<CreateAppBody, 'type' | 'modules' | 'edges' | 'chatConfig'>;

async function handler(
  req: ApiRequestProps<createHttpToolsBody, createHttpToolsQuery>,
  res: ApiResponseType<string>
): Promise<string> {
  const { name, avatar, intro, parentId, createType } = req.body;

  const { teamId, tmbId, userId } = parentId
    ? await authApp({ req, appId: parentId, per: TeamAppCreatePermissionVal, authToken: true })
    : await authUserPer({ req, authToken: true, per: TeamAppCreatePermissionVal });

  await checkTeamAppTypeLimit({ teamId, appCheckType: 'tool' });

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
          avatar,
          toolList: [],
          ...(createType === 'batch' && {
            baseUrl: '',
            apiSchemaStr: '',
            customHeaders: '{}',
            headerSecret: {}
          })
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
