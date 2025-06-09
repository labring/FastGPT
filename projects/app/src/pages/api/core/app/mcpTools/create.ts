import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { type CreateAppBody, onCreateApp } from '../create';
import { type McpToolConfigType } from '@fastgpt/global/core/app/type';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  getMCPToolRuntimeNode,
  getMCPToolSetRuntimeNode
} from '@fastgpt/global/core/app/mcpTools/utils';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { checkTeamAppLimit } from '@fastgpt/service/support/permission/teamLimit';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type HeaderAuthConfigType } from '@fastgpt/global/common/teamSecret/type';
import { formatAuthData } from '@/components/support/teamSecrets/utils';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { upsertTeamSecrets } from '@fastgpt/service/support/teamSecret/controller';
import { TeamSecretTypeEnum } from '@fastgpt/global/common/teamSecret/constants';

export type createMCPToolsQuery = {};

export type createMCPToolsBody = Omit<
  CreateAppBody,
  'type' | 'modules' | 'edges' | 'chatConfig'
> & {
  url: string;
  headerAuth: HeaderAuthConfigType;
  toolList: McpToolConfigType[];
};

export type createMCPToolsResponse = {};

async function handler(
  req: ApiRequestProps<createMCPToolsBody, createMCPToolsQuery>,
  res: ApiResponseType<createMCPToolsResponse>
): Promise<createMCPToolsResponse> {
  const { name, avatar, toolList, url, headerAuth, parentId } = req.body;

  const { teamId, tmbId, userId } = parentId
    ? await authApp({ req, appId: parentId, per: WritePermissionVal, authToken: true })
    : await authUserPer({ req, authToken: true, per: TeamAppCreatePermissionVal });

  await checkTeamAppLimit(teamId);

  const mcpToolsId = await mongoSessionRun(async (session) => {
    const mcpToolsId = await onCreateApp({
      name,
      avatar,
      parentId,
      teamId,
      tmbId,
      type: AppTypeEnum.toolSet,
      modules: [],
      session
    });

    await upsertTeamSecrets({
      teamSecret: [formatAuthData({ data: headerAuth, prefix: `${mcpToolsId}-` })],
      type: TeamSecretTypeEnum.headersAuth,
      appId: mcpToolsId
    });

    await MongoApp.findByIdAndUpdate(
      mcpToolsId,
      {
        modules: [
          getMCPToolSetRuntimeNode({
            url,
            toolList,
            name,
            avatar,
            headerAuth: formatAuthData({
              data: headerAuth,
              prefix: `${mcpToolsId}-`
            })
          })
        ]
      },
      { session }
    );

    for (const tool of toolList) {
      await onCreateApp({
        name: tool.name,
        avatar,
        parentId: mcpToolsId,
        teamId,
        tmbId,
        type: AppTypeEnum.tool,
        intro: tool.description,
        modules: [
          getMCPToolRuntimeNode({
            tool,
            url,
            headerAuth: formatAuthData({
              data: headerAuth,
              prefix: `${mcpToolsId}-`
            })
          })
        ],
        session
      });
    }

    return mcpToolsId;
  });

  pushTrack.createApp({
    type: AppTypeEnum.toolSet,
    appId: mcpToolsId,
    uid: userId,
    teamId,
    tmbId
  });

  return {};
}

export default NextAPI(handler);
