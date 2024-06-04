import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoPlugin } from '@fastgpt/service/core/plugin/schema';
import { authPluginCrud } from '@fastgpt/service/support/permission/auth/plugin';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { teamId } = await authUserPer({ req, authToken: true, per: WritePermissionVal });
    const { pluginId } = req.query as { pluginId: string };

    if (!pluginId) {
      throw new Error('缺少参数');
    }
    await authPluginCrud({ req, authToken: true, pluginId, per: 'owner' });

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
