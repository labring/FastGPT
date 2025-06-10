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
import { upsertSecrets } from '@fastgpt/service/support/secret/controller';
import { SecretTypeEnum } from '@fastgpt/global/common/secret/constants';

// add prefix to secretIds in headerAuth
const addPrefixToSecretIds = ({
  headerAuth,
  prefix
}: {
  headerAuth: StoreSecretValueType;
  prefix: string;
}): StoreSecretValueType => {
  if (!headerAuth || Object.keys(headerAuth).length === 0) return {};

  // create a new object to avoid modifying the original object
  const result: StoreSecretValueType = {};

  // iterate over each key-value pair in headerAuth
  Object.entries(headerAuth).forEach(([key, authValue]) => {
    // copy authValue and add prefix to secretId
    result[key] = {
      ...authValue,
      secretId: authValue.secretId ? `${prefix}${authValue.secretId}` : ''
    };
  });

  return result;
};

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

    const headerAuthWithPrefix = addPrefixToSecretIds({
      headerAuth,
      prefix: `${mcpToolsId}-mcpTools-`
    });

    await upsertSecrets({
      secrets: [headerAuthWithPrefix],
      type: SecretTypeEnum.headersAuth,
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
            headerAuth: headerAuthWithPrefix
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
            headerAuth: headerAuthWithPrefix
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
