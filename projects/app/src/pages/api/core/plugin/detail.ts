import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authPluginCrud } from '@fastgpt/service/support/permission/auth/plugin';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { id } = req.query as { id: string };
    await connectToDatabase();
    const { plugin } = await authPluginCrud({ req, authToken: true, id, per: 'r' });

    jsonRes(res, {
      data: plugin
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
