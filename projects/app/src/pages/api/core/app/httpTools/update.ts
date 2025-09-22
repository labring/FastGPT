import type { NextApiResponse } from 'next';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getHTTPToolSetRuntimeNode } from '@fastgpt/global/core/app/httpTools/utils';
import { NextAPI } from '@/service/middleware/entry';
import type { HttpToolConfigType } from '@fastgpt/global/core/app/type';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { storeSecretValue } from '@fastgpt/service/common/secret/utils';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';

export type UpdateHttpPluginBody = {
  appId: string;
  baseUrl: string;
  apiSchemaStr: string;
  toolList: HttpToolConfigType[];
  headerSecret: StoreSecretValueType;
  customHeaders?: string;
};

async function handler(req: ApiRequestProps<UpdateHttpPluginBody>, res: NextApiResponse<any>) {
  const { appId, baseUrl, apiSchemaStr, toolList, headerSecret, customHeaders } = req.body;

  const { app } = await authApp({ req, authToken: true, appId, per: ManagePermissionVal });

  const formatedHeaderAuth = storeSecretValue(headerSecret);

  const toolSetRuntimeNode = getHTTPToolSetRuntimeNode({
    name: app.name,
    avatar: app.avatar,
    baseUrl,
    apiSchemaStr,
    toolList,
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
}

export default NextAPI(handler);
