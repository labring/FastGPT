import type { NextApiResponse } from 'next';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { ClientSession } from '@fastgpt/service/common/mongo';
import { httpApiSchema2Plugins } from '@fastgpt/global/core/app/httpPlugin/utils';
import { NextAPI } from '@/service/middleware/entry';
import { AppSchema } from '@fastgpt/global/core/app/type';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { isEqual } from 'lodash';
import { onCreateApp } from '../create';
import { onDelOneApp } from '../del';

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
        name,
        avatar,
        intro,
        pluginData
      },
      { session }
    );
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
  // 数据库中不存在，schema存在，新增
  for await (const plugin of schemaPlugins) {
    if (!dbPlugins.find((p) => p.pluginData?.pluginUniId === plugin.name)) {
      await onCreateApp({
        ...plugin,
        teamId,
        tmbId,
        session
      });
    }
  }
  // 数据库中存在，schema存在，更新
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
