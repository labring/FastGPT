import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoPlugin } from '@fastgpt/service/core/plugin/schema';
import { authPluginCrud } from '@fastgpt/service/support/permission/auth/plugin';
import { findPluginAndAllChildren } from '@fastgpt/service/core/plugin/controller';
import { authUserNotVisitor } from '@fastgpt/service/support/permission/auth/user';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { teamId } = await authUserNotVisitor({ req, authToken: true });
    const { id: pluginId } = req.query as { id: string };

    if (!pluginId) {
      throw new Error('缺少参数');
    }

    const plugins = await findPluginAndAllChildren({
      teamId,
      pluginId
    });

    await authPluginCrud({ req, authToken: true, id: pluginId, per: 'owner' });

    await MongoPlugin.deleteMany({
      _id: { $in: plugins.map((d) => d._id) }
    });

    jsonRes(res, {});
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
