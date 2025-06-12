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
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { SecretTypeEnum } from '@fastgpt/global/common/secret/constants';
import { encryptSecret } from '@fastgpt/global/common/secret/utils';

export type createMCPToolsQuery = {};

export type createMCPToolsBody = Omit<
  CreateAppBody,
  'type' | 'modules' | 'edges' | 'chatConfig'
> & {
  url: string;
  headerAuth: StoreSecretValueType;
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

  const secretKey = process.env.AES256_SECRET_KEY;
  const formatedHeaderAuth = Object.fromEntries(
    Object.entries(headerAuth || {}).map(([key, value]) => [
      key,
      {
        secret: encryptSecret(value.value, secretKey),
        value: ''
      }
    ])
  );

  const mcpToolsId = await mongoSessionRun(async (session) => {
    const mcpToolsId = await onCreateApp({
      name,
      avatar,
      parentId,
      teamId,
      tmbId,
      type: AppTypeEnum.toolSet,
      modules: [
        getMCPToolSetRuntimeNode({
          url,
          toolList,
          name,
          avatar,
          headerAuth: formatedHeaderAuth
        })
      ],
      session
    });

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
            headerAuth: formatedHeaderAuth
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
