import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { onCreateApp } from '../create';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { checkTeamAppTypeLimit } from '@fastgpt/service/support/permission/teamLimit';
import { getHTTPToolSetRuntimeNode } from '@fastgpt/global/core/app/tool/httpTool/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  CreateHttpToolsBodySchema,
  type CreateHttpToolsBodyType
} from '@fastgpt/global/openapi/core/app/httpTools/api';
import {
  CreateAppResponseSchema,
  type CreateAppResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { HttpToolTypeEnum } from '@fastgpt/global/core/app/tool/httpTool/constants';

async function handler(
  req: ApiRequestProps<CreateHttpToolsBodyType>
): Promise<CreateAppResponseType> {
  const {
    body: { name, avatar, intro, parentId, createType }
  } = parseApiInput({
    req,
    bodySchema: CreateHttpToolsBodySchema
  });

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
          ...(createType === HttpToolTypeEnum.batch && {
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

  return CreateAppResponseSchema.parse(httpToolsetId);
}

export default NextAPI(handler);
