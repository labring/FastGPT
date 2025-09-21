import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type McpToolConfigType } from '@fastgpt/global/core/app/type';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoApp } from '@fastgpt/service/core/app/schema';

import { getMCPToolSetRuntimeNode } from '@fastgpt/global/core/app/mcpTools/utils';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { storeSecretValue } from '@fastgpt/service/common/secret/utils';

export type updateMCPToolsQuery = {};

export type updateMCPToolsBody = {
  appId: string;
  url: string;
  headerSecret: StoreSecretValueType;
  toolList: McpToolConfigType[];
};

export type updateMCPToolsResponse = {};

async function handler(
  req: ApiRequestProps<updateMCPToolsBody, updateMCPToolsQuery>,
  res: ApiResponseType<updateMCPToolsResponse>
): Promise<updateMCPToolsResponse> {
  const { appId, url, toolList, headerSecret } = req.body;
  const { app } = await authApp({ req, authToken: true, appId, per: ManagePermissionVal });

  const formatedHeaderAuth = storeSecretValue(headerSecret);

  // create tool set node
  const toolSetRuntimeNode = getMCPToolSetRuntimeNode({
    url,
    toolList,
    headerSecret: formatedHeaderAuth,
    name: app.name,
    avatar: app.avatar,
    toolId: ''
  });

  await mongoSessionRun(async (session) => {
    // update app and app version
    await MongoApp.updateOne(
      { _id: appId },
      {
        modules: [toolSetRuntimeNode],
        updateTime: new Date()
      },
      { session }
    );
    await MongoAppVersion.updateOne(
      { appId },
      {
        $set: {
          nodes: [toolSetRuntimeNode]
        }
      },
      { session }
    );
  });

  return {};
}

export default NextAPI(handler);
