import type { NextApiRequest, NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoPlugin } from '@fastgpt/service/core/plugin/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { NextAPI } from '@/service/middleware/entry';
import { PluginTypeEnum } from '@fastgpt/global/core/plugin/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';

/* 
  1. 先读取 HTTP plugin 内容,并找到所有的子plugin,然后事务批量创建,最后修改 inited
  2. 读取剩下未 inited 的plugin,逐一创建
*/

let success = 0;
async function handler(req: NextApiRequest, res: NextApiResponse) {
  await authCert({ req, authRoot: true });

  const { teamId } = req.body as { teamId?: string };

  const total = await MongoPlugin.countDocuments({
    inited: { $ne: true }
  });

  console.log('Total plugin', total);

  await initHttp(teamId);
  await initPlugin(teamId);
}

async function initHttp(teamId?: string): Promise<any> {
  /* 读取http插件和他的children */
  const plugin = await MongoPlugin.findOne({
    ...(teamId && { teamId }),
    type: PluginTypeEnum.folder,
    inited: { $ne: true }
  }).lean();
  if (!plugin) return;

  const children = await MongoPlugin.find({
    teamId: plugin.teamId,
    parentId: plugin._id,
    inited: { $ne: true }
  }).lean();

  await mongoSessionRun(async (session) => {
    /* 创建HTTP插件作为目录 */
    const [{ _id }] = await MongoApp.create(
      [
        {
          teamId: plugin.teamId,
          tmbId: plugin.tmbId,
          type: AppTypeEnum.httpPlugin,
          name: plugin.name,
          avatar: plugin.avatar,
          intro: plugin.intro,
          metadata: plugin.metadata,
          version: plugin.version,
          pluginData: {
            apiSchemaStr: plugin.metadata?.apiSchemaStr,
            customHeaders: plugin.metadata?.customHeaders
          }
        }
      ],
      { session }
    );

    /* 批量创建子插件 */
    for await (const item of children) {
      const [{ _id: newPluginId }] = await MongoApp.create(
        [
          {
            _id: item._id,
            parentId: _id,
            teamId: item.teamId,
            tmbId: item.tmbId,
            type: AppTypeEnum.plugin,
            name: item.name,
            avatar: item.avatar,
            intro: item.intro,
            version: plugin.version,
            modules: item.modules,
            edges: item.edges,
            pluginData: {
              nodeVersion: item.nodeVersion,
              pluginUniId: plugin.metadata?.pluginUid
            }
          }
        ],
        { session }
      );
      if (item.version === 'v2') {
        await MongoAppVersion.create(
          [
            {
              appId: newPluginId,
              nodes: item.modules,
              edges: item.edges
            }
          ],
          { session }
        );
      }
    }

    /* 更新插件信息 */
    await MongoPlugin.findOneAndUpdate(
      {
        _id: plugin._id
      },
      {
        $set: { inited: true }
      },
      { session }
    );
    await MongoPlugin.updateMany(
      {
        teamId: plugin.teamId,
        parentId: plugin._id
      },
      {
        $set: { inited: true }
      },
      { session }
    );

    success += children.length + 1;
    console.log(success);
  });

  return initHttp();
}

async function initPlugin(teamId?: string): Promise<any> {
  const plugin = await MongoPlugin.findOne({
    ...(teamId && { teamId }),
    type: PluginTypeEnum.custom,
    inited: { $ne: true }
  }).lean();
  if (!plugin) return;

  await mongoSessionRun(async (session) => {
    const [{ _id: newPluginId }] = await MongoApp.create(
      [
        {
          _id: plugin._id,
          teamId: plugin.teamId,
          tmbId: plugin.tmbId,
          type: AppTypeEnum.plugin,
          name: plugin.name,
          avatar: plugin.avatar,
          intro: plugin.intro,
          version: plugin.version,
          modules: plugin.modules,
          edges: plugin.edges,
          pluginData: {
            nodeVersion: plugin.nodeVersion
          }
        }
      ],
      { session }
    );

    if (plugin.version === 'v2') {
      await MongoAppVersion.create(
        [
          {
            appId: newPluginId,
            nodes: plugin.modules,
            edges: plugin.edges
          }
        ],
        { session }
      );
    }

    await MongoPlugin.findOneAndUpdate(
      {
        _id: plugin._id
      },
      {
        $set: { inited: true }
      },
      { session }
    );

    success++;
    console.log(success);
  });

  return initPlugin();
}

export default NextAPI(handler);
