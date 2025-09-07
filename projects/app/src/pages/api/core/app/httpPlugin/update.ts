import type { NextApiResponse } from 'next';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { type ClientSession } from '@fastgpt/service/common/mongo';
import { httpApiSchema2Plugins } from '@fastgpt/global/core/app/httpPlugin/utils';
import { NextAPI } from '@/service/middleware/entry';
import { type AppSchema } from '@fastgpt/global/core/app/type';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { isEqual } from 'lodash';
import { onCreateApp } from '../create';
import { onDelOneApp } from '@fastgpt/service/core/app/controller';
import { refreshSourceAvatar } from '@fastgpt/service/common/file/image/controller';
import {
  getHTTPToolRuntimeNode,
  getHTTPToolSetRuntimeNode,
  str2OpenApiSchema
} from '@fastgpt/global/core/app/httpPlugin/utils';
import { type HttpToolConfigType } from '@fastgpt/global/core/app/type';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';

export type UpdateHttpPluginBody = {
  appId: string;
  name: string;
  avatar?: string;
  intro?: string;
  pluginData: AppSchema['pluginData'];
};

async function handler(req: ApiRequestProps<UpdateHttpPluginBody>, res: NextApiResponse<any>) {
  const { appId, name, avatar, intro, pluginData } = req.body;

  const { app } = await authApp({ req, authToken: true, appId, per: ManagePermissionVal });

  const storeData = {
    apiSchemaStr: app.pluginData?.apiSchemaStr,
    customHeaders: app.pluginData?.customHeaders
  };
  const updateData = {
    apiSchemaStr: pluginData?.apiSchemaStr,
    customHeaders: pluginData?.customHeaders
  };

  const schema = await str2OpenApiSchema(pluginData?.apiSchemaStr);

  const toolList: HttpToolConfigType[] = schema.pathData.map((item) => ({
    name: item.name,
    description: item.description || '',
    path: item.path,
    method: item.method,
    inputSchema: {
      type: 'object',
      properties: {
        // params -> JSONSchema
        ...(Array.isArray(item.params)
          ? item.params.reduce((acc: any, p: any) => {
              acc[p.name] = {
                type: p?.schema?.type || 'string',
                description: p?.description
              };
              return acc;
            }, {})
          : {}),
        // requestBody.application/json.schema.properties 直接并入
        ...(item.request?.content?.['application/json']?.schema?.properties || {})
      },
      required: [
        ...(Array.isArray(item.params)
          ? item.params.filter((p: any) => p.required).map((p: any) => p.name)
          : []),
        ...((item.request?.content?.['application/json']?.schema?.required as string[]) || [])
      ]
    }
  }));

  const httpToolSetNode = getHTTPToolSetRuntimeNode({
    url: schema.serverPath || '',
    toolList: toolList,
    // headerSecret: pluginData?.customHeaders as StoreSecretValueType,
    headerSecret: undefined,
    name: name || app.name,
    avatar: avatar || app.avatar,
    toolId: ''
  });

  await mongoSessionRun(async (session) => {
    // update children
    if (!isEqual(storeData, updateData)) {
      await updateHttpChildrenPlugin({
        teamId: app.teamId,
        tmbId: app.tmbId,
        parentId: app._id,
        pluginData,
        session
      });
    }

    await MongoApp.findByIdAndUpdate(
      appId,
      {
        ...(name && { name }),
        ...(avatar && { avatar }),
        ...(intro !== undefined && { intro }),
        pluginData,
        modules: [httpToolSetNode],
        updateTime: new Date()
      },
      { session }
    );

    await MongoAppVersion.updateOne(
      { appId },
      {
        $set: {
          nodes: [httpToolSetNode]
        }
      },
      { session }
    );

    await refreshSourceAvatar(avatar, app.avatar, session);
  });
}

export default NextAPI(handler);

const updateHttpChildrenPlugin = async ({
  teamId,
  tmbId,
  parentId,
  pluginData,
  session
}: {
  teamId: string;
  tmbId: string;
  parentId: string;
  pluginData?: AppSchema['pluginData'];
  session: ClientSession;
}) => {
  if (!pluginData?.apiSchemaStr) return;

  const dbPlugins = await MongoApp.find({
    parentId,
    teamId
  }).select({
    pluginData: 1
  });

  const schemaPlugins = await httpApiSchema2Plugins({
    parentId,
    apiSchemaStr: pluginData?.apiSchemaStr,
    customHeader: pluginData?.customHeaders
  });

  // 数据库中存在，schema不存在，删除
  for await (const plugin of dbPlugins) {
    if (!schemaPlugins.find((p) => p.name === plugin.pluginData?.pluginUniId)) {
      await onDelOneApp({
        teamId,
        appId: plugin._id,
        session
      });
    }
  }

  for await (const plugin of schemaPlugins) {
    const dbPlugin = dbPlugins.find((p) => plugin.name === p.pluginData?.pluginUniId);
    if (dbPlugin) {
      await MongoApp.findByIdAndUpdate(
        dbPlugin._id,
        {
          ...plugin,
          version: 'v2'
        },
        { session }
      );
    }
  }
};
