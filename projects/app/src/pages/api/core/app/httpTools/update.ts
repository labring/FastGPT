import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getHTTPToolSetRuntimeNode } from '@fastgpt/global/core/app/tool/httpTool/utils';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { storeSecretValue } from '@fastgpt/service/common/secret/utils';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { updateParentFoldersUpdateTime } from '@fastgpt/service/core/app/controller';
import {
  UpdateHttpToolsBodySchema,
  type UpdateHttpToolsBodyType
} from '@fastgpt/global/openapi/core/app/httpTools/api';

async function handler(req: ApiRequestProps<UpdateHttpToolsBodyType>, res: ApiResponseType) {
  const { appId, baseUrl, apiSchemaStr, toolList, headerSecret, customHeaders } =
    UpdateHttpToolsBodySchema.parse(req.body);

  const { app } = await authApp({ req, authToken: true, appId, per: ManagePermissionVal });

  const formatedHeaderAuth = storeSecretValue(headerSecret);

  const formattedToolList = toolList.map((tool) => ({
    ...tool,
    headerSecret: tool.headerSecret ? storeSecretValue(tool.headerSecret) : undefined
  }));

  const toolSetRuntimeNode = getHTTPToolSetRuntimeNode({
    name: app.name,
    avatar: app.avatar,
    baseUrl,
    apiSchemaStr,
    toolList: formattedToolList,
    headerSecret: formatedHeaderAuth,
    customHeaders
  });

  await mongoSessionRun(async (session) => {
    await MongoApp.findByIdAndUpdate(
      appId,
      {
        modules: [toolSetRuntimeNode]
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
  updateParentFoldersUpdateTime({
    parentId: app.parentId
  });
}

export default NextAPI(handler);
