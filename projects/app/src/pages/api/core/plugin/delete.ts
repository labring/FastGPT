import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoPlugin } from '@fastgpt/service/core/plugin/schema';
import { authPluginCrud } from '@fastgpt/service/support/permission/auth/plugin';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { id } = req.query as { id: string };
    await connectToDatabase();
    await authPluginCrud({ req, authToken: true, id, per: 'owner' });

    await MongoPlugin.findByIdAndRemove(id);

    jsonRes(res, {});
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
