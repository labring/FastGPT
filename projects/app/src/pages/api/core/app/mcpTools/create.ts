import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { onCreateApp } from '../create';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getMCPToolSetRuntimeNode } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { checkTeamAppTypeLimit } from '@fastgpt/service/support/permission/teamLimit';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { storeSecretValue } from '@fastgpt/service/common/secret/utils';
import {
  CreateMcpToolsBodySchema,
  CreateMcpToolsResponseSchema,
  type CreateMcpToolsBodyType,
  type CreateMcpToolsResponseType
} from '@fastgpt/global/openapi/core/app/mcpTools/api';

export type createMCPToolsQuery = {};

async function handler(
  req: ApiRequestProps<CreateMcpToolsBodyType>,
  res: ApiResponseType
): Promise<CreateMcpToolsResponseType> {
  const {
    name,
    avatar,
    toolList,
    url,
    headerSecret = {},
    parentId
  } = CreateMcpToolsBodySchema.parse(req.body);

  const { teamId, tmbId, userId } = parentId
    ? await authApp({ req, appId: parentId, per: WritePermissionVal, authToken: true })
    : await authUserPer({ req, authToken: true, per: TeamAppCreatePermissionVal });

  await checkTeamAppTypeLimit({ teamId, appCheckType: 'tool' });

  const formatedHeaderAuth = storeSecretValue(headerSecret);

  const mcpToolsId = await mongoSessionRun(async (session) => {
    const mcpToolsId = await onCreateApp({
      name,
      avatar,
      parentId,
      teamId,
      tmbId,
      type: AppTypeEnum.mcpToolSet,
      modules: [
        getMCPToolSetRuntimeNode({
          url,
          toolList,
          name,
          avatar,
          headerSecret: formatedHeaderAuth,
          toolId: ''
        })
      ],
      session
    });

    return mcpToolsId;
  });

  pushTrack.createApp({
    type: AppTypeEnum.mcpToolSet,
    appId: mcpToolsId,
    uid: userId,
    teamId,
    tmbId
  });

  return CreateMcpToolsResponseSchema.parse(mcpToolsId);
}

export default NextAPI(handler);
