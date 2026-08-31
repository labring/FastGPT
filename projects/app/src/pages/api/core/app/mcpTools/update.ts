import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoApp } from '@fastgpt/service/core/app/schema';

import { getMCPToolSetRuntimeNode } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { storeSecretValue } from '@fastgpt/service/common/secret/utils';
import { updateParentFoldersUpdateTime } from '@fastgpt/service/core/app/controller';
import { beforeUpdateAppFormat } from '@fastgpt/service/core/app/controller';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateMcpToolsBodySchema,
  UpdateMcpToolsResponseSchema,
  type UpdateMcpToolsBodyType,
  type UpdateMcpToolsResponseType
} from '@fastgpt/global/openapi/core/app/mcpTools/api';
import { assertMCPUrlNotInternal } from '@fastgpt/service/core/app/mcp';
import { encodeMcpToolSetNodesForStorage } from '@fastgpt/service/core/app/jsonSchemaStorage';

async function handler(
  req: ApiRequestProps<UpdateMcpToolsBodyType>
): Promise<UpdateMcpToolsResponseType> {
  const {
    body: { appId, url, toolList, headerSecret }
  } = parseApiInput({
    req,
    bodySchema: UpdateMcpToolsBodySchema
  });
  const { app, teamId } = await authApp({ req, authToken: true, appId, per: ManagePermissionVal });

  await assertMCPUrlNotInternal(url);

  const formatedHeaderAuth = storeSecretValue(headerSecret);

  // create tool set node
  const toolSetRuntimeNode = getMCPToolSetRuntimeNode({
    url,
    toolList,
    headerSecret: formatedHeaderAuth,
    name: app.name,
    avatar: app.avatar ?? undefined
  });
  const storageNodes = encodeMcpToolSetNodesForStorage([toolSetRuntimeNode]);

  await beforeUpdateAppFormat({ nodes: [toolSetRuntimeNode], teamId });

  await mongoSessionRun(async (session) => {
    // update app and app version
    await MongoApp.updateOne(
      { _id: appId },
      {
        modules: storageNodes,
        updateTime: new Date()
      },
      { session }
    );

    await MongoAppVersion.updateOne(
      { appId },
      {
        $set: {
          nodes: storageNodes
        }
      },
      { session }
    );
  });
  updateParentFoldersUpdateTime({
    parentId: app.parentId
  });

  return UpdateMcpToolsResponseSchema.parse(undefined);
}

export default NextAPI(handler);
