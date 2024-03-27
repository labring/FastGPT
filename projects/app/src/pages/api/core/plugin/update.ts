import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { UpdatePluginParams } from '@fastgpt/global/core/plugin/controller';
import { authPluginCrud } from '@fastgpt/service/support/permission/auth/plugin';
import { MongoPlugin } from '@fastgpt/service/core/plugin/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { ClientSession } from '@fastgpt/service/common/mongo';
import { httpApiSchema2Plugins } from '@fastgpt/global/core/plugin/httpPlugin/utils';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const body = req.body as UpdatePluginParams;

    const { id, ...props } = body;

    const { teamId, tmbId } = await authPluginCrud({ req, authToken: true, id, per: 'owner' });

    const updateData = {
      name: props.name,
      intro: props.intro,
      avatar: props.avatar,
      parentId: props.parentId,
      ...(props.modules &&
        props.modules.length > 0 && {
          modules: props.modules
        }),
      metadata: props.metadata
    };

    if (props.metadata?.apiSchemaStr) {
      await mongoSessionRun(async (session) => {
        // update children
        await updateHttpChildrenPlugin({
          teamId,
          tmbId,
          parent: body,
          session
        });
        await MongoPlugin.findByIdAndUpdate(id, updateData, { session });
      });

      jsonRes(res, {});
    } else {
      jsonRes(res, {
        data: await MongoPlugin.findByIdAndUpdate(id, updateData)
      });
    }
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

const updateHttpChildrenPlugin = async ({
  teamId,
  tmbId,
  parent,
  session
}: {
  teamId: string;
  tmbId: string;
  parent: UpdatePluginParams;
  session: ClientSession;
}) => {
  if (!parent.metadata?.apiSchemaStr) return;
  const dbPlugins = await MongoPlugin.find(
    {
      parentId: parent.id,
      teamId
    },
    '_id metadata'
  );

  const schemaPlugins = await httpApiSchema2Plugins({
    parentId: parent.id,
    apiSchemaStr: parent.metadata?.apiSchemaStr,
    customHeader: parent.metadata?.customHeaders
  });

  // 数据库中存在，schema不存在，删除
  for await (const plugin of dbPlugins) {
    if (!schemaPlugins.find((p) => p.name === plugin.metadata?.pluginUid)) {
      await MongoPlugin.deleteOne({ _id: plugin._id }, { session });
    }
  }
  // 数据库中不存在，schema存在，新增
  for await (const plugin of schemaPlugins) {
    if (!dbPlugins.find((p) => p.metadata?.pluginUid === plugin.name)) {
      await MongoPlugin.create(
        [
          {
            ...plugin,
            metadata: {
              pluginUid: plugin.name
            },
            teamId,
            tmbId
          }
        ],
        {
          session
        }
      );
    }
  }
  // 数据库中存在，schema存在，更新
  for await (const plugin of schemaPlugins) {
    const dbPlugin = dbPlugins.find((p) => plugin.name === p.metadata?.pluginUid);
    if (dbPlugin) {
      await MongoPlugin.findByIdAndUpdate(dbPlugin._id, plugin, { session });
    }
  }
};
