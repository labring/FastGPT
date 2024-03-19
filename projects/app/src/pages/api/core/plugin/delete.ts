import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoPlugin } from '@fastgpt/service/core/plugin/schema';
import { authPluginCrud } from '@fastgpt/service/support/permission/auth/plugin';
import { authUserNotVisitor } from '@fastgpt/service/support/permission/auth/user';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { teamId } = await authUserNotVisitor({ req, authToken: true });
    const { pluginId } = req.query as { pluginId: string };

    if (!pluginId) {
      throw new Error('缺少参数');
    }
    await authPluginCrud({ req, authToken: true, id: pluginId, per: 'owner' });

    await mongoSessionRun(async (session) => {
      await MongoPlugin.deleteMany(
        {
          teamId,
          parentId: pluginId
        },
        {
          session
        }
      );
      await MongoPlugin.findByIdAndDelete(pluginId, { session });
    });

    jsonRes(res, {});
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
