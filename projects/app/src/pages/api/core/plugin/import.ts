import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { CreateOnePluginParams } from '@fastgpt/global/core/plugin/controller';
import { authUserNotVisitor } from '@fastgpt/service/support/permission/auth/user';
import { MongoPlugin } from '@fastgpt/service/core/plugin/schema';
import { checkTeamPluginLimit } from '@fastgpt/service/support/permission/teamLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { teamId, tmbId } = await authUserNotVisitor({ req, authToken: true });
    const body = req.body as { pluginData: CreateOnePluginParams[]; parentId: string };

    await checkTeamPluginLimit(teamId);
    const parentId = body.parentId;
    if (!parentId) {
      throw new Error('parentId is required');
    }

    const pluginData = body.pluginData;
    const bodyPluginNames = new Set(pluginData.map((plugin) => plugin.name));

    const existingPlugins = await MongoPlugin.find({
      teamId,
      parentId
    });

    const updatePromises = existingPlugins
      .filter((plugin) => bodyPluginNames.has(plugin.name))
      .map((plugin) => {
        const updatedPlugin = pluginData.find((p) => p.name === plugin.name);
        return MongoPlugin.updateOne({ _id: plugin._id }, { $set: updatedPlugin });
      });

    await Promise.all(updatePromises);

    // 删除不再需要的现有插件
    const deletionPromises = existingPlugins
      .filter((plugin) => !bodyPluginNames.has(plugin.name))
      .map((plugin) => MongoPlugin.deleteOne({ _id: plugin._id }));

    await Promise.all(deletionPromises);

    // 插入新插件
    const newPlugins = pluginData.filter(
      (plugin) => !existingPlugins.some((p) => p.name === plugin.name)
    );
    const pluginsToCreate = newPlugins.map((plugin) => ({
      ...plugin,
      teamId,
      tmbId
    }));

    await MongoPlugin.insertMany(pluginsToCreate);

    jsonRes(res, {});
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
