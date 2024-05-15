import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { UpdatePluginParams } from '@fastgpt/global/core/plugin/controller';
import { authPluginCrud } from '@fastgpt/service/support/permission/auth/plugin';
import { MongoPlugin } from '@fastgpt/service/core/plugin/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { ClientSession } from '@fastgpt/service/common/mongo';
import { httpApiSchema2Plugins } from '@fastgpt/global/core/plugin/httpPlugin/utils';
import { isEqual } from 'lodash';
import { nanoid } from 'nanoid';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const body = req.body as UpdatePluginParams;

    const { id, modules, edges, ...props } = body;

    const { teamId, tmbId } = await authPluginCrud({
      req,
      authToken: true,
      pluginId: id,
      per: 'owner'
    });

    const originPlugin = await MongoPlugin.findById(id);

    let updateData = {
      name: props.name,
      intro: props.intro,
      avatar: props.avatar,
      parentId: props.parentId,
      version: 'v2',
      ...(modules?.length && {
        modules: modules
      }),
      ...(edges?.length && { edges }),
      metadata: props.metadata,
      nodeVersion: originPlugin?.nodeVersion
    };

    const isNodeVersionEqual =
      isEqual(
        originPlugin?.modules.map((module) => {
          return { ...module, position: undefined };
        }),
        updateData.modules?.map((module) => {
          return { ...module, position: undefined };
        })
      ) && isEqual(originPlugin?.edges, updateData.edges);

    if (!isNodeVersionEqual) {
      updateData = {
        ...updateData,
        nodeVersion: nanoid(6)
      };
    }
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
            tmbId,
            version: 'v2'
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
      await MongoPlugin.findByIdAndUpdate(
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
