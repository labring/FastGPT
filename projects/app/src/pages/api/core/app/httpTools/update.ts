import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getHTTPToolSetRuntimeNode } from '@fastgpt/global/core/app/tool/httpTool/utils';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { storeSecretValue } from '@fastgpt/service/common/secret/utils';
import { updateParentFoldersUpdateTime } from '@fastgpt/service/core/app/controller';
import { beforeUpdateAppFormat } from '@fastgpt/service/core/app/controller';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { updateAppPublishedVersion } from '@fastgpt/service/core/app/version/controller';
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

  await mongoSessionRun(async (session) => {
    await updateAppPublishedVersion({
      appId,
      nodes: storageNodes,
      resources: [],
      session
    });
  });
  updateParentFoldersUpdateTime({
    parentId: app.parentId
  });

  return UpdateHttpToolsResponseSchema.parse(undefined);
}

export default NextAPI(handler);
