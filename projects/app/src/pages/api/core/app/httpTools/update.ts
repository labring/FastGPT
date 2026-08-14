import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getHTTPToolSetRuntimeNode } from '@fastgpt/global/core/app/tool/httpTool/utils';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { storeSecretValue } from '@fastgpt/service/common/secret/utils';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { updateParentFoldersUpdateTime } from '@fastgpt/service/core/app/controller';
import { prepareWorkflowForPersistence } from '@fastgpt/service/core/app/controller';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateHttpToolsBodySchema,
  UpdateHttpToolsResponseSchema,
  type UpdateHttpToolsBodyType,
  type UpdateHttpToolsResponseType
} from '@fastgpt/global/openapi/core/app/httpTools/api';
import { encodeHttpToolSetNodesForStorage } from '@fastgpt/service/core/app/jsonSchemaStorage';

async function handler(
  req: ApiRequestProps<UpdateHttpToolsBodyType>
): Promise<UpdateHttpToolsResponseType> {
  const { appId, baseUrl, apiSchemaStr, toolList, headerSecret, customHeaders } = parseApiInput({
    req,
    bodySchema: UpdateHttpToolsBodySchema
  }).body;

  const { app, teamId } = await authApp({ req, authToken: true, appId, per: ManagePermissionVal });

  const formatedHeaderAuth = storeSecretValue(headerSecret);

  const formattedToolList = toolList.map((tool) => ({
    ...tool,
    headerSecret: tool.headerSecret ? storeSecretValue(tool.headerSecret) : undefined
  }));

  const toolSetRuntimeNode = getHTTPToolSetRuntimeNode({
    name: app.name,
    avatar: app.avatar ?? undefined,
    baseUrl,
    apiSchemaStr,
    toolList: formattedToolList,
    headerSecret: formatedHeaderAuth,
    customHeaders
  });
  const storageNodes = encodeHttpToolSetNodesForStorage([toolSetRuntimeNode]);

  await beforeUpdateAppFormat({ nodes: [toolSetRuntimeNode], teamId });

  const workflow = await prepareWorkflowForPersistence({ nodes: [toolSetRuntimeNode] });

  await mongoSessionRun(async (session) => {
    await MongoApp.findByIdAndUpdate(
      appId,
      {
        modules: workflow.nodes
      },
      { session }
    );

    await MongoAppVersion.updateOne(
      { appId },
      {
        $set: {
          nodes: workflow.nodes
        }
      },
      { session }
    );
  });
  updateParentFoldersUpdateTime({
    parentId: app.parentId
  });

  return UpdateHttpToolsResponseSchema.parse(undefined);
}

export default NextAPI(handler);
